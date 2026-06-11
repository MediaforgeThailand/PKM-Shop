import { resolveAuthUserId, selectMany, selectOne, updateRows } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { insertLabFacts } from '../_shared/labFacts.ts';
import type { CustomerRow, LabConfirmResponse, LabReportRow, LabResultRow } from '../_shared/types.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const reportSelect = 'id,tenant_id,customer_id,storage_path,status,ai_summary_th,collected_date,created_at';
const resultSelect = 'id,report_id,test_code,test_name_raw,value,unit,ref_low,ref_high,confidence,confirmed';

const requestSchema = z.object({
  confirmations: z.array(z.object({
    test_code: z.string().min(1),
    unit: z.string().trim().nullable(),
    value: z.number(),
  })).min(1),
  report_id: z.string().uuid(),
});

function hasUnconfirmedLowConfidenceRows(rows: LabResultRow[]) {
  return rows.some((row) => row.confidence < 0.8 && !row.confirmed);
}

export async function handleLabConfirm(req: Request) {
  const optionsResponse = handleOptions(req);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }

  try {
    const authUserId = await resolveAuthUserId(req.headers.get('authorization'));
    const body = await validateJson(req, requestSchema);
    const report = await selectOne<LabReportRow>('lab_reports', {
      id: `eq.${body.report_id}`,
      select: reportSelect,
    });

    if (!report) {
      throw new HttpError('VALIDATION', 'Lab report not found.', 404);
    }

    if (report.status !== 'needs_confirmation') {
      throw new HttpError('VALIDATION', 'Lab report does not need confirmation.', 400);
    }

    const customer = await selectOne<CustomerRow>('customers', {
      auth_user_id: `eq.${authUserId}`,
      id: `eq.${report.customer_id}`,
      select: 'id,tenant_id,auth_user_id,line_user_id,nickname,phone,referred_by,referred_at,created_at',
      tenant_id: `eq.${report.tenant_id}`,
    });

    if (!customer) {
      throw new HttpError('VALIDATION', 'Lab report not found for this customer.', 404);
    }

    const existingRows = await selectMany<LabResultRow>('lab_results', {
      report_id: `eq.${report.id}`,
      select: resultSelect,
    });
    const existingCodes = new Set(existingRows.map((row) => row.test_code));

    for (const confirmation of body.confirmations) {
      if (!existingCodes.has(confirmation.test_code)) {
        throw new HttpError('VALIDATION', `Lab result ${confirmation.test_code} is not part of this report.`, 400);
      }
    }

    for (const confirmation of body.confirmations) {
      await updateRows<LabResultRow>(
        'lab_results',
        {
          confirmed: true,
          unit: confirmation.unit,
          value: confirmation.value,
        },
        {
          report_id: `eq.${report.id}`,
          select: resultSelect,
          test_code: `eq.${confirmation.test_code}`,
        },
      );
    }

    const results = await selectMany<LabResultRow>('lab_results', {
      order: 'test_code.asc',
      report_id: `eq.${report.id}`,
      select: resultSelect,
    });
    let updatedReport = report;

    if (!hasUnconfirmedLowConfidenceRows(results)) {
      const reports = await updateRows<LabReportRow>(
        'lab_reports',
        {
          status: 'ready',
        },
        {
          id: `eq.${report.id}`,
          select: reportSelect,
          tenant_id: `eq.${report.tenant_id}`,
        },
      );

      updatedReport = reports[0] ?? report;
      await insertLabFacts(customer, updatedReport, results);
    }

    const response: LabConfirmResponse = {
      report: updatedReport,
      results,
    };

    return json(response);
  } catch (error) {
    return toErrorResponse(error);
  }
}

if (!(globalThis as typeof globalThis & { __MIRACARE_SUPPRESS_SERVE__?: boolean }).__MIRACARE_SUPPRESS_SERVE__) {
  Deno.serve(handleLabConfirm);
}
