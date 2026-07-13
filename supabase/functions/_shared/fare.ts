// PKM-Shop — delivery fare engine (Ready.md §3.3). Pure functions; all rates come from
// app_settings (loaded by settings.ts), never hardcoded. Amounts are integer THB.

export type DeliveryType = 'rider' | 'express_grab' | 'lalamove' | 'parcel_kerry';

export type LalamoveTier = { max_km: number; fee: number };

export type DeliverySettings = {
  normal_fee: number;
  express_surcharge: number;
  lalamove_tiers: LalamoveTier[];
  lalamove_per_km_over_14: number;
  kerry_fee: number;
  service_radius_km: number;
};

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in km between two lat/lng points.
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Lalamove tiered fare: ≤5→50, ≤10→80, ≤14→100, then +per_km_over_14 for each km beyond
// the top tier (rounded up). Tiers come from settings so they stay editable.
export function lalamoveFare(distanceKm: number, s: DeliverySettings): number {
  const tiers = [...s.lalamove_tiers].sort((x, y) => x.max_km - y.max_km);
  if (tiers.length === 0) {
    throw new Error('lalamove_tiers is empty');
  }
  for (const tier of tiers) {
    if (distanceKm <= tier.max_km) {
      return tier.fee;
    }
  }
  const top = tiers[tiers.length - 1];
  const over = Math.ceil(distanceKm - top.max_km);
  return top.fee + Math.max(0, over) * s.lalamove_per_km_over_14;
}

// Fee charged to the customer for a chosen delivery type.
export function computeDeliveryFee(
  type: DeliveryType,
  distanceKm: number,
  s: DeliverySettings,
): number {
  switch (type) {
    case 'rider':
      return s.normal_fee;
    case 'express_grab':
      return s.normal_fee + s.express_surcharge;
    case 'lalamove':
      return lalamoveFare(distanceKm, s);
    case 'parcel_kerry':
      return s.kerry_fee;
    default: {
      const never: never = type;
      throw new Error(`unknown delivery type ${never}`);
    }
  }
}

// Whether an address falls inside the rider service zone.
export function isInServiceZone(distanceKm: number, s: DeliverySettings): boolean {
  return distanceKm <= s.service_radius_km;
}

// Which delivery types are offerable for a given distance (used by the AI to present options).
// In-zone → rider (normal) or express (Grab). Out-of-zone → Lalamove; far → Kerry (always available).
export function availableDeliveryTypes(distanceKm: number, s: DeliverySettings): DeliveryType[] {
  if (isInServiceZone(distanceKm, s)) {
    return ['rider', 'express_grab', 'parcel_kerry'];
  }
  return ['lalamove', 'parcel_kerry'];
}
