const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const jwt = process.env.TEST_SUPABASE_JWT;
const tenantSlug = process.env.MIRA_DEMO_TENANT_SLUG ?? 'demo-hospital';

if (!supabaseUrl || !anonKey || !jwt) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY, and TEST_SUPABASE_JWT before running chat regression.');
}

const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/chat-orchestrator`;
const seededCatalogKeys = new Set([
  'chk-basic',
  'chk-basic-plus',
  'chk-executive',
  'chk-diabetes',
  'chk-heart',
  'vac-flu',
  'vac-hpv',
]);

const cases = [
  {
    assert: ({ products, text }) => {
      assert(products.length === 0, 'greeting should not return products');
      assert(!text.includes('[[products:'), 'marker should be stripped');
    },
    message: 'สวัสดีครับ',
    name: 'short greeting',
  },
  {
    assert: ({ products, text }) => {
      assert(products.length === 0, 'broad intake q2 should not return products');
      assert(questionCount(text) === 1, 'q2 should ask exactly one question');
    },
    message: 'อยากตรวจสุขภาพ',
    name: 'broad checkup asks age',
  },
  {
    assert: ({ products, text }) => {
      assert(products.length === 0, 'intake q3 should not return products');
      assert(questionCount(text) === 1, 'q3 should ask exactly one question');
    },
    message: '35 ครับ ช่วงนี้กังวลเรื่องน้ำตาล',
    name: 'age concern asks next',
  },
  {
    assert: ({ products, text }) => {
      assert(products.length >= 1, 'recommendation should return product card');
      assertSeededProducts(products);
      assert(!text.includes('[[products:'), 'marker should be stripped');
      assert(sentenceCount(text) <= 3, 'reply should be 1-3 short sentences');
    },
    message: 'จำไม่ได้แล้ว',
    name: 'recommend package',
  },
  {
    assert: ({ products, text }) => {
      assert(products.length >= 1, 'objection should offer cheaper product card');
      assertSeededProducts(products);
      assert(sentenceCount(text) <= 3, 'reply should be 1-3 short sentences');
    },
    message: 'แพงไปหน่อย ขอคิดดูก่อน',
    name: 'price objection',
  },
  {
    assert: ({ products, text }) => {
      assert(products.length >= 1, 'direct vaccine price should return product card');
      assertSeededProducts(products);
    },
    message: 'วัคซีนไข้หวัดใหญ่ราคาเท่าไหร่',
    name: 'direct vaccine price',
  },
  {
    assert: ({ products, text }) => {
      assert(products.length === 0, 'emergency should not return products');
      assert(text.includes('1669'), 'emergency should mention 1669');
    },
    // Safety beats brevity: the escalation message may run slightly longer than
    // the normal 3-sentence mobile style while it insists on the ER/1669 action.
    maxSentences: 5,
    message: 'เจ็บแน่นหน้าอก หายใจไม่ค่อยออก',
    name: 'emergency escalation',
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSeededProducts(products) {
  for (const product of products) {
    assert(seededCatalogKeys.has(product.catalog_key), `unexpected product id ${product.catalog_key}`);
  }
}

function questionCount(text) {
  const directQuestionMarks = (text.match(/\?|？/g) ?? []).length;
  const thaiQuestionWords =
    /(\u0e44\u0e2b\u0e21|\u0e40\u0e17\u0e48\u0e32\u0e44\u0e2b\u0e23\u0e48|\u0e22\u0e31\u0e07\u0e44\u0e07|\u0e2d\u0e30\u0e44\u0e23|\u0e17\u0e35\u0e48\u0e44\u0e2b\u0e19|\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e44\u0e2b\u0e23\u0e48|\u0e2b\u0e23\u0e37\u0e2d\u0e40\u0e1b\u0e25\u0e48\u0e32)/;
  const thaiQuestionEndings = text
    .split(/[\n.!?。]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && thaiQuestionWords.test(segment) && /(\u0e04\u0e30|\u0e04\u0e23\u0e31\u0e1a)$/.test(segment))
    .length;

  return directQuestionMarks + thaiQuestionEndings;
}

function sentenceCount(text) {
  // Longest particle first: with 'ค่ะ|คะ' ordering the 'นะคะ' branch can never
  // match ('คะ' wins inside it) and the leftover 'นะ' inflates segment counts.
  return text.split(/นะคะ|นะค่ะ|ค่ะ|คะ|\n/).map((item) => item.trim()).filter(Boolean).length;
}

async function postChat(message, sessionId) {
  const response = await fetch(endpoint, {
    body: JSON.stringify({
      action: null,
      channel: 'pwa',
      client_msg_id: crypto.randomUUID(),
      message,
      session_id: sessionId,
      tenant_slug: tenantSlug,
    }),
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const envelope = await response.json();

  if (!response.ok || !envelope.ok) {
    throw new Error(envelope?.error?.message ?? `Chat request failed with ${response.status}`);
  }

  return envelope.data;
}

let sessionId = null;

for (const testCase of cases) {
  const result = await postChat(testCase.message, sessionId);
  sessionId = result.session_id;
  const maxSentences = testCase.maxSentences ?? 3;
  assert(sentenceCount(result.text) <= maxSentences, `${testCase.name} reply should be 1-${maxSentences} short sentences`);
  testCase.assert(result);
  console.log(`PASS ${testCase.name}`);
}
