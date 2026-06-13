// R4: PDPA export + erasure handler tests (fetch-stubbed; no live Supabase).

declare const Deno: {
  env: {
    delete: (key: string) => void;
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
  };
  test: (name: string, fn: () => void | Promise<void>) => void;
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

type StubReq = { url: string; method: string; body: Record<string, unknown> | null };

const CUSTOMER = {
  auth_user_id: 'auth-user-1',
  created_at: '2026-06-13T00:00:00Z',
  id: 'cust-1',
  line_user_id: null,
  nickname: 'A',
  phone: '0811111111',
  referred_at: null,
  referred_by: null,
  tenant_id: 'tenant-1',
};

async function withPdpaStub(route: (req: StubReq) => unknown, fn: (requests: StubReq[]) => Promise<void>) {
  const realFetch = globalThis.fetch;
  const realUrl = Deno.env.get('SUPABASE_URL');
  const realKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  (globalThis as typeof globalThis & { __MIRACARE_SUPPRESS_SERVE__?: boolean }).__MIRACARE_SUPPRESS_SERVE__ = true;
  Deno.env.set('SUPABASE_URL', 'https://stub.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-stub');
  const requests: StubReq[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const captured: StubReq = { body, method, url };
    requests.push(captured);
    const payload = route(captured);
    return Promise.resolve(
      new Response(JSON.stringify(payload ?? []), { headers: { 'content-type': 'application/json' }, status: 200 }),
    );
  }) as typeof fetch;
  try {
    await fn(requests);
  } finally {
    globalThis.fetch = realFetch;
    if (realUrl === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', realUrl);
    if (realKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', realKey);
  }
}

function authedRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer test-jwt', 'content-type': 'application/json' },
    method: 'POST',
  });
}

Deno.test('pdpa-export self path returns a document and records a completed export request', async () => {
  await withPdpaStub(
    (req) => {
      if (req.url.includes('/auth/v1/user')) return { id: 'auth-user-1' };
      if (req.url.includes('/rest/v1/customers')) return [CUSTOMER];
      if (req.url.includes('/rest/v1/pdpa_requests') && req.method === 'POST') return [{ id: 'req-export-1' }];
      return [];
    },
    async (requests) => {
      const { handlePdpaExport } = await import('../../pdpa-export/index.ts');
      const response = await handlePdpaExport(authedRequest('https://stub/pdpa-export', {}));
      assertEquals(response.status, 200);
      const { data: payload } = await response.json();
      assertEquals(payload.request_id, 'req-export-1');
      assertEquals(payload.document.customer.id, 'cust-1');
      const inserted = requests.find((r) => r.method === 'POST' && r.url.includes('/rest/v1/pdpa_requests'));
      assertEquals(inserted?.body?.kind, 'export');
      assertEquals(inserted?.body?.requested_by, 'customer');
    },
  );
});

Deno.test('pdpa-delete admin path anonymizes orders (never status) and deletes the customer', async () => {
  await withPdpaStub(
    (req) => {
      if (req.url.includes('/auth/v1/user')) return { id: 'admin-user-1' };
      if (req.url.includes('/rest/v1/customers') && req.method === 'GET') return [CUSTOMER];
      if (req.url.includes('/rest/v1/tenant_members')) return [{ role: 'tenant_admin', tenant_id: 'tenant-1' }];
      if (req.url.includes('/rest/v1/pdpa_requests') && req.method === 'POST') return [{ id: 'req-delete-1' }];
      return [];
    },
    async (requests) => {
      const { handlePdpaDelete } = await import('../../pdpa-delete/index.ts');
      const response = await handlePdpaDelete(
        authedRequest('https://stub/pdpa-delete', { confirm: 'ลบถาวร', customer_id: '11111111-1111-4111-8111-111111111111' }),
      );
      assertEquals(response.status, 200);
      const { data: payload } = await response.json();
      assertEquals(payload.deleted, true);
      assertEquals(payload.noop, false);

      const ordersPatch = requests.find((r) => r.method === 'PATCH' && r.url.includes('/rest/v1/orders'));
      assert(Boolean(ordersPatch), 'expected an orders anonymize PATCH');
      assertEquals(ordersPatch?.body?.buyer_phone, null);
      assertEquals(ordersPatch?.body?.customer_id, null);
      assertEquals(ordersPatch?.body?.session_id, null);
      assert(ordersPatch?.body ? !('status' in ordersPatch.body) : false, 'anonymize PATCH must NEVER touch orders.status');

      const customerDelete = requests.find((r) => r.method === 'DELETE' && r.url.includes('/rest/v1/customers'));
      assert(Boolean(customerDelete), 'expected the customer row to be deleted');
      const factsDelete = requests.find((r) => r.method === 'DELETE' && r.url.includes('/rest/v1/user_facts'));
      assert(Boolean(factsDelete), 'expected user_facts to be deleted');
    },
  );
});

Deno.test('pdpa-delete rejects a non-admin staff member', async () => {
  await withPdpaStub(
    (req) => {
      if (req.url.includes('/auth/v1/user')) return { id: 'staff-user-1' };
      if (req.url.includes('/rest/v1/customers') && req.method === 'GET') return [CUSTOMER];
      if (req.url.includes('/rest/v1/tenant_members')) return [{ role: 'tenant_staff', tenant_id: 'tenant-1' }];
      return [];
    },
    async (requests) => {
      const { handlePdpaDelete } = await import('../../pdpa-delete/index.ts');
      const response = await handlePdpaDelete(
        authedRequest('https://stub/pdpa-delete', { confirm: 'ลบถาวร', customer_id: '11111111-1111-4111-8111-111111111111' }),
      );
      assertEquals(response.status, 403);
      const deleted = requests.find((r) => r.method === 'DELETE' && r.url.includes('/rest/v1/customers'));
      assert(!deleted, 'a non-admin must not trigger any deletion');
    },
  );
});

Deno.test('pdpa-delete is an idempotent no-op for an already-erased customer', async () => {
  await withPdpaStub(
    (req) => {
      if (req.url.includes('/auth/v1/user')) return { id: 'admin-user-1' };
      if (req.url.includes('/rest/v1/customers') && req.method === 'GET') return []; // already gone
      if (req.url.includes('/rest/v1/pdpa_requests') && req.method === 'GET') return [{ tenant_id: 'tenant-1' }];
      if (req.url.includes('/rest/v1/tenant_members')) return [{ role: 'tenant_admin', tenant_id: 'tenant-1' }];
      return [];
    },
    async () => {
      const { handlePdpaDelete } = await import('../../pdpa-delete/index.ts');
      const response = await handlePdpaDelete(
        authedRequest('https://stub/pdpa-delete', { confirm: 'ลบถาวร', customer_id: '11111111-1111-4111-8111-111111111111' }),
      );
      assertEquals(response.status, 200);
      const { data: payload } = await response.json();
      assertEquals(payload.noop, true);
      assertEquals(payload.deleted, false);
    },
  );
});

Deno.test('pdpa-delete rejects a wrong confirmation token', async () => {
  await withPdpaStub(
    () => [],
    async (requests) => {
      const { handlePdpaDelete } = await import('../../pdpa-delete/index.ts');
      const response = await handlePdpaDelete(
        authedRequest('https://stub/pdpa-delete', { confirm: 'delete', customer_id: '11111111-1111-4111-8111-111111111111' }),
      );
      assert(response.status >= 400, 'expected a validation error for the wrong confirm token');
      assertEquals(requests.length, 0);
    },
  );
});
