// PKM-Shop — packing station (Ready.md §3.1, §6). Role: packer or admin.
//  claim: take an order in a locked round (confirmed -> packing, stamp packer). Atomic —
//         a second packer hitting the same order gets a 409 instead of silently stealing it.
//  pack:  finish packing (packing -> packed) -> record packer commission -> notify customer
//         with the packing photo. Only the claiming packer (or an admin) can pack.
import { assertTenant, rest, rpc, selectOne } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertRole, actorTag, resolveStaffProfile } from '../_shared/pkmAuth.ts';
import { createSignedReadUrl } from '../_shared/storage.ts';
import { notifyEvent } from '../_shared/notify.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim'), tenant_slug: z.string().min(1), order_id: z.string().uuid() }),
  z.object({ action: z.literal('pack'), tenant_slug: z.string().min(1), order_id: z.string().uuid(), photo_path: z.string().min(1) }),
]);

type OrderRow = { id: string; status: string; packer_id: string | null };

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }
  try {
    const body = await validateJson(req, schema);
    const tenant = await assertTenant(body.tenant_slug);
    const profile = await resolveStaffProfile(req.headers.get('authorization'), tenant.id);
    assertRole(profile, ['packer']);
    const actor = actorTag('packer', profile);
    const isAdmin = profile.roles.includes('admin');

    const order = await selectOne<OrderRow>('orders', {
      id: `eq.${body.order_id}`,
      select: 'id,status,packer_id',
      tenant_id: `eq.${tenant.id}`,
    });
    if (!order) {
      throw new HttpError('VALIDATION', 'Order not found.', 404);
    }

    if (body.action === 'claim') {
      // Atomic claim: only stamps when the order is still unclaimed (or already mine).
      const claimed = await rest<OrderRow[]>(
        `orders?id=eq.${body.order_id}&tenant_id=eq.${tenant.id}&status=eq.confirmed&or=(packer_id.is.null,packer_id.eq.${profile.id})`,
        { body: { packer_id: profile.id, updated_at: new Date().toISOString() }, method: 'PATCH', prefer: 'return=representation' },
      );
      if (!claimed || claimed.length === 0) {
        throw new HttpError('CONFLICT', order.packer_id && order.packer_id !== profile.id ? 'ออเดอร์นี้มีคนรับแพ็คแล้ว' : 'ออเดอร์นี้ไม่อยู่ในสถานะรอแพ็ค', 409);
      }
      const updated = await rpc('pkm_transition_order', {
        p_actor: actor,
        p_meta: {},
        p_order_id: body.order_id,
        p_to_status: 'packing',
      });
      return json({ ok: true, order: updated });
    }

    // pack — must be the packer who claimed it (admins exempt).
    if (!isAdmin && order.packer_id !== profile.id) {
      throw new HttpError('FORBIDDEN', 'ออเดอร์นี้อยู่ในมือแพ็คเกอร์คนอื่น', 403);
    }
    if (!body.photo_path.startsWith(`${tenant.id}/`)) {
      throw new HttpError('VALIDATION', 'Invalid photo path.', 400);
    }
    const packed = await rpc('pkm_transition_order', {
      p_actor: actor,
      p_meta: {},
      p_order_id: body.order_id,
      p_photo_url: body.photo_path,
      p_to_status: 'packed',
    });
    if (!packed) {
      throw new HttpError('VALIDATION', 'Pack transition failed.', 400);
    }
    await rpc('pkm_record_packer_commission', { p_order_id: body.order_id });

    const photoUrl = await createSignedReadUrl('packing', body.photo_path, 3600).catch(() => null);
    await notifyEvent({ eventType: 'packed', extra: { photoUrl }, orderId: body.order_id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});

    return json({ ok: true, order: packed });
  } catch (error) {
    return toErrorResponse(error);
  }
});
