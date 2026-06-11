import { resolveAttributedReferrerId } from '../referrals.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

const referrerId = 'referrer-1';
const baseTenant = {
  attribution_window_days: 30,
};
const nowMs = Date.parse('2026-06-11T00:00:00.000Z');

Deno.test('resolveAttributedReferrerId returns active referral inside attribution window', () => {
  assertEquals(
    resolveAttributedReferrerId(
      {
        referred_at: '2026-06-01T00:00:00.000Z',
        referred_by: referrerId,
      },
      baseTenant,
      nowMs,
    ),
    referrerId,
  );
});

Deno.test('resolveAttributedReferrerId drops expired referral outside attribution window', () => {
  assertEquals(
    resolveAttributedReferrerId(
      {
        referred_at: '2026-05-01T00:00:00.000Z',
        referred_by: referrerId,
      },
      baseTenant,
      nowMs,
    ),
    null,
  );
});

Deno.test('resolveAttributedReferrerId keeps referral through the exact expiry boundary', () => {
  assertEquals(
    resolveAttributedReferrerId(
      {
        referred_at: '2026-05-12T00:00:00.000Z',
        referred_by: referrerId,
      },
      baseTenant,
      nowMs,
    ),
    referrerId,
  );
});

Deno.test('resolveAttributedReferrerId keeps same-instant referral for zero-day attribution window', () => {
  assertEquals(
    resolveAttributedReferrerId(
      {
        referred_at: '2026-06-11T00:00:00.000Z',
        referred_by: referrerId,
      },
      {
        attribution_window_days: 0,
      },
      nowMs,
    ),
    referrerId,
  );
});

Deno.test('resolveAttributedReferrerId treats negative attribution windows as zero days', () => {
  assertEquals(
    resolveAttributedReferrerId(
      {
        referred_at: '2026-06-10T23:59:59.000Z',
        referred_by: referrerId,
      },
      {
        attribution_window_days: -7,
      },
      nowMs,
    ),
    null,
  );
});

Deno.test('resolveAttributedReferrerId returns null for missing or invalid attribution data', () => {
  assertEquals(resolveAttributedReferrerId({ referred_at: null, referred_by: referrerId }, baseTenant, nowMs), null);
  assertEquals(resolveAttributedReferrerId({ referred_at: '2026-06-01T00:00:00.000Z', referred_by: null }, baseTenant, nowMs), null);
  assertEquals(resolveAttributedReferrerId({ referred_at: 'not-a-date', referred_by: referrerId }, baseTenant, nowMs), null);
});
