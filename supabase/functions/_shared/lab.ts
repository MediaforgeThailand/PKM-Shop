import type { LabVisionResult } from './openai.ts';

export { LAB_SUMMARY_DISCLAIMER_TH } from './templates.ts';
import { LAB_SUMMARY_DISCLAIMER_TH } from './templates.ts';

export const LAB_CODE_NORMALIZATION_TABLE = [
  { test_code: 'FBS' },
  { test_code: 'HBA1C' },
  { test_code: 'CHOL' },
  { test_code: 'TG' },
  { test_code: 'HDL' },
  { test_code: 'LDL' },
  { test_code: 'CR' },
  { test_code: 'ALT' },
  { test_code: 'AST' },
  { test_code: 'CBC' },
  { test_code: 'HB' },
  { test_code: 'HCT' },
  { test_code: 'WBC' },
  { test_code: 'PLT' },
  { test_code: 'UA' },
] as const;

export const SUPPORTED_LAB_TEST_CODES = LAB_CODE_NORMALIZATION_TABLE.map((row) => row.test_code);

const supportedLabTestCodeSet = new Set<string>(SUPPORTED_LAB_TEST_CODES);

export type SupportedLabTestCode = (typeof LAB_CODE_NORMALIZATION_TABLE)[number]['test_code'];

export type NormalizedLabRow = {
  confidence: number;
  ref_high: number | null;
  ref_low: number | null;
  test_code: string;
  test_name_raw: string;
  unit: string | null;
  value: number | null;
};

export function isSupportedLabTestCode(value: string | null | undefined): value is SupportedLabTestCode {
  return typeof value === 'string' && supportedLabTestCodeSet.has(value);
}

export function formatLabCodeNormalizationTable() {
  return [
    '| test_code | normalization rule |',
    '|---|---|',
    ...LAB_CODE_NORMALIZATION_TABLE.map(
      (row) => `| ${row.test_code} | Use ${row.test_code} only when the raw row explicitly matches this supported code. Otherwise set mapped_code to null. |`,
    ),
  ].join('\n');
}

export function normalizeLabRows(rows: LabVisionResult[]): NormalizedLabRow[] {
  return rows
    .map((row, index) => ({
      confidence: Math.max(0, Math.min(1, row.confidence)),
      ref_high: typeof row.ref_high === 'number' ? row.ref_high : null,
      ref_low: typeof row.ref_low === 'number' ? row.ref_low : null,
      test_code: isSupportedLabTestCode(row.mapped_code) ? row.mapped_code : `UNMAPPED_${index + 1}`,
      test_name_raw: row.test_name_raw.trim() || `Lab row ${index + 1}`,
      unit: row.unit?.trim() || null,
      value: typeof row.value === 'number' ? row.value : null,
    }))
    .filter((row) => row.test_name_raw.length > 0);
}

export function hasLowConfidenceLabRows(rows: NormalizedLabRow[]) {
  return rows.some((row) => row.confidence < 0.8);
}

export function sanitizeLabSummary(rawSummary: string) {
  const cleaned = rawSummary.replace(/วินิจฉัย/g, 'ประเมิน').trim();
  const summary = cleaned || 'สรุปผลยังไม่พร้อม';

  if (summary.includes(LAB_SUMMARY_DISCLAIMER_TH)) {
    return summary;
  }

  return `${summary}\n${LAB_SUMMARY_DISCLAIMER_TH}`;
}
