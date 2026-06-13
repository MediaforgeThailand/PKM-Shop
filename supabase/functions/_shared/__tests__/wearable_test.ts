import { strToU8, zipSync } from 'fflate';

import { AppleHealthParseError, parseAppleHealthExportStream, parseAppleHealthXml } from '../wearable.ts';
import { sampleAppleHealthXml } from './fixtures/apple_health_export.ts';

declare const Deno: {
  env: {
    delete: (key: string) => void;
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
  };
  test: (name: string, fn: () => void | Promise<void>) => void;
};

function assertEquals<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function* chunkBytes(bytes: Uint8Array, size: number) {
  for (let offset = 0; offset < bytes.length; offset += size) {
    yield bytes.slice(offset, offset + size);
  }
}

Deno.test('parseAppleHealthXml aggregates daily wearable metrics from sample export', () => {
  const parsed = parseAppleHealthXml(sampleAppleHealthXml);
  const metrics = [...parsed.metrics].sort((a, b) => `${a.metric}:${a.day}`.localeCompare(`${b.metric}:${b.day}`));

  assertEquals(metrics, [
    {
      day: '2026-06-01',
      metric: 'active_energy_kcal',
      value: 120.5,
    },
    {
      day: '2026-06-01',
      metric: 'avg_hr',
      value: 85,
    },
    {
      day: '2026-06-01',
      metric: 'resting_hr',
      value: 62,
    },
    {
      day: '2026-06-01',
      metric: 'sleep_minutes',
      value: 150,
    },
    {
      day: '2026-06-01',
      metric: 'steps',
      value: 3200,
    },
  ]);
});

Deno.test('parseAppleHealthXml keeps latest body samples with normalized units', () => {
  const parsed = parseAppleHealthXml(sampleAppleHealthXml);
  const samples = [...parsed.latestSamples]
    .map((sample) => ({
      ...sample,
      value: Math.round(sample.value * 10) / 10,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  assertEquals(samples, [
    {
      day: '2026-06-02',
      key: 'height_cm',
      value: 172,
    },
    {
      day: '2026-06-01',
      key: 'weight_kg',
      value: 70,
    },
  ]);
});

Deno.test('parseAppleHealthExportStream streams XML chunks and normalizes imperial body units', async () => {
  const xml = [
    '<HealthData>',
    '<Record type="HKQuantityTypeIdentifierBodyMass" unit="lb" value="154.3234" startDate="2026-06-03 08:00:00 +0700" endDate="2026-06-03 08:00:00 +0700"/>',
    '<Record type="HKQuantityTypeIdentifierHeight" unit="in" value="68" startDate="2026-06-03 08:00:00 +0700" endDate="2026-06-03 08:00:00 +0700"/>',
    '<Record type="HKQuantityTypeIdentifierStepCount" unit="count" value="1000" startDate="2026-06-03 09:00:00 +0700" endDate="2026-06-03 10:00:00 +0700"/>',
    '</HealthData>',
  ].join('');
  const parsed = await parseAppleHealthExportStream(chunkBytes(new TextEncoder().encode(xml), 11), {
    contentType: 'application/xml',
    storagePath: 'imports/export.xml',
  });
  const samples = [...parsed.latestSamples]
    .map((sample) => ({
      ...sample,
      value: Math.round(sample.value * 10) / 10,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  assertEquals(samples, [
    {
      day: '2026-06-03',
      key: 'height_cm',
      value: 172.7,
    },
    {
      day: '2026-06-03',
      key: 'weight_kg',
      value: 70,
    },
  ]);
  assertEquals(parsed.metrics, [
    {
      day: '2026-06-03',
      metric: 'steps',
      value: 1000,
    },
  ]);
});

Deno.test('parseAppleHealthExportStream reads export.xml from Apple Health zip chunks', async () => {
  const archive = zipSync({
    'apple_health_export/export.xml': strToU8(sampleAppleHealthXml),
  });
  const parsed = await parseAppleHealthExportStream(chunkBytes(archive, 23), {
    storagePath: 'imports/apple_health_export.zip',
  });
  const steps = parsed.metrics.find((metric) => metric.metric === 'steps' && metric.day === '2026-06-01');

  assertEquals(steps?.value, 3200);
});

Deno.test('parseAppleHealthExportStream rejects zip archives without export.xml', async () => {
  const archive = zipSync({
    'apple_health_export/README.txt': strToU8('No health export here.'),
  });

  try {
    await parseAppleHealthExportStream(chunkBytes(archive, 17), {
      storagePath: 'imports/apple_health_export.zip',
    });
  } catch (error) {
    assertEquals(error instanceof AppleHealthParseError, true);
    assertEquals(error instanceof Error ? error.message : '', 'Apple Health export zip does not contain export.xml.');
    return;
  }

  throw new Error('Expected missing export.xml to be rejected.');
});

// --- R5: wearable-ingest handler stamps import_id + source_ref ---

type StubReq = { url: string; method: string; body: Record<string, unknown> | null };

Deno.test('wearable-ingest records an import entity and stamps import_id + source_ref', async () => {
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
    requests.push({ body, method, url });

    if (url.includes('/storage/v1/object/')) {
      return Promise.resolve(
        new Response(new TextEncoder().encode(sampleAppleHealthXml), {
          headers: { 'content-type': 'text/xml' },
          status: 200,
        }),
      );
    }

    const json = (payload: unknown) =>
      Promise.resolve(new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' }, status: 200 }));

    if (url.includes('/rest/v1/customers')) {
      return json([
        {
          auth_user_id: null,
          created_at: '2026-06-13T00:00:00Z',
          id: 'cust-1',
          line_user_id: null,
          nickname: null,
          phone: null,
          referred_at: null,
          referred_by: null,
          tenant_id: 'tenant-1',
        },
      ]);
    }
    if (url.includes('/rest/v1/wearable_imports')) {
      return json([{ customer_id: 'cust-1', file_path: 'cust/export.xml', filename: 'export.xml', id: 'import-1', imported_at: '2026-06-13T00:00:00Z', metric_count: 1, source: 'apple_export', tenant_id: 'tenant-1' }]);
    }
    if (url.includes('/rest/v1/wearable_metrics')) {
      return json([{ customer_id: 'cust-1', day: '2026-06-01', id: 'metric-1', metric: 'steps', source: 'apple_export', tenant_id: 'tenant-1', value: 3200 }]);
    }
    if (url.includes('/rest/v1/user_facts')) {
      return method === 'GET' ? json([]) : json([{ id: 'fact-1' }]);
    }
    return json([]);
  }) as typeof fetch;

  try {
    const { handleWearableIngest } = await import('../../wearable-ingest/index.ts');
    const response = await handleWearableIngest(
      new Request('https://stub.functions/wearable-ingest', {
        body: JSON.stringify({ customer_id: '11111111-1111-4111-8111-111111111111', storage_path: 'cust/export.xml' }),
        headers: { authorization: 'Bearer service-role-stub', 'content-type': 'application/json' },
        method: 'POST',
      }),
    );

    assertEquals(response.status, 200);

    const importInsert = requests.find((r) => r.method === 'POST' && r.url.includes('/rest/v1/wearable_imports'));
    assert(Boolean(importInsert), 'expected a wearable_imports insert');
    assertEquals(importInsert?.body?.source, 'apple_export');

    const metricUpsert = requests.find((r) => r.method === 'POST' && r.url.includes('/rest/v1/wearable_metrics'));
    assert(Boolean(metricUpsert), 'expected a wearable_metrics upsert');
    assertEquals(metricUpsert?.body?.import_id, 'import-1');

    const factInsert = requests.find((r) => r.method === 'POST' && r.url.includes('/rest/v1/user_facts'));
    assert(Boolean(factInsert), 'expected a user_facts insert for the latest body sample');
    assertEquals(factInsert?.body?.source, 'wearable');
    assertEquals(factInsert?.body?.source_ref, 'import-1');
  } finally {
    globalThis.fetch = realFetch;
    if (realUrl === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', realUrl);
    if (realKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', realKey);
  }
});
