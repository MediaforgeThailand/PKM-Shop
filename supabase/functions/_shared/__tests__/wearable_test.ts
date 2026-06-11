import { strToU8, zipSync } from 'fflate';

import { AppleHealthParseError, parseAppleHealthExportStream, parseAppleHealthXml } from '../wearable.ts';
import { sampleAppleHealthXml } from './fixtures/apple_health_export.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function assertEquals<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
