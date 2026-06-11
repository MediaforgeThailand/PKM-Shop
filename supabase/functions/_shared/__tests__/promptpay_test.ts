import { buildPromptPayPayload } from '../promptpay.ts';

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

Deno.test('buildPromptPayPayload builds phone fixture for 2990 THB', () => {
  assertEquals(
    buildPromptPayPayload('0812345678', 2990),
    '00020101021129370016A00000067701011101130066812345678530376454072990.005802TH63044FB9',
  );
});

Deno.test('buildPromptPayPayload builds national id fixture', () => {
  assertEquals(
    buildPromptPayPayload('0200000000000', 100),
    '00020101021129370016A0000006770101110213020000000000053037645406100.005802TH630441B4',
  );
});

Deno.test('buildPromptPayPayload builds low amount fixture', () => {
  assertEquals(
    buildPromptPayPayload('0812345678', 1),
    '00020101021129370016A00000067701011101130066812345678530376454041.005802TH63043917',
  );
});
