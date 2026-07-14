// PKM-Shop — admin operations (Ready.md §3.3, §3.6, §3.7, §4). Role: admin.
//  confirm_payment: approve a manual-queue slip (flips the EXISTING pending payment row).
//  reject_payment:  reject a manual-queue slip + tell the customer why.
//  cancel_order:    cancel before packing.
//  create_kerry_round + kerry_handover: daily Kerry parcel round (one per Bangkok day).
//  set_external_ref: record the Grab/Lalamove/Kerry reference number (Ready.md §3.3).
//  set_customer_zone: per-customer delivery-zone override (Ready.md §3.3).
//  create_manual_order: phone orders; notifies the customer with payment info.
//  confirm_payout:  mark a payroll payout transferred (+ slip) and notify the staff member.
//  send_customer_message / close_handoff: admin answers the LINE chat in place of the AI.
import { assertTenant, insertRow, rpc, selectOne, updateRows } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertRole, actorTag, resolveStaffProfile } from '../_shared/pkmAuth.ts';
import { pushLineMessages, textLineMessage } from '../_shared/line.ts';
import { notifyEvent } from '../_shared/notify.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm_payment'), tenant_slug: z.string().min(1), payment_id: z.string().uuid() }),
  z.object({ action: z.literal('reject_payment'), tenant_slug: z.string().min(1), payment_id: z.string().uuid(), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal('cancel_order'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal('create_kerry_round'), tenant_slug: z.string().min(1) }),
  z.object({ action: z.literal('kerry_handover'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), tracking: z.string().min(1).max(120) }),
  z.object({ action: z.literal('set_external_ref'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), external_ref: z.string().min(1).max(120) }),
  z.object({ action: z.literal('set_customer_zone'), tenant_slug: z.string().min(1), customer_id: z.string().uuid(), zone: z.enum(['in_zone', 'out_zone']).nullable() }),
  z.object({ action: z.literal('confirm_payout'), tenant_slug: z.string().min(1), payout_id: z.string().uuid(), slip_path: z.string().min(1) }),
  z.object({ action: z.literal('send_customer_message'), tenant_slug: z.string().min(1), session_id: z.string().uuid(), text: z.string().min(1).max(2000) }),
  z.object({ action: z.literal('close_handoff'), tenant_slug: z.string().min(1), session_id: z.string().uuid() }),
  z.object({
    action: z.literal('create_manual_order'), tenant_slug: z.string().min(1),
    items: z.array(z.object({ product_id: z.string().uuid(), qty: z.number().int().min(1).max(99) })).min(1),
    delivery_type: z.enum(['rider', 'express_grab', 'parcel_kerry']).default('rider'),
    address: z.string().max(500).optional(),
    recipient_name: z.string().max(120).optional(),
    recipient_phone: z.string().max(30).optional(),
    customer_phone: z.string().max(30).optional(),
    mark_paid: z.boolean().optional(),
  }),
]);

type OrderRow = { id: string; order_no: string; grand_total: number; tenant_id: string; delivery_type: string; status: string };
type PaymentRow = { id: string; tenant_id: string; order_id: string; status: string; kind: string };
type PayoutRow = { id: string; profile_id: string; total: number };
type SessionRow = { id: string; tenant_id: string; customer_id: string; agent_mode: string };

async function requireOrder(orderId: string, tenantId: string): Promise<OrderRow> {
  const order = await selectOne<OrderRow>('orders', {
    id: `eq.${orderId}`,
    select: 'id,order_no,grand_total,tenant_id,delivery_type,status',
    tenant_id: `eq.${tenantId}`,
  });
  if (!order) throw new HttpError('VALIDATION', 'Order not found.', 404);
  return order;
}

async function requirePayment(paymentId: string, tenantId: string): Promise<PaymentRow> {
  const pay = await selectOne<PaymentRow>('payments', {
    id: `eq.${paymentId}`,
    select: 'id,tenant_id,order_id,status,kind',
    tenant_id: `eq.${tenantId}`,
  });
  if (!pay) throw new HttpError('VALIDATION', 'Payment not found.', 404);
  return pay;
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }
  try {
    const body = await validateJson(req, schema);
    const tenant = await assertTenant(body.tenant_slug);
    const profile = await resolveStaffProfile(req.headers.get('authorization'), tenant.id);
    assertRole(profile, ['admin']);
    const actor = actorTag('admin', profile);

    switch (body.action) {
      case 'confirm_payment': {
        await requirePayment(body.payment_id, tenant.id);
        const order = await rpc<OrderRow>('pkm_confirm_pending_payment', {
          p_actor: actor, p_payment_id: body.payment_id, p_verified_by: profile.user_id,
        });
        // The RPC no-ops (returns the untouched order) when the order raced past the
        // confirmable state — surface that instead of toasting a false success.
        const after = await requirePayment(body.payment_id, tenant.id);
        if (after.status === 'pending_verify') {
          throw new HttpError('CONFLICT', `ยืนยันไม่ได้ — ออเดอร์อยู่สถานะ "${order.status}" แล้ว ตรวจสอบหรือปฏิเสธสลิปนี้แทน`, 409);
        }
        await notifyEvent({ eventType: 'paid', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        if (order.delivery_type === 'express_grab') {
          await notifyEvent({ eventType: 'express_paid', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        }
        return json({ ok: true, order });
      }
      case 'reject_payment': {
        const pay = await requirePayment(body.payment_id, tenant.id);
        await rpc('pkm_reject_payment', { p_actor: actor, p_note: body.reason ?? null, p_payment_id: body.payment_id });
        await notifyEvent({ eventType: 'payment_rejected', extra: { reason: body.reason }, orderId: pay.order_id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        return json({ ok: true });
      }
      case 'cancel_order': {
        await requireOrder(body.order_id, tenant.id);
        await rpc('pkm_transition_order', { p_actor: actor, p_meta: {}, p_note: body.reason ?? null, p_order_id: body.order_id, p_to_status: 'cancelled' });
        return json({ ok: true });
      }
      case 'create_kerry_round': {
        const round = await rpc('pkm_get_or_create_daily_kerry_round', { p_tenant_id: tenant.id });
        return json({ ok: true, round });
      }
      case 'kerry_handover': {
        const order = await requireOrder(body.order_id, tenant.id);
        if (order.delivery_type !== 'parcel_kerry') {
          throw new HttpError('VALIDATION', 'ออเดอร์นี้ไม่ใช่พัสดุ Kerry', 400);
        }
        // Order must be 'packed' first; transition surfaces the error instead of swallowing it.
        await rpc('pkm_transition_order', { p_actor: actor, p_meta: { tracking: body.tracking }, p_order_id: body.order_id, p_to_status: 'delivered' });
        await updateRows('orders', { external_ref: body.tracking, updated_at: new Date().toISOString() }, { id: `eq.${body.order_id}`, tenant_id: `eq.${tenant.id}` });
        await notifyEvent({ eventType: 'kerry_handover', extra: { tracking: body.tracking }, orderId: body.order_id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        return json({ ok: true });
      }
      case 'set_external_ref': {
        const order = await requireOrder(body.order_id, tenant.id);
        if (!['express_grab', 'lalamove', 'parcel_kerry'].includes(order.delivery_type)) {
          throw new HttpError('VALIDATION', 'เลขอ้างอิงใช้กับออเดอร์ Grab/Lalamove/Kerry เท่านั้น', 400);
        }
        await updateRows('orders', { external_ref: body.external_ref, updated_at: new Date().toISOString() }, { id: `eq.${body.order_id}`, tenant_id: `eq.${tenant.id}` });
        return json({ ok: true });
      }
      case 'set_customer_zone': {
        const rows = await updateRows<{ id: string }>('customers', { zone_override: body.zone }, { id: `eq.${body.customer_id}`, select: 'id', tenant_id: `eq.${tenant.id}` });
        if (!rows || rows.length === 0) {
          throw new HttpError('VALIDATION', 'Customer not found.', 404);
        }
        return json({ ok: true });
      }
      case 'create_manual_order': {
        const order = await rpc<OrderRow>('pkm_create_order', {
          p_tenant_id: tenant.id,
          p_items: body.items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
          p_delivery_type: body.delivery_type,
          p_address: body.address ?? null,
          p_recipient_name: body.recipient_name ?? null,
          p_recipient_phone: body.recipient_phone ?? null,
          p_customer_phone: body.customer_phone ?? null,
          p_lat: null, p_lng: null,
        });
        if (body.mark_paid) {
          await rpc('pkm_confirm_payment', {
            p_actor: actor, p_amount: order.grand_total, p_auto: false, p_kind: 'goods', p_method: 'promptpay',
            p_order_id: order.id, p_raw: null, p_slip_url: null, p_trans_ref: null, p_verified_by: profile.user_id,
          });
          await notifyEvent({ eventType: 'paid', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
          if (order.delivery_type === 'express_grab') {
            await notifyEvent({ eventType: 'express_paid', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
          }
        } else {
          // Matrix row "ออเดอร์สร้าง (pending)": customer gets the summary + payment info.
          await notifyEvent({ eventType: 'order_created', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        }
        return json({ ok: true, order });
      }
      case 'confirm_payout': {
        const payout = await selectOne<PayoutRow>('payroll_payouts', { id: `eq.${body.payout_id}`, select: 'id,profile_id,total', tenant_id: `eq.${tenant.id}` });
        if (!payout) throw new HttpError('VALIDATION', 'Payout not found.', 404);
        // Guard against a second admin confirming the same payout (= a second bank transfer).
        const rows = await updateRows<{ id: string }>('payroll_payouts',
          { confirmed_by: profile.user_id, paid_at: new Date().toISOString(), slip_photo_url: body.slip_path },
          { id: `eq.${body.payout_id}`, paid_at: 'is.null', select: 'id', tenant_id: `eq.${tenant.id}` });
        if (!rows || rows.length === 0) {
          throw new HttpError('CONFLICT', 'รายการนี้ถูกยืนยันโอนไปแล้ว', 409);
        }
        await notifyEvent({ eventType: 'payout_confirmed', extra: { amount: payout.total, profileId: payout.profile_id }, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        return json({ ok: true });
      }
      case 'send_customer_message': {
        const session = await selectOne<SessionRow>('chat_sessions', { id: `eq.${body.session_id}`, select: 'id,tenant_id,customer_id,agent_mode', tenant_id: `eq.${tenant.id}` });
        if (!session) throw new HttpError('VALIDATION', 'Session not found.', 404);
        const customer = await selectOne<{ line_user_id: string | null }>('customers', { id: `eq.${session.customer_id}`, select: 'line_user_id', tenant_id: `eq.${tenant.id}` });
        // Admin reply implies takeover: AI stays silent until close_handoff.
        if (session.agent_mode !== 'human') {
          await updateRows('chat_sessions', { agent_mode: 'human' }, { id: `eq.${session.id}`, select: 'id', tenant_id: `eq.${tenant.id}` });
        }
        await insertRow('chat_messages', { content: body.text, role: 'admin', session_id: session.id }, { select: 'id' });
        await updateRows('chat_sessions', { last_message_at: new Date().toISOString() }, { id: `eq.${session.id}`, select: 'id' });
        if (customer?.line_user_id) {
          await pushLineMessages(tenant.slug, customer.line_user_id, [textLineMessage(body.text)]);
        }
        return json({ ok: true, pushed: Boolean(customer?.line_user_id) });
      }
      case 'close_handoff': {
        const session = await selectOne<SessionRow>('chat_sessions', { id: `eq.${body.session_id}`, select: 'id,tenant_id,customer_id,agent_mode', tenant_id: `eq.${tenant.id}` });
        if (!session) throw new HttpError('VALIDATION', 'Session not found.', 404);
        await updateRows('chat_sessions', { agent_mode: 'ai', flagged: null }, { id: `eq.${session.id}`, select: 'id', tenant_id: `eq.${tenant.id}` });
        await insertRow('chat_messages', { content: 'แอดมินปิดเคส — AI กลับมาตอบอัตโนมัติ', role: 'system_notice', session_id: session.id }, { select: 'id' }).catch(() => {});
        return json({ ok: true });
      }
      default:
        throw new HttpError('VALIDATION', 'Unknown action.', 400);
    }
  } catch (error) {
    return toErrorResponse(error);
  }
});
