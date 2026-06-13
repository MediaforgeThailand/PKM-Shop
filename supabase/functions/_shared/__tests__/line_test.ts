import {
  linePostbackToAction,
  orderPaymentLineFlexMessage,
  orderQrLineImageMessage,
  productLineFlexMessage,
  requireTenantEnv,
  requireLineChannelToken,
  textLineMessage,
  verifyLineSignature,
} from '../line.ts';
import type { ChatProduct, OrderPanelState } from '../types.ts';

declare const Deno: {
  env: {
    delete: (key: string) => void;
    set: (key: string, value: string) => void;
  };
  test: (name: string, fn: () => void | Promise<void>) => void;
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

function clearLineEnv() {
  for (const key of [
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_ACCESS_TOKEN__demo-hospital',
    'LINE_CHANNEL_ACCESS_TOKEN__demo_hospital',
    'LINE_CHANNEL_SECRET',
    'LINE_CHANNEL_SECRET__demo-hospital',
    'LINE_CHANNEL_SECRET__demo_hospital',
    'LINE_CHANNEL_TOKEN',
    'LINE_CHANNEL_TOKEN__demo-hospital',
    'LINE_CHANNEL_TOKEN__demo_hospital',
  ]) {
    Deno.env.delete(key);
  }
}

async function signBody(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      hash: 'SHA-256',
      name: 'HMAC',
    },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const bytes = new Uint8Array(digest);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

Deno.test('requireLineChannelToken prefers tenant token from spec env name', () => {
  clearLineEnv();
  Deno.env.set('LINE_CHANNEL_TOKEN', 'generic-token');
  Deno.env.set('LINE_CHANNEL_TOKEN__demo-hospital', 'tenant-token');

  assertEquals(requireLineChannelToken('demo-hospital'), 'tenant-token');
  clearLineEnv();
});

Deno.test('requireLineChannelToken supports access-token compatibility fallback', () => {
  clearLineEnv();
  Deno.env.set('LINE_CHANNEL_ACCESS_TOKEN__demo-hospital', 'legacy-token');

  assertEquals(requireLineChannelToken('demo-hospital'), 'legacy-token');
  clearLineEnv();
});

Deno.test('requireLineChannelToken supports underscore-normalized tenant env names', () => {
  clearLineEnv();
  Deno.env.set('LINE_CHANNEL_TOKEN', 'generic-token');
  Deno.env.set('LINE_CHANNEL_TOKEN__demo_hospital', 'underscore-token');

  assertEquals(requireLineChannelToken('demo-hospital'), 'underscore-token');
  clearLineEnv();
});

Deno.test('requireTenantEnv prefers underscore tenant secret before generic fallback', () => {
  clearLineEnv();
  Deno.env.set('LINE_CHANNEL_SECRET', 'generic-secret');
  Deno.env.set('LINE_CHANNEL_SECRET__demo_hospital', 'underscore-secret');

  assertEquals(requireTenantEnv('LINE_CHANNEL_SECRET', 'demo-hospital'), 'underscore-secret');
  clearLineEnv();
});

Deno.test('textLineMessage truncates LINE text payload', () => {
  const message = textLineMessage('a'.repeat(5000));

  assertEquals(message.type, 'text');
  assertEquals(message.text.length, 4500);
});

Deno.test('productLineFlexMessage builds carousel with product postbacks', () => {
  const products: ChatProduct[] = Array.from({ length: 11 }, (_, index) => ({
    catalog_key: `pkg-${index + 1}`,
    description: index === 0 ? '' : `Description ${index + 1}`,
    image_url: index === 0 ? 'https://example.test/package.png' : null,
    name: `Package ${index + 1}`,
    price_baht: 1200 + index,
  }));

  const message = productLineFlexMessage(products);
  if (!message) {
    throw new Error('expected product flex message');
  }

  assertEquals(message.type, 'flex');

  const carousel = message.contents as { contents: Array<Record<string, unknown>>; type: string };
  assertEquals(carousel.type, 'carousel');
  assertEquals(carousel.contents.length, 10);

  const firstBubble = carousel.contents[0] as {
    body: { contents: Array<{ text?: string }> };
    footer: { contents: Array<{ action: { data: string; type: string } }> };
    hero: { type: string; url: string };
  };
  assertEquals(firstBubble.hero.type, 'image');
  assertEquals(firstBubble.hero.url, 'https://example.test/package.png');
  assertEquals(firstBubble.body.contents[0].text, 'Package 1');
  assertEquals(firstBubble.body.contents[2].text, '1,200 THB');
  assertEquals(firstBubble.footer.contents[0].action.type, 'postback');
  assertEquals(firstBubble.footer.contents[0].action.data, 'select_product:pkg-1');
});

Deno.test('productLineFlexMessage returns null when there are no products', () => {
  assertEquals(productLineFlexMessage([]), null);
});

Deno.test('orderQrLineImageMessage builds LINE image payload', () => {
  const message = orderQrLineImageMessage('https://cdn.example.test/line-assets/promptpay/order-123.png');

  assertEquals(message.type, 'image');
  assertEquals(message.originalContentUrl, 'https://cdn.example.test/line-assets/promptpay/order-123.png');
  assertEquals(message.previewImageUrl, 'https://cdn.example.test/line-assets/promptpay/order-123.png');
});

Deno.test('orderPaymentLineFlexMessage builds payment postback button', () => {
  const order: NonNullable<OrderPanelState> = {
    amount_baht: 3499,
    booking_at: null,
    branch_name: 'Demo Branch',
    id: 'order-123',
    missing_fields: [],
    payment_provider: null,
    preferred_date: null,
    preferred_date_end: null,
    preferred_time_window: null,
    product_name: 'Advanced Checkup',
    qr_payload: '000201010212',
    step: 'qr',
    status: 'awaiting_payment',
  };

  const message = orderPaymentLineFlexMessage(order);
  assertEquals(message.type, 'flex');
  assertEquals(message.altText, 'PromptPay QR');

  const bubble = message.contents as {
    body: { contents: Array<{ text?: string }> };
    footer: { contents: Array<{ action: { data: string; type: string } }> };
  };
  assertEquals(bubble.body.contents[0].text, 'Advanced Checkup');
  assertEquals(bubble.body.contents[1].text, '3,499 THB');
  assertEquals(bubble.footer.contents[0].action.type, 'postback');
  assertEquals(bubble.footer.contents[0].action.data, 'payment_done:order-123');
});

Deno.test('linePostbackToAction maps product selection postback', () => {
  const parsed = linePostbackToAction('select_product:chk-basic');
  const action = parsed.action;

  if (!action || action.type !== 'select_product') {
    throw new Error('expected select_product action');
  }

  assertEquals(action.catalog_key, 'chk-basic');
});

Deno.test('linePostbackToAction maps payment confirmation postback', () => {
  const parsed = linePostbackToAction('payment_done:order-123');
  const action = parsed.action;

  if (!action || action.type !== 'payment_done') {
    throw new Error('expected payment_done action');
  }

  assertEquals(action.order_id, 'order-123');
});

Deno.test('linePostbackToAction keeps unknown postback text bounded', () => {
  const parsed = linePostbackToAction('x'.repeat(500));

  assertEquals(parsed.action, null);
  assertEquals(parsed.message.length, 400);
});

Deno.test('verifyLineSignature accepts valid HMAC signature', async () => {
  clearLineEnv();
  Deno.env.set('LINE_CHANNEL_SECRET__demo-hospital', 'line-secret');
  const body = JSON.stringify({ events: [] });
  const signature = await signBody(body, 'line-secret');

  await verifyLineSignature(body, signature, 'demo-hospital');
  clearLineEnv();
});

Deno.test('verifyLineSignature rejects invalid signature', async () => {
  clearLineEnv();
  Deno.env.set('LINE_CHANNEL_SECRET__demo-hospital', 'line-secret');
  const body = JSON.stringify({ events: [] });
  const signature = await signBody(body, 'other-secret');

  try {
    await verifyLineSignature(body, signature, 'demo-hospital');
  } catch (error) {
    assert(error instanceof Error && error.message.includes('Invalid LINE signature'), 'expected invalid signature error');
    clearLineEnv();
    return;
  }

  clearLineEnv();
  throw new Error('expected verifyLineSignature to reject invalid signature');
});

Deno.test('verifyLineSignature rejects malformed base64 signature header', async () => {
  clearLineEnv();
  Deno.env.set('LINE_CHANNEL_SECRET__demo-hospital', 'line-secret');

  try {
    await verifyLineSignature(JSON.stringify({ events: [] }), 'not base64@@', 'demo-hospital');
  } catch (error) {
    assert(error instanceof Error && error.message.includes('Invalid LINE signature'), 'expected malformed signature error');
    clearLineEnv();
    return;
  }

  clearLineEnv();
  throw new Error('expected verifyLineSignature to reject malformed signature');
});
