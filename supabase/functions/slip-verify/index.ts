// PKM-Shop — SlipOK slip verification (Ready.md §3.6, §7.1). Internal (service-role):
// the LINE flow calls this after the customer uploads a slip and relays the typed outcome
// back to the customer. Verifies against the order the customer actually owes:
//   - a pending cart  -> goods payment (expected = grand_total)
//   - a returned order awaiting its redelivery fee -> pkm_process_redelivery_payment
// On a full pass the money-authority RPC flips the order to paid (server-side only);
// anything ambiguous drops into the admin manual queue (payment_status = pending_verify)
// and the admins are notified. SlipOK quota exhaustion (1003/1004) alerts admins urgently.
import { assertServiceRoleAuthorization, assertTenant, rpc, selectOne } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { downloadStorageObject } from '../_shared/storage.ts';
import { receiverMatchesStore, verifySlip } from '../_shared/slipok.ts';
import { notifyEvent } from '../_shared/notify.ts';
import { loadSettings, settingString } from '../_shared/settings.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.object({
  tenant_slug: z.string().min(1),
  order_id: z.string().uuid(),
  slip_path: z.string().min(1),        // path in the private payment-slips bucket
  qr_data: z.string().optional(),      // decoded QR value if the client read it
});

type OrderRow = {
  id: string;
  tenant_id: string;
  order_no: string;
  grand_total: number;
  delivery_fee: number;
  status: string;
  payment_status: string;
  delivery_type: string;
};

type SlipVerifyResponse = {
  status: 'paid' | 'already_paid' | 'bank_delay' | 'retry_later' | 'duplicate' | 'amount_mismatch' | 'unreadable' | 'pending_verify';
  kind: 'goods' | 'redelivery';
  order_no: string;
  expected_amount: number;
  reason?: string;
  retry_minutes?: number;
};

async function queueForManualReview(params: {
  order: OrderRow;
  tenantSlug: string;
  expected: number;
  kind: 'goods' | 'redelivery';
  slipPath: string;
  reason: string;
}): Promise<SlipVerifyResponse> {
  await rpc('pkm_record_pending_payment', {
    p_amount: params.expected,
    p_kind: params.kind,
    p_note: params.reason,
    p_order_id: params.order.id,
    p_slip_url: params.slipPath,
  });
  await notifyEvent({
    eventType: 'slip_manual_queue',
    extra: { reason: params.reason },
    orderId: params.order.id,
    tenantId: params.order.tenant_id,
    tenantSlug: params.tenantSlug,
  }).catch(() => {});
  return {
    expected_amount: params.expected,
    kind: params.kind,
    order_no: params.order.order_no,
    reason: params.reason,
    status: 'pending_verify',
  };
}

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
      select: 'id,tenant_id,order_no,grand_total,delivery_fee,status,payment_status,delivery_type',
      tenant_id: `eq.${tenant.id}`,
    });
    if (!order) {
      throw new HttpError('VALIDATION', 'Order not found.', 404);
    }

    // Which payment does this slip settle?
    let kind: 'goods' | 'redelivery' = 'goods';
    let expected = order.grand_total;
    if (order.status === 'awaiting_redelivery_fee') {
      const ret = await selectOne<{ new_order_id: string | null }>('returns', {
        order_id: `eq.${order.id}`,
        select: 'new_order_id',
      });
      if (ret?.new_order_id) {
        return json({ expected_amount: 0, kind: 'redelivery', order_no: order.order_no, status: 'already_paid' } satisfies SlipVerifyResponse);
      }
      kind = 'redelivery';
      expected = order.delivery_fee;
    } else if (order.payment_status === 'paid') {
      return json({ expected_amount: order.grand_total, kind, order_no: order.order_no, status: 'already_paid' } satisfies SlipVerifyResponse);
    }

    const slip = await downloadStorageObject('payment-slips', body.slip_path);
    const result = await verifySlip({
      contentType: slip.contentType,
      expectedAmount: expected,
      fileBytes: slip.bytes,
      qrData: body.qr_data ?? null,
    });

    const base = { expected_amount: expected, kind, order_no: order.order_no };

    // Bank-origin delay / temporary busy: ask the customer to resend later, do NOT queue.
    if (result.status === 'bank_delay') {
      return json({ ...base, retry_minutes: result.retryMinutes, status: 'bank_delay' } satisfies SlipVerifyResponse);
    }
    if (result.status === 'bank_busy') {
      return json({ ...base, status: 'retry_later' } satisfies SlipVerifyResponse);
    }
    // Known-bad slips: tell the customer directly, no manual queue (Ready.md §7.1).
    if (result.status === 'duplicate') {
      return json({ ...base, status: 'duplicate' } satisfies SlipVerifyResponse);
    }
    if (result.status === 'amount_mismatch') {
      return json({ ...base, status: 'amount_mismatch' } satisfies SlipVerifyResponse);
    }
    if (result.status === 'unreadable') {
      return json({ ...base, status: 'unreadable' } satisfies SlipVerifyResponse);
    }
    // Auto-verification is out of quota: URGENT admin alert + manual queue (Ready.md §7.1).
    if (result.status === 'quota_exceeded') {
      await notifyEvent({ eventType: 'slipok_quota', tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
      return json(await queueForManualReview({ expected, kind, order, reason: 'slipok_quota_exceeded', slipPath: body.slip_path, tenantSlug: tenant.slug }));
    }

    if (result.status === 'passed') {
      // Our-side re-validation (never trust HTTP 200 alone — Ready.md §7.1 step 3):
      // amount, receiver account, duplicate transRef.
      if (result.amount === null || result.amount !== expected) {
        return json(await queueForManualReview({ expected, kind, order, reason: 'amount_unverified', slipPath: body.slip_path, tenantSlug: tenant.slug }));
      }
      const settings = await loadSettings(tenant.id);
      const storeAccount = settingString(settings, 'store_receiver_account', '');
      if (!receiverMatchesStore(result.receiverAccount, storeAccount)) {
        return json(await queueForManualReview({ expected, kind, order, reason: 'wrong_account', slipPath: body.slip_path, tenantSlug: tenant.slug }));
      }
      const dup = await selectOne<{ id: string }>('payments', {
        select: 'id',
        slipok_trans_ref: `eq.${result.transRef}`,
      });
      if (dup) {
        return json({ ...base, status: 'duplicate' } satisfies SlipVerifyResponse);
      }

      if (kind === 'redelivery') {
        const child = await rpc<OrderRow>('pkm_process_redelivery_payment', {
          p_actor: 'system',
          p_amount: expected,
          p_auto: true,
          p_order_id: order.id,
          p_raw: result.raw ?? null,
          p_slip_url: body.slip_path,
          p_trans_ref: result.transRef,
          p_verified_by: null,
        });
        await notifyEvent({ eventType: 'paid', orderId: child.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        if (child.delivery_type === 'express_grab') {
          await notifyEvent({ eventType: 'express_paid', orderId: child.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        }
        return json({ ...base, order_no: child.order_no, status: 'paid' } satisfies SlipVerifyResponse);
      }

      await rpc('pkm_confirm_payment', {
        p_actor: 'system',
        p_amount: expected,
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
      if (order.delivery_type === 'express_grab') {
        await notifyEvent({ eventType: 'express_paid', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
      }
      return json({ ...base, status: 'paid' } satisfies SlipVerifyResponse);
    }

    // not_configured / error -> manual queue with the reason visible to admins.
    return json(await queueForManualReview({ expected, kind, order, reason: result.status, slipPath: body.slip_path, tenantSlug: tenant.slug }));
  } catch (error) {
    return toErrorResponse(error);
  }
});
