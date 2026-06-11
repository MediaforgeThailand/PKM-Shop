import { Unzip, UnzipInflate } from 'fflate';
import type { FlateError } from 'fflate';

import type { WearableMetricRow } from './types.ts';

type MetricAccumulator = {
  count: number;
  sum: number;
};

export type LatestBodySample = {
  day: string;
  key: 'height_cm' | 'weight_kg';
  value: number;
};

export type ParsedAppleHealthXml = {
  latestSamples: LatestBodySample[];
  metrics: Array<{
    day: string;
    metric: WearableMetricRow['metric'];
    value: number;
  }>;
};

export class AppleHealthParseError extends Error {}

type ByteChunkSource = AsyncIterable<Uint8Array>;

function parseAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  const matcher = /([A-Za-z0-9_:-]+)="([^"]*)"/g;
  let match = matcher.exec(tag);

  while (match) {
    attrs[match[1]] = match[2];
    match = matcher.exec(tag);
  }

  return attrs;
}

function addAccumulator(map: Map<string, MetricAccumulator>, metric: WearableMetricRow['metric'], day: string, value: number, mode: 'avg' | 'sum') {
  const key = `${metric}:${day}`;
  const current = map.get(key) ?? { count: 0, sum: 0 };

  map.set(key, {
    count: mode === 'avg' ? current.count + 1 : 1,
    sum: current.sum + value,
  });
}

function minutesBetween(start: string, end: string) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  return Math.round((endMs - startMs) / 60000);
}

function normalizeBodySample(type: string, unit: string | undefined, value: number): Pick<LatestBodySample, 'key' | 'value'> | null {
  if (type === 'HKQuantityTypeIdentifierBodyMass') {
    return {
      key: 'weight_kg',
      value: unit === 'lb' ? value * 0.45359237 : value,
    };
  }

  if (type === 'HKQuantityTypeIdentifierHeight') {
    const heightCm = unit === 'm' ? value * 100 : unit === 'in' ? value * 2.54 : value;

    return {
      key: 'height_cm',
      value: heightCm,
    };
  }

  return null;
}

class AppleHealthAccumulator {
  private latestSamples = new Map<LatestBodySample['key'], LatestBodySample>();
  private metrics = new Map<string, MetricAccumulator>();

  ingestRecordTag(tag: string) {
    const attrs = parseAttributes(tag);
    const type = attrs.type;
    const startDate = attrs.startDate;
    const endDate = attrs.endDate;
    const day = startDate?.slice(0, 10);
    const value = Number(attrs.value);

    if (type && day && Number.isFinite(value)) {
      if (type === 'HKQuantityTypeIdentifierStepCount') {
        addAccumulator(this.metrics, 'steps', day, value, 'sum');
      } else if (type === 'HKQuantityTypeIdentifierHeartRate') {
        addAccumulator(this.metrics, 'avg_hr', day, value, 'avg');
      } else if (type === 'HKQuantityTypeIdentifierRestingHeartRate') {
        addAccumulator(this.metrics, 'resting_hr', day, value, 'avg');
      } else if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
        addAccumulator(this.metrics, 'active_energy_kcal', day, value, 'sum');
      } else {
        const sample = normalizeBodySample(type, attrs.unit, value);

        if (sample) {
          const current = this.latestSamples.get(sample.key);

          if (!current || day >= current.day) {
            this.latestSamples.set(sample.key, {
              day,
              key: sample.key,
              value: sample.value,
            });
          }
        }
      }
    }

    if (type === 'HKCategoryTypeIdentifierSleepAnalysis' && day && startDate && endDate && attrs.value?.includes('Asleep')) {
      addAccumulator(this.metrics, 'sleep_minutes', day, minutesBetween(startDate, endDate), 'sum');
    }
  }

  toParsed(): ParsedAppleHealthXml {
    return {
      latestSamples: [...this.latestSamples.values()],
      metrics: [...this.metrics.entries()].map(([key, value]) => {
        const [metric, day] = key.split(':') as [WearableMetricRow['metric'], string];

        return {
          day,
          metric,
          value: metric === 'avg_hr' || metric === 'resting_hr' ? Math.round((value.sum / Math.max(1, value.count)) * 10) / 10 : value.sum,
        };
      }),
    };
  }
}

class AppleHealthRecordScanner {
  private buffer = '';

  constructor(private accumulator: AppleHealthAccumulator) {}

  pushText(text: string, final = false) {
    this.buffer += text;

    while (this.buffer.length > 0) {
      const start = this.buffer.indexOf('<Record');

      if (start < 0) {
        this.buffer = final ? '' : this.buffer.slice(-16);
        return;
      }

      if (start > 0) {
        this.buffer = this.buffer.slice(start);
      }

      const end = this.buffer.indexOf('>');

      if (end < 0) {
        return;
      }

      this.accumulator.ingestRecordTag(this.buffer.slice(0, end + 1));
      this.buffer = this.buffer.slice(end + 1);
    }
  }
}

async function parseAppleHealthXmlChunks(chunks: ByteChunkSource) {
  const accumulator = new AppleHealthAccumulator();
  const scanner = new AppleHealthRecordScanner(accumulator);
  const decoder = new TextDecoder();

  for await (const chunk of chunks) {
    scanner.pushText(decoder.decode(chunk, { stream: true }));
  }

  scanner.pushText(decoder.decode(), true);

  return accumulator.toParsed();
}

function parseAppleHealthXmlText(xml: string) {
  const accumulator = new AppleHealthAccumulator();
  const scanner = new AppleHealthRecordScanner(accumulator);

  scanner.pushText(xml, true);

  return accumulator.toParsed();
}

function isAppleHealthExportXmlPath(name: string) {
  return name.replace(/\\/g, '/').toLowerCase().endsWith('/export.xml') || name.toLowerCase() === 'export.xml';
}

export async function parseAppleHealthZipStream(chunks: ByteChunkSource): Promise<ParsedAppleHealthXml> {
  const accumulator = new AppleHealthAccumulator();
  const scanner = new AppleHealthRecordScanner(accumulator);
  const decoder = new TextDecoder();
  let foundExportXml = false;
  let finishedExportXml = false;
  let settled = false;

  return await new Promise<ParsedAppleHealthXml>((resolve, reject) => {
    function rejectOnce(error: Error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }

    function resolveOnce() {
      if (!settled) {
        settled = true;
        resolve(accumulator.toParsed());
      }
    }

    const unzip = new Unzip((file) => {
      if (foundExportXml || !isAppleHealthExportXmlPath(file.name)) {
        return;
      }

      foundExportXml = true;
      file.ondata = (error: FlateError | null, chunk: Uint8Array, final: boolean) => {
        if (error) {
          rejectOnce(error);
          return;
        }

        scanner.pushText(decoder.decode(chunk, { stream: !final }), final);

        if (final) {
          finishedExportXml = true;
          resolveOnce();
        }
      };
      file.start();
    });

    unzip.register(UnzipInflate);

    async function pushChunks() {
      try {
        for await (const chunk of chunks) {
          if (settled) {
            return;
          }

          unzip.push(chunk);
        }

        if (!settled) {
          unzip.push(new Uint8Array(), true);
        }

        if (!settled && !foundExportXml) {
          rejectOnce(new AppleHealthParseError('Apple Health export zip does not contain export.xml.'));
        } else if (!settled && !finishedExportXml) {
          rejectOnce(new AppleHealthParseError('Apple Health export.xml did not finish streaming from the zip archive.'));
        }
      } catch (error) {
        rejectOnce(error instanceof Error ? error : new Error('Unable to parse Apple Health export zip.'));
      }
    }

    void pushChunks();
  });
}

export async function parseAppleHealthExportStream(
  chunks: ByteChunkSource,
  options: {
    contentType?: string;
    storagePath?: string;
  } = {},
): Promise<ParsedAppleHealthXml> {
  const path = options.storagePath?.toLowerCase() ?? '';
  const contentType = options.contentType?.toLowerCase() ?? '';

  if (path.endsWith('.zip') || contentType.includes('zip')) {
    return parseAppleHealthZipStream(chunks);
  }

  return parseAppleHealthXmlChunks(chunks);
}

export function parseAppleHealthXml(xml: string): ParsedAppleHealthXml {
  return parseAppleHealthXmlText(xml);
}
