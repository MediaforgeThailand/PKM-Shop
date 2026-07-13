// PKM-Shop — SlipOK slip verification (Ready.md §3.6, §7.1). Internal (service-role):
// the chat flow calls this after the customer uploads a slip. On a full pass the order goes
// `paid` via pkm_confirm_payment (server-side authority); otherwise it drops into the manual
// queue (payment_status = pending_verify). Until SLIPOK keys exist, every slip goes to the
// manual queue and payment stays staff-confirmed.
import { assertServiceRoleAuthorization, assertTenant, rpc, selectOne } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { downloadStorageObject } from '../_shared/storage.ts';
import { verifySlip } from '../_shared/slipok.ts';
import { notifyEvent } from '../_shared/notify.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.object({
  tenant_slug: z.string().min(1),
  order_id: z.string().uuid(),
  slip_path: z.string().min(1),        // path in the private payment-slips bucket
  qr_data: z.string().optional(),      // decoded QR value if the client read it
  kind: z.enum(['goods', 'delivery', 'redelivery']).optional(),
});

type OrderRow = {
  id: string;
  tenant_id: string;
  grand_total: number;
  status: string;
  payment_status: string;
  delivery_type: string;
};

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }
  try {
    assertServiceRoleAuthorization(req.headers.get('authorization'));
    const body = await validateJson(req, schema);
    const tenant = await assertTenant(body.tenant_slug);
    const order = await selectOne<OrderRow>('orders', {
      id: `eq.${body.order_id}`,
      select: 'id,tenant_id,grand_total,status,payment_status,delivery_type',
      tenant_id: `eq.${tenant.id}`,
    });
    if (!order) {
      throw new HttpError('VALIDATION', 'Order not found.', 404);
    }
    if (order.payment_status === 'paid') {
      return json({ status: 'already_paid' });
    }

    const kind = body.kind ?? 'goods';
    const slip = await downloadStorageObject('payment-slips', body.slip_path);
    const result = await verifySlip({
      contentType: slip.contentType,
      expectedAmount: order.grand_total,
      fileBytes: slip.bytes,
      qrData: body.qr_data ?? null,
    });

    // Bank-origin delay / temporary busy: ask the customer to resend later, do NOT queue.
    if (result.status === 'bank_delay') {
      return json({ status: 'bank_delay', retry_minutes: result.retryMinutes });
    }
    if (result.status === 'bank_busy') {
      return json({ status: 'retry_later' });
    }

    const amountMatches = result.status === 'passed' && result.amount === order.grand_total;

    if (result.status === 'passed' && amountMatches) {
      await rpc('pkm_confirm_payment', {
        p_actor: 'system',
        p_amount: order.grand_total,
        p_auto: true,
        p_kind: kind,
        p_method: 'promptpay',
        p_order_id: order.id,
        p_raw: result.raw ?? null,
        p_slip_url: body.slip_path,
        p_trans_ref: result.transRef,
        p_verified_by: null,
      });
      await notifyEvent({ eventType: 'paid', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
      return json({ status: 'paid' });
    }

    // Every other outcome (not_configured, unreadable, duplicate, amount_mismatch,
    // wrong_account, quota_exceeded, error, or passed-but-amount-mismatch) → manual queue.
    await rpc('pkm_record_pending_payment', {
      p_amount: order.grand_total,
      p_kind: kind,
      p_note: result.status,
      p_order_id: order.id,
      p_slip_url: body.slip_path,
    });
    await notifyEvent({ eventType: 'slip_received', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
    return json({ status: 'pending_verify', reason: result.status });
  } catch (error) {
    return toErrorResponse(error);
  }
});
