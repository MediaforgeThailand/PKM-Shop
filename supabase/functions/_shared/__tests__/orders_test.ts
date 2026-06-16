import {
  assertOrderBelongsToSession,
  assertPaymentSlipPathForOrder,
  canTransition,
  commissionSchemeForConfirmedOrder,
  paymentSlipStoragePath,
  toOrderPanel,
} from '../orders.ts';
import type { OrderRow, OrderStatus, OrderWithProductRow } from '../types.ts';

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

function order(status: OrderStatus, overrides: Partial<OrderRow> = {}): Pick<OrderRow, 'booking_at' | 'buyer_age' | 'buyer_name' | 'buyer_phone' | 'status'> {
  return {
    booking_at: null,
    buyer_age: 35,
    buyer_name: 'Test Buyer',
    buyer_phone: '0812345678',
    status,
    ...overrides,
  };
}

function panelOrder(overrides: Partial<OrderRow> = {}): OrderWithProductRow {
  return {
    admin_note: null,
    amount_baht: 100,
    booking_at: null,
    branch_id: null,
    buyer_age: 35,
    buyer_name: 'Test Buyer',
    buyer_phone: '0812345678',
    channel: 'chat_app',
    commission_scheme_snapshot: null,
    created_at: '2026-06-13T00:00:00.000Z',
    customer_id: 'customer-1',
    id: 'order-1',
    paid_at: null,
    payment_provider: null,
    preferred_branch: null,
    preferred_date: null,
    preferred_date_end: null,
    preferred_time_window: null,
    product_id: 'product-1',
    products: {
      catalog_key: 'basic',
      category: 'checkup',
      name: 'Basic Checkup',
      price_baht: 100,
    },
    qty: 1,
    referrer_id: null,
    session_id: 'session-1',
    slip_url: null,
    status: 'awaiting_payment',
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    stripe_payment_status: null,
    tenant_id: 'tenant-1',
    updated_at: '2026-06-13T00:00:00.000Z',
    ...overrides,
  };
}

Deno.test('canTransition allows collecting info to awaiting payment with buyer info', () => {
  assert(canTransition(order('collecting_info'), 'awaiting_payment', 'ai'), 'expected collecting -> awaiting');
});

Deno.test('toOrderPanel omits PromptPay QR when Stripe owns the payment', () => {
  const panel = toOrderPanel(panelOrder({ payment_provider: 'stripe' }), { promptpay_id: '0812345678' });

  assert(panel?.step === 'qr', 'expected payment step');
  assert(!panel?.qr_payload, 'expected Stripe order to skip PromptPay payload');
});

Deno.test('toOrderPanel keeps PromptPay QR for default payment orders', () => {
  const panel = toOrderPanel(panelOrder(), { promptpay_id: '0812345678' });

  assert(panel?.step === 'qr', 'expected payment step');
  assert(Boolean(panel?.qr_payload), 'expected PromptPay payload for default order');
});

Deno.test('toOrderPanel sets a 10-minute payment_due_at for awaiting_payment orders', () => {
  const panel = toOrderPanel(panelOrder({ updated_at: '2026-06-13T00:00:00.000Z' }), { promptpay_id: '0812345678' });

  assertSame(panel?.payment_due_at, '2026-06-13T00:10:00.000Z', 'expected due time = entered awaiting_payment + 10 min');
});

Deno.test('toOrderPanel leaves payment_due_at null when not awaiting payment', () => {
  const panel = toOrderPanel(panelOrder({ status: 'collecting_info' }), { promptpay_id: '0812345678' });

  assertSame(panel?.payment_due_at ?? null, null, 'expected no due time outside awaiting_payment');
});

Deno.test('canTransition blocks collecting info without buyer name', () => {
  assert(!canTransition(order('collecting_info', { buyer_name: null }), 'awaiting_payment', 'ai'), 'expected missing buyer name to block');
});

Deno.test('canTransition blocks collecting info without buyer age', () => {
  assert(!canTransition(order('collecting_info', { buyer_age: null }), 'awaiting_payment', 'ai'), 'expected missing buyer age to block');
});

Deno.test('canTransition allows selecting branch to collecting info for customer', () => {
  assert(canTransition(order('selecting_branch'), 'collecting_info', 'customer'), 'expected selecting_branch -> collecting_info');
});

Deno.test('canTransition blocks selecting branch for non-customer actors', () => {
  assert(!canTransition(order('selecting_branch'), 'collecting_info', 'ai'), 'expected ai selecting_branch transition to block');
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
    { actor: 'customer', from: 'selecting_branch', to: 'collecting_info' },
    { actor: 'customer', from: 'selecting_branch', to: 'cancelled' },
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
    { actor: 'ai', from: 'selecting_branch', to: 'collecting_info' },
    { actor: 'admin:user', from: 'selecting_branch', to: 'collecting_info' },
    { actor: 'ai', from: 'collecting_info', overrides: { buyer_phone: null }, to: 'awaiting_payment' },
    { actor: 'ai', from: 'collecting_info', overrides: { buyer_age: null }, to: 'awaiting_payment' },
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
