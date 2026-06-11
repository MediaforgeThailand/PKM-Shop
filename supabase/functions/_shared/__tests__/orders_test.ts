import {
  assertOrderBelongsToSession,
  assertPaymentSlipPathForOrder,
  canTransition,
  commissionSchemeForConfirmedOrder,
  paymentSlipStoragePath,
} from '../orders.ts';
import type { OrderRow, OrderStatus } from '../types.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSame<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(message);
  }
}

function order(status: OrderStatus, overrides: Partial<OrderRow> = {}): Pick<OrderRow, 'booking_at' | 'buyer_name' | 'buyer_phone' | 'status'> {
  return {
    booking_at: null,
    buyer_name: 'Test Buyer',
    buyer_phone: '0812345678',
    status,
    ...overrides,
  };
}

Deno.test('canTransition allows collecting info to awaiting payment with buyer info', () => {
  assert(canTransition(order('collecting_info'), 'awaiting_payment', 'ai'), 'expected collecting -> awaiting');
});

Deno.test('canTransition blocks collecting info without buyer name', () => {
  assert(!canTransition(order('collecting_info', { buyer_name: null }), 'awaiting_payment', 'ai'), 'expected missing buyer name to block');
});

Deno.test('canTransition allows awaiting payment to submitted', () => {
  assert(canTransition(order('awaiting_payment'), 'submitted', 'customer'), 'expected awaiting -> submitted');
});

Deno.test('canTransition blocks submitted to confirmed for non-admin', () => {
  assert(!canTransition(order('submitted'), 'confirmed', 'customer'), 'expected non-admin confirm to block');
});

Deno.test('canTransition allows submitted to confirmed for admin', () => {
  assert(canTransition(order('submitted'), 'confirmed', 'admin:user'), 'expected admin confirm');
});

Deno.test('canTransition requires booking_at for booked', () => {
  assert(!canTransition(order('confirmed'), 'booked', 'admin:user'), 'expected missing booking_at to block');
  assert(canTransition(order('confirmed', { booking_at: '2026-06-11T10:00:00Z' }), 'booked', 'admin:user'), 'expected booking_at to allow');
});

Deno.test('canTransition blocks terminal statuses', () => {
  assert(!canTransition(order('done'), 'cancelled', 'admin:user'), 'expected done terminal');
  assert(!canTransition(order('cancelled'), 'submitted', 'admin:user'), 'expected cancelled terminal');
});

Deno.test('canTransition allows every legal transition in the state machine', () => {
  const legalCases: Array<{
    actor: string;
    from: OrderStatus;
    overrides?: Partial<OrderRow>;
    to: OrderStatus;
  }> = [
    { actor: 'ai', from: 'collecting_info', to: 'awaiting_payment' },
    { actor: 'customer', from: 'collecting_info', to: 'cancelled' },
    { actor: 'customer', from: 'awaiting_payment', to: 'submitted' },
    { actor: 'customer', from: 'awaiting_payment', to: 'cancelled' },
    { actor: 'admin:user', from: 'submitted', to: 'confirmed' },
    { actor: 'admin:user', from: 'submitted', to: 'cancelled' },
    { actor: 'admin:user', from: 'confirmed', overrides: { booking_at: '2026-06-11T10:00:00Z' }, to: 'booked' },
    { actor: 'admin:user', from: 'confirmed', to: 'cancelled' },
    { actor: 'admin:user', from: 'booked', to: 'done' },
    { actor: 'admin:user', from: 'booked', to: 'cancelled' },
  ];

  for (const testCase of legalCases) {
    assert(
      canTransition(order(testCase.from, testCase.overrides), testCase.to, testCase.actor),
      `expected ${testCase.from} -> ${testCase.to} to be legal`,
    );
  }
});

Deno.test('canTransition blocks representative illegal transitions', () => {
  const illegalCases: Array<{
    actor: string;
    from: OrderStatus;
    overrides?: Partial<OrderRow>;
    to: OrderStatus;
  }> = [
    { actor: 'ai', from: 'collecting_info', overrides: { buyer_phone: null }, to: 'awaiting_payment' },
    { actor: 'customer', from: 'awaiting_payment', to: 'confirmed' },
    { actor: 'customer', from: 'submitted', to: 'confirmed' },
    { actor: 'customer', from: 'submitted', to: 'cancelled' },
    { actor: 'admin:user', from: 'confirmed', to: 'booked' },
    { actor: 'customer', from: 'confirmed', overrides: { booking_at: '2026-06-11T10:00:00Z' }, to: 'booked' },
    { actor: 'customer', from: 'booked', to: 'done' },
    { actor: 'admin:user', from: 'done', to: 'cancelled' },
    { actor: 'admin:user', from: 'cancelled', to: 'submitted' },
  ];

  for (const testCase of illegalCases) {
    assert(
      !canTransition(order(testCase.from, testCase.overrides), testCase.to, testCase.actor),
      `expected ${testCase.from} -> ${testCase.to} to be illegal`,
    );
  }
});

Deno.test('commissionSchemeForConfirmedOrder prefers the order snapshot over the current referrer scheme', () => {
  const snapshot = {
    by_category: { checkup: 12 },
    default: 10,
    mode: 'percent' as const,
  };
  const current = {
    by_category: { checkup: 5 },
    default: 5,
    mode: 'percent' as const,
  };

  assertSame(
    commissionSchemeForConfirmedOrder({ commission_scheme_snapshot: snapshot }, { commission_scheme: current }),
    snapshot,
    'expected order-time snapshot to win',
  );
});

Deno.test('commissionSchemeForConfirmedOrder falls back to current referrer scheme for legacy orders', () => {
  const current = {
    by_category: {},
    default: 100,
    mode: 'flat_baht' as const,
  };

  assertSame(
    commissionSchemeForConfirmedOrder({ commission_scheme_snapshot: null }, { commission_scheme: current }),
    current,
    'expected legacy order to use current referrer scheme',
  );
});

Deno.test('paymentSlipStoragePath creates an order-scoped jpg path', () => {
  assertSame(
    paymentSlipStoragePath({
      contentType: 'image/jpeg',
      objectId: 'slip-1',
      orderId: 'order-1',
      tenantId: 'tenant-1',
    }),
    'tenant-1/order-1/slip-1.jpg',
    'expected tenant/order scoped jpg path',
  );
});

Deno.test('assertPaymentSlipPathForOrder accepts only the matching tenant/order prefix', () => {
  const validPath = assertPaymentSlipPathForOrder({
    orderId: 'order-1',
    slipPath: 'payment-slips/tenant-1/order-1/slip-1.png',
    tenantId: 'tenant-1',
  });

  assertSame(validPath, 'tenant-1/order-1/slip-1.png', 'expected bucket prefix to be stripped');

  let rejected = false;

  try {
    assertPaymentSlipPathForOrder({
      orderId: 'order-1',
      slipPath: 'tenant-1/order-2/slip-1.png',
      tenantId: 'tenant-1',
    });
  } catch {
    rejected = true;
  }

  assert(rejected, 'expected another order path to be rejected');
});

Deno.test('paymentSlipStoragePath rejects unsupported content types', () => {
  let rejected = false;

  try {
    paymentSlipStoragePath({
      contentType: 'application/pdf',
      objectId: 'slip-1',
      orderId: 'order-1',
      tenantId: 'tenant-1',
    });
  } catch {
    rejected = true;
  }

  assert(rejected, 'expected unsupported content type to be rejected');
});

Deno.test('assertOrderBelongsToSession rejects another customer or session', () => {
  assertOrderBelongsToSession(
    {
      customer_id: 'customer-1',
      session_id: 'session-1',
    },
    {
      customerId: 'customer-1',
      sessionId: 'session-1',
    },
  );

  let rejected = false;

  try {
    assertOrderBelongsToSession(
      {
        customer_id: 'customer-2',
        session_id: 'session-1',
      },
      {
        customerId: 'customer-1',
        sessionId: 'session-1',
      },
    );
  } catch {
    rejected = true;
  }

  assert(rejected, 'expected ownership mismatch to be rejected');
});
