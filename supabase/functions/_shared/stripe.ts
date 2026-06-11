import { HttpError } from './http.ts';

type RuntimeDeno = {
  env: {
    get: (key: string) => string | undefined;
  };
};

type StripeCheckoutSession = {
  amount_total: number | null;
  client_reference_id: string | null;
  currency: string | null;
  id: string;
  metadata?: Record<string, string>;
  mode: string | null;
  payment_intent: string | null;
  payment_status: string;
  status: string | null;
  url: string | null;
};

type StripeEvent = {
  data: {
    object: unknown;
  };
  id: string;
  type: string;
};

type CheckoutSessionInput = {
  amountBaht: number;
  cancelUrl: string;
  customerEmail?: string | null;
  imageUrl?: string | null;
  metadata: Record<string, string>;
  orderId: string;
  productDescription: string;
  productName: string;
  stripePriceId?: string | null;
  successUrl: string;
};

const stripeApiVersion = '2026-02-25.clover';
const webhookToleranceSeconds = 5 * 60;

function readEnv(key: string) {
  const runtime = globalThis as typeof globalThis & { Deno?: RuntimeDeno };

  return runtime.Deno?.env.get(key);
}

function requiredEnv(key: string) {
  const value = readEnv(key)?.trim();

  if (!value) {
    throw new HttpError('CONFIGURATION', `Missing ${key}.`, 500);
  }

  return value;
}

export function stripeCheckoutBaseUrl() {
  const raw =
    readEnv('MIRA_PUBLIC_APP_URL') ??
    readEnv('APP_BASE_URL') ??
    readEnv('SITE_URL') ??
    'https://mira-health-app.vercel.app';

  return raw.trim().replace(/\/$/, '');
}

function appendParam(params: URLSearchParams, key: string, value: string | number | boolean | null | undefined) {
  if (value === undefined || value === null || value === '') {
    return;
  }

  params.append(key, String(value));
}

function amountBahtToStripeMinorUnits(amountBaht: number) {
  if (!Number.isInteger(amountBaht) || amountBaht <= 0) {
    throw new HttpError('VALIDATION', 'Order amount must be a positive integer THB amount.', 400);
  }

  return amountBaht * 100;
}

async function stripePost<TResponse>(path: string, params: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, '')}`, {
    body: params,
    headers: {
      Authorization: `Bearer ${requiredEnv('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': stripeApiVersion,
    },
    method: 'POST',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: { message?: unknown } }).error?.message ?? 'Stripe request failed.')
        : `Stripe request failed with ${response.status}.`;

    throw new HttpError('UPSTREAM', message, response.status);
  }

  return payload as TResponse;
}

export async function createStripeCheckoutSession(input: CheckoutSessionInput) {
  const params = new URLSearchParams();

  appendParam(params, 'mode', 'payment');
  appendParam(params, 'success_url', input.successUrl);
  appendParam(params, 'cancel_url', input.cancelUrl);
  appendParam(params, 'client_reference_id', input.orderId);
  appendParam(params, 'locale', 'auto');
  appendParam(params, 'origin_context', 'web');
  appendParam(params, 'payment_intent_data[description]', input.productName);

  if (input.customerEmail) {
    appendParam(params, 'customer_email', input.customerEmail);
  }

  for (const [key, value] of Object.entries(input.metadata)) {
    appendParam(params, `metadata[${key}]`, value);
    appendParam(params, `payment_intent_data[metadata][${key}]`, value);
  }

  if (input.stripePriceId) {
    appendParam(params, 'line_items[0][price]', input.stripePriceId);
  } else {
    appendParam(params, 'line_items[0][price_data][currency]', 'thb');
    appendParam(params, 'line_items[0][price_data][unit_amount]', amountBahtToStripeMinorUnits(input.amountBaht));
    appendParam(params, 'line_items[0][price_data][product_data][name]', input.productName);
    appendParam(params, 'line_items[0][price_data][product_data][description]', input.productDescription.slice(0, 1000));

    if (input.imageUrl?.startsWith('https://')) {
      appendParam(params, 'line_items[0][price_data][product_data][images][0]', input.imageUrl);
    }
  }

  appendParam(params, 'line_items[0][quantity]', 1);

  return stripePost<StripeCheckoutSession>('checkout/sessions', params);
}

function parseStripeSignatureHeader(signatureHeader: string) {
  const timestamp = signatureHeader
    .split(',')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === 't')?.[1];
  const signatures = signatureHeader
    .split(',')
    .map((part) => part.trim().split('='))
    .filter(([key, value]) => key === 'v1' && Boolean(value))
    .map(([, value]) => value);

  if (!timestamp || signatures.length === 0) {
    throw new HttpError('VALIDATION', 'Missing Stripe webhook signature.', 400);
  }

  return {
    signatures,
    timestamp,
  };
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      hash: 'SHA-256',
      name: 'HMAC',
    },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  return toHex(signature);
}

export async function verifyStripeWebhookEvent(rawBody: string, signatureHeader: string | null) {
  if (!signatureHeader) {
    throw new HttpError('VALIDATION', 'Missing Stripe-Signature header.', 400);
  }

  const { signatures, timestamp } = parseStripeSignatureHeader(signatureHeader);
  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    throw new HttpError('VALIDATION', 'Invalid Stripe webhook timestamp.', 400);
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);

  if (ageSeconds > webhookToleranceSeconds) {
    throw new HttpError('VALIDATION', 'Stripe webhook timestamp is outside tolerance.', 400);
  }

  const expected = await hmacSha256Hex(requiredEnv('STRIPE_WEBHOOK_SECRET'), `${timestamp}.${rawBody}`);
  const matched = signatures.some((signature) => constantTimeEqual(expected, signature));

  if (!matched) {
    throw new HttpError('VALIDATION', 'Stripe webhook signature verification failed.', 400);
  }

  return JSON.parse(rawBody) as StripeEvent;
}

export function asStripeCheckoutSession(value: unknown): StripeCheckoutSession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<StripeCheckoutSession>;

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }

  return {
    amount_total: typeof candidate.amount_total === 'number' ? candidate.amount_total : null,
    client_reference_id: typeof candidate.client_reference_id === 'string' ? candidate.client_reference_id : null,
    currency: typeof candidate.currency === 'string' ? candidate.currency : null,
    id: candidate.id,
    metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {},
    mode: typeof candidate.mode === 'string' ? candidate.mode : null,
    payment_intent: typeof candidate.payment_intent === 'string' ? candidate.payment_intent : null,
    payment_status: typeof candidate.payment_status === 'string' ? candidate.payment_status : 'unknown',
    status: typeof candidate.status === 'string' ? candidate.status : null,
    url: typeof candidate.url === 'string' ? candidate.url : null,
  };
}

export function stripeMinorUnitsForBaht(amountBaht: number) {
  return amountBahtToStripeMinorUnits(amountBaht);
}
