import { filterKnownProductMarkerKeys, parseProductMarker } from '../marker.ts';

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

Deno.test('parseProductMarker truncates ids to two', () => {
  assertEquals(parseProductMarker('ok\n[[products: a,b,c]]'), {
    catalogKeys: ['a', 'b'],
    text: 'ok',
  });
});

Deno.test('parseProductMarker drops empty id entries', () => {
  assertEquals(parseProductMarker('ok\n[[products: a,  , b ]]'), {
    catalogKeys: ['a', 'b'],
    text: 'ok',
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
