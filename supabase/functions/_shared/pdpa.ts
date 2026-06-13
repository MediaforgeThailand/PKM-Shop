// R4: shared PDPA export + erasure logic, used by the pdpa-export and
// pdpa-delete edge functions. Authorized by docs/miracare-v3-followups-plan.md §0.2
// (new PDPA export/delete; deletes are customer-requested erasure).
//
// Erasure rule (DECIDED by owner 2026-06-12): hard-delete personal data, but
// ANONYMIZE orders (keep amounts/status/commission integrity) — never touch
// orders.status (the transition_order-only rule applies to status alone).

import { rest, resolveAuthUserId, selectMany, selectOne, tenantBySlug, updateRows } from './db.ts';
import { HttpError } from './http.ts';
import { createSignedReadUrl, deleteStorageObject } from './storage.ts';
import type { CustomerRow } from './types.ts';

const CUSTOMER_SELECT =
  'id,tenant_id,auth_user_id,line_user_id,nickname,phone,referred_by,referred_at,created_at';

export const PDPA_ERASURE_PLACEHOLDER = 'ลบตามคำขอ (PDPA)';

type TenantMembership = { role: string; tenant_id: string };

export type PdpaActorResult =
  | { customer: CustomerRow; found: true; requestedBy: string; tenantId: string }
  | { authUserId: string; found: false };

async function assertTenantAdmin(authUserId: string, tenantId: string) {
  const memberships = await selectMany<TenantMembership>('tenant_members', {
    auth_user_id: `eq.${authUserId}`,
    select: 'tenant_id,role',
  });
  const role = memberships.find((membership) => membership.tenant_id === tenantId)?.role;

  if (role !== 'superadmin' && role !== 'tenant_admin') {
    throw new HttpError('VALIDATION', 'Not allowed for this customer.', 403);
  }
}

// Resolves the target customer + authorization for a PDPA request.
// - customer_id present  -> admin path (requires tenant_admin/superadmin of the customer's tenant).
// - customer_id absent   -> self path (auth user's own customer row; tenant_slug disambiguates).
// On the admin path, a missing customer returns { found: false } so the delete
// handler can stay idempotent for an already-erased customer.
export async function resolvePdpaActor(
  authorization: string | null,
  input: { customerId?: string; tenantSlug?: string },
): Promise<PdpaActorResult> {
  const authUserId = await resolveAuthUserId(authorization);

  if (input.customerId) {
    const customer = await selectOne<CustomerRow>('customers', {
      id: `eq.${input.customerId}`,
      select: CUSTOMER_SELECT,
    });

    if (!customer) {
      return { authUserId, found: false };
    }

    await assertTenantAdmin(authUserId, customer.tenant_id);

    return { customer, found: true, requestedBy: `admin:${authUserId}`, tenantId: customer.tenant_id };
  }

  const customers = await selectMany<CustomerRow>('customers', {
    auth_user_id: `eq.${authUserId}`,
    select: CUSTOMER_SELECT,
  });
  let matched = customers;

  if (input.tenantSlug) {
    const tenant = await tenantBySlug(input.tenantSlug);
    matched = tenant ? customers.filter((customer) => customer.tenant_id === tenant.id) : [];
  }

  if (matched.length === 0) {
    throw new HttpError('VALIDATION', 'No customer profile found for this account.', 404);
  }

  if (matched.length > 1) {
    throw new HttpError('VALIDATION', 'Multiple profiles found — specify tenant_slug.', 400);
  }

  return { customer: matched[0], found: true, requestedBy: 'customer', tenantId: matched[0].tenant_id };
}

// Idempotency helper for pdpa-delete: when the admin-targeted customer no longer
// exists, confirm a prior completed delete request exists AND the caller still
// administers that tenant, so a repeat call returns a safe no-op (not a 404 leak).
export async function authorizePriorDelete(authorization: string | null, customerId: string) {
  const authUserId = await resolveAuthUserId(authorization);
  const prior = await selectOne<{ tenant_id: string }>('pdpa_requests', {
    customer_id: `eq.${customerId}`,
    kind: 'eq.delete',
    order: 'requested_at.desc',
    select: 'tenant_id',
  });

  if (!prior) {
    throw new HttpError('VALIDATION', 'Customer not found.', 404);
  }

  await assertTenantAdmin(authUserId, prior.tenant_id);

  return prior.tenant_id;
}

async function selectAll<T>(table: string, filter: Record<string, string>) {
  return selectMany<T>(table, filter);
}

async function deleteWhere(table: string, filter: string) {
  await rest(`${table}?${filter}`, { method: 'DELETE', prefer: 'return=minimal' });
}

async function signReadUrlSafe(bucket: string, path: string): Promise<string | null> {
  try {
    return await createSignedReadUrl(bucket, path, 10 * 60);
  } catch {
    return null;
  }
}

// Assembles a single export document with the customer's personal data.
export async function buildPdpaExport(customer: CustomerRow) {
  const customerFilter = { customer_id: `eq.${customer.id}` };
  const [consents, facts, sessions, orders, labReports, wearableMetrics, wearableImports] = await Promise.all([
    selectAll<Record<string, unknown>>('consents', customerFilter),
    selectAll<Record<string, unknown>>('user_facts', customerFilter),
    selectAll<{ id: string }>('chat_sessions', customerFilter),
    selectAll<{ id: string; slip_url: string | null }>('orders', customerFilter),
    selectAll<{ id: string; storage_path: string | null }>('lab_reports', customerFilter),
    selectAll<Record<string, unknown>>('wearable_metrics', customerFilter),
    selectAll<Record<string, unknown>>('wearable_imports', customerFilter),
  ]);

  const sessionIds = sessions.map((session) => session.id);
  const reportIds = labReports.map((report) => report.id);
  const orderIds = orders.map((order) => order.id);

  const [messages, labResults, orderEvents] = await Promise.all([
    sessionIds.length ? selectMany<Record<string, unknown>>('chat_messages', { session_id: `in.(${sessionIds.join(',')})` }) : Promise.resolve([]),
    reportIds.length ? selectMany<Record<string, unknown>>('lab_results', { report_id: `in.(${reportIds.join(',')})` }) : Promise.resolve([]),
    orderIds.length ? selectMany<Record<string, unknown>>('order_events', { order_id: `in.(${orderIds.join(',')})` }) : Promise.resolve([]),
  ]);

  const slipUrls = (await Promise.all(
    orders
      .map((order) => order.slip_url)
      .filter((path): path is string => Boolean(path))
      .map((path) => signReadUrlSafe('payment-slips', path)),
  )).filter((url): url is string => Boolean(url));

  const labImageUrls = (await Promise.all(
    labReports
      .map((report) => report.storage_path)
      .filter((path): path is string => Boolean(path))
      .map((path) => signReadUrlSafe('lab-reports', path)),
  )).filter((url): url is string => Boolean(url));

  return {
    consents,
    customer,
    lab_image_urls: labImageUrls,
    lab_reports: labReports,
    lab_results: labResults,
    messages,
    order_events: orderEvents,
    orders,
    sessions,
    slip_urls: slipUrls,
    user_facts: facts,
    wearable_imports: wearableImports,
    wearable_metrics: wearableMetrics,
  };
}

// Performs the erasure sequence (FK-safe order). Idempotent: deleting rows that
// are already gone is a no-op, and anonymizing zero orders is a no-op.
export async function executePdpaErasure(customer: CustomerRow) {
  const customerId = customer.id;
  const tenantId = customer.tenant_id;

  // 1) Collect storage paths BEFORE mutating/deleting the rows that hold them.
  const [orders, labReports, sessions] = await Promise.all([
    selectAll<{ id: string; slip_url: string | null }>('orders', { customer_id: `eq.${customerId}` }),
    selectAll<{ id: string; storage_path: string | null }>('lab_reports', { customer_id: `eq.${customerId}` }),
    selectAll<{ id: string }>('chat_sessions', { customer_id: `eq.${customerId}` }),
  ]);
  const slipPaths = orders.map((order) => order.slip_url).filter((path): path is string => Boolean(path));
  const labPaths = labReports.map((report) => report.storage_path).filter((path): path is string => Boolean(path));
  const sessionIds = sessions.map((session) => session.id);

  // 2) Delete storage objects (best-effort; deleteStorageObject treats 404 as success).
  for (const path of slipPaths) {
    await deleteStorageObject('payment-slips', path);
  }
  for (const path of labPaths) {
    await deleteStorageObject('lab-reports', path);
  }

  // 3) Anonymize orders FIRST (clears the person linkage + buyer fields, never status),
  //    so deleting customers/chat_sessions below does not violate the orders FKs.
  await updateRows('orders', {
    buyer_name: PDPA_ERASURE_PLACEHOLDER,
    buyer_phone: null,
    customer_id: null,
    session_id: null,
    slip_url: null,
    updated_at: new Date().toISOString(),
  }, {
    customer_id: `eq.${customerId}`,
    select: 'id',
    tenant_id: `eq.${tenantId}`,
  });

  // 4) Delete personal-data rows (children before parents).
  if (sessionIds.length) {
    await deleteWhere('chat_messages', `session_id=in.(${sessionIds.join(',')})`);
  }
  await deleteWhere('chat_sessions', `customer_id=eq.${customerId}`);
  await deleteWhere('user_facts', `customer_id=eq.${customerId}`);
  await deleteWhere('consents', `customer_id=eq.${customerId}`);
  await deleteWhere('wearable_metrics', `customer_id=eq.${customerId}`);
  await deleteWhere('wearable_imports', `customer_id=eq.${customerId}`);
  await deleteWhere('lab_reports', `customer_id=eq.${customerId}`); // cascades lab_results

  // 5) Delete the customer row last.
  await deleteWhere('customers', `id=eq.${customerId}&tenant_id=eq.${tenantId}`);
}

export async function recordPdpaRequest(input: {
  customerId: string;
  kind: 'delete' | 'export';
  requestedBy: string;
  tenantId: string;
}) {
  const [row] = await rest<{ id: string }[]>('pdpa_requests', {
    body: {
      customer_id: input.customerId,
      kind: input.kind,
      requested_by: input.requestedBy,
      tenant_id: input.tenantId,
    },
    method: 'POST',
    prefer: 'return=representation',
  });

  return row;
}

export async function completePdpaRequest(requestId: string) {
  await rest(`pdpa_requests?id=eq.${requestId}`, {
    body: { completed_at: new Date().toISOString() },
    method: 'PATCH',
    prefer: 'return=minimal',
  });
}
