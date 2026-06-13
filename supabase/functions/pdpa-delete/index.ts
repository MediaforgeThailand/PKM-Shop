import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { authorizePriorDelete, completePdpaRequest, executePdpaErasure, recordPdpaRequest, resolvePdpaActor } from '../_shared/pdpa.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const requestSchema = z.object({
  confirm: z.literal('ลบถาวร'),
  customer_id: z.string().uuid().optional(),
  tenant_slug: z.string().min(1).optional(),
});

// PDPA hard-delete (right to erasure). Auth: the authenticated customer for their
// own data, or a tenant_admin supplying customer_id for a customer of their tenant.
// Orders are anonymized (financial integrity), never deleted; orders.status is untouched.
export async function handlePdpaDelete(req: Request) {
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
      // Admin targeted a customer that no longer exists: stay idempotent only if a
      // prior delete request exists and the caller still administers that tenant.
      if (!body.customer_id) {
        throw new HttpError('VALIDATION', 'Customer not found.', 404);
      }

      await authorizePriorDelete(req.headers.get('authorization'), body.customer_id);

      return json({ completed_at: null, deleted: false, noop: true, request_id: null });
    }

    const request = await recordPdpaRequest({
      customerId: actor.customer.id,
      kind: 'delete',
      requestedBy: actor.requestedBy,
      tenantId: actor.tenantId,
    });
    await executePdpaErasure(actor.customer);
    await completePdpaRequest(request.id);

    return json({ completed_at: new Date().toISOString(), deleted: true, noop: false, request_id: request.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}

if (!(globalThis as typeof globalThis & { __MIRACARE_SUPPRESS_SERVE__?: boolean }).__MIRACARE_SUPPRESS_SERVE__) {
  Deno.serve(handlePdpaDelete);
}
