// PKM-Shop — delivery fare quote (Ready.md §3.3). Internal (service-role); the AI sales
// agent calls this to quote shipping. Rates + store location come from app_settings.
import { assertServiceRoleAuthorization, assertTenant } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { availableDeliveryTypes, computeDeliveryFee, haversineKm, isInServiceZone } from '../_shared/fare.ts';
import { deliverySettings, loadSettings, storeLatLng } from '../_shared/settings.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const schema = z.object({
  tenant_slug: z.string().min(1),
  delivery_type: z.enum(['rider', 'express_grab', 'lalamove', 'parcel_kerry']).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
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
    const settingsMap = await loadSettings(tenant.id);
    const settings = deliverySettings(settingsMap);
    const store = storeLatLng(settingsMap);

    let distanceKm: number | null = null;
    if (store && typeof body.lat === 'number' && typeof body.lng === 'number') {
      distanceKm = Math.round(haversineKm(store, { lat: body.lat, lng: body.lng }) * 100) / 100;
    }

    // Fee for a specific requested type (lalamove needs a distance).
    let fee: number | null = null;
    if (body.delivery_type) {
      if (body.delivery_type === 'lalamove' && distanceKm === null) {
        throw new HttpError('VALIDATION', 'Lalamove fare needs store + customer coordinates.', 400);
      }
      fee = computeDeliveryFee(body.delivery_type, distanceKm ?? 0, settings);
    }

    return json({
      available_types: distanceKm === null ? null : availableDeliveryTypes(distanceKm, settings),
      distance_km: distanceKm,
      fee,
      in_zone: distanceKm === null ? null : isInServiceZone(distanceKm, settings),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
});
