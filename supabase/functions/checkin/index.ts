// PKM-Shop — HR check-in (Ready.md §3.8). Any active staff. Records photo + GPS and whether
// the location is within the check-in radius (records pass/fail; never blocks work).
import { assertTenant, insertRow, selectOne } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { resolveStaffProfile } from '../_shared/pkmAuth.ts';
import { haversineKm } from '../_shared/fare.ts';
import { loadSettings, settingNumber, storeLatLng } from '../_shared/settings.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

// Ready.md §3.8: check-in = photo + GPS, always. The record never blocks work, but an
// empty check-in is meaningless — both are required.
const schema = z.object({
  tenant_slug: z.string().min(1),
  shift_id: z.string().uuid().optional(),
  photo_path: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
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

    // shift_id must be one of THIS tenant's shifts (arbitrary UUIDs pollute reports).
    if (body.shift_id) {
      const shift = await selectOne<{ id: string }>('shifts', { id: `eq.${body.shift_id}`, select: 'id', tenant_id: `eq.${tenant.id}` });
      if (!shift) {
        throw new HttpError('VALIDATION', 'ไม่พบกะที่เลือก', 400);
      }
    }

    const settingsMap = await loadSettings(tenant.id);
    const store = storeLatLng(settingsMap);
    const radiusM = settingNumber(settingsMap, 'checkin_radius_m', 150);

    let geofencePass: boolean | null = null;
    if (store) {
      const meters = haversineKm(store, { lat: body.lat, lng: body.lng }) * 1000;
      geofencePass = meters <= radiusM;
    }

    const row = await insertRow('attendance', {
      geofence_pass: geofencePass,
      lat: body.lat,
      lng: body.lng,
      photo_url: body.photo_path,
      profile_id: profile.id,
      shift_id: body.shift_id ?? null,
      tenant_id: tenant.id,
    }, { select: 'id,geofence_pass,checked_in_at' });

    return json({ attendance: row, geofence_pass: geofencePass, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
});
