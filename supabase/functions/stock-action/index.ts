// PKM-Shop — stock movements (Ready.md §3.5). Role: stock or admin. Inbound (qty > 0) must
// carry a photo. Adjusts products.stock_qty transactionally via pkm_apply_stock_movement.
import { assertTenant, rpc } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertRole, resolveStaffProfile } from '../_shared/pkmAuth.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.object({
  tenant_slug: z.string().min(1),
  product_id: z.string().uuid(),
  qty: z.number().int().refine((n) => n !== 0, 'qty must be non-zero'),
  photo_path: z.string().optional(),
  reason: z.string().max(300).optional(),
});

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }
  try {
    const body = await validateJson(req, schema);
    const tenant = await assertTenant(body.tenant_slug);
    const profile = await resolveStaffProfile(req.headers.get('authorization'), tenant.id);
    assertRole(profile, ['stock']);

    if (body.photo_path && !body.photo_path.startsWith(`${tenant.id}/`)) {
      throw new HttpError('VALIDATION', 'Invalid photo path.', 400);
    }

    const movement = await rpc('pkm_apply_stock_movement', {
      p_actor: profile.user_id,
      p_photo_url: body.photo_path ?? null,
      p_product_id: body.product_id,
      p_qty: body.qty,
      p_reason: body.reason ?? null,
      p_tenant_id: tenant.id,
    });

    return json({ movement, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
});
