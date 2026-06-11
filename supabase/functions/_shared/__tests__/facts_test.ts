import { normalizeFactCandidates, renderFactsThai } from '../facts.ts';
import type { FactKeyRow, UserFactRow } from '../types.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
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
