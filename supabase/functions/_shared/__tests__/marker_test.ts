import { filterKnownProductMarkerKeys, parseChatMarker, parseProductMarker } from '../marker.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEquals(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }

  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => deepEquals(value, expected[index]))
    );
  }

  if (isRecord(actual) || isRecord(expected)) {
    if (!isRecord(actual) || !isRecord(expected)) {
      return false;
    }

    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();

    return (
      deepEquals(actualKeys, expectedKeys) &&
      actualKeys.every((key) => deepEquals(actual[key], expected[key]))
    );
  }

  return false;
}

function assertEquals(actual: unknown, expected: unknown) {
  if (!deepEquals(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('parseProductMarker returns text without marker when absent', () => {
  assertEquals(parseProductMarker('hello'), { catalogKeys: [], text: 'hello' });
});

Deno.test('parseChatMarker returns no marker when absent', () => {
  assertEquals(parseChatMarker('hello'), {
    catalogKeys: [],
    strippedExtraMarkerCount: 0,
    text: 'hello',
    type: null,
  });
});

Deno.test('parseProductMarker parses one id', () => {
  assertEquals(parseProductMarker('แนะนำตัวนี้ค่ะ\n[[products: chk-basic]]'), {
    catalogKeys: ['chk-basic'],
    text: 'แนะนำตัวนี้ค่ะ',
  });
});

Deno.test('parseProductMarker parses two ids', () => {
  assertEquals(parseProductMarker('เทียบสองตัวค่ะ\n[[products: chk-basic, chk-premium]]'), {
    catalogKeys: ['chk-basic', 'chk-premium'],
    text: 'เทียบสองตัวค่ะ',
  });
});

Deno.test('parseProductMarker accepts whitespace variants', () => {
  assertEquals(parseProductMarker('ok\n[[products:   a,   b  ]]   '), {
    catalogKeys: ['a', 'b'],
    text: 'ok',
  });
});

Deno.test('parseProductMarker ignores mid-text marker', () => {
  assertEquals(parseProductMarker('[[products: a]] still text'), {
    catalogKeys: [],
    text: '[[products: a]] still text',
  });
});

Deno.test('parseProductMarker keeps legacy two id output', () => {
  assertEquals(parseProductMarker('ok\n[[products: a,b]]'), {
    catalogKeys: ['a', 'b'],
    text: 'ok',
  });
});

Deno.test('parseChatMarker truncates product ids to four', () => {
  assertEquals(parseChatMarker('ok\n[[products: a,b,c,d,e]]'), {
    catalogKeys: ['a', 'b', 'c', 'd'],
    strippedExtraMarkerCount: 0,
    text: 'ok',
    type: 'products',
  });
});

Deno.test('parseProductMarker uses v3 four id cap', () => {
  assertEquals(parseProductMarker('ok\n[[products: a,b,c,d,e]]'), {
    catalogKeys: ['a', 'b', 'c', 'd'],
    text: 'ok',
  });
});

Deno.test('parseProductMarker drops empty id entries', () => {
  assertEquals(parseProductMarker('ok\n[[products: a,  , b ]]'), {
    catalogKeys: ['a', 'b'],
    text: 'ok',
  });
});

Deno.test('parseChatMarker parses categories marker and ignores args', () => {
  assertEquals(parseChatMarker('เลือกหมวดได้เลยค่ะ\n[[categories: ignored]]'), {
    catalogKeys: [],
    strippedExtraMarkerCount: 0,
    text: 'เลือกหมวดได้เลยค่ะ',
    type: 'categories',
  });
});

Deno.test('parseChatMarker parses order status marker', () => {
  assertEquals(parseChatMarker('คิวของคุณลงไว้แล้วค่ะ\n[[order_status]]'), {
    catalogKeys: [],
    strippedExtraMarkerCount: 0,
    text: 'คิวของคุณลงไว้แล้วค่ะ',
    type: 'order_status',
  });
});

Deno.test('parseChatMarker strips extra marker lines before final marker', () => {
  assertEquals(parseChatMarker('ตัวเลือกค่ะ\n[[categories]]\n[[products: a,b]]'), {
    catalogKeys: ['a', 'b'],
    strippedExtraMarkerCount: 1,
    text: 'ตัวเลือกค่ะ',
    type: 'products',
  });
});

Deno.test('filterKnownProductMarkerKeys logs unknown ids and drops them', () => {
  let loggedUnknownKeys: string[] = [];
  const resolved = filterKnownProductMarkerKeys(['known-a', 'missing', 'known-b'], ['known-a', 'known-b'], (unknownKeys) => {
    loggedUnknownKeys = unknownKeys;
  });

  assertEquals(resolved, ['known-a', 'known-b']);
  assertEquals(loggedUnknownKeys, ['missing']);
});
