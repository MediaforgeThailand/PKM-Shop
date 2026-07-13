// PKM-Shop — packing station (Ready.md §3.1, §6). Role: packer or admin.
//  claim: take an order in a locked round (confirmed -> packing, stamp packer).
//  pack:  finish packing (packing -> packed) -> record packer commission -> notify customer
//         with the packing photo.
import { assertTenant, rpc, updateRows } from '../_shared/db.ts';
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

    if (body.action === 'claim') {
      await updateRows('orders', { packer_id: profile.id, updated_at: new Date().toISOString() }, {
        id: `eq.${body.order_id}`,
        tenant_id: `eq.${tenant.id}`,
      });
      const order = await rpc('pkm_transition_order', {
        p_actor: actor,
        p_meta: {},
        p_order_id: body.order_id,
        p_to_status: 'packing',
      });
      return json({ ok: true, order });
    }

    // pack
    const order = await rpc('pkm_transition_order', {
      p_actor: actor,
      p_meta: {},
      p_order_id: body.order_id,
      p_photo_url: body.photo_path,
      p_to_status: 'packed',
    });
    if (!order) {
      throw new HttpError('VALIDATION', 'Pack transition failed.', 400);
    }
    await rpc('pkm_record_packer_commission', { p_order_id: body.order_id });

    const photoUrl = await createSignedReadUrl('packing', body.photo_path, 3600).catch(() => null);
    await notifyEvent({ eventType: 'packed', extra: { photoUrl }, orderId: body.order_id, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});

    return json({ ok: true, order });
  } catch (error) {
    return toErrorResponse(error);
  }
});
