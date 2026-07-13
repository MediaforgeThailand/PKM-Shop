// PKM-Shop — admin operations (Ready.md §3.3, §3.6, §3.7). Role: admin.
//  confirm_payment: manual verify from the slip queue (order -> paid, actor admin).
//  cancel_order:    cancel before packing.
//  create_kerry_round + kerry_handover: daily Kerry parcel round.
//  confirm_payout:  mark a payroll payout transferred (+ slip) and notify the staff member.
import { assertTenant, insertRow, rpc, selectOne, updateRows } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertRole, actorTag, resolveStaffProfile } from '../_shared/pkmAuth.ts';
import { notifyEvent } from '../_shared/notify.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm_payment'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), slip_path: z.string().optional() }),
  z.object({ action: z.literal('cancel_order'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal('create_kerry_round'), tenant_slug: z.string().min(1) }),
  z.object({ action: z.literal('kerry_handover'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), tracking: z.string().min(1) }),
  z.object({ action: z.literal('confirm_payout'), tenant_slug: z.string().min(1), payout_id: z.string().uuid(), slip_path: z.string().min(1) }),
]);

type OrderRow = { id: string; grand_total: number; tenant_id: string; delivery_type: string };
type PayoutRow = { id: string; profile_id: string; total: number };

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
        const order = await selectOne<OrderRow>('orders', { id: `eq.${body.order_id}`, select: 'id,grand_total,tenant_id,delivery_type', tenant_id: `eq.${tenant.id}` });
        if (!order) throw new HttpError('VALIDATION', 'Order not found.', 404);
        await rpc('pkm_confirm_payment', {
          p_actor: actor, p_amount: order.grand_total, p_auto: false, p_kind: 'goods', p_method: 'promptpay',
          p_order_id: order.id, p_raw: null, p_slip_url: body.slip_path ?? null, p_trans_ref: null, p_verified_by: profile.user_id,
        });
        await notifyEvent({ eventType: 'paid', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        if (order.delivery_type === 'express_grab') {
          await notifyEvent({ eventType: 'express_paid', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        }
        return json({ ok: true });
      }
      case 'cancel_order': {
        await rpc('pkm_transition_order', { p_actor: actor, p_meta: {}, p_note: body.reason ?? null, p_order_id: body.order_id, p_to_status: 'cancelled' });
        return json({ ok: true });
      }
      case 'create_kerry_round': {
        const round = await rpc('pkm_get_or_create_round', {
          p_round_at: new Date().toISOString(), p_tenant_id: tenant.id, p_type: 'kerry',
        });
        return json({ ok: true, round });
      }
      case 'kerry_handover': {
        // Order must be 'packed' first; transition surfaces the error instead of swallowing it.
        await rpc('pkm_transition_order', { p_actor: actor, p_meta: { tracking: body.tracking }, p_order_id: body.order_id, p_to_status: 'delivered' });
        await updateRows('orders', { external_ref: body.tracking, updated_at: new Date().toISOString() }, { id: `eq.${body.order_id}`, tenant_id: `eq.${tenant.id}` });
        await notifyEvent({ eventType: 'kerry_handover', extra: { tracking: body.tracking }, orderId: body.order_id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        return json({ ok: true });
      }
      case 'confirm_payout': {
        const payout = await selectOne<PayoutRow>('payroll_payouts', { id: `eq.${body.payout_id}`, select: 'id,profile_id,total', tenant_id: `eq.${tenant.id}` });
        if (!payout) throw new HttpError('VALIDATION', 'Payout not found.', 404);
        await updateRows('payroll_payouts', { confirmed_by: profile.user_id, paid_at: new Date().toISOString(), slip_photo_url: body.slip_path }, { id: `eq.${body.payout_id}`, tenant_id: `eq.${tenant.id}` });
        await notifyEvent({ eventType: 'payout_confirmed', extra: { amount: payout.total, profileId: payout.profile_id }, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
        return json({ ok: true });
      }
      default:
        throw new HttpError('VALIDATION', 'Unknown action.', 400);
    }
  } catch (error) {
    return toErrorResponse(error);
  }
});
