// PKM-Shop — rider multi-stop delivery (Ready.md §3.1, §3.2, §3.4). Role: rider or admin.
//  claim_round: accept a locked round (locked -> confirmed, stamp rider), move its packed
//               orders to out_for_delivery, notify every customer in the round.
//  start_stop:  begin a stop (round -> in_progress, order -> delivering), notify that customer.
//  pod:         proof of delivery (order -> delivered + photo), notify; complete round if last.
//  return:      undelivered (order -> returned + reason -> awaiting_redelivery_fee), record a
//               return, notify customer + admin; complete round if last.
import { assertTenant, insertRow, rpc, selectMany, updateRows } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertRole, actorTag, resolveStaffProfile, type StaffProfile } from '../_shared/pkmAuth.ts';
import { createSignedReadUrl } from '../_shared/storage.ts';
import { notifyEvent } from '../_shared/notify.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim_round'), tenant_slug: z.string().min(1), round_id: z.string().uuid() }),
  z.object({ action: z.literal('start_stop'), tenant_slug: z.string().min(1), order_id: z.string().uuid() }),
  z.object({ action: z.literal('pod'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), photo_path: z.string().min(1) }),
  z.object({ action: z.literal('return'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), reason: z.string().min(1).max(300) }),
]);

type OrderRow = { id: string; status: string; round_id: string | null; stop_sequence: number | null; delivery_fee: number };

async function ordersInRound(roundId: string, tenantId: string): Promise<OrderRow[]> {
  return selectMany<OrderRow>('orders', {
    round_id: `eq.${roundId}`,
    select: 'id,status,round_id,stop_sequence,delivery_fee',
    tenant_id: `eq.${tenantId}`,
  });
}

// Complete a round once NO order is still in flight; pay the rider for the round.
// "In flight" = any non-terminal status, including confirmed/packing (an unpacked order must
// not orphan when the last packed order is delivered) — audit fix.
async function maybeCompleteRound(roundId: string, tenantId: string, actor: string) {
  const orders = await ordersInRound(roundId, tenantId);
  const active = orders.some((o) => ['confirmed', 'packing', 'packed', 'out_for_delivery', 'delivering'].includes(o.status));
  if (active) {
    return;
  }
  await rpc('pkm_transition_round', { p_actor: actor, p_meta: {}, p_round_id: roundId, p_rider_id: null, p_to_status: 'done' }).catch(() => {});
  await rpc('pkm_record_rider_round_pay', { p_round_id: roundId }).catch(() => {});
}

async function handleClaimRound(roundId: string, tenant: { id: string; slug: string }, profile: StaffProfile, actor: string) {
  await rpc('pkm_transition_round', { p_actor: actor, p_meta: {}, p_rider_id: profile.id, p_round_id: roundId, p_to_status: 'confirmed' });
  const orders = await ordersInRound(roundId, tenant.id);
  for (const o of orders) {
    if (o.status === 'packed') {
      await rpc('pkm_transition_order', { p_actor: actor, p_meta: {}, p_order_id: o.id, p_to_status: 'out_for_delivery' }).catch(() => {});
    }
  }
  await notifyEvent({ eventType: 'rider_accepted', roundId, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
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
    assertRole(profile, ['rider']);
    const actor = actorTag('rider', profile);

    if (body.action === 'claim_round') {
      await handleClaimRound(body.round_id, tenant, profile, actor);
      return json({ ok: true });
    }

    // The remaining actions target a single order; load it for its round.
    const orders = await selectMany<OrderRow>('orders', {
      id: `eq.${body.order_id}`,
      select: 'id,status,round_id,stop_sequence,delivery_fee',
      tenant_id: `eq.${tenant.id}`,
    });
    const order = orders[0];
    if (!order) {
      throw new HttpError('VALIDATION', 'Order not found.', 404);
    }

    if (body.action === 'start_stop') {
      if (order.round_id) {
        await rpc('pkm_transition_round', { p_actor: actor, p_meta: {}, p_rider_id: null, p_round_id: order.round_id, p_to_status: 'in_progress' }).catch(() => {});
        const roundOrders = await ordersInRound(order.round_id, tenant.id);
        const maxSeq = roundOrders.reduce((m, o) => Math.max(m, o.stop_sequence ?? 0), 0);
        await updateRows('orders', { stop_sequence: maxSeq + 1 }, { id: `eq.${order.id}`, tenant_id: `eq.${tenant.id}` });
      }
      await rpc('pkm_transition_order', { p_actor: actor, p_meta: {}, p_order_id: order.id, p_to_status: 'delivering' });
      await notifyEvent({ eventType: 'rider_dispatched', orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
      return json({ ok: true });
    }

    if (body.action === 'pod') {
      await rpc('pkm_transition_order', { p_actor: actor, p_meta: {}, p_order_id: order.id, p_photo_url: body.photo_path, p_to_status: 'delivered' });
      const photoUrl = await createSignedReadUrl('pod', body.photo_path, 3600).catch(() => null);
      await notifyEvent({ eventType: 'delivered', extra: { photoUrl }, orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
      if (order.round_id) {
        await maybeCompleteRound(order.round_id, tenant.id, actor);
      }
      return json({ ok: true });
    }

    // return
    await rpc('pkm_transition_order', { p_actor: actor, p_meta: { reason: body.reason }, p_note: body.reason, p_order_id: order.id, p_to_status: 'returned' });
    await insertRow('returns', { order_id: order.id, reason: body.reason, tenant_id: tenant.id });
    await rpc('pkm_transition_order', { p_actor: 'system', p_meta: {}, p_order_id: order.id, p_to_status: 'awaiting_redelivery_fee' }).catch(() => {});
    await notifyEvent({ eventType: 'returned', extra: { reason: body.reason }, orderId: order.id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
    if (order.round_id) {
      await maybeCompleteRound(order.round_id, tenant.id, actor);
    }
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
});
