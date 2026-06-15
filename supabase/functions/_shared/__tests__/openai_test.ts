import { callOrderFieldExtractor } from '../openai.ts';

declare const Deno: {
  env: {
    delete: (key: string) => void;
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
  };
  test: (name: string, fn: () => void | Promise<void>) => void;
};

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

// Stubs the OpenAI /responses call so callOrderFieldExtractor parses a fixed payload
// without a network round-trip. Mirrors the global-fetch stub pattern used by facts_test.
async function withStubbedExtraction(extractionJson: string, fn: () => Promise<void>) {
  const realFetch = globalThis.fetch;
  const realKey = Deno.env.get('OPENAI_API_KEY');
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ output_text: extractionJson }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )) as typeof fetch;

  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) Deno.env.delete('OPENAI_API_KEY');
    else Deno.env.set('OPENAI_API_KEY', realKey);
  }
}

Deno.test('callOrderFieldExtractor extracts buyer_age within bounds', async () => {
  await withStubbedExtraction(
    JSON.stringify({ buyer_age: 40, buyer_name: 'Somchai', buyer_phone: null, preferred_date: null }),
    async () => {
      const extracted = await callOrderFieldExtractor('age 40 name Somchai');

      assertEquals(extracted.buyer_age, 40);
      assertEquals(extracted.buyer_name, 'Somchai');
    },
  );
});

Deno.test('callOrderFieldExtractor drops out-of-range age', async () => {
  await withStubbedExtraction(
    JSON.stringify({ buyer_age: 200, buyer_name: null, buyer_phone: null, preferred_date: null }),
    async () => {
      const extracted = await callOrderFieldExtractor('age 200');

      assertEquals(extracted.buyer_age, undefined);
    },
  );
});

Deno.test('callOrderFieldExtractor leaves buyer_age undefined when null', async () => {
  await withStubbedExtraction(
    JSON.stringify({ buyer_age: null, buyer_name: null, buyer_phone: null, preferred_date: null }),
    async () => {
      const extracted = await callOrderFieldExtractor('hello');

      assertEquals(extracted.buyer_age, undefined);
    },
  );
});

Deno.test('callOrderFieldExtractor reports confirmation', async () => {
  await withStubbedExtraction(
    JSON.stringify({ buyer_age: null, buyer_name: null, buyer_phone: null, confirmed: true, preferred_date: null }),
    async () => {
      const extracted = await callOrderFieldExtractor('ใช่ ถูกต้อง');

      assertEquals(extracted.confirmed, true);
      assertEquals(extracted.buyer_name, undefined);
    },
  );
});

Deno.test('callOrderFieldExtractor confirmed defaults false', async () => {
  await withStubbedExtraction(
    JSON.stringify({ buyer_age: null, buyer_name: 'Somchai', buyer_phone: null, preferred_date: null }),
    async () => {
      const extracted = await callOrderFieldExtractor('ชื่อ Somchai');

      assertEquals(extracted.confirmed, false);
      assertEquals(extracted.buyer_name, 'Somchai');
    },
  );
});
