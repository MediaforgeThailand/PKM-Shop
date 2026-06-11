import { insertRow, selectOne, updateRows, upsertRow } from '../_shared/db.ts';
import { HttpError, handleOptions, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertInternalServiceRoleAuthorization } from '../_shared/internalAuth.ts';
import { hasLowConfidenceLabRows, normalizeLabRows } from '../_shared/lab.ts';
import { callLabSummary, callLabVisionExtractor } from '../_shared/openai.ts';
import { downloadStorageObject } from '../_shared/storage.ts';
import type { CustomerRow, LabIngestRequest, LabReportRow, LabResultRow } from '../_shared/types.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const requestSchema = z.object({
  collected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customer_id: z.string().uuid(),
  storage_path: z.string().min(1),
});

const factCodes = new Set(['FBS', 'HBA1C', 'CHOL']);

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

async function insertLabFacts(customer: CustomerRow, report: LabReportRow, rows: LabResultRow[]) {
  for (const row of rows) {
    if (!factCodes.has(row.test_code) || row.value === null) {
      continue;
    }

    await upsertRow(
      'user_facts',
      {
        confidence: row.confidence,
        customer_id: customer.id,
        key: row.test_code,
        source: 'lab_import',
        source_ref: report.id,
        status: 'active',
        tenant_id: customer.tenant_id,
        value_num: row.value,
        value_text: null,
      },
      'customer_id,key,source,source_ref',
    );
  }
}

export async function handleLabIngest(req: Request) {
  const optionsResponse = handleOptions(req);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }

  let report: LabReportRow | null = null;

  try {
    assertInternalServiceRoleAuthorization(req.headers.get('authorization'));

    const body = await validateJson(req, requestSchema);
    const customer = await loadCustomerForInternalIngest(body.customer_id);

    report = await insertRow<LabReportRow>('lab_reports', {
      collected_date: body.collected_date ?? null,
      customer_id: customer.id,
      status: 'processing',
      storage_path: body.storage_path,
      tenant_id: customer.tenant_id,
    }, {
      select: 'id,tenant_id,customer_id,storage_path,status,ai_summary_th,collected_date,created_at',
    });

    const object = await downloadStorageObject('lab-reports', body.storage_path);
    const visionRows = await callLabVisionExtractor(object.bytes, object.contentType);
    const extracted = normalizeLabRows(visionRows);
    const hasLowConfidence = hasLowConfidenceLabRows(extracted);
    const status: LabReportRow['status'] = hasLowConfidence ? 'needs_confirmation' : 'ready';
    const summary = status === 'ready' ? await callLabSummary(visionRows) : null;
    const results: LabResultRow[] = [];

    for (const row of extracted) {
      const result = await upsertRow<LabResultRow>(
        'lab_results',
        {
          confidence: row.confidence,
          confirmed: row.confidence >= 0.8,
          ref_high: row.ref_high,
          ref_low: row.ref_low,
          report_id: report.id,
          test_code: row.test_code,
          test_name_raw: row.test_name_raw,
          unit: row.unit,
          value: row.value,
        },
        'report_id,test_code',
        {
          select: 'id,report_id,test_code,test_name_raw,value,unit,ref_low,ref_high,confidence,confirmed',
        },
      );
      results.push(result);
    }

    const updatedRows = await updateRows<LabReportRow>(
      'lab_reports',
      {
        ai_summary_th: summary,
        status,
      },
      {
        id: `eq.${report.id}`,
        select: 'id,tenant_id,customer_id,storage_path,status,ai_summary_th,collected_date,created_at',
        tenant_id: `eq.${customer.tenant_id}`,
      },
    );
    const updatedReport = updatedRows[0] ?? report;

    if (updatedReport.status === 'ready') {
      await insertLabFacts(customer, updatedReport, results);
    }

    return json({
      report: updatedReport,
      results,
    });
  } catch (error) {
    if (report) {
      await updateRows<LabReportRow>(
        'lab_reports',
        {
          status: 'failed',
        },
        {
          id: `eq.${report.id}`,
          select: 'id,tenant_id,customer_id,storage_path,status,ai_summary_th,collected_date,created_at',
          tenant_id: `eq.${report.tenant_id}`,
        },
      ).catch(() => null);
    }

    return toErrorResponse(error);
  }
}

if (!(globalThis as typeof globalThis & { __MIRACARE_SUPPRESS_SERVE__?: boolean }).__MIRACARE_SUPPRESS_SERVE__) {
  Deno.serve(handleLabIngest);
}
