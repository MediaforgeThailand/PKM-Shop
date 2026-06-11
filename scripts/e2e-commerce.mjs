import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAuthUserSession } from './create-test-jwt.mjs';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const tenantSlug = process.env.MIRA_DEMO_TENANT_SLUG ?? 'demo-hospital';

const ADMIN_EMAIL = 'e2e-admin@miracare.dev';
const DIRECT_CUSTOMER_EMAIL = 'e2e-customer@miracare.dev';
const REFERRED_CUSTOMER_EMAIL = 'e2e-referred-customer@miracare.dev';
const REFERRER_NAME = 'E2E Commerce Referrer';

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY before running commerce E2E.');
}

const endpointBase = supabaseUrl.replace(/\/$/, '');
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const created = {
  authUserIds: [],
  orderIds: [],
};
let adminAccessToken = null;
let tenant = null;
let caughtError = null;

try {
  await run();
} catch (error) {
  caughtError = error;
  throw error;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    if (caughtError) {
      console.warn(`commerce E2E cleanup failed after test error: ${cleanupError.message}`);
    } else {
      throw cleanupError;
    }
  }
}

async function run() {
  tenant = await loadTenant();
  const product = await loadProduct(tenant.id);
  const [admin, directCustomer, referredCustomer] = await Promise.all([
    createAuthUserSession({
      email: ADMIN_EMAIL,
      purpose: 'miracare-v2-commerce-e2e-admin',
    }),
    createAuthUserSession({
      email: DIRECT_CUSTOMER_EMAIL,
      purpose: 'miracare-v2-commerce-e2e-customer',
    }),
    createAuthUserSession({
      email: REFERRED_CUSTOMER_EMAIL,
      purpose: 'miracare-v2-commerce-e2e-customer',
    }),
  ]);

  adminAccessToken = admin.accessToken;
  created.authUserIds.push(admin.user.id, directCustomer.user.id, referredCustomer.user.id);
  await cleanupResidualTestData(tenant.id, created.authUserIds);
  await seedAdminMembership(tenant.id, admin.user.id);

  const direct = await runPurchaseFlow({
    buyerName: 'E2E Direct Customer',
    buyerPhone: '0811111111',
    customerAccessToken: directCustomer.accessToken,
    label: 'direct customer purchase',
  });
  await confirmOrderAndAssertNotices({
    expectedCommission: false,
    label: 'direct customer purchase',
    orderId: direct.orderId,
    sessionId: direct.sessionId,
  });
  await assertCommissionEntries(direct.orderId, 0, 'direct purchase should not create commission entries');

  const referrer = await createReferrer(tenant.id);
  const referred = await runPurchaseFlow({
    buyerName: 'E2E Referred Customer',
    buyerPhone: '0822222222',
    customerAccessToken: referredCustomer.accessToken,
    label: 'referred customer purchase',
    refCode: referrer.ref_code,
  });
  const referredOrder = await loadOrderForCommission(referred.orderId);

  assert(
    referredOrder.referrer_id === referrer.id,
    `referred purchase should snapshot referrer ${referrer.id}, got ${referredOrder.referrer_id ?? 'none'}`,
  );
  assert(referredOrder.commission_scheme_snapshot, 'referred order should snapshot the referrer commission scheme');

  await confirmOrderAndAssertNotices({
    expectedCommission: true,
    label: 'referred customer purchase',
    orderId: referred.orderId,
    sessionId: referred.sessionId,
  });

  const commissionEntry = await assertSingleCommissionEntry(referred.orderId);
  const productCategory = embeddedOne(referredOrder.products)?.category ?? product.category;
  const expectedCommissionAmount = calculateCommissionAmount(
    referredOrder.amount_baht,
    productCategory,
    referredOrder.commission_scheme_snapshot,
  );

  assert(
    commissionEntry.amount_baht === expectedCommissionAmount,
    `commission amount should match snapshot scheme: expected ${expectedCommissionAmount}, got ${commissionEntry.amount_baht}`,
  );

  console.log('e2e-commerce: PASS (direct purchase, admin confirm, referral attribution, and commission snapshot checked)');
}

async function loadTenant() {
  const row = await mustSingle(
    service.from('tenants').select('id,slug,promptpay_id').eq('slug', tenantSlug).single(),
    `Demo tenant "${tenantSlug}" not found. Run scripts/seed-demo.mjs first.`,
  );

  if (!row.promptpay_id) {
    throw new Error(
      `Demo tenant "${tenantSlug}" must have promptpay_id before commerce E2E. ` +
        'Run scripts/seed-demo.mjs with MIRA_DEMO_PROMPTPAY_ID or configure the tenant before retrying.',
    );
  }

  return row;
}

async function loadProduct(tenantId) {
  const row = await mustSingle(
    service
      .from('products')
      .select('id,tenant_id,catalog_key,category,price_baht,active')
      .eq('tenant_id', tenantId)
      .eq('catalog_key', 'chk-basic')
      .eq('active', true)
      .single(),
    `Active product "chk-basic" not found for tenant "${tenantSlug}". Run scripts/seed-demo.mjs first.`,
  );

  assert(row.price_baht > 0, 'chk-basic must have a positive price to generate PromptPay payloads');

  return row;
}

async function seedAdminMembership(tenantId, authUserId) {
  const { error } = await service.from('tenant_members').upsert(
    {
      auth_user_id: authUserId,
      role: 'tenant_admin',
      tenant_id: tenantId,
    },
    {
      onConflict: 'tenant_id,auth_user_id',
    },
  );

  if (error) {
    throw new Error(`Unable to seed commerce E2E tenant admin membership: ${error.message}`);
  }
}

async function createReferrer(tenantId) {
  const row = await mustSingle(
    service
      .from('referrers')
      .insert({
        active: true,
        commission_scheme: {
          by_category: {},
          default: 10,
          mode: 'percent',
        },
        name: REFERRER_NAME,
        tenant_id: tenantId,
        type: 'staff',
      })
      .select('id,tenant_id,ref_code,commission_scheme')
      .single(),
    'Unable to create commerce E2E referrer.',
  );

  assert(/^[0-9A-HJKMNP-TV-Z]{6}$/.test(row.ref_code), `generated ref_code has invalid shape: ${row.ref_code}`);

  return row;
}

async function runPurchaseFlow({ buyerName, buyerPhone, customerAccessToken, label, refCode }) {
  const selected = await postChat(customerAccessToken, {
    action: {
      catalog_key: 'chk-basic',
      type: 'select_product',
    },
    message: `Select chk-basic for ${label}.`,
    ref_code: refCode,
    session_id: null,
  });
  const selectedOrder = selected.order;

  assert(selected.session_id, `${label}: select_product should return a session_id`);
  assert(selectedOrder?.id, `${label}: select_product should create an order panel`);
  created.orderIds.push(selectedOrder.id);

  const infoBefore = await countSystemNotices(selected.session_id);
  const formSubmitted = await postChat(customerAccessToken, {
    action: {
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      order_id: selectedOrder.id,
      preferred_date: '2026-07-01',
      type: 'order_form_submit',
    },
    message: `Submit buyer info for ${label}.`,
    session_id: selected.session_id,
  });

  assert(formSubmitted.order?.status === 'awaiting_payment', `${label}: form submit should advance to awaiting_payment`);
  assertPromptPayPayload(formSubmitted.order.qr_payload, `${label}: awaiting_payment should include a valid PromptPay payload`);
  await assertSystemNoticeDelta({
    afterLabel: `${label}: order_form_submit`,
    beforeCount: infoBefore,
    expectedDelta: 1,
    sessionId: selected.session_id,
  });

  const paymentBefore = await countSystemNotices(selected.session_id);
  const submitted = await postChat(customerAccessToken, {
    action: {
      order_id: selectedOrder.id,
      type: 'payment_done',
    },
    message: `Payment done for ${label}.`,
    session_id: selected.session_id,
  });

  assert(submitted.order?.status === 'submitted', `${label}: payment_done should advance to submitted`);
  await assertSystemNoticeDelta({
    afterLabel: `${label}: payment_done`,
    beforeCount: paymentBefore,
    expectedDelta: 1,
    sessionId: selected.session_id,
  });

  return {
    orderId: selectedOrder.id,
    sessionId: selected.session_id,
  };
}

async function confirmOrderAndAssertNotices({ expectedCommission, label, orderId, sessionId }) {
  const beforeCount = await countSystemNotices(sessionId);
  const result = await postEdge('admin-order-action', adminAccessToken, {
    action: 'confirm',
    order_id: orderId,
  });

  assert(result.order?.status === 'confirmed', `${label}: admin confirm should move order to confirmed`);
  await assertSystemNoticeDelta({
    afterLabel: `${label}: admin confirm`,
    beforeCount,
    expectedDelta: 1,
    sessionId,
  });

  const commissionCount = await countCommissionEntries(orderId);

  if (expectedCommission) {
    assert(commissionCount === 1, `${label}: referrer-attributed confirm should create one commission entry`);
  } else {
    assert(commissionCount === 0, `${label}: unattributed confirm should not create commission entries`);
  }
}

async function postChat(jwt, { action, message, ref_code: refCode, session_id: sessionId }) {
  return postEdge('chat-orchestrator', jwt, {
    action,
    channel: 'pwa',
    client_msg_id: randomUUID(),
    message,
    ...(refCode ? { ref_code: refCode } : {}),
    session_id: sessionId,
    tenant_slug: tenantSlug,
  });
}

async function postEdge(functionName, jwt, body) {
  const response = await fetch(`${endpointBase}/functions/v1/${functionName}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const text = await response.text();
  let envelope = null;

  try {
    envelope = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${functionName} returned non-JSON response with status ${response.status}.`);
  }

  if (!response.ok || !envelope?.ok) {
    throw new Error(envelope?.error?.message ?? `${functionName} failed with status ${response.status}`);
  }

  return envelope.data;
}

async function countSystemNotices(sessionId) {
  const { count, error } = await service
    .from('chat_messages')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('session_id', sessionId)
    .eq('role', 'system_notice');

  if (error) {
    throw new Error(`Unable to count system notices: ${error.message}`);
  }

  return count ?? 0;
}

async function assertSystemNoticeDelta({ afterLabel, beforeCount, expectedDelta, sessionId }) {
  const afterCount = await countSystemNotices(sessionId);
  const actualDelta = afterCount - beforeCount;

  assert(
    actualDelta === expectedDelta,
    `${afterLabel}: expected ${expectedDelta} new system_notice row, got ${actualDelta}`,
  );
}

async function loadOrderForCommission(orderId) {
  return mustSingle(
    service
      .from('orders')
      .select('id,amount_baht,commission_scheme_snapshot,referrer_id,products(category)')
      .eq('id', orderId)
      .single(),
    `Unable to load order ${orderId} for commission assertion.`,
  );
}

async function countCommissionEntries(orderId) {
  const { count, error } = await service
    .from('commission_entries')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('order_id', orderId);

  if (error) {
    throw new Error(`Unable to count commission entries for order ${orderId}: ${error.message}`);
  }

  return count ?? 0;
}

async function assertCommissionEntries(orderId, expectedCount, label) {
  const count = await countCommissionEntries(orderId);

  assert(count === expectedCount, `${label}: expected ${expectedCount} commission entries, got ${count}`);
}

async function assertSingleCommissionEntry(orderId) {
  return mustSingle(
    service
      .from('commission_entries')
      .select('id,order_id,scheme_snapshot,amount_baht,status')
      .eq('order_id', orderId)
      .single(),
    `Expected one commission entry for order ${orderId}.`,
  );
}

function calculateCommissionAmount(amountBaht, category, scheme) {
  const categoryValue = finiteNumber(scheme?.by_category?.[category]);
  const defaultValue = finiteNumber(scheme?.default);
  const rateOrAmount = categoryValue ?? defaultValue ?? 0;

  if (scheme?.mode === 'flat_baht') {
    return Math.max(0, Math.round(rateOrAmount));
  }

  return Math.max(0, Math.round((amountBaht * rateOrAmount) / 100));
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function assertPromptPayPayload(payload, label) {
  assert(typeof payload === 'string' && payload.length > 8, label);

  const payloadWithoutCrc = payload.slice(0, -4);
  const expectedCrc = crc16Ccitt(payloadWithoutCrc);
  const actualCrc = payload.slice(-4).toUpperCase();

  assert(payloadWithoutCrc.endsWith('6304'), `${label}: missing CRC tag 6304`);
  assert(actualCrc === expectedCrc, `${label}: expected CRC ${expectedCrc}, got ${actualCrc}`);
}

function crc16Ccitt(payload) {
  let crc = 0xffff;

  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

async function cleanup() {
  if (!tenant) {
    return;
  }

  await cancelCreatedOrders();
  await cleanupResidualTestData(tenant.id, created.authUserIds);

  for (const userId of created.authUserIds) {
    const { error } = await service.auth.admin.deleteUser(userId);

    if (error && !/not found/i.test(error.message)) {
      throw new Error(`Unable to delete commerce E2E auth user ${userId}: ${error.message}`);
    }
  }
}

async function cancelCreatedOrders() {
  if (!adminAccessToken) {
    return;
  }

  for (const orderId of [...new Set(created.orderIds)]) {
    try {
      await postEdge('admin-order-action', adminAccessToken, {
        action: 'cancel',
        order_id: orderId,
      });
    } catch (error) {
      console.warn(`commerce E2E could not cancel order ${orderId}: ${error.message}`);
    }
  }
}

async function cleanupResidualTestData(tenantId, authUserIds) {
  if (authUserIds.length > 0) {
    await checked(
      service.from('tenant_members').delete().eq('tenant_id', tenantId).in('auth_user_id', authUserIds),
      'cleanup tenant_members',
    );
  }

  const customers = authUserIds.length > 0
    ? await mustMany(
      service.from('customers').select('id').eq('tenant_id', tenantId).in('auth_user_id', authUserIds),
      'Unable to find residual commerce E2E customers.',
    )
    : [];
  const customerIds = customers.map((row) => row.id);
  const referrers = await mustMany(
    service.from('referrers').select('id').eq('tenant_id', tenantId).eq('name', REFERRER_NAME),
    'Unable to find residual commerce E2E referrers.',
  );
  const referrerIds = referrers.map((row) => row.id);
  const sessions = customerIds.length > 0
    ? await mustMany(
      service.from('chat_sessions').select('id').eq('tenant_id', tenantId).in('customer_id', customerIds),
      'Unable to find residual commerce E2E sessions.',
    )
    : [];
  const sessionIds = sessions.map((row) => row.id);
  const orderIds = new Set();

  if (customerIds.length > 0) {
    const rows = await mustMany(
      service.from('orders').select('id').eq('tenant_id', tenantId).in('customer_id', customerIds),
      'Unable to find residual commerce E2E customer orders.',
    );

    for (const row of rows) {
      orderIds.add(row.id);
    }
  }

  if (referrerIds.length > 0) {
    const rows = await mustMany(
      service.from('orders').select('id').eq('tenant_id', tenantId).in('referrer_id', referrerIds),
      'Unable to find residual commerce E2E referrer orders.',
    );

    for (const row of rows) {
      orderIds.add(row.id);
    }
  }

  const orderIdList = [...orderIds];

  if (orderIdList.length > 0) {
    await deleteByFilter('commission_entries', (query) => query.in('order_id', orderIdList));
    await deleteByFilter('order_events', (query) => query.in('order_id', orderIdList));
    await deleteByIds('orders', orderIdList);
  }

  if (sessionIds.length > 0) {
    await deleteByFilter('chat_messages', (query) => query.in('session_id', sessionIds));
    await deleteByIds('chat_sessions', sessionIds);
  }

  if (customerIds.length > 0) {
    await deleteByFilter('consents', (query) => query.in('customer_id', customerIds));
    await deleteByFilter('lab_reports', (query) => query.in('customer_id', customerIds));
    await deleteByFilter('user_facts', (query) => query.in('customer_id', customerIds));
    await deleteByIds('customers', customerIds);
  }

  if (referrerIds.length > 0) {
    await deleteByIds('referrers', referrerIds);
  }
}

async function deleteByIds(table, ids) {
  if (ids.length === 0) {
    return;
  }

  await deleteByFilter(table, (query) => query.in('id', ids));
}

async function deleteByFilter(table, applyFilter) {
  await checked(applyFilter(service.from(table).delete()), `cleanup ${table}`);
}

async function checked(query, fallbackMessage) {
  const { error } = await query;

  if (error) {
    throw new Error(`${fallbackMessage}: ${error.message}`);
  }
}

async function mustSingle(query, fallbackMessage) {
  const { data, error } = await query;

  if (error || !data) {
    throw new Error(error?.message ?? fallbackMessage);
  }

  return data;
}

async function mustMany(query, fallbackMessage) {
  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? fallbackMessage);
  }

  return data ?? [];
}

function embeddedOne(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
