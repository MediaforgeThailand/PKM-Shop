import { HttpError } from './http.ts';

type RuntimeDeno = {
  env: {
    get: (key: string) => string | undefined;
  };
};

type StripeCheckoutSession = {
  amount_total: number | null;
  client_reference_id: string | null;
  client_secret?: string | null;
  currency: string | null;
  id: string;
  metadata?: Record<string, string>;
  mode: string | null;
  payment_intent: string | null;
  payment_status: string;
  status: string | null;
  url: string | null;
};

type StripeProduct = {
  active: boolean;
  id: string;
};

type StripePrice = {
  active: boolean;
  currency: string;
  id: string;
  product: string | { id?: string } | null;
  unit_amount: number | null;
};

type StripePromptPayQrCode = {
  data: string;
  hosted_instructions_url: string;
  image_url_png: string;
  image_url_svg: string;
};

type StripePaymentIntent = {
  amount: number;
  currency: string | null;
  id: string;
  metadata?: Record<string, string>;
  next_action?: {
    promptpay_display_qr_code?: Partial<StripePromptPayQrCode> | null;
    type?: string | null;
  } | null;
  status: string;
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

type PromptPayPaymentIntentInput = {
  amountBaht: number;
  buyerEmail?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  metadata: Record<string, string>;
  orderId: string;
  productName: string;
  returnUrl?: string | null;
};

type StripeCatalogProductInput = {
  active: boolean;
  amountBaht: number;
  catalogKey: string;
  category: string;
  description: string;
  imageUrl?: string | null;
  productId: string;
  productName: string;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  tenantId: string;
};

type StripeCatalogSyncResult = {
  priceAction: 'created' | 'reused';
  productAction: 'created' | 'updated';
  stripePriceId: string;
  stripeProductId: string;
};

export type StripePromptPayPaymentIntentResult = {
  paymentIntent: StripePaymentIntent;
  qr: StripePromptPayQrCode | null;
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

function stripeSecretKey() {
  const value = requiredEnv('STRIPE_SECRET_KEY');

  if (!/^(sk|rk)_(test|live)_/.test(value)) {
    throw new HttpError('CONFIGURATION', 'STRIPE_SECRET_KEY must be a Stripe secret or restricted secret key.', 500);
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

async function stripePost<TResponse>(
  path: string,
  params: URLSearchParams,
  options: {
    idempotencyKey?: string;
  } = {},
) {
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, '')}`, {
    body: params,
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
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

async function stripeGet<TResponse>(path: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, '')}`, {
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      'Stripe-Version': stripeApiVersion,
    },
    method: 'GET',
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

function appendStripeCatalogMetadata(params: URLSearchParams, input: StripeCatalogProductInput) {
  appendParam(params, 'metadata[tenant_id]', input.tenantId);
  appendParam(params, 'metadata[product_id]', input.productId);
  appendParam(params, 'metadata[catalog_key]', input.catalogKey);
  appendParam(params, 'metadata[category]', input.category);
}

function appendStripeProductImage(params: URLSearchParams, imageUrl?: string | null) {
  if (imageUrl?.startsWith('https://')) {
    appendParam(params, 'images[0]', imageUrl);
  }
}

function stripePriceProductId(price: StripePrice) {
  if (typeof price.product === 'string') {
    return price.product;
  }

  return price.product?.id ?? null;
}

async function createStripeProduct(input: StripeCatalogProductInput) {
  const params = new URLSearchParams();

  appendParam(params, 'name', input.productName);
  appendParam(params, 'description', input.description.slice(0, 1000));
  appendParam(params, 'active', input.active);
  appendStripeProductImage(params, input.imageUrl);
  appendStripeCatalogMetadata(params, input);

  return stripePost<StripeProduct>('products', params);
}

async function updateStripeProduct(stripeProductId: string, input: StripeCatalogProductInput) {
  const params = new URLSearchParams();

  appendParam(params, 'name', input.productName);
  appendParam(params, 'description', input.description.slice(0, 1000));
  appendParam(params, 'active', input.active);
  appendStripeProductImage(params, input.imageUrl);
  appendStripeCatalogMetadata(params, input);

  return stripePost<StripeProduct>(`products/${encodeURIComponent(stripeProductId)}`, params);
}

async function createStripePrice(stripeProductId: string, input: StripeCatalogProductInput) {
  const params = new URLSearchParams();

  appendParam(params, 'currency', 'thb');
  appendParam(params, 'unit_amount', amountBahtToStripeMinorUnits(input.amountBaht));
  appendParam(params, 'product', stripeProductId);
  appendParam(params, 'active', input.active);
  appendStripeCatalogMetadata(params, input);

  return stripePost<StripePrice>('prices', params);
}

async function retrieveStripePrice(stripePriceId: string) {
  return stripeGet<StripePrice>(`prices/${encodeURIComponent(stripePriceId)}`);
}

async function deactivateStripePrice(stripePriceId: string) {
  const params = new URLSearchParams();

  appendParam(params, 'active', false);

  return stripePost<StripePrice>(`prices/${encodeURIComponent(stripePriceId)}`, params);
}

export async function createOrUpdateStripeCatalogProduct(input: StripeCatalogProductInput): Promise<StripeCatalogSyncResult> {
  let productAction: StripeCatalogSyncResult['productAction'] = input.stripeProductId ? 'updated' : 'created';
  let product: StripeProduct;

  if (input.stripeProductId) {
    try {
      product = await updateStripeProduct(input.stripeProductId, input);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) {
        throw error;
      }

      product = await createStripeProduct(input);
      productAction = 'created';
    }
  } else {
    product = await createStripeProduct(input);
  }

  let priceAction: StripeCatalogSyncResult['priceAction'] = 'created';
  let stripePriceId = '';
  const expectedUnitAmount = amountBahtToStripeMinorUnits(input.amountBaht);

  if (input.stripePriceId) {
    let existingPrice: StripePrice | null = null;

    try {
      existingPrice = await retrieveStripePrice(input.stripePriceId);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) {
        throw error;
      }
    }

    if (existingPrice) {
      const matchesCurrentProduct = stripePriceProductId(existingPrice) === product.id;
      const matchesCurrentPrice =
        existingPrice.active &&
        existingPrice.currency.toLowerCase() === 'thb' &&
        existingPrice.unit_amount === expectedUnitAmount &&
        matchesCurrentProduct;

      if (matchesCurrentPrice) {
        priceAction = 'reused';
        stripePriceId = existingPrice.id;
      } else {
        await deactivateStripePrice(existingPrice.id);
      }
    }
  }

  if (!stripePriceId) {
    const newPrice = await createStripePrice(product.id, input);
    stripePriceId = newPrice.id;
  }

  return {
    priceAction,
    productAction,
    stripePriceId,
    stripeProductId: product.id,
  };
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

function toStripePromptPayQrCode(value: unknown): StripePromptPayQrCode | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<StripePromptPayQrCode>;

  if (
    typeof candidate.data !== 'string' ||
    typeof candidate.hosted_instructions_url !== 'string' ||
    typeof candidate.image_url_png !== 'string' ||
    typeof candidate.image_url_svg !== 'string'
  ) {
    return null;
  }

  return {
    data: candidate.data,
    hosted_instructions_url: candidate.hosted_instructions_url,
    image_url_png: candidate.image_url_png,
    image_url_svg: candidate.image_url_svg,
  };
}

function promptPayQrFromPaymentIntent(intent: StripePaymentIntent) {
  return toStripePromptPayQrCode(intent.next_action?.promptpay_display_qr_code ?? null);
}

export async function createStripePromptPayPaymentIntent(input: PromptPayPaymentIntentInput): Promise<StripePromptPayPaymentIntentResult> {
  const params = new URLSearchParams();

  appendParam(params, 'amount', amountBahtToStripeMinorUnits(input.amountBaht));
  appendParam(params, 'currency', 'thb');
  appendParam(params, 'confirm', true);
  appendParam(params, 'description', input.productName);
  appendParam(params, 'payment_method_types[0]', 'promptpay');
  appendParam(params, 'payment_method_data[type]', 'promptpay');

  if (input.buyerName) {
    appendParam(params, 'payment_method_data[billing_details][name]', input.buyerName);
  }

  if (input.buyerEmail) {
    appendParam(params, 'payment_method_data[billing_details][email]', input.buyerEmail);
  }

  if (input.buyerPhone) {
    appendParam(params, 'payment_method_data[billing_details][phone]', input.buyerPhone);
  }

  if (input.returnUrl) {
    appendParam(params, 'return_url', input.returnUrl);
  }

  for (const [key, value] of Object.entries(input.metadata)) {
    appendParam(params, `metadata[${key}]`, value);
  }

  const paymentIntent = await stripePost<StripePaymentIntent>('payment_intents', params, {
    idempotencyKey: `miracare-promptpay-${input.orderId}`,
  });

  return {
    paymentIntent,
    qr: promptPayQrFromPaymentIntent(paymentIntent),
  };
}

export async function retrieveStripePaymentIntent(paymentIntentId: string): Promise<StripePromptPayPaymentIntentResult> {
  const paymentIntent = await stripeGet<StripePaymentIntent>(`payment_intents/${encodeURIComponent(paymentIntentId)}`);

  return {
    paymentIntent,
    qr: promptPayQrFromPaymentIntent(paymentIntent),
  };
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
    client_secret: typeof candidate.client_secret === 'string' ? candidate.client_secret : null,
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

export function asStripePaymentIntent(value: unknown): StripePaymentIntent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<StripePaymentIntent>;

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }

  return {
    amount: typeof candidate.amount === 'number' ? candidate.amount : 0,
    currency: typeof candidate.currency === 'string' ? candidate.currency : null,
    id: candidate.id,
    metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {},
    next_action: candidate.next_action && typeof candidate.next_action === 'object' ? candidate.next_action : null,
    status: typeof candidate.status === 'string' ? candidate.status : 'unknown',
  };
}

export function stripeMinorUnitsForBaht(amountBaht: number) {
  return amountBahtToStripeMinorUnits(amountBaht);
}
