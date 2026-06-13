import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { buildPdpaExport, completePdpaRequest, recordPdpaRequest, resolvePdpaActor } from '../_shared/pdpa.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const requestSchema = z.object({
  customer_id: z.string().uuid().optional(),
  tenant_slug: z.string().min(1).optional(),
});

// PDPA data export. Auth: the authenticated customer for their own data, or a
// tenant_admin supplying customer_id for a customer of their tenant.
export async function handlePdpaExport(req: Request) {
  const optionsResponse = handleOptions(req);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }

  try {
    const body = await validateJson(req, requestSchema);
    const actor = await resolvePdpaActor(req.headers.get('authorization'), {
      customerId: body.customer_id,
      tenantSlug: body.tenant_slug,
    });

    if (!actor.found) {
      throw new HttpError('VALIDATION', 'Customer not found.', 404);
    }

    const document = await buildPdpaExport(actor.customer);
    const request = await recordPdpaRequest({
      customerId: actor.customer.id,
      kind: 'export',
      requestedBy: actor.requestedBy,
      tenantId: actor.tenantId,
    });
    await completePdpaRequest(request.id);

    return json({ document, exported_at: new Date().toISOString(), request_id: request.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}

if (!(globalThis as typeof globalThis & { __MIRACARE_SUPPRESS_SERVE__?: boolean }).__MIRACARE_SUPPRESS_SERVE__) {
  Deno.serve(handlePdpaExport);
}
