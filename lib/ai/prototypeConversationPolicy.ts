import type { ChatContextAssessment, ChatUiCard } from './healthChatTypes';

export type ProductRequestKind = 'broad' | 'direct' | 'none';

export type PrototypePolicyMessage = {
  content: string;
  role: 'assistant' | 'user';
};

const DEFAULT_PROTOTYPE_USER_NICKNAME = 'บอส';

const productDiscoveryTerms = [
  'แพ็กเกจ',
  'แพ็คเกจ',
  'ตรวจสุขภาพ',
  'ตรวจเลือด',
  'เจาะเลือด',
  'แล็บ',
  'โปรดักส์',
  'โปรดัก',
  'สินค้า',
  'บริการ',
  'รายการตรวจ',
  'blood test',
  'lab test',
  'checkup',
  'package',
  'product',
];

const productBrowseTerms = [
  'ต้องการ',
  'อยาก',
  'ควร',
  'ควรตรวจ',
  'ขอดู',
  'แนะนำ',
  'มีอะไรบ้าง',
  'ทั้งหมด',
  'ราคา',
  'ซื้อ',
  'จอง',
  'เลือก',
  'compare',
  'buy',
  'pay',
];

const explicitProductTerms = ['แพ็กเกจ', 'แพ็คเกจ', 'package', 'ราคา', 'ซื้อ', 'จอง', 'ชำระ', 'จ่าย', 'ขอดู', 'มีอะไรบ้าง', 'ทั้งหมด', 'โปรดัก'];
const careQuestionTerms = ['เตรียมตัว', 'ต้องทำยังไง', 'ทำไง', 'ทำอย่างไร', 'กินน้ำได้ไหม', 'งดอาหาร', 'ต้องงด', 'ก่อนตรวจ', 'หลังตรวจ', 'ผลตรวจ', 'อ่านผล', 'แปลผล'];

export function includesAnyTerm(text: string, terms: string[]) {
  const normalizedText = text.toLowerCase();

  return terms.some((term) => normalizedText.includes(term.toLowerCase()));
}

function hasPackagePurchaseIntent(question: string) {
  const normalized = question.toLowerCase();
  const buyTerms = ['ซื้อ', 'จ่าย', 'ชำระ', 'checkout', 'buy', 'pay'];
  const packageTerms = ['แพ็กเกจ', 'แพ็คเกจ', 'ตรวจสุขภาพ', 'checkup', 'package'];

  return buyTerms.some((term) => normalized.includes(term)) && packageTerms.some((term) => normalized.includes(term));
}

export function classifyProductRequest(question: string): ProductRequestKind {
  const normalized = question.toLowerCase();

  if (includesAnyTerm(normalized, careQuestionTerms) && !includesAnyTerm(normalized, explicitProductTerms)) {
    return 'none';
  }

  if (hasPackagePurchaseIntent(question)) {
    return includesAnyTerm(normalized, ['ตรวจเลือด', 'เจาะเลือด', 'วัคซีน', 'มะเร็ง', 'หัวใจ', 'น้ำตาล', 'ไขมัน', 'blood', 'lab', 'vaccine'])
      ? 'direct'
      : 'broad';
  }

  const mentionsProduct = includesAnyTerm(normalized, productDiscoveryTerms);
  const browsingProducts = includesAnyTerm(normalized, productBrowseTerms);
  const hasProductIntent = mentionsProduct || (browsingProducts && includesAnyTerm(normalized, ['ตรวจ', 'สุขภาพ', 'health', 'product']));

  if (!hasProductIntent) {
    return 'none';
  }

  const directTerms = [
    'ตรวจเลือด',
    'เจาะเลือด',
    'แล็บ',
    'แลป',
    'วัคซีน',
    'มะเร็ง',
    'หัวใจ',
    'เบาหวาน',
    'น้ำตาล',
    'ไขมัน',
    'ตับ',
    'ไต',
    'x-ray',
    'mri',
    'ct',
    'ultrasound',
    'mammogram',
    'hpv',
    'blood',
    'lab',
    'vaccine',
    'basic blood',
  ];
  const listTerms = ['ทั้งหมด', 'มีอะไรบ้าง', 'ราคา', 'ขอดูแพ็กเกจ', 'ขอดูแพคเกจ'];

  if (includesAnyTerm(normalized, directTerms) || includesAnyTerm(normalized, listTerms)) {
    return 'direct';
  }

  return 'broad';
}

export function hasBlockedConversationStyle(text: string) {
  return includesAnyTerm(text, [
    'ถ้าจะวางแผน',
    'วางแผนให้ใช้',
    'เพื่อให้คำแนะนำแม่นยำ',
    'เพื่อประเมิน',
    'เพื่อคัดกรอง',
    'เพราะคำแนะนำควร',
    'ขอทราบ',
    'ข้อมูลที่จำเป็น',
    'ข้อมูลที่ให้มา',
    'กรุณา',
    'ดำเนินการ',
    'โซนที่สะดวก',
    'งบคร่าว',
    'เหมาะทั้งสุขภาพ',
    'เวลาเดินทาง',
    'ค่าใช้จ่าย',
    'budget',
    'option',
    'ไม่มีข้อมูลในระบบ',
    'ไม่มีข้อมูลอ้างอิง',
    'ไม่พบข้อมูลในระบบ',
    'ระบบข้อมูล',
    'ผมครับ',
    'ในฐานะ',
  ]);
}

function countQuestionLikePhrases(text: string) {
  const normalizedText = text.replace(/\s+/g, ' ');
  const marks = normalizedText.match(/[?？]/g)?.length ?? 0;
  const thaiQuestionEndings =
    normalizedText.match(/(?:ไหม|มั้ย|หรือเปล่า|หรือไม่|เมื่อไหร่|แถวไหน|ละแวกไหน|ที่ไหน|อะไร|เท่าไหร่|กี่ปี)(?:คะ|ค่ะ|ครับ)?/g)?.length ?? 0;

  return Math.max(marks, thaiQuestionEndings);
}

function needsConversationCleanup(text: string, contextAssessment: ChatContextAssessment) {
  const compactText = text.replace(/\s+/g, ' ').trim();

  return (
    hasBlockedConversationStyle(text) ||
    countQuestionLikePhrases(text) > 1 ||
    /^\s*(?:[-*]|\d+[.)])\s+/m.test(text) ||
    (contextAssessment.mode === 'ask_context' && Boolean(contextAssessment.nextQuestion) && compactText.length > (contextAssessment.nextQuestion?.length ?? 0) + 120)
  );
}

function compactAnswer(text: string) {
  return text
    .replace(/ถ้าจะวางแผน[^.!?\n。]*[.!?\n。]?/gi, '')
    .replace(/เพื่อให้คำแนะนำแม่นยำ[^.!?\n。]*[.!?\n。]?/gi, '')
    .replace(/เพราะคำแนะนำควร[^.!?\n。]*[.!?\n。]?/gi, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .slice(0, 220);
}

export function enforceConversationStyle(text: string, contextAssessment: ChatContextAssessment) {
  if (!needsConversationCleanup(text, contextAssessment)) {
    return text;
  }

  if (contextAssessment.mode === 'ask_context' && contextAssessment.nextQuestion && !hasBlockedConversationStyle(contextAssessment.nextQuestion)) {
    return contextAssessment.nextQuestion;
  }

  const compact = compactAnswer(text);

  if (compact && !hasBlockedConversationStyle(compact) && countQuestionLikePhrases(compact) <= 1) {
    return compact;
  }

  return 'โอเคค่ะ คุณบอสสะดวกตรวจแถวไหนคะ';
}

export function sanitizeAssistantDisplayText(text: string, userNickname = DEFAULT_PROTOTYPE_USER_NICKNAME) {
  const trimmed = text.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (!hasBlockedConversationStyle(trimmed) && countQuestionLikePhrases(trimmed) <= 1) {
    return trimmed;
  }

  const compact = compactAnswer(trimmed);

  if (compact && !hasBlockedConversationStyle(compact) && countQuestionLikePhrases(compact) <= 1) {
    return compact;
  }

  return `โอเคค่ะ ${userDisplayName(userNickname)}สะดวกตรวจแถวไหนคะ`;
}

export function createNaturalHealthFallbackAnswer(
  question: string,
  options: { hasMatches?: boolean; userNickname?: string } = {},
) {
  const normalized = question.toLowerCase();
  const displayName = userDisplayName(options.userNickname ?? DEFAULT_PROTOTYPE_USER_NICKNAME);
  const isWhy = normalized.includes('ทำไม') || normalized.includes('why');
  const isBlood = normalized.includes('ตรวจเลือด') || normalized.includes('เจาะเลือด') || normalized.includes('blood');
  const isPrep = normalized.includes('เตรียมตัว') || normalized.includes('งดอาหาร') || normalized.includes('ก่อนตรวจ');
  const isEmergency = normalized.includes('เจ็บหน้าอก') || normalized.includes('หายใจลำบาก') || normalized.includes('หมดสติ') || normalized.includes('ฉุกเฉิน');
  const isResultReview = normalized.includes('ผลตรวจ') || normalized.includes('อ่านผล') || normalized.includes('แปลผล');

  if (isEmergency) {
    return 'อาการแบบนี้อย่ารอดูเองนะคะ แนะนำให้ไปฉุกเฉินหรือโทรขอความช่วยเหลือทันทีค่ะ';
  }

  if (isResultReview) {
    return `ได้ค่ะ${displayName} ส่งค่าผลตรวจมาได้เลย เดี๋ยวฉันช่วยอ่านเป็นภาษาง่ายๆ ให้ค่ะ`;
  }

  if (isWhy) {
    return 'เพราะตรวจพื้นฐานช่วยเห็นภาพน้ำตาล ไขมัน ตับ ไต และความดันในรอบเดียวค่ะ ถ้ามีผลเก่าเอามาเทียบด้วยจะเห็นแนวโน้มชัดขึ้น';
  }

  if (isBlood || isPrep) {
    return 'ได้ค่ะ ถ้าตรวจเลือด ให้เช็กก่อนว่าต้องงดอาหารไหม โดยเฉพาะน้ำตาลกับไขมันค่ะ ยาที่กินประจำอย่าเพิ่งหยุดเองนะคะ';
  }

  if (options.hasMatches) {
    return `ได้ค่ะ${displayName} เรื่องนี้เริ่มดูจากข้อมูลพื้นฐานก่อนจะปลอดภัยกว่า ถ้ามีผลตรวจเก่าหรืออาการที่กังวล ส่งมาให้ดูต่อได้เลยค่ะ`;
  }

  return `ได้ค่ะ${displayName} คุยเรื่องนี้สั้นๆ ได้เลย ถ้าอยากกลับมาดูสุขภาพ เดี๋ยวฉันช่วยต่อให้ค่ะ`;
}

export function hasProductGridCard(cards?: ChatUiCard[]) {
  return cards?.some((card) => card.type === 'product_grid') ?? false;
}

function hasAgeSlot(text: string) {
  if (/(?:อายุ|age)\s*[0-9]{1,3}/i.test(text) || /[0-9]{1,3}\s*(?:ปี|years?\s*old|yo)/i.test(text)) {
    return true;
  }

  return text
    .split(/\r?\n/)
    .some((line) => /^\s*(1[89]|[2-8][0-9]|9[0-9])\s+/.test(line) && includesAnyTerm(line, ['เรื่อง', 'โฟกัส', 'น้ำตาล', 'ไขมัน', 'สุขภาพ', 'concern', 'focus']));
}

function userDisplayName(userNickname = DEFAULT_PROTOTYPE_USER_NICKNAME) {
  return userNickname.startsWith('คุณ') ? userNickname : `คุณ${userNickname}`;
}

function hasGreetingTerm(text: string) {
  return includesAnyTerm(text, ['สวัสดี', 'หวัดดี', 'ดีค่ะ', 'ดีครับ', 'hello', 'hi', 'hey', 'sawasdee']);
}

function hasNoRecentCheckupEvidence(text: string) {
  return includesAnyTerm(text, [
    'ยังไม่เคยตรวจ',
    'ไม่เคยตรวจสุขภาพ',
    'ไม่เคยตรวจจริงจัง',
    'ไม่เคยมีผลตรวจ',
    'ไม่ได้ตรวจสุขภาพ',
    'ไม่ได้ตรวจมานาน',
    'ไม่มีผลตรวจล่าสุด',
    'ยังไม่มีผลตรวจล่าสุด',
    'never had checkup',
    'no recent checkup',
  ]);
}

function getLastAssistantMessageBeforeQuestion(history: PrototypePolicyMessage[], question: string) {
  const normalizedQuestion = question.trim();

  for (const message of [...history].reverse()) {
    if (message.role === 'user' && message.content.trim() === normalizedQuestion) {
      continue;
    }

    if (message.role === 'assistant' && message.content.trim()) {
      return message.content;
    }
  }

  return '';
}

function isUnknownRecentCheckupReply(history: PrototypePolicyMessage[], question: string) {
  if (!includesAnyTerm(question, ['จำไม่ได้', 'ไม่แน่ใจ', 'ไม่รู้', 'นานแล้ว', 'น่าจะนาน', 'หลายปี', 'จำไม่ได้แล้ว', 'not sure', "don't remember", 'cannot remember'])) {
    return false;
  }

  const lastAssistantMessage = getLastAssistantMessageBeforeQuestion(history, question);

  return includesAnyTerm(lastAssistantMessage, [
    'ตรวจล่าสุด',
    'ตรวจสุขภาพครั้งล่าสุด',
    'ครั้งล่าสุดประมาณ',
    'ผลตรวจล่าสุด',
    'เคยตรวจครั้งล่าสุด',
    'ตรวจสุขภาพมาก่อน',
    'last checkup',
    'latest checkup',
    'lab result',
  ]);
}

function looksLikeUserQuestion(text: string) {
  return includesAnyTerm(text, ['?', 'ไหม', 'มั้ย', 'หรือเปล่า', 'ทำไง', 'ยังไง', 'อย่างไร', 'ควร', 'ได้ไหม', 'what', 'how', 'should', 'can i']);
}

function looksLikeContextFollowUpAnswer(history: PrototypePolicyMessage[], question: string) {
  const lastAssistantMessage = getLastAssistantMessageBeforeQuestion(history, question);

  if (!lastAssistantMessage || looksLikeUserQuestion(question)) {
    return false;
  }

  if (includesAnyTerm(lastAssistantMessage, ['อายุประมาณ', 'อายุเท่าไหร่', 'how old', 'age'])) {
    return hasAgeSlot(question);
  }

  if (includesAnyTerm(lastAssistantMessage, ['ตรวจสุขภาพครั้งล่าสุด', 'ตรวจล่าสุด', 'เคยตรวจสุขภาพ', 'ผลตรวจล่าสุด', 'last checkup', 'latest checkup'])) {
    return (
      isUnknownRecentCheckupReply(history, question) ||
      includesAnyTerm(question, ['ไม่เคย', 'จำไม่ได้', 'ไม่แน่ใจ', 'ปีที่แล้ว', 'เดือนที่แล้ว', 'นานแล้ว', 'ล่าสุด', 'last year', 'months ago', 'never'])
    );
  }

  if (includesAnyTerm(lastAssistantMessage, ['อยากดูเรื่องไหน', 'โฟกัสเรื่องไหน', 'กังวลเรื่องไหน', 'focus'])) {
    return includesAnyTerm(question, ['น้ำตาล', 'ไขมัน', 'ตับ', 'ไต', 'หัวใจ', 'เหนื่อย', 'นอน', 'เครียด', 'น้ำหนัก', 'blood sugar', 'cholesterol', 'heart']);
  }

  if (includesAnyTerm(lastAssistantMessage, ['โรคประจำตัว', 'ยาที่กิน', 'แพ้ยา', 'medical condition'])) {
    return includesAnyTerm(question, ['ไม่มี', 'มี', 'โรค', 'ยา', 'แพ้', 'เบาหวาน', 'ความดัน', 'ไขมัน', 'หัวใจ', 'none', 'no ', 'diabetes', 'hypertension']);
  }

  if (includesAnyTerm(lastAssistantMessage, ['สะดวกตรวจแถวไหน', 'ใกล้บ้าน', 'ใกล้ที่ทำงาน', 'location'])) {
    return includesAnyTerm(question, ['แถว', 'ใกล้', 'บ้าน', 'ที่ทำงาน', 'กรุงเทพ', 'สุขุมวิท', 'สาทร', 'สีลม', 'ปิ่นเกล้า', 'รังสิต', 'นนทบุรี', 'ใกล้ฉัน']);
  }

  return false;
}

export function inferActiveProductRequestKind(messages: PrototypePolicyMessage[], currentRequestKind: ProductRequestKind): ProductRequestKind {
  if (currentRequestKind !== 'none') {
    return currentRequestKind;
  }

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';

  if (!looksLikeContextFollowUpAnswer(messages, latestUserMessage)) {
    return 'none';
  }

  const latestPriorProductKind = [...messages.filter((message) => message.role === 'user').slice(-8)]
    .reverse()
    .map((message) => classifyProductRequest(message.content))
    .find((kind) => kind !== 'none');

  return latestPriorProductKind ?? 'none';
}

export function createPrototypeContextAssessment(
  question: string,
  productRequestKind: ProductRequestKind,
  history: PrototypePolicyMessage[] = [],
  userNickname = DEFAULT_PROTOTYPE_USER_NICKNAME,
): ChatContextAssessment {
  const historyUserMessages = history.filter((message) => message.role === 'user').map((message) => message.content.trim()).filter(Boolean);
  const userMessages = historyUserMessages[historyUserMessages.length - 1] === question.trim() ? historyUserMessages : [...historyUserMessages, question.trim()];
  const priorUserText = userMessages.slice(0, -1).join(' ');
  const userText = userMessages.join(' ');
  const hasGreeting = hasGreetingTerm(question);
  const displayName = userDisplayName(userNickname);
  const greetingPrefix = hasGreeting ? `สวัสดีค่ะ${displayName} ` : '';
  const isBroadCheckupRequest = productRequestKind === 'broad';
  const hasKnownNoRecentCheckup = hasNoRecentCheckupEvidence(priorUserText);
  const answeredUnknownRecentCheckup = isUnknownRecentCheckupReply(history, question);
  const slotSummary = {
    accessPreference: includesAnyTerm(userText, ['งบ', 'บาท', 'ราคา', 'budget', 'ใกล้', 'แถว', 'อยู่', 'สะดวก']),
    age: hasAgeSlot(userText),
    clinicalHistory: includesAnyTerm(userText, ['โรคประจำตัว', 'ไม่มีโรค', 'ไม่เป็นโรค', 'ไม่เคยมีประวัติโรค', 'ไม่มีประวัติโรค', 'ประวัติโรค', 'ยา', 'แพ้ยา', 'เบาหวาน', 'ความดัน', 'ไขมัน', 'หัวใจ']),
    goal: includesAnyTerm(userText, ['อยากเช็ค', 'อยากเช็ก', 'โฟกัส', 'กังวล', 'เป้าหมาย', 'ลดน้ำหนัก', 'น้ำตาล', 'ไขมัน', 'สุขภาพ', 'check']),
    recentCheckup: includesAnyTerm(userText, ['ตรวจล่าสุด', 'ผลตรวจ', 'เคยตรวจ', 'ไม่เคยตรวจ', 'ปีที่แล้ว', 'เดือนที่แล้ว', 'ล่าสุด']) || answeredUnknownRecentCheckup,
    riskLifestyle: includesAnyTerm(userText, ['น้ำหนัก', 'ส่วนสูง', 'bmi', 'สูบ', 'เหล้า', 'นอน', 'เครียด', 'ครอบครัว', 'เหนื่อย']),
  };
  const score =
    (slotSummary.age ? 20 : 0) +
    (slotSummary.goal ? 20 : 0) +
    (slotSummary.clinicalHistory ? 20 : 0) +
    (slotSummary.recentCheckup ? 15 : 0) +
    (slotSummary.accessPreference ? 15 : 0) +
    (slotSummary.riskLifestyle ? 10 : 0);
  const productReady = score >= 85 && slotSummary.age && slotSummary.goal && slotSummary.clinicalHistory && slotSummary.recentCheckup && slotSummary.accessPreference;
  const level = score >= 85 ? 'ready' : score >= 35 ? 'partial' : 'insufficient';
  const labels = {
    accessPreference: 'พื้นที่สะดวกหรืองบประมาณ',
    age: 'อายุหรือช่วงอายุ',
    clinicalHistory: 'โรคประจำตัว ยา หรือประวัติแพ้',
    goal: 'เป้าหมายหรือเรื่องที่อยากโฟกัส',
    recentCheckup: 'ประวัติการตรวจหรือผลตรวจล่าสุด',
    riskLifestyle: 'น้ำหนัก ไลฟ์สไตล์ หรือความเสี่ยงเพิ่มเติม',
  };
  const slotEntries = Object.entries(slotSummary) as [keyof typeof slotSummary, boolean][];
  const mode =
    productRequestKind === 'direct'
      ? 'direct_product'
      : productRequestKind === 'broad' && productReady
        ? 'personalized_recommendation'
        : 'ask_context';
  const nextQuestion = isBroadCheckupRequest && !slotSummary.recentCheckup
    ? hasKnownNoRecentCheckup
      ? `${greetingPrefix}ฉันจำได้ว่า${displayName}ยังไม่เคยตรวจสุขภาพช่วงที่ผ่านมา งั้นเริ่มจากรอบพื้นฐานก่อนนะคะ`
      : `${greetingPrefix}เดี๋ยวค่อยๆ ดูให้นะคะ ${displayName}ตรวจสุขภาพครั้งล่าสุดประมาณเมื่อไหร่คะ`
    : answeredUnknownRecentCheckup && !slotSummary.age
      ? `ไม่เป็นไรค่ะ งั้นเริ่มตรวจพื้นฐานรอบใหม่กันนะคะ ${displayName}อายุประมาณเท่าไหร่คะ`
    : !slotSummary.age || !slotSummary.goal
      ? `${greetingPrefix}${!slotSummary.age ? `ได้ค่ะ ${displayName}อายุประมาณเท่าไหร่คะ` : `โอเคค่ะ ${displayName}อยากดูเรื่องไหนเป็นพิเศษคะ`}`
    : !slotSummary.clinicalHistory
      ? `ขอเพิ่มอีกนิดค่ะ ${displayName}มีโรคประจำตัวที่ควรรู้ก่อนไหมคะ`
      : !slotSummary.recentCheckup
        ? `โอเคค่ะ ${displayName}ตรวจสุขภาพครั้งล่าสุดประมาณเมื่อไหร่คะ`
        : `โอเคค่ะ ${displayName}สะดวกตรวจแถวไหนคะ`;

  return {
    collectedSlots: slotEntries.filter(([, exists]) => exists).map(([key]) => labels[key]),
    confidence: Math.min(0.95, 0.68 + slotEntries.filter(([, exists]) => exists).length * 0.03),
    level,
    missingSlots: slotEntries.filter(([, exists]) => !exists).map(([key]) => labels[key]),
    mode,
    nextQuestion: productRequestKind === 'broad' && mode === 'ask_context' ? nextQuestion : null,
    purpose: 'health_package_recommendation',
    score,
  };
}
