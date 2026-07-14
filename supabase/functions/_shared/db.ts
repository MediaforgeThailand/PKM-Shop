import { HttpError } from './http.ts';
export { assertInternalServiceRoleAuthorization as assertServiceRoleAuthorization } from './internalAuth.ts';
import type { CustomerRow, TenantRow } from './types.ts';

type RuntimeDeno = {
  env: {
    get: (key: string) => string | undefined;
  };
};

type RestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

type RestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: RestMethod;
  prefer?: string;
};

function readEnv(key: string) {
  const runtime = globalThis as typeof globalThis & { Deno?: RuntimeDeno };

  return runtime.Deno?.env.get(key);
}

function serviceConfig() {
  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError('UPSTREAM', 'Missing Supabase service configuration.', 500);
  }

  return {
    serviceRoleKey,
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
  };
}

function queryString(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]));

  if (entries.length === 0) {
    return '';
  }

  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function rest<T>(path: string, options: RestOptions = {}): Promise<T> {
  const { serviceRoleKey, supabaseUrl } = serviceConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path.replace(/^\//, '')}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'message' in payload && typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `Supabase REST request failed with ${response.status}.`;

    throw new HttpError('UPSTREAM', detail, response.status);
  }

  return payload as T;
}

export async function selectMany<T>(table: string, params: Record<string, string | undefined>) {
  return rest<T[]>(`${table}${queryString(params)}`);
}

export async function selectOne<T>(table: string, params: Record<string, string | undefined>) {
  const rows = await selectMany<T>(table, {
    ...params,
    limit: params.limit ?? '1',
  });

  return rows[0] ?? null;
}

export async function insertRow<T>(table: string, row: Record<string, unknown>, params: Record<string, string | undefined> = {}) {
  const rows = await rest<T[]>(`${table}${queryString(params)}`, {
    body: row,
    method: 'POST',
    prefer: 'return=representation',
  });

  return rows[0];
}

export async function upsertRow<T>(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
  params: Record<string, string | undefined> = {},
) {
  const rows = await rest<T[]>(`${table}${queryString({ ...params, on_conflict: onConflict })}`, {
    body: row,
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
  });

  return rows[0];
}

export async function updateRows<T>(table: string, row: Record<string, unknown>, params: Record<string, string | undefined>) {
  return rest<T[]>(`${table}${queryString(params)}`, {
    body: row,
    method: 'PATCH',
    prefer: 'return=representation',
  });
}

export async function rpc<T>(functionName: string, body: Record<string, unknown>) {
  return rest<T>(`rpc/${functionName}`, {
    body,
    method: 'POST',
  });
}

export async function tenantBySlug(slug: string) {
  return selectOne<TenantRow>('tenants', {
    select: 'id,slug,display_name,logo_url,promptpay_id,features',
    slug: `eq.${slug}`,
  });
}

export async function assertTenant(slug: string) {
  const tenant = await tenantBySlug(slug);

  if (!tenant) {
    throw new HttpError('TENANT_NOT_FOUND', 'Tenant not found.', 404);
  }

  return tenant;
}

export async function resolveAuthUser(authorization: string | null) {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    throw new HttpError('VALIDATION', 'Missing Supabase JWT.', 401);
  }

  const { serviceRoleKey, supabaseUrl } = serviceConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: serviceRoleKey,
    },
  });
  const payload = await parseResponse(response);

  if (!response.ok || !payload || typeof payload !== 'object' || typeof (payload as { id?: unknown }).id !== 'string') {
    throw new HttpError('VALIDATION', 'Invalid Supabase JWT.', 401);
  }

  return {
    email: typeof (payload as { email?: unknown }).email === 'string' ? (payload as { email: string }).email : null,
    id: (payload as { id: string }).id,
  };
}

export async function resolveAuthUserId(authorization: string | null) {
  const user = await resolveAuthUser(authorization);

  return user.id;
}

export async function resolveOrCreateCustomer(tenantId: string, authUserId: string, nickname?: string | null) {
  // Only write `nickname` when a caller explicitly supplies it. Every chat turn
  // calls this with nickname omitted; including `nickname: null` in the upsert
  // body made merge-duplicates overwrite the nickname that fact-extractor wrote
  // to customers.nickname (facts.ts), silently defeating the user_nickname
  // personalization on app/pwa every turn (H1, deep-risk-audit-2026-06-14).
  return upsertRow<CustomerRow>(
    'customers',
    {
      auth_user_id: authUserId,
      ...(nickname === undefined ? {} : { nickname }),
      tenant_id: tenantId,
    },
    'tenant_id,auth_user_id',
    {
      select: 'id,tenant_id,auth_user_id,line_user_id,nickname,phone,zone_override,created_at',
    },
  );
}

export async function invokeInternalFunction(functionName: string, body: Record<string, unknown>) {
  const { serviceRoleKey, supabaseUrl } = serviceConfig();

  return fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}
