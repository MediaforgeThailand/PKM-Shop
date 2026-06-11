import { calculateCommissionAmount, type CommissionScheme } from '../commissions.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function scheme(overrides: Partial<CommissionScheme> = {}): CommissionScheme {
  return {
    by_category: {},
    default: 10,
    mode: 'percent',
    ...overrides,
  };
}

Deno.test('calculateCommissionAmount applies default percent commission', () => {
  assertEquals(calculateCommissionAmount(2990, 'checkup', scheme()), 299);
});

Deno.test('calculateCommissionAmount applies category percent override', () => {
  assertEquals(calculateCommissionAmount(2990, 'vaccine', scheme({ by_category: { vaccine: 5 } })), 150);
});

Deno.test('calculateCommissionAmount applies flat baht default', () => {
  assertEquals(calculateCommissionAmount(2990, 'checkup', scheme({ default: 125, mode: 'flat_baht' })), 125);
});

Deno.test('calculateCommissionAmount applies flat baht category override', () => {
  assertEquals(
    calculateCommissionAmount(2990, 'vaccine', scheme({ by_category: { vaccine: 80.4 }, default: 125, mode: 'flat_baht' })),
    80,
  );
});

Deno.test('calculateCommissionAmount clamps negative commissions to zero', () => {
  assertEquals(calculateCommissionAmount(2990, 'checkup', scheme({ default: -10 })), 0);
  assertEquals(calculateCommissionAmount(2990, 'checkup', scheme({ default: -125, mode: 'flat_baht' })), 0);
});
