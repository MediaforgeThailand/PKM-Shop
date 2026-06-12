import { resolveProductBranchSelection } from '../branches.ts';
import { HttpError } from '../http.ts';
import { referrerOrderRequestSchema } from '../referrerOrder.ts';
import { resolveAttributedReferrerId } from '../referrals.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertValidationError(fn: () => unknown, expectedMessage: string) {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof HttpError)) {
      throw new Error('expected HttpError');
    }

    const httpError = error;

    assertEquals(httpError.code, 'VALIDATION');
    assertEquals(httpError.status, 400);
    assertEquals(httpError.message, expectedMessage);
    return;
  }

  throw new Error('Expected validation error');
}

const referrerId = 'referrer-1';
const baseTenant = {
  attribution_window_days: 30,
};
const nowMs = Date.parse('2026-06-11T00:00:00.000Z');
const baseReferrerOrderPayload = {
  action: 'create_order',
  buyer_age: 35,
  buyer_name: 'Buyer Name',
  buyer_phone: '0812345678',
  catalog_key: 'chk-basic',
  tenant_slug: 'demo-hospital',
} as const;

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

Deno.test('referrer order schema requires buyer age inside chat bounds', () => {
  assert(referrerOrderRequestSchema.safeParse(baseReferrerOrderPayload).success, 'expected valid referrer create payload');
  assert(!referrerOrderRequestSchema.safeParse({ ...baseReferrerOrderPayload, buyer_age: undefined }).success, 'expected missing age to fail');
  assert(!referrerOrderRequestSchema.safeParse({ ...baseReferrerOrderPayload, buyer_age: 0 }).success, 'expected age below one to fail');
  assert(!referrerOrderRequestSchema.safeParse({ ...baseReferrerOrderPayload, buyer_age: 121 }).success, 'expected age above 120 to fail');
});

Deno.test('resolveProductBranchSelection handles legacy, single, and multi-branch products', () => {
  const branchA = { address: 'A', district: 'วัฒนา', id: 'branch-a', name: 'สาขา A' };
  const branchB = { address: 'B', district: 'สาทร', id: 'branch-b', name: 'สาขา B' };

  assertEquals(resolveProductBranchSelection([], undefined), null);
  assertEquals(resolveProductBranchSelection([branchA], undefined)?.id, branchA.id);
  assertEquals(resolveProductBranchSelection([branchA], branchA.id)?.id, branchA.id);
  assertValidationError(
    () => resolveProductBranchSelection([branchA], branchB.id),
    'Branch is not available for this product.',
  );
  assertValidationError(
    () => resolveProductBranchSelection([branchA, branchB], undefined),
    'branch_id is required for this product.',
  );
  assertEquals(resolveProductBranchSelection([branchA, branchB], branchB.id)?.id, branchB.id);
  assertValidationError(
    () => resolveProductBranchSelection([branchA, branchB], 'branch-other'),
    'Branch is not available for this product.',
  );
});
