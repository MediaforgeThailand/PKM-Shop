// PKM-Shop — customer AI sales chat entry (app/PWA channel). Thin HTTP shell over
// orchestrateChat; the LINE channel enters through line-webhook.
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { orchestrateChat } from '../_shared/pkmOrchestrate.ts';
import type { PkmChatRequest } from '../_shared/pkmTypes.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('browse_categories') }),
  z.object({ type: z.literal('browse_category'), category_id: z.string().uuid() }),
  z.object({ type: z.literal('select_product'), catalog_key: z.string().min(1), qty: z.number().int().min(1).max(99).optional() }),
  z.object({ type: z.literal('set_address'), lat: z.number().optional(), lng: z.number().optional(), address_text: z.string().max(500).optional() }),
  z.object({ type: z.literal('choose_delivery_type'), delivery_type: z.enum(['rider', 'express_grab', 'lalamove', 'parcel_kerry']) }),
  z.object({ type: z.literal('confirm_order') }),
  z.object({ type: z.literal('request_slip_upload'), content_type: z.enum(['image/jpeg', 'image/png']) }),
  z.object({ type: z.literal('payment_slip'), slip_path: z.string().min(1) }),
  z.object({ type: z.literal('get_order_status') }),
  z.object({ type: z.literal('refresh_order') }),
]);

const schema = z.object({
  action: actionSchema.nullable(),
  channel: z.enum(['app', 'line']),
  client_msg_id: z.string().uuid(),
  message: z.string().trim(),
  session_id: z.string().uuid().nullable(),
  tenant_slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
});

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }
  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }
  try {
    const body = await validateJson(req, schema);
    const result = await orchestrateChat(body as unknown as PkmChatRequest, req.headers.get('authorization'));
    return json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
});
