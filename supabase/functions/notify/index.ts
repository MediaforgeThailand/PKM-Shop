// PKM-Shop — the single outbound notification entry point (Ready.md §4).
// Internal (service-role) only: producers POST an event; notifyEvent fans it out over LINE.
import { assertServiceRoleAuthorization, assertTenant } from '../_shared/db.ts';
import { handleOptions, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { notifyEvent, type NotifyParams } from '../_shared/notify.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.object({
  tenant_slug: z.string().min(1),
  event_type: z.enum([
    'order_created', 'slip_received', 'paid', 'round_locked', 'packed',
    'rider_accepted', 'rider_dispatched', 'delivered', 'returned',
    'express_paid', 'payroll_cutoff', 'payout_confirmed', 'kerry_handover',
  ]),
  order_id: z.string().uuid().optional(),
  round_id: z.string().uuid().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }
  try {
    assertServiceRoleAuthorization(req.headers.get('authorization'));
    const body = await validateJson(req, schema);
    const tenant = await assertTenant(body.tenant_slug);
    await notifyEvent({
      eventType: body.event_type,
      extra: body.extra as unknown as NotifyParams['extra'],
      orderId: body.order_id,
      roundId: body.round_id,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    });
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
});
