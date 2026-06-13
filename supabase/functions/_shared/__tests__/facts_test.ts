import { insertFactsIdempotent, normalizeFactCandidates, recordFormAgeFact, renderFactsThai } from '../facts.ts';
import type { FactKeyRow, UserFactRow } from '../types.ts';

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

const registry: FactKeyRow[] = [
  { key: 'age', unit: 'year', value_kind: 'number' },
  { key: 'birth_year', unit: 'year', value_kind: 'number' },
  { key: 'nickname', unit: null, value_kind: 'text' },
  { key: 'weight_kg', unit: 'kg', value_kind: 'number' },
];

Deno.test('normalizeFactCandidates converts Thai numerals', () => {
  assertEquals(normalizeFactCandidates([{ confidence: 0.8, key: 'weight_kg', value: '๗๐ กก.' }], registry), [
    { confidence: 0.8, key: 'weight_kg', status: 'active', value_num: 70, value_text: null },
  ]);
});

Deno.test('normalizeFactCandidates parses decimal kg values', () => {
  assertEquals(normalizeFactCandidates([{ confidence: 0.8, key: 'weight_kg', value: '70.5 kg' }], registry), [
    { confidence: 0.8, key: 'weight_kg', status: 'active', value_num: 70.5, value_text: null },
  ]);
});

Deno.test('normalizeFactCandidates converts Buddhist birth years', () => {
  assertEquals(normalizeFactCandidates([{ confidence: 0.8, key: 'birth_year', value: '2533' }], registry), [
    { confidence: 0.8, key: 'birth_year', status: 'active', value_num: 1990, value_text: null },
  ]);
});

Deno.test('normalizeFactCandidates stores medium confidence as candidate', () => {
  assertEquals(normalizeFactCandidates([{ confidence: 0.55, key: 'nickname', value: 'บอส' }], registry), [
    { confidence: 0.55, key: 'nickname', status: 'candidate', value_num: null, value_text: 'บอส' },
  ]);
});

Deno.test('renderFactsThai renders active and candidate lines', () => {
  const baseFact = {
    created_at: '2026-06-11T00:00:00Z',
    customer_id: 'customer',
    id: 'fact',
    source: 'chat_extraction',
    source_ref: 'message',
    superseded_by: null,
    tenant_id: 'tenant',
  } satisfies Omit<UserFactRow, 'confidence' | 'key' | 'status' | 'value_num' | 'value_text'>;
  const rendered = renderFactsThai(
    [
      {
        ...baseFact,
        confidence: 0.9,
        key: 'weight_kg',
        status: 'active',
        value_num: 70,
        value_text: null,
      },
    ],
    [
      {
        ...baseFact,
        confidence: 0.5,
        id: 'candidate',
        key: 'nickname',
        status: 'candidate',
        value_num: null,
        value_text: 'บอส',
      },
    ],
    registry,
  );

  assert(rendered.activeLine.includes('น้ำหนัก: 70 กก.'), 'expected active weight line');
  assert(rendered.candidateLine.includes('ชื่อเล่น ~บอส'), 'expected candidate nickname line');
});

// --- recordFormAgeFact / insertFactsIdempotent source param (R2 / F1) ---

type StubRequest = { url: string; method: string; body: Record<string, unknown> | null };

async function withFetchStub(
  routes: (req: StubRequest) => unknown,
  fn: (requests: StubRequest[]) => Promise<void>,
) {
  const realFetch = globalThis.fetch;
  const realUrl = Deno.env.get('SUPABASE_URL');
  const realKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  Deno.env.set('SUPABASE_URL', 'https://stub.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-stub');
  const requests: StubRequest[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const captured: StubRequest = { body, method, url };
    requests.push(captured);
    const payload = routes(captured);
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

function ageRow(source: UserFactRow['source']): UserFactRow {
  return {
    confidence: 1,
    created_at: '2026-06-13T00:00:00Z',
    customer_id: 'cust-1',
    id: 'fact-age-1',
    key: 'age',
    source,
    source_ref: 'order-1',
    status: 'active',
    superseded_by: null,
    tenant_id: 'tenant-1',
    value_num: 35,
    value_text: null,
  };
}

Deno.test('insertFactsIdempotent defaults source to chat_extraction', async () => {
  await withFetchStub(
    (req) => (req.method === 'POST' ? [ageRow('chat_extraction')] : []),
    async (requests) => {
      await insertFactsIdempotent({
        customerId: 'cust-1',
        facts: [{ confidence: 1, key: 'age', status: 'active', value_num: 35, value_text: null }],
        sourceRef: 'order-1',
        tenantId: 'tenant-1',
      });
      const insert = requests.find((r) => r.method === 'POST' && r.url.includes('user_facts'));
      assert(Boolean(insert), 'expected a user_facts insert');
      assertEquals(insert?.body?.source, 'chat_extraction');
    },
  );
});

Deno.test('recordFormAgeFact writes age with source user_form when consent granted', async () => {
  await withFetchStub(
    (req) => {
      if (req.url.includes('consents')) return [{ granted: true }];
      if (req.method === 'POST' && req.url.includes('user_facts')) return [ageRow('user_form')];
      return [];
    },
    async (requests) => {
      const result = await recordFormAgeFact({ age: 35, customerId: 'cust-1', orderId: 'order-1', tenantId: 'tenant-1' });
      assert(result !== null, 'expected a fact row when consent is granted');
      const insert = requests.find((r) => r.method === 'POST' && r.url.includes('user_facts'));
      assert(Boolean(insert), 'expected a user_facts insert');
      assertEquals(insert?.body?.source, 'user_form');
      assertEquals(insert?.body?.key, 'age');
      assertEquals(insert?.body?.value_num, 35);
      assertEquals(insert?.body?.confidence, 1);
    },
  );
});

Deno.test('recordFormAgeFact is a silent no-op without consent', async () => {
  await withFetchStub(
    (req) => {
      if (req.url.includes('consents')) return []; // no consent row
      return [];
    },
    async (requests) => {
      const result = await recordFormAgeFact({ age: 35, customerId: 'cust-1', orderId: 'order-1', tenantId: 'tenant-1' });
      assertEquals(result, null);
      const insert = requests.find((r) => r.method === 'POST' && r.url.includes('user_facts'));
      assert(!insert, 'expected NO user_facts insert without consent');
    },
  );
});

Deno.test('recordFormAgeFact skips out-of-range age before any query', async () => {
  await withFetchStub(
    () => [],
    async (requests) => {
      const result = await recordFormAgeFact({ age: 0, customerId: 'cust-1', orderId: 'order-1', tenantId: 'tenant-1' });
      assertEquals(result, null);
      assertEquals(requests.length, 0);
    },
  );
});
