import {
  LAB_CODE_NORMALIZATION_TABLE,
  LAB_SUMMARY_DISCLAIMER_TH,
  formatLabCodeNormalizationTable,
  hasLowConfidenceLabRows,
  normalizeLabRows,
  sanitizeLabSummary,
} from '../lab.ts';
import type { LabVisionResult } from '../openai.ts';
import labVisionFixture from './fixtures/lab_vision_results.json' with { type: 'json' };

declare const Deno: {
  test: (name: string, fn: () => void) => void;
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

const sampleRows: LabVisionResult[] = [
  {
    confidence: 1.2,
    mapped_code: 'FBS',
    ref_high: 99,
    ref_low: 70,
    test_name_raw: ' Fasting Blood Sugar ',
    unit: ' mg/dL ',
    value: 88,
  },
  {
    confidence: 0.62,
    mapped_code: null,
    ref_high: null,
    ref_low: null,
    test_name_raw: '',
    unit: '',
    value: null,
  },
  {
    confidence: 0.91,
    mapped_code: 'UNSUPPORTED',
    ref_high: null,
    ref_low: null,
    test_name_raw: 'Unexpected code',
    unit: null,
    value: 10,
  },
];

const fixtureRows = labVisionFixture.results as LabVisionResult[];

Deno.test('lab code normalization table covers the 15 supported test codes', () => {
  assertEquals(
    LAB_CODE_NORMALIZATION_TABLE.map((row) => row.test_code),
    ['FBS', 'HBA1C', 'CHOL', 'TG', 'HDL', 'LDL', 'CR', 'ALT', 'AST', 'CBC', 'HB', 'HCT', 'WBC', 'PLT', 'UA'],
  );

  const table = formatLabCodeNormalizationTable();

  assert(table.includes('| test_code | normalization rule |'), 'expected markdown normalization table header');
  assert(table.includes('| HBA1C |'), 'expected HBA1C row in normalization table');
  assert(table.includes('| UA |'), 'expected UA row in normalization table');
});

Deno.test('normalizeLabRows clamps confidence, trims lab fields, and rejects unsupported codes', () => {
  assertEquals(normalizeLabRows(sampleRows), [
    {
      confidence: 1,
      ref_high: 99,
      ref_low: 70,
      test_code: 'FBS',
      test_name_raw: 'Fasting Blood Sugar',
      unit: 'mg/dL',
      value: 88,
    },
    {
      confidence: 0.62,
      ref_high: null,
      ref_low: null,
      test_code: 'UNMAPPED_2',
      test_name_raw: 'Lab row 2',
      unit: null,
      value: null,
    },
    {
      confidence: 0.91,
      ref_high: null,
      ref_low: null,
      test_code: 'UNMAPPED_3',
      test_name_raw: 'Unexpected code',
      unit: null,
      value: 10,
    },
  ]);
});

Deno.test('normalizeLabRows handles sample lab vision fixture', () => {
  const rows = normalizeLabRows(fixtureRows);

  assertEquals(rows.map((row) => row.test_code), ['FBS', 'HBA1C', 'CHOL', 'UNMAPPED_4']);
  assert(hasLowConfidenceLabRows(rows), 'expected low-confidence fixture row to require confirmation');
  assertEquals(rows[0].value, 105);
  assertEquals(rows[2].confidence, 0.76);
});

Deno.test('hasLowConfidenceLabRows flags rows below confirmation threshold', () => {
  assert(hasLowConfidenceLabRows(normalizeLabRows(sampleRows)), 'expected low confidence row to require confirmation');
  assert(!hasLowConfidenceLabRows(normalizeLabRows([sampleRows[0]])), 'expected high confidence row to be ready');
});

Deno.test('sanitizeLabSummary appends disclaimer and removes diagnosis wording', () => {
  const summary = sanitizeLabSummary('ผลนี้ยังไม่ใช่การวินิจฉัยโรค');

  assert(summary.includes(LAB_SUMMARY_DISCLAIMER_TH), 'expected fixed disclaimer');
  assert(!summary.includes('วินิจฉัย'), 'expected diagnosis wording to be removed');
  assert(summary.includes('ประเมิน'), 'expected replacement wording');
});

Deno.test('sanitizeLabSummary does not duplicate disclaimer', () => {
  const summary = sanitizeLabSummary(`ผลโดยรวมอยู่ในช่วงอ้างอิง\n${LAB_SUMMARY_DISCLAIMER_TH}`);
  const occurrences = summary.split(LAB_SUMMARY_DISCLAIMER_TH).length - 1;

  assertEquals(occurrences, 1);
});
