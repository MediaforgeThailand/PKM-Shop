import {
  availableDeliveryTypes,
  computeDeliveryFee,
  haversineKm,
  isInServiceZone,
  lalamoveFare,
  type DeliverySettings,
} from '../fare.ts';
import { computeRoundAt, roundLabelBangkok } from '../rounds.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

const S: DeliverySettings = {
  normal_fee: 40,
  express_surcharge: 55,
  lalamove_tiers: [
    { max_km: 5, fee: 50 },
    { max_km: 10, fee: 80 },
    { max_km: 14, fee: 100 },
  ],
  lalamove_per_km_over_14: 10,
  kerry_fee: 100,
  service_radius_km: 8,
};

// Bangkok-local wall clock -> UTC Date (UTC+7, no DST).
function bkk(y: number, mo1: number, d: number, h: number, m: number): Date {
  return new Date(Date.UTC(y, mo1 - 1, d, h, m, 0) - 7 * 3600 * 1000);
}

Deno.test('fare: rider = normal_fee', () => {
  assertEquals(computeDeliveryFee('rider', 3, S), 40);
});

Deno.test('fare: express = normal_fee + surcharge', () => {
  assertEquals(computeDeliveryFee('express_grab', 3, S), 95);
});

Deno.test('fare: kerry = flat', () => {
  assertEquals(computeDeliveryFee('parcel_kerry', 250, S), 100);
});

Deno.test('fare: lalamove tier boundaries', () => {
  assertEquals(lalamoveFare(3, S), 50);
  assertEquals(lalamoveFare(5, S), 50);
  assertEquals(lalamoveFare(5.1, S), 80);
  assertEquals(lalamoveFare(10, S), 80);
  assertEquals(lalamoveFare(14, S), 100);
});

Deno.test('fare: lalamove over 14km adds per-km (rounded up)', () => {
  assertEquals(lalamoveFare(14.1, S), 110); // 100 + ceil(0.1)*10
  assertEquals(lalamoveFare(20, S), 160); // 100 + 6*10
  assertEquals(lalamoveFare(24, S), 200); // 100 + 10*10
});

Deno.test('zone + available types', () => {
  assert(isInServiceZone(8, S), '8km should be in zone');
  assert(!isInServiceZone(8.1, S), '8.1km should be out of zone');
  assertEquals(availableDeliveryTypes(5, S), ['rider', 'express_grab', 'parcel_kerry']);
  assertEquals(availableDeliveryTypes(12, S), ['lalamove', 'parcel_kerry']);
});

Deno.test('haversine sanity (~1.11km per 0.01° lat)', () => {
  const d = haversineKm({ lat: 13.75, lng: 100.5 }, { lat: 13.76, lng: 100.5 });
  assert(d > 1.0 && d < 1.2, `expected ~1.11km, got ${d}`);
});

Deno.test('round cutoff: minute < 30 -> next top of hour', () => {
  assertEquals(computeRoundAt(bkk(2026, 7, 13, 12, 29)).getTime(), bkk(2026, 7, 13, 13, 0).getTime());
  assertEquals(computeRoundAt(bkk(2026, 7, 13, 12, 0)).getTime(), bkk(2026, 7, 13, 13, 0).getTime());
});

Deno.test('round cutoff: minute >= 30 -> +2 hours', () => {
  assertEquals(computeRoundAt(bkk(2026, 7, 13, 12, 30)).getTime(), bkk(2026, 7, 13, 14, 0).getTime());
  assertEquals(computeRoundAt(bkk(2026, 7, 13, 12, 31)).getTime(), bkk(2026, 7, 13, 14, 0).getTime());
});

Deno.test('round cutoff: crosses midnight', () => {
  assertEquals(computeRoundAt(bkk(2026, 7, 13, 23, 29)).getTime(), bkk(2026, 7, 14, 0, 0).getTime());
  assertEquals(computeRoundAt(bkk(2026, 7, 13, 23, 45)).getTime(), bkk(2026, 7, 14, 1, 0).getTime());
});

Deno.test('round label is Bangkok HH:00', () => {
  assertEquals(roundLabelBangkok(bkk(2026, 7, 13, 14, 0)), '14:00');
  assertEquals(roundLabelBangkok(bkk(2026, 7, 14, 0, 0)), '00:00');
});
