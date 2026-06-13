import { insertRow, selectMany, selectOne, updateRows, upsertRow } from '../_shared/db.ts';
import { HttpError, handleOptions, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertInternalServiceRoleAuthorization } from '../_shared/internalAuth.ts';
import { streamStorageObject } from '../_shared/storage.ts';
import type { CustomerRow, UserFactRow, WearableImportRow, WearableIngestRequest, WearableMetricRow } from '../_shared/types.ts';
import { AppleHealthParseError, parseAppleHealthExportStream, type LatestBodySample } from '../_shared/wearable.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const requestSchema = z.object({
  customer_id: z.string().uuid(),
  storage_path: z.string().min(1),
});

async function loadCustomerForInternalIngest(customerId: string) {
  const customer = await selectOne<CustomerRow>('customers', {
    id: `eq.${customerId}`,
    select: 'id,tenant_id,auth_user_id,line_user_id,nickname,phone,referred_by,referred_at,created_at',
  });

  if (!customer) {
    throw new HttpError('VALIDATION', 'Customer not found.', 404);
  }

  return customer;
}

async function insertLatestFact(customer: CustomerRow, sample: LatestBodySample, sourceRef: string | null) {
  const activeFacts = await selectMany<UserFactRow>('user_facts', {
    customer_id: `eq.${customer.id}`,
    key: `eq.${sample.key}`,
    select: 'id,tenant_id,customer_id,key,value_text,value_num,confidence,status,source,source_ref,superseded_by,created_at',
    status: 'eq.active',
    tenant_id: `eq.${customer.tenant_id}`,
  });

  for (const fact of activeFacts) {
    await updateRows<UserFactRow>(
      'user_facts',
      {
        status: 'superseded',
      },
      {
        id: `eq.${fact.id}`,
        select: 'id,tenant_id,customer_id,key,value_text,value_num,confidence,status,source,source_ref,superseded_by,created_at',
        tenant_id: `eq.${customer.tenant_id}`,
      },
    );
  }

  await insertRow<UserFactRow>('user_facts', {
    confidence: 0.95,
    customer_id: customer.id,
    key: sample.key,
    source: 'wearable',
    source_ref: sourceRef,
    status: 'active',
    tenant_id: customer.tenant_id,
    value_num: Math.round(sample.value * 10) / 10,
    value_text: null,
  });
}

async function* streamChunks(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        return;
      }

      if (value) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function handleWearableIngest(req: Request) {
  const optionsResponse = handleOptions(req);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }

  try {
    assertInternalServiceRoleAuthorization(req.headers.get('authorization'));

    const body = await validateJson(req, requestSchema);
    const customer = await loadCustomerForInternalIngest(body.customer_id);
    const object = await streamStorageObject('wearable-imports', body.storage_path);
    const parsed = await parseAppleHealthExportStream(streamChunks(object.stream), {
      contentType: object.contentType,
      storagePath: body.storage_path,
    });
    // R5: record the import entity first so every metric and fact derived from
    // this file carries a spec-defined source_ref instead of null.
    const importRow = await insertRow<WearableImportRow>(
      'wearable_imports',
      {
        customer_id: customer.id,
        file_path: body.storage_path,
        filename: body.storage_path.split('/').pop() ?? body.storage_path,
        metric_count: parsed.metrics.length,
        source: 'apple_export',
        tenant_id: customer.tenant_id,
      },
      {
        select: 'id,tenant_id,customer_id,source,filename,file_path,metric_count,imported_at',
      },
    );

    const metrics: WearableMetricRow[] = [];

    for (const metric of parsed.metrics) {
      const row = await upsertRow<WearableMetricRow>(
        'wearable_metrics',
        {
          customer_id: customer.id,
          day: metric.day,
          import_id: importRow.id,
          metric: metric.metric,
          source: 'apple_export',
          tenant_id: customer.tenant_id,
          value: metric.value,
        },
        'customer_id,metric,day,source',
        {
          select: 'id,tenant_id,customer_id,source,metric,day,value',
        },
      );
      metrics.push(row);
    }

    for (const sample of parsed.latestSamples) {
      await insertLatestFact(customer, sample, importRow.id);
    }

    return json({
      inserted: metrics.length,
      metrics,
    });
  } catch (error) {
    if (error instanceof AppleHealthParseError) {
      return toErrorResponse(new HttpError('VALIDATION', error.message, 400));
    }

    return toErrorResponse(error);
  }
}

if (!(globalThis as typeof globalThis & { __MIRACARE_SUPPRESS_SERVE__?: boolean }).__MIRACARE_SUPPRESS_SERVE__) {
  Deno.serve(handleWearableIngest);
}
