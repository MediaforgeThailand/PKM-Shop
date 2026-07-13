// PKM-Shop — typed access to app_settings (Ready.md §5, §9: never hardcode rates).
import { selectMany } from './db.ts';
import type { DeliverySettings, LalamoveTier } from './fare.ts';

export type SettingsMap = Record<string, unknown>;

export async function loadSettings(tenantId: string): Promise<SettingsMap> {
  const rows = await selectMany<{ key: string; value: unknown }>('app_settings', {
    select: 'key,value',
    tenant_id: `eq.${tenantId}`,
  });
  const map: SettingsMap = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export function settingNumber(map: SettingsMap, key: string, fallback: number): number {
  const value = map[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function settingString(map: SettingsMap, key: string, fallback: string): string {
  const value = map[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function storeLatLng(map: SettingsMap): { lat: number; lng: number } | null {
  const lat = map['store_lat'];
  const lng = map['store_lng'];
  if (typeof lat === 'number' && typeof lng === 'number') {
    return { lat, lng };
  }
  return null;
}

const DEFAULT_TIERS: LalamoveTier[] = [
  { max_km: 5, fee: 50 },
  { max_km: 10, fee: 80 },
  { max_km: 14, fee: 100 },
];

function parseTiers(value: unknown): LalamoveTier[] {
  if (!Array.isArray(value)) {
    return DEFAULT_TIERS;
  }
  const tiers = value
    .filter((t): t is { max_km: number; fee: number } =>
      Boolean(t) && typeof t === 'object' &&
      typeof (t as { max_km?: unknown }).max_km === 'number' &&
      typeof (t as { fee?: unknown }).fee === 'number')
    .map((t) => ({ max_km: t.max_km, fee: t.fee }));
  return tiers.length ? tiers : DEFAULT_TIERS;
}

export function deliverySettings(map: SettingsMap): DeliverySettings {
  return {
    normal_fee: settingNumber(map, 'normal_fee', 40),
    express_surcharge: settingNumber(map, 'express_surcharge', 55),
    lalamove_tiers: parseTiers(map['lalamove_tiers']),
    lalamove_per_km_over_14: settingNumber(map, 'lalamove_per_km_over_14', 10),
    kerry_fee: settingNumber(map, 'kerry_fee', 100),
    service_radius_km: settingNumber(map, 'service_radius_km', 8),
  };
}
