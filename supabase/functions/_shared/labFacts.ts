import { upsertRow } from './db.ts';
import type { CustomerRow, LabReportRow, LabResultRow } from './types.ts';

const factCodes = new Set(['FBS', 'HBA1C', 'CHOL']);

export async function insertLabFacts(customer: CustomerRow, report: LabReportRow, rows: LabResultRow[]) {
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
