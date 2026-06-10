type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type ChatRequest = {
  clientRequestId?: string;
  messages?: ChatMessage[];
  model?: string;
  question?: string;
  userNickname?: string;
};

type OpenAITextContent = {
  annotations?: {
    title?: string;
    type?: string;
    url?: string;
  }[];
  text?: string;
  type?: string;
};

type OpenAIOutputItem = {
  action?: {
    queries?: string[];
    query?: string;
    sources?: {
      title?: string;
      url?: string;
    }[];
    type?: string;
  };
  content?: OpenAITextContent[];
  id?: string;
  type?: string;
};

type OpenAIResponse = {
  error?: {
    message?: string;
  };
  incomplete_details?: {
    reason?: string;
  };
  output?: OpenAIOutputItem[];
  output_text?: string;
  status?: string;
};

type GeminiEmbeddingResponse = {
  embedding?: {
    values?: number[];
  };
  error?: {
    message?: string;
  };
  usageMetadata?: {
    promptTokenCount?: number;
  };
};

type JwtPayload = {
  app_metadata?: Record<string, unknown>;
  sub?: string;
  user_metadata?: Record<string, unknown>;
};

type RagCategory =
  | 'care.checkup_preparation'
  | 'care.patient_education'
  | 'marketplace.product'
  | 'ops.booking'
  | 'ops.call_center'
  | 'ops.payment'
  | 'ops.referral'
  | 'privacy.consent'
  | 'safety.escalation';

type RagChunk = {
  id: string;
  title: string;
  category: RagCategory;
  topic: string;
  audience: 'patient' | 'doctor' | 'call_center' | 'hospital_admin' | 'internal';
  language: 'th' | 'en';
  summary: string;
  content: string;
  keywords: string[];
  source: string;
  sourceUrl?: string;
  sourceType: string;
  reviewStatus: 'draft' | 'approved' | 'expired' | 'archived';
  riskLevel: 'low' | 'medium' | 'high';
  medicalReviewer?: string | null;
  lastReviewedAt?: string | null;
  expiresAt?: string | null;
  tokenBudget: number;
  priority: number;
};

type RagChunkRow = {
  id: string;
  title: string;
  category: string;
  topic: string | null;
  audience: RagChunk['audience'] | null;
  language: RagChunk['language'] | null;
  summary: string | null;
  content: string;
  keywords: string[] | null;
  source: string | null;
  source_url: string | null;
  source_type: string | null;
  review_status: RagChunk['reviewStatus'] | null;
  risk_level: RagChunk['riskLevel'] | null;
  medical_reviewer: string | null;
  last_reviewed_at: string | null;
  expires_at: string | null;
  token_budget: number | null;
  priority: number | null;
};

type RagMatch = RagChunk & {
  matchedCategories: RagCategory[];
  retrievalMode?: 'keyword' | 'skipped' | 'vector';
  score: number;
};

type PublicRagMatch = {
  category: string;
  id: string;
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  source: string;
  sourceUrl?: string;
  summary: string;
  title: string;
  topic: string;
};

type PublicSearchSource = {
  domain: string;
  title: string;
  trustTier: number;
  url: string;
};

type RetrievalRoute =
  | 'controlled_web_search'
  | 'emergency'
  | 'none'
  | 'personal_memory_deep'
  | 'policy_rag'
  | 'product_rag'
  | 'recent_chat';

type RouterDecision = {
  emergency: boolean;
  reasons: Record<string, string>;
  routes: RetrievalRoute[];
  routesRejected: Record<string, string>;
  stage: 'heuristic' | 'llm';
};

type RouterMeta = {
  cacheHit?: boolean;
  latencyMs: {
    router: number;
    total?: number;
  };
  reasons: Record<string, string>;
  routes: RetrievalRoute[];
  routesRejected: Record<string, string>;
  stage: 'heuristic' | 'llm';
};

type RagVectorMatchRow = RagChunkRow & {
  similarity: number | null;
};

type AppRoleRow = {
  role: string;
};

type ConsentRow = {
  id: string;
  status: 'granted' | 'revoked';
};

type InsertedIdRow = {
  id: string;
};

type HealthChatIntent =
  | 'booking'
  | 'checkout'
  | 'health_advice'
  | 'off_topic'
  | 'product_compare'
  | 'product_recommendation'
  | 'safety_escalation'
  | 'small_talk';

type ContextLevel = 'insufficient' | 'partial' | 'ready';

type RecommendationMode = 'ask_context' | 'direct_product' | 'personalized_recommendation';

type ProductRequestKind = 'broad' | 'direct' | 'none';

type ContextSlotKey = 'accessPreference' | 'age' | 'clinicalHistory' | 'goal' | 'recentCheckup' | 'riskLifestyle';

type ContextAssessment = {
  collectedSlots: string[];
  confidence: number;
  level: ContextLevel;
  missingSlots: string[];
  mode: RecommendationMode;
  nextQuestion: string | null;
  purpose: 'health_package_recommendation';
  score: number;
  slotSummary: Record<ContextSlotKey, boolean>;
};

type ConversationIdentityContext = {
  hasAnyPersonalContext: boolean;
  hasGreeting: boolean;
  hasKnownNoRecentCheckup: boolean;
  hasUnknownRecentCheckupReply: boolean;
  isBroadCheckupOpening: boolean;
};

type AgentMemoryType =
  | 'budget'
  | 'communication_preference'
  | 'goal'
  | 'lifestyle_preference'
  | 'location_preference'
  | 'other'
  | 'product_interest';

type AgentMemoryRecord = {
  confidence: number;
  id?: string;
  memoryType: AgentMemoryType;
  status: 'saved' | 'skipped';
  summary: string;
  validUntil?: string | null;
  value?: string | null;
};

type AgentMemoryRow = {
  confidence: number | null;
  memory_type: AgentMemoryType;
  observed_at: string;
  summary: string;
  valid_until: string | null;
  value: string | null;
};

type HealthFactContextRow = {
  confidence: number | null;
  fact_type: string;
  label: string;
  observed_at: string | null;
  unit: string | null;
  value: string;
};

type StoredChatMessageRow = ChatMessage & {
  created_at?: string;
};

type CompanionSessionContext = {
  messages: ChatMessage[];
  rollingSummary?: string | null;
  sessionId?: string | null;
};

type CompanionSessionRow = {
  id: string;
  rolling_summary?: string | null;
};

type PersonalContextState = {
  agentMemory: AgentMemoryRow[];
  healthFacts: HealthFactContextRow[];
  recentMessages: ChatMessage[];
  rollingSummary?: string | null;
  sessionId?: string | null;
};

type WebSearchSourceRow = {
  display_name: string;
  domain: string;
  id: string;
  source_type: string;
  topics: string[] | null;
  trust_tier: number;
};

type HospitalProductRow = {
  booking_note: string | null;
  category: string;
  description: string;
  duration: string | null;
  hospital_address: string | null;
  hospital_lat: number | null;
  hospital_lng: number | null;
  hospital_map_query: string | null;
  hospital_name: string;
  id: string;
  includes: string[] | null;
  metadata: {
    product_image_preview_uri?: string | null;
  } | null;
  price_amount: number;
  rag_chunk_id: string | null;
  tags: string[] | null;
  title: string;
};

type ChatProductCard = {
  bookingNote?: string | null;
  category: string;
  description: string;
  duration?: string | null;
  hospitalAddress?: string | null;
  hospitalLat?: number | null;
  hospitalLng?: number | null;
  hospitalMapQuery?: string | null;
  hospitalName: string;
  id: string;
  includes: string[];
  priceAmount: number;
  productImagePreviewUri?: string | null;
  ragChunkId?: string | null;
  reason?: string;
  tags: string[];
  title: string;
};

type ChatBranchCard = {
  address?: string | null;
  distanceLabel?: string;
  hospitalName: string;
  id: string;
  lat?: number | null;
  lng?: number | null;
  mapQuery?: string | null;
  name: string;
  nextSlot?: string;
  productId: string;
};

type ChatUiCard =
  | { id: string; products: ChatProductCard[]; title: string; type: 'product_grid' }
  | { branches: ChatBranchCard[]; id: string; product: ChatProductCard; title: string; type: 'branch_location' }
  | { branch?: ChatBranchCard; id: string; product: ChatProductCard; title: string; type: 'checkout_draft' }
  | { count: number; id: string; summaries: string[]; type: 'memory_saved' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_CONTEXT_CHARS = 1800;
const DEFAULT_LIMIT = 3;
const DEFAULT_USER_NICKNAME = '\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32';
const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const MIRACARE_PROMPT_ID = 'pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021';
const MIRACARE_PROMPT_VERSION = '2';
const MIRACARE_DEFAULT_BRAND_NAME = 'MiraCare';
const MIRACARE_DEFAULT_USER_NICKNAME = '\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32';
const MIRACARE_EMPTY_PERSONAL_CONTEXT = '\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2a\u0e48\u0e27\u0e19\u0e15\u0e31\u0e27\u0e17\u0e35\u0e48\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19';
const MIRACARE_EMPTY_RECENT_CHAT = '\u0e44\u0e21\u0e48\u0e21\u0e35\u0e41\u0e0a\u0e17\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14';
const MIRACARE_PRODUCT_CARD_TITLE = '\u0e41\u0e1e\u0e47\u0e01\u0e40\u0e01\u0e08\u0e17\u0e35\u0e48\u0e41\u0e19\u0e30\u0e19\u0e33';
const thaiStopWords = new Set(['ครับ', 'ค่ะ', 'และ', 'หรือ', 'ที่', 'การ', 'ของ', 'ให้', 'ต้อง', 'ทำ', 'ยังไง']);
const englishStopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'how', 'can', 'should', 'about']);

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
  'มีอะไรบ้าง',
  'ทั้งหมด',
  'ราคา',
  'blood test',
  'lab test',
  'checkup',
  'package',
  'product',
];

const intentRules: { categories: RagCategory[]; terms: string[] }[] = [
  {
    categories: ['safety.escalation'],
    terms: [
      'ฉุกเฉิน',
      'เจ็บหน้าอก',
      'หายใจลำบาก',
      'แขนขาอ่อนแรง',
      'หมดสติ',
      'แพ้รุนแรง',
      'เลือดออก',
      'emergency',
      'urgent',
    ],
  },
  {
    categories: ['ops.payment', 'ops.booking'],
    terms: ['จ่ายเงิน', 'ชำระเงิน', 'ใบเสร็จ', 'receipt', 'checkout', 'payment', 'order status'],
  },
  {
    categories: ['ops.booking', 'ops.call_center'],
    terms: ['จองคิว', 'นัด', 'โทรหา', 'call center', 'appointment', 'booking', 'order number'],
  },
  {
    categories: ['ops.referral'],
    terms: ['referral', 'code', 'โค้ด', 'หมอแนะนำ', 'affiliate', 'commission', 'ค่าคอม'],
  },
  {
    categories: ['marketplace.product'],
    terms: productDiscoveryTerms,
  },
  {
    categories: ['care.checkup_preparation'],
    terms: ['ตรวจสุขภาพ', 'ตรวจเลือด', 'เตรียมตัว', 'งดอาหาร', 'เจาะเลือด', 'blood test', 'lab test', 'fasting', 'checkup'],
  },
  {
    categories: ['marketplace.product'],
    terms: ['แพ็กเกจ', 'package', 'สินค้า', 'ราคา', 'บริการ', 'โรงพยาบาล', 'รวมอะไร', 'มีอะไรบ้าง', 'product'],
  },
  {
    categories: ['care.patient_education', 'safety.escalation'],
    terms: ['ความเสี่ยง', 'เสี่ยง', 'อายุ', 'น้ำหนัก', 'ส่วนสูง', 'เพศชาย', 'เพศหญิง', 'bmi', 'risk'],
  },
  {
    categories: ['privacy.consent'],
    terms: ['ข้อมูลสุขภาพ', 'ข้อมูลส่วนตัว', 'ยินยอม', 'ลบข้อมูล', 'consent', 'privacy', 'pdpa'],
  },
];

const localFallbackKnowledge: RagChunk[] = [
  {
    id: 'medical-safety-001',
    title: 'Medical safety boundary',
    category: 'safety.escalation',
    topic: 'urgent_symptom_escalation',
    audience: 'patient',
    language: 'th',
    source: 'Mira chatbot safety policy v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/medical-safety-boundary',
    reviewStatus: 'approved',
    riskLevel: 'high',
    tokenBudget: 240,
    priority: 1,
    keywords: ['ฉุกเฉิน', 'เจ็บหน้าอก', 'หายใจลำบาก', 'วินิจฉัย', 'ยา', 'urgent', 'emergency'],
    summary:
      'ห้าม chatbot วินิจฉัยโรค จ่ายยา เปลี่ยนยา หรือแทนแพทย์ ถ้ามีอาการฉุกเฉิน เช่น เจ็บหน้าอก หายใจลำบาก แขนขาอ่อนแรง หมดสติ แพ้รุนแรง เลือดออกมาก ให้รีบพบแพทย์ฉุกเฉินทันที',
    content:
      'The chatbot gives general health information and navigation help. It must not diagnose, prescribe, change medication, or replace a licensed medical professional. For severe symptoms such as chest pain, breathing difficulty, sudden weakness, severe allergic reaction, fainting, severe pain, or heavy bleeding, advise urgent medical care immediately.',
  },
  {
    id: 'blood-test-prep-001',
    title: 'Preparing for routine blood tests',
    category: 'care.checkup_preparation',
    topic: 'blood_test_preparation',
    audience: 'patient',
    language: 'th',
    source: 'Mira operating policy v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/blood-test-preparation',
    reviewStatus: 'approved',
    riskLevel: 'medium',
    tokenBudget: 260,
    priority: 18,
    keywords: ['ตรวจเลือด', 'เจาะเลือด', 'งดอาหาร', 'ดื่มน้ำ', 'ยา', 'lab test', 'blood test', 'fasting', 'ตรวจน้ำตาล', 'ตรวจไขมัน'],
    summary:
      'ตอบเรื่องเตรียมตัวตรวจเลือดทั่วไป: เช็กว่ารายการตรวจต้องงดอาหารไหม โดยเฉพาะน้ำตาล/ไขมัน ดื่มน้ำเปล่าได้ถ้าไม่ถูกห้าม แจ้งยา/อาหารเสริม/โรคประจำตัว และยืนยันรายละเอียดกับโรงพยาบาล',
    content:
      'For routine blood tests, preparation depends on the ordered tests. Fasting is commonly required for some glucose and lipid tests, often around 8-12 hours, but the hospital/package instruction should be treated as the source of truth. Users may usually drink plain water unless told otherwise. They should not stop prescribed medication unless instructed by a licensed clinician. They should tell the hospital about regular medicines, supplements, pregnancy, chronic conditions, and previous reactions to blood draws. Arrive early and bring ID, order number, and prior results if available.',
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getNumberEnv(name: string, fallback: number) {
  const value = Number(Deno.env.get(name));

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createRequestId(clientRequestId?: string) {
  return clientRequestId?.trim() || `req-${Date.now()}-${crypto.randomUUID()}`;
}

function formatUserDisplayName(userNickname = DEFAULT_USER_NICKNAME) {
  const nickname = userNickname.trim() || DEFAULT_USER_NICKNAME;

  return nickname.startsWith('คุณ') ? nickname : `คุณ${nickname}`;
}

function createSmallTalkAnswer(question: string, userNickname = DEFAULT_USER_NICKNAME) {
  const normalized = question
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const userDisplayName = formatUserDisplayName(userNickname);

  const greetings = new Set([
    'hi',
    'hello',
    'hey',
    'sawasdee',
    'สวัสดี',
    'สวัสดีค่ะ',
    'สวัสดีครับ',
    'หวัดดี',
    'หวัดดีค่ะ',
    'หวัดดีครับ',
    'ดีค่ะ',
    'ดีครับ',
  ]);

  if (greetings.has(normalized)) {
    return `สวัสดีค่ะ${userDisplayName} วันนี้อยากให้ฉันช่วยเรื่องอะไรคะ`;
  }

  if (['ขอบคุณ', 'ขอบคุณค่ะ', 'ขอบคุณครับ', 'thanks', 'thank you'].includes(normalized)) {
    return `ยินดีค่ะ${userDisplayName}`;
  }

  return null;
}

function hasGreetingTerm(question: string) {
  return containsAny(question, ['สวัสดี', 'หวัดดี', 'ดีค่ะ', 'ดีครับ', 'hello', 'hi', 'hey', 'sawasdee']);
}

function hasNoRecentCheckupEvidence(text: string) {
  return containsAny(text, [
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
    'no lab result',
  ]);
}

function getPersonalContextSearchText(personalContextState: PersonalContextState) {
  const factText = personalContextState.healthFacts.map((fact) => `${fact.fact_type} ${fact.label} ${fact.value} ${fact.observed_at ?? ''}`).join('\n');
  const memoryText = personalContextState.agentMemory.map((memory) => `${memory.memory_type} ${memory.summary} ${memory.value ?? ''}`).join('\n');
  const messageText = sanitizeMessagesForModelContext(personalContextState.recentMessages).map((message) => `${message.role}: ${message.content}`).join('\n');

  return [factText, memoryText, messageText].filter(Boolean).join('\n');
}

function hasPriorUserMessage(messages: ChatMessage[] | undefined, question: string) {
  const normalizedQuestion = question.trim();

  return (messages ?? []).some((message, index, list) => {
    if (message.role !== 'user' || !message.content.trim()) {
      return false;
    }

    return index < list.length - 1 || message.content.trim() !== normalizedQuestion;
  });
}

function getPriorConversationText(messages: ChatMessage[] | undefined, question: string) {
  const normalizedQuestion = question.trim();

  return sanitizeMessagesForModelContext(messages ?? [])
    .filter((message, index, list) => {
      if (!message.content.trim()) {
        return false;
      }

      return index < list.length - 1 || message.content.trim() !== normalizedQuestion;
    })
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');
}

function isUsableAssistantContext(content: string) {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return false;
  }

  if (normalizedContent.length > 360 || hasBlockedConversationStyle(normalizedContent) || looksLikePromptLeak(normalizedContent)) {
    return false;
  }

  if (countStructuredLines(normalizedContent) > 1 || /\*\*|#{1,6}\s|^\s*(?:[-*]|\d+[.)])\s+/m.test(normalizedContent)) {
    return false;
  }

  if (/ไม่มี(?:ข้อมูล|อยู่ในระบบ)|ข้อมูลในระบบ|ระบบข้อมูล|ผมครับ|chatbot|model|prompt|rag/i.test(normalizedContent)) {
    return false;
  }

  if (/ขอทราบ|กรุณา|เพื่อประเมิน|เพื่อคัดกรอง|ข้อมูลที่จำเป็น|ข้อมูลที่ให้มา|ดำเนินการ|ในฐานะ/i.test(normalizedContent)) {
    return false;
  }

  return true;
}

function sanitizeMessagesForModelContext(messages: ChatMessage[]) {
  return messages
    .map((message) => ({ content: message.content.trim(), role: message.role }))
    .filter((message) => {
      if (!message.content) {
        return false;
      }

      return message.role === 'user' || isUsableAssistantContext(message.content);
    });
}

function mergeConversationMessages(storedMessages: ChatMessage[], clientMessages: ChatMessage[] | undefined, options: { sanitize?: boolean } = {}) {
  const merged: ChatMessage[] = [];
  const sourceMessages = options.sanitize === false ? [...storedMessages, ...(clientMessages ?? [])] : sanitizeMessagesForModelContext([...storedMessages, ...(clientMessages ?? [])]);

  for (const message of sourceMessages) {
    const content = message.content.trim();

    if (!content) {
      continue;
    }

    const last = merged[merged.length - 1];

    if (last?.role === message.role && last.content.trim() === content) {
      continue;
    }

    merged.push({ content, role: message.role });
  }

  return merged.slice(-12);
}

function buildConversationIdentityContext({
  messages,
  personalContextState,
  productRequestKind,
  question,
}: {
  messages?: ChatMessage[];
  personalContextState: PersonalContextState;
  productRequestKind: ProductRequestKind;
  question: string;
}): ConversationIdentityContext {
  const priorContextText = [getPersonalContextSearchText(personalContextState), getPriorConversationText(messages, question)].filter(Boolean).join('\n');

  return {
    hasAnyPersonalContext:
      personalContextState.healthFacts.length > 0 ||
      personalContextState.agentMemory.length > 0 ||
      personalContextState.recentMessages.length > 0 ||
    hasPriorUserMessage(messages, question),
    hasGreeting: hasGreetingTerm(question),
    hasKnownNoRecentCheckup: hasNoRecentCheckupEvidence(priorContextText),
    hasUnknownRecentCheckupReply: isUnknownRecentCheckupReply(messages, question),
    isBroadCheckupOpening: productRequestKind === 'broad',
  };
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');

  return atob(padded);
}

function parseJwtPayload(authorization: string): JwtPayload | null {
  const token = authorization.replace(/^Bearer\s+/i, '');
  const [, payload] = token.split('.');

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(payload)) as JwtPayload;
  } catch {
    return null;
  }
}

function getUserId(payload: JwtPayload | null) {
  return payload?.sub ?? null;
}

function isAdmin(payload: JwtPayload | null) {
  const roles = [
    payload?.app_metadata?.role,
    payload?.user_metadata?.role,
    payload?.app_metadata?.app_role,
    payload?.user_metadata?.app_role,
  ];

  return roles.some((role) => role === 'admin');
}

async function resolveAdminRequest(payload: JwtPayload | null, userId: string, authorization: string) {
  if (isAdmin(payload)) {
    return true;
  }

  const config = getSupabaseConfig();

  if (!config) {
    return false;
  }

  try {
    const response = await fetch(
      `${config.supabaseUrl}/rest/v1/app_user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: restHeaders(authorization) },
    );

    if (!response.ok) {
      return false;
    }

    const rows = (await response.json()) as AppRoleRow[];

    return rows[0]?.role === 'admin';
  } catch {
    return false;
  }
}

function getSupabaseConfig() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseAnonKey, supabaseUrl };
}

function restHeaders(authorization: string, extra?: Record<string, string>) {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error('Missing Supabase REST configuration.');
  }

  return {
    Authorization: authorization,
    apikey: config.supabaseAnonKey,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function updateRest(pathAndQuery: string, body: Record<string, unknown>, authorization: string) {
  const config = getSupabaseConfig();

  if (!config) {
    return;
  }

  await fetch(`${config.supabaseUrl}/rest/v1/${pathAndQuery}`, {
    method: 'PATCH',
    headers: restHeaders(authorization, { Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
}

async function insertRest(table: string, body: Record<string, unknown> | Record<string, unknown>[], authorization: string) {
  const config = getSupabaseConfig();

  if (!config) {
    return;
  }

  await fetch(`${config.supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: restHeaders(authorization, { Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
}

async function callRpc<T>(functionName: string, body: Record<string, unknown>, authorization: string): Promise<T | null> {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: restHeaders(authorization),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function selectRest<T>(pathAndQuery: string, authorization: string): Promise<T | null> {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${pathAndQuery}`, {
    headers: restHeaders(authorization),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

async function insertRestReturningId(table: string, body: Record<string, unknown>, authorization: string): Promise<string | null> {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?select=id`, {
    method: 'POST',
    headers: restHeaders(authorization, { Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as InsertedIdRow[];

  return rows[0]?.id ?? null;
}

function normalizeGeminiModelName(model: string) {
  return model.replace(/^models\//, '').trim();
}

function geminiModelResource(model: string) {
  return `models/${normalizeGeminiModelName(model)}`;
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

async function generateGeminiEmbedding({
  apiBaseUrl,
  geminiApiKey,
  model,
  taskType,
  text,
  title,
}: {
  apiBaseUrl: string;
  geminiApiKey: string;
  model: string;
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
  text: string;
  title?: string;
}) {
  const normalizedModel = normalizeGeminiModelName(model);
  const response = await fetch(`${apiBaseUrl}/${geminiModelResource(normalizedModel)}:embedContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiApiKey,
    },
    body: JSON.stringify({
      model: geminiModelResource(normalizedModel),
      content: {
        parts: [{ text }],
      },
      embedContentConfig: {
        autoTruncate: true,
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType,
        ...(title ? { title } : {}),
      },
    }),
  });
  const data = (await response.json()) as GeminiEmbeddingResponse;

  if (!response.ok || !data.embedding?.values?.length) {
    throw new Error(data.error?.message ?? 'Gemini embedding request failed.');
  }

  return {
    model: normalizedModel,
    usageMetadata: data.usageMetadata,
    values: data.embedding.values,
  };
}

function normalizeInput(input: string) {
  return input.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s.-]/gu, ' ');
}

function tokenize(input: string) {
  return normalizeInput(input)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !thaiStopWords.has(token) && !englishStopWords.has(token));
}

function uniqueCategories(categories: RagCategory[]) {
  return [...new Set(categories)];
}

function classifyRagIntent(query: string): RagCategory[] {
  const normalizedQuery = normalizeInput(query);
  const matchedCategories = intentRules.flatMap((rule) => {
    const matchesRule = rule.terms.some((term) => normalizedQuery.includes(term.toLowerCase()));

    return matchesRule ? rule.categories : [];
  });

  return uniqueCategories(matchedCategories);
}

function normalizeRagCategory(value: string): RagCategory {
  const legacyMap: Record<string, RagCategory> = {
    booking: 'ops.booking',
    checkup: 'care.checkup_preparation',
    privacy: 'privacy.consent',
    referral: 'ops.referral',
    safety: 'safety.escalation',
  };

  return (legacyMap[value] ?? value) as RagCategory;
}

function toRagChunk(row: RagChunkRow): RagChunk {
  return {
    id: row.id,
    title: row.title,
    category: normalizeRagCategory(row.category),
    topic: row.topic ?? 'general',
    audience: row.audience ?? 'patient',
    language: row.language ?? 'th',
    summary: row.summary ?? row.content,
    content: row.content,
    keywords: row.keywords ?? [],
    source: row.source ?? 'Supabase RAG corpus',
    sourceUrl: row.source_url ?? undefined,
    sourceType: row.source_type ?? 'internal_policy',
    reviewStatus: row.review_status ?? 'draft',
    riskLevel: row.risk_level ?? 'low',
    medicalReviewer: row.medical_reviewer,
    lastReviewedAt: row.last_reviewed_at,
    expiresAt: row.expires_at,
    tokenBudget: row.token_budget ?? 320,
    priority: row.priority ?? 50,
  };
}

async function fetchApprovedRagChunks(authorization: string) {
  const config = getSupabaseConfig();

  if (!config) {
    return localFallbackKnowledge;
  }

  const select = [
    'id',
    'title',
    'category',
    'topic',
    'audience',
    'language',
    'summary',
    'content',
    'keywords',
    'source',
    'source_url',
    'source_type',
    'review_status',
    'risk_level',
    'medical_reviewer',
    'last_reviewed_at',
    'expires_at',
    'token_budget',
    'priority',
  ].join(',');
  const url = `${config.supabaseUrl}/rest/v1/rag_chunks?select=${encodeURIComponent(select)}&is_active=eq.true&review_status=eq.approved&order=priority.asc,created_at.asc`;
  const response = await fetch(url, {
    headers: restHeaders(authorization),
  });

  if (!response.ok) {
    return localFallbackKnowledge;
  }

  const rows = (await response.json()) as RagChunkRow[];

  return rows.length ? rows.map(toRagChunk).filter((chunk) => chunk.reviewStatus === 'approved') : localFallbackKnowledge;
}

async function retrieveVectorRagContext({
  apiBaseUrl,
  authorization,
  geminiApiKey,
  limit,
  preferredCategories,
  question,
}: {
  apiBaseUrl: string;
  authorization: string;
  geminiApiKey: string;
  limit: number;
  preferredCategories: RagCategory[];
  question: string;
}) {
  const config = getSupabaseConfig();

  if (!config) {
    return [];
  }

  const embeddingModel = Deno.env.get('GEMINI_EMBEDDING_MODEL') ?? DEFAULT_EMBEDDING_MODEL;
  const embedding = await generateGeminiEmbedding({
    apiBaseUrl,
    geminiApiKey,
    model: embeddingModel,
    taskType: 'RETRIEVAL_QUERY',
    text: question,
  });
  const matchThreshold = getNumberEnv('RAG_VECTOR_MATCH_THRESHOLD', 0.62);
  const rows = await callRpc<RagVectorMatchRow[]>(
    'match_rag_chunks',
    {
      category_filter: preferredCategories,
      match_count: Math.max(limit, DEFAULT_LIMIT),
      match_threshold: matchThreshold,
      query_embedding: vectorLiteral(embedding.values),
    },
    authorization,
  );

  return trimToBudget(
    (rows ?? [])
      .map((row) => ({
        ...toRagChunk(row),
        matchedCategories: preferredCategories,
        retrievalMode: 'vector' as const,
        score: Math.round((row.similarity ?? 0) * 1000),
      }))
      .filter((match) => match.reviewStatus === 'approved')
      .sort((a, b) => b.score - a.score || a.priority - b.priority || a.title.localeCompare(b.title))
      .slice(0, limit),
    DEFAULT_CONTEXT_CHARS,
  );
}

function scoreChunk(queryTokens: string[], preferredCategories: RagCategory[], chunk: RagChunk) {
  const normalizedQuery = queryTokens.join(' ');
  const haystack = `${chunk.title} ${chunk.category} ${chunk.topic} ${chunk.keywords.join(' ')} ${chunk.summary} ${
    chunk.content
  }`.toLowerCase();
  const categoryMatched = preferredCategories.includes(chunk.category);
  const keywordScore = chunk.keywords.reduce((score, keyword) => {
    const normalizedKeyword = keyword.toLowerCase();

    return normalizedQuery.includes(normalizedKeyword) || haystack.includes(normalizedQuery) ? score + 4 : score;
  }, 0);
  const tokenScore = queryTokens.reduce((score, token) => {
    if (haystack.includes(token)) {
      return score + (chunk.title.toLowerCase().includes(token) ? 3 : 1);
    }

    return score;
  }, 0);
  const relevanceScore = (categoryMatched ? 8 : 0) + keywordScore + tokenScore;

  if (relevanceScore === 0) {
    return 0;
  }

  const priorityScore = Math.max(0, 6 - Math.floor(chunk.priority / 20));

  return relevanceScore + priorityScore;
}

function eligibleChunks(chunks: RagChunk[], preferredCategories: RagCategory[]) {
  const approvedChunks = chunks.filter((chunk) => chunk.reviewStatus === 'approved');

  if (preferredCategories.length === 0) {
    return approvedChunks;
  }

  const routedChunks = approvedChunks.filter((chunk) => preferredCategories.includes(chunk.category));

  return routedChunks.length > 0 ? routedChunks : approvedChunks;
}

function trimToBudget(matches: RagMatch[], maxContextChars: number) {
  let usedChars = 0;

  return matches.filter((match) => {
    const nextCost = Math.min(match.tokenBudget * 4, match.summary.length + 160);

    if (usedChars > 0 && usedChars + nextCost > maxContextChars) {
      return false;
    }

    usedChars += nextCost;
    return true;
  });
}

function retrieveRagContext(query: string, chunks: RagChunk[], limit = DEFAULT_LIMIT, preferredCategoriesOverride?: RagCategory[]): RagMatch[] {
  const queryTokens = tokenize(query);
  const preferredCategories = uniqueCategories(preferredCategoriesOverride ?? classifyRagIntent(query));
  const candidates = eligibleChunks(chunks, preferredCategories);

  if (queryTokens.length === 0) {
    return trimToBudget(
      candidates
        .slice()
        .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
        .slice(0, limit)
        .map((chunk) => ({ ...chunk, matchedCategories: preferredCategories, retrievalMode: 'keyword' as const, score: 0 })),
      DEFAULT_CONTEXT_CHARS,
    );
  }

  const scoredMatches = candidates
    .map((chunk) => ({
      ...chunk,
      matchedCategories: preferredCategories,
      retrievalMode: 'keyword' as const,
      score: scoreChunk(queryTokens, preferredCategories, chunk),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.priority - b.priority || a.title.localeCompare(b.title))
    .slice(0, limit);

  return trimToBudget(scoredMatches, DEFAULT_CONTEXT_CHARS);
}

function containsAny(query: string, terms: string[]) {
  const normalizedQuery = normalizeInput(query);

  return terms.some((term) => normalizedQuery.includes(term.toLowerCase()));
}

function hasProductDiscoveryIntent(question: string) {
  const normalizedQuestion = normalizeInput(question);
  const explicitProductTerms = ['แพ็กเกจ', 'แพ็คเกจ', 'package', 'ราคา', 'ซื้อ', 'จอง', 'ชำระ', 'จ่าย', 'ขอดู', 'มีอะไรบ้าง', 'ทั้งหมด', 'โปรดัก'];
  const careQuestionTerms = ['เตรียมตัว', 'ต้องทำยังไง', 'ทำไง', 'ทำอย่างไร', 'กินน้ำได้ไหม', 'งดอาหาร', 'ต้องงด', 'ก่อนตรวจ', 'หลังตรวจ', 'ผลตรวจ', 'อ่านผล', 'แปลผล'];

  if (careQuestionTerms.some((term) => normalizedQuestion.includes(term.toLowerCase())) && !explicitProductTerms.some((term) => normalizedQuestion.includes(term.toLowerCase()))) {
    return false;
  }

  const browseTerms = ['ต้องการ', 'อยาก', 'ควร', 'ควรตรวจ', 'ขอดู', 'แนะนำ', 'มีอะไรบ้าง', 'ทั้งหมด', 'ซื้อ', 'จอง', 'เลือก', 'buy', 'pay'];
  const mentionsProduct = productDiscoveryTerms.some((term) => normalizedQuestion.includes(term.toLowerCase()));
  const browsingProducts = browseTerms.some((term) => normalizedQuestion.includes(term.toLowerCase()));

  return mentionsProduct || (browsingProducts && containsAny(question, ['ตรวจ', 'สุขภาพ', 'health', 'product']));
}

function classifyProductRequest(question: string): ProductRequestKind {
  const normalizedQuestion = normalizeInput(question);

  if (!hasProductDiscoveryIntent(question)) {
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
    'คอเลสเตอรอล',
    'ตับ',
    'ไต',
    'ฮอร์โมน',
    'ไทรอยด์',
    'x-ray',
    'xray',
    'mri',
    'ct',
    'ultrasound',
    'mammogram',
    'hpv',
    'influenza',
    'blood',
    'lab',
    'basic blood',
    'cancer',
    'heart',
    'diabetes',
    'vaccine',
  ];
  const listTerms = ['ทั้งหมด', 'มีอะไรบ้าง', 'ราคา', 'ขอดูแพ็กเกจ', 'ขอดูแพคเกจ', 'show packages', 'list packages'];

  if (directTerms.some((term) => normalizedQuestion.includes(term.toLowerCase()))) {
    return 'direct';
  }

  if (listTerms.some((term) => normalizedQuestion.includes(term.toLowerCase()))) {
    return 'direct';
  }

  const broadTerms = [
    'อยากตรวจสุขภาพ',
    'ต้องการตรวจสุขภาพ',
    'ตรวจสุขภาพ',
    'ตรวจประจำปี',
    'ควรตรวจอะไร',
    'แนะนำตรวจ',
    'แนะนำแพ็กเกจ',
    'แนะนำแพคเกจ',
    'health checkup',
    'checkup',
  ];

  return broadTerms.some((term) => normalizedQuestion.includes(term.toLowerCase())) ? 'broad' : 'direct';
}

function getRecentUserHistoryText(messages: ChatMessage[] | undefined, question: string) {
  const recentUserMessages = (messages ?? [])
    .filter((message) => message.role === 'user' && message.content.trim())
    .slice(-8)
    .map((message) => message.content.trim());
  const normalizedQuestion = question.trim();
  const lastUserMessage = recentUserMessages[recentUserMessages.length - 1];

  if (!lastUserMessage || lastUserMessage !== normalizedQuestion) {
    recentUserMessages.push(normalizedQuestion);
  }

  return recentUserMessages.join('\n');
}

function getLastAssistantMessageBeforeQuestion(messages: ChatMessage[] | undefined, question: string) {
  const normalizedQuestion = question.trim();

  for (const message of [...(messages ?? [])].reverse()) {
    if (message.role === 'user' && message.content.trim() === normalizedQuestion) {
      continue;
    }

    if (message.role === 'assistant' && message.content.trim()) {
      return message.content;
    }
  }

  return '';
}

function isUnknownRecentCheckupReply(messages: ChatMessage[] | undefined, question: string) {
  if (!containsAny(question, ['จำไม่ได้', 'ไม่แน่ใจ', 'ไม่รู้', 'นานแล้ว', 'น่าจะนาน', 'หลายปี', 'จำไม่ได้แล้ว', 'not sure', "don't remember", 'cannot remember'])) {
    return false;
  }

  const lastAssistantMessage = getLastAssistantMessageBeforeQuestion(messages, question);

  return containsAny(lastAssistantMessage, [
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

function looksLikeUserQuestion(question: string) {
  return containsAny(question, ['?', 'ไหม', 'มั้ย', 'หรือเปล่า', 'ทำไง', 'ยังไง', 'อย่างไร', 'ควร', 'ได้ไหม', 'what', 'how', 'should', 'can i']);
}

function looksLikeContextFollowUpAnswer(messages: ChatMessage[] | undefined, question: string) {
  const lastAssistantMessage = getLastAssistantMessageBeforeQuestion(messages, question);
  const normalizedAssistant = normalizeInput(lastAssistantMessage);
  const normalizedQuestion = normalizeInput(question);

  if (!lastAssistantMessage || looksLikeUserQuestion(question)) {
    return false;
  }

  if (containsAny(normalizedAssistant, ['อายุประมาณ', 'อายุเท่าไหร่', 'how old', 'age'])) {
    return hasAgeSlot(question);
  }

  if (containsAny(normalizedAssistant, ['ตรวจสุขภาพครั้งล่าสุด', 'ตรวจล่าสุด', 'เคยตรวจสุขภาพ', 'ผลตรวจล่าสุด', 'last checkup', 'latest checkup'])) {
    return (
      isUnknownRecentCheckupReply(messages, question) ||
      containsAny(normalizedQuestion, ['ไม่เคย', 'จำไม่ได้', 'ไม่แน่ใจ', 'ปีที่แล้ว', 'เดือนที่แล้ว', 'นานแล้ว', 'ล่าสุด', 'last year', 'months ago', 'never'])
    );
  }

  if (containsAny(normalizedAssistant, ['อยากดูเรื่องไหน', 'โฟกัสเรื่องไหน', 'กังวลเรื่องไหน', 'focus'])) {
    return containsAny(normalizedQuestion, ['น้ำตาล', 'ไขมัน', 'ตับ', 'ไต', 'หัวใจ', 'เหนื่อย', 'นอน', 'เครียด', 'น้ำหนัก', 'blood sugar', 'cholesterol', 'heart']);
  }

  if (containsAny(normalizedAssistant, ['โรคประจำตัว', 'ยาที่กิน', 'แพ้ยา', 'medical condition'])) {
    return containsAny(normalizedQuestion, ['ไม่มี', 'มี', 'โรค', 'ยา', 'แพ้', 'เบาหวาน', 'ความดัน', 'ไขมัน', 'หัวใจ', 'none', 'no ', 'diabetes', 'hypertension']);
  }

  if (containsAny(normalizedAssistant, ['สะดวกตรวจแถวไหน', 'ใกล้บ้าน', 'ใกล้ที่ทำงาน', 'location'])) {
    return containsAny(normalizedQuestion, ['แถว', 'ใกล้', 'บ้าน', 'ที่ทำงาน', 'กรุงเทพ', 'สุขุมวิท', 'สาทร', 'สีลม', 'ปิ่นเกล้า', 'รังสิต', 'นนทบุรี', 'ใกล้ฉัน']);
  }

  return false;
}

function inferActiveProductRequestKind(messages: ChatMessage[] | undefined, currentRequestKind: ProductRequestKind): ProductRequestKind {
  if (currentRequestKind !== 'none') {
    return currentRequestKind;
  }

  const userMessages = (messages ?? []).filter((message) => message.role === 'user');
  const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? '';

  if (!looksLikeContextFollowUpAnswer(messages, latestUserMessage)) {
    return 'none';
  }

  const latestPriorProductKind = [...userMessages.slice(-8)]
    .reverse()
    .map((message) => classifyProductRequest(message.content))
    .find((kind) => kind !== 'none');

  return latestPriorProductKind ?? 'none';
}

function hasAgeSlot(question: string) {
  if (/(?:อายุ|age)\s*[0-9]{1,3}/i.test(question) || /[0-9]{1,3}\s*(?:ปี|years?\s*old|yo)/i.test(question)) {
    return true;
  }

  return question
    .split(/\r?\n/)
    .some((line) => /^\s*(1[89]|[2-8][0-9]|9[0-9])\s+/.test(line) && containsAny(line, ['เรื่อง', 'โฟกัส', 'น้ำตาล', 'ไขมัน', 'สุขภาพ', 'concern', 'focus']));
}

function extractQuestionSlotSummary(question: string) {
  return {
    accessPreference: containsAny(question, ['งบ', 'บาท', 'ราคา', 'budget', 'ใกล้', 'แถว', 'อยู่', 'สะดวก', 'โรงพยาบาล']),
    age: hasAgeSlot(question),
    clinicalHistory: containsAny(question, [
      'โรคประจำตัว',
      'ไม่มีโรค',
      'ไม่เป็นโรค',
      'ไม่เคยมีประวัติโรค',
      'ไม่มีประวัติโรค',
      'ประวัติโรค',
      'ยา',
      'แพ้ยา',
      'แพ้อาหาร',
      'เบาหวาน',
      'ความดัน',
      'ไขมัน',
      'หัวใจ',
      'ไทรอยด์',
      'มะเร็ง',
      'asthma',
      'allergy',
      'medication',
    ]),
    goal: containsAny(question, ['อยากเช็ค', 'อยากเช็ก', 'โฟกัส', 'กังวล', 'เป้าหมาย', 'ลดน้ำหนัก', 'น้ำตาล', 'ไขมัน', 'นอน', 'เหนื่อย', 'สุขภาพ', 'check']),
    recentCheckup: containsAny(question, ['ตรวจล่าสุด', 'ผลตรวจ', 'เคยตรวจ', 'ไม่เคยตรวจ', 'ปีที่แล้ว', 'เดือนที่แล้ว', 'ล่าสุด', 'lab result', 'last checkup']),
    riskLifestyle: containsAny(question, ['น้ำหนัก', 'ส่วนสูง', 'bmi', 'สูบ', 'เหล้า', 'แอลกอฮอล์', 'ออกกำลัง', 'นอน', 'เครียด', 'ครอบครัว', 'เหนื่อย', 'ปวด']),
  };
}

function extractStoredSlotSummary(personalContextState: PersonalContextState) {
  const healthFactTypes = new Set(personalContextState.healthFacts.map((fact) => fact.fact_type));
  const healthFactText = personalContextState.healthFacts.map((fact) => `${fact.fact_type} ${fact.label} ${fact.value}`).join(' ');
  const memoryTypes = new Set(personalContextState.agentMemory.map((memory) => memory.memory_type));
  const memoryText = personalContextState.agentMemory.map((memory) => `${memory.memory_type} ${memory.summary} ${memory.value ?? ''}`).join(' ');
  const messageText = personalContextState.recentMessages.map((message) => `${message.role} ${message.content}`).join(' ');
  const combinedText = `${healthFactText} ${memoryText} ${messageText}`;

  return {
    accessPreference: memoryTypes.has('budget') || memoryTypes.has('location_preference') || containsAny(combinedText, ['งบ', 'บาท', 'budget', 'ใกล้', 'แถว']),
    age: healthFactTypes.has('demographic') || containsAny(combinedText, ['age', 'อายุ']),
    clinicalHistory:
      healthFactTypes.has('condition') ||
      healthFactTypes.has('medication') ||
      healthFactTypes.has('allergy') ||
      containsAny(combinedText, ['โรคประจำตัว', 'ไม่มีโรค', 'ไม่เคยมีประวัติโรค', 'ไม่มีประวัติโรค', 'ประวัติโรค', 'ยา', 'แพ้ยา', 'condition', 'medication', 'allergy']),
    goal: memoryTypes.has('goal') || memoryTypes.has('product_interest') || containsAny(combinedText, ['goal', 'สนใจ', 'อยาก', 'โฟกัส']),
    recentCheckup: healthFactTypes.has('lab_result') || healthFactTypes.has('screening') || containsAny(combinedText, ['ตรวจล่าสุด', 'ผลตรวจ', 'lab', 'screening']),
    riskLifestyle:
      healthFactTypes.has('symptom') ||
      healthFactTypes.has('lifestyle') ||
      healthFactTypes.has('family_history') ||
      healthFactTypes.has('vital') ||
      containsAny(combinedText, ['น้ำหนัก', 'ส่วนสูง', 'bmi', 'นอน', 'สูบ', 'ครอบครัว', 'symptom']),
  };
}

function getContextScore(slotSummary: ContextAssessment['slotSummary']) {
  return (
    (slotSummary.age ? 20 : 0) +
    (slotSummary.goal ? 20 : 0) +
    (slotSummary.clinicalHistory ? 20 : 0) +
    (slotSummary.recentCheckup ? 15 : 0) +
    (slotSummary.accessPreference ? 15 : 0) +
    (slotSummary.riskLifestyle ? 10 : 0)
  );
}

function hasProductRecommendationReadiness(slotSummary: ContextAssessment['slotSummary'], score: number) {
  return (
    score >= 85 &&
    slotSummary.age &&
    slotSummary.goal &&
    slotSummary.clinicalHistory &&
    slotSummary.recentCheckup &&
    slotSummary.accessPreference
  );
}

function getContextLevel(score: number): ContextLevel {
  if (score >= 85) {
    return 'ready';
  }

  if (score >= 35) {
    return 'partial';
  }

  return 'insufficient';
}

function getContextSlotLists(slotSummary: ContextAssessment['slotSummary']) {
  const labels: Record<ContextSlotKey, string> = {
    accessPreference: 'พื้นที่สะดวกหรืองบประมาณ',
    age: 'อายุหรือช่วงอายุ',
    clinicalHistory: 'โรคประจำตัว ยา หรือประวัติแพ้',
    goal: 'เป้าหมายหรือเรื่องที่อยากโฟกัส',
    recentCheckup: 'ประวัติการตรวจหรือผลตรวจล่าสุด',
    riskLifestyle: 'น้ำหนัก ไลฟ์สไตล์ หรือความเสี่ยงเพิ่มเติม',
  };
  const entries = Object.entries(slotSummary) as [ContextSlotKey, boolean][];

  return {
    collectedSlots: entries.filter(([, exists]) => exists).map(([key]) => labels[key]),
    missingSlots: entries.filter(([, exists]) => !exists).map(([key]) => labels[key]),
  };
}

function createNextContextQuestion(slotSummary: ContextAssessment['slotSummary'], userNickname: string, identityContext: ConversationIdentityContext) {
  const userDisplayName = formatUserDisplayName(userNickname);
  const greetingPrefix = identityContext.hasGreeting ? `สวัสดีค่ะ${userDisplayName} ` : '';

  if (identityContext.isBroadCheckupOpening && !slotSummary.recentCheckup) {
    if (identityContext.hasKnownNoRecentCheckup) {
      return `${greetingPrefix}ฉันจำได้ว่า${userDisplayName}ยังไม่เคยตรวจสุขภาพช่วงที่ผ่านมา งั้นเริ่มจากรอบพื้นฐานก่อนนะคะ`;
    }

    return `${greetingPrefix}เดี๋ยวค่อยๆ ดูให้นะคะ ${userDisplayName}ตรวจสุขภาพครั้งล่าสุดประมาณเมื่อไหร่คะ`;
  }

  if (identityContext.hasUnknownRecentCheckupReply && !slotSummary.age) {
    return `ไม่เป็นไรค่ะ งั้นเริ่มตรวจพื้นฐานรอบใหม่กันนะคะ ${userDisplayName}อายุประมาณเท่าไหร่คะ`;
  }

  if (!slotSummary.age && !slotSummary.goal) {
    return `${greetingPrefix}ได้ค่ะ ${userDisplayName}อายุประมาณเท่าไหร่คะ`;
  }

  if (!slotSummary.age) {
    return `${greetingPrefix}ได้ค่ะ ${userDisplayName}อายุประมาณเท่าไหร่คะ`;
  }

  if (!slotSummary.goal) {
    return `${greetingPrefix}โอเคค่ะ ${userDisplayName}อยากดูเรื่องไหนเป็นพิเศษคะ`;
  }

  if (!slotSummary.clinicalHistory) {
    return `ขอเพิ่มอีกนิดค่ะ ${userDisplayName}มีโรคประจำตัวที่ควรรู้ก่อนไหมคะ`;
  }

  if (!slotSummary.recentCheckup) {
    return `โอเคค่ะ ${userDisplayName}ตรวจสุขภาพครั้งล่าสุดประมาณเมื่อไหร่คะ`;
  }

  if (!slotSummary.accessPreference) {
    return `โอเคค่ะ ${userDisplayName}สะดวกตรวจแถวไหนคะ`;
  }

  return `รับทราบค่ะ ${userDisplayName}อยากดูเรื่องไหนเป็นพิเศษคะ`;
}

function assessContext({
  identityContext,
  messages,
  personalContextState,
  productRequestKind,
  question,
  userNickname,
}: {
  identityContext: ConversationIdentityContext;
  messages?: ChatMessage[];
  personalContextState: PersonalContextState;
  productRequestKind: ProductRequestKind;
  question: string;
  userNickname: string;
}): ContextAssessment {
  const questionSlots = extractQuestionSlotSummary(getRecentUserHistoryText(messages, question));
  const answeredUnknownRecentCheckup = isUnknownRecentCheckupReply(messages, question);
  const storedSlots = extractStoredSlotSummary(personalContextState);
  const slotSummary = {
    accessPreference: questionSlots.accessPreference || storedSlots.accessPreference,
    age: questionSlots.age || storedSlots.age,
    clinicalHistory: questionSlots.clinicalHistory || storedSlots.clinicalHistory,
    goal: questionSlots.goal || storedSlots.goal,
    recentCheckup: questionSlots.recentCheckup || storedSlots.recentCheckup || answeredUnknownRecentCheckup,
    riskLifestyle: questionSlots.riskLifestyle || storedSlots.riskLifestyle,
  };
  const score = getContextScore(slotSummary);
  const level = getContextLevel(score);
  const productReady = hasProductRecommendationReadiness(slotSummary, score);
  const { collectedSlots, missingSlots } = getContextSlotLists(slotSummary);
  const mode: RecommendationMode =
    productRequestKind === 'direct' ? 'direct_product' : productRequestKind === 'broad' && productReady ? 'personalized_recommendation' : 'ask_context';
  const nextQuestion = productRequestKind === 'broad' && mode === 'ask_context' ? createNextContextQuestion(slotSummary, userNickname, identityContext) : null;

  return {
    collectedSlots,
    confidence: Math.min(0.95, collectedSlots.length > 0 ? 0.74 + collectedSlots.length * 0.03 : 0.68),
    level,
    missingSlots,
    mode,
    nextQuestion,
    purpose: 'health_package_recommendation',
    score,
    slotSummary,
  };
}

function toPublicContextAssessment(assessment: ContextAssessment) {
  return {
    collectedSlots: assessment.collectedSlots,
    confidence: assessment.confidence,
    level: assessment.level,
    missingSlots: assessment.missingSlots,
    mode: assessment.mode,
    nextQuestion: assessment.nextQuestion,
    purpose: assessment.purpose,
    score: assessment.score,
  };
}

function inferHealthChatIntent(question: string, preferredCategories: RagCategory[]): HealthChatIntent {
  if (preferredCategories.includes('safety.escalation') && containsAny(question, ['ฉุกเฉิน', 'เจ็บหน้าอก', 'หายใจลำบาก', 'หมดสติ', 'emergency', 'urgent'])) {
    return 'safety_escalation';
  }

  if (createSmallTalkAnswer(question)) {
    return 'small_talk';
  }

  if (preferredCategories.includes('ops.payment') || containsAny(question, ['checkout', 'ชำระ', 'จ่ายเงิน', 'payment'])) {
    return 'checkout';
  }

  if (preferredCategories.includes('ops.booking') || containsAny(question, ['จองคิว', 'นัด', 'appointment', 'booking'])) {
    return 'booking';
  }

  if (containsAny(question, ['เปรียบเทียบ', 'เทียบ', 'compare'])) {
    return 'product_compare';
  }

  if (hasProductDiscoveryIntent(question)) {
    return 'product_recommendation';
  }

  if (preferredCategories.includes('marketplace.product') || containsAny(question, ['แพ็กเกจ', 'แพ็คเกจ', 'ตรวจสุขภาพ', 'package', 'checkup', 'ซื้อ'])) {
    return 'product_recommendation';
  }

  if (preferredCategories.includes('care.checkup_preparation') || preferredCategories.includes('care.patient_education')) {
    return 'health_advice';
  }

  return containsAny(question, ['หนัง', 'เพลง', 'เกม', 'movie', 'song', 'game']) ? 'off_topic' : 'health_advice';
}

function uniqueRoutes(routes: RetrievalRoute[]) {
  return [...new Set(routes)];
}

function hasRoute(decision: RouterDecision, route: RetrievalRoute) {
  return decision.routes.includes(route);
}

function estimateTokenCount(text: string) {
  return Math.ceil(text.length / 4);
}

function routeTurn({
  activeProductRequestKind,
  consentGranted,
  contextAssessment,
  intent,
  preferredCategories,
  question,
}: {
  activeProductRequestKind: ProductRequestKind;
  consentGranted: boolean;
  contextAssessment: ContextAssessment;
  intent: HealthChatIntent;
  preferredCategories: RagCategory[];
  question: string;
}): RouterDecision {
  const routes: RetrievalRoute[] = [];
  const reasons: Record<string, string> = {};
  const routesRejected: Record<string, string> = {};

  if (intent === 'safety_escalation' || preferredCategories.includes('safety.escalation')) {
    return {
      emergency: true,
      reasons: { emergency: 'safety pre-check matched urgent symptoms' },
      routes: ['emergency'],
      routesRejected,
      stage: 'heuristic',
    };
  }

  if (containsAny(question, ['เมื่อกี้', 'ที่คุย', 'ก่อนหน้า', 'สรุป', 'จำได้ไหม', 'what did we discuss', 'previous'])) {
    routes.push('recent_chat');
    reasons.recent_chat = 'user referenced prior conversation';
  }

  if (consentGranted && (intent === 'health_advice' || intent === 'product_recommendation' || intent === 'product_compare' || activeProductRequestKind !== 'none')) {
    routes.push('personal_memory_deep');
    reasons.personal_memory_deep = 'health or product answer may depend on durable user context';
  } else if (!consentGranted) {
    routesRejected.personal_memory_deep = 'chat_health_memory consent is not granted';
  }

  const shouldRouteProducts =
    intent === 'product_compare' ||
    activeProductRequestKind === 'direct' ||
    contextAssessment.mode === 'direct_product' ||
    contextAssessment.mode === 'personalized_recommendation' ||
    (preferredCategories.includes('marketplace.product') && contextAssessment.mode !== 'ask_context');

  if (shouldRouteProducts) {
    routes.push('product_rag');
    reasons.product_rag = 'product or package intent detected';
  } else if (activeProductRequestKind === 'broad' && contextAssessment.mode === 'ask_context') {
    routesRejected.product_rag = 'broad checkup request needs more user context before product retrieval';
  }

  if (
    intent === 'booking' ||
    intent === 'checkout' ||
    preferredCategories.some((category) => category.startsWith('ops.') || category === 'privacy.consent')
  ) {
    routes.push('policy_rag');
    reasons.policy_rag = 'booking, payment, referral, call center, or consent policy may be needed';
  }

  const medicalSearchLikely =
    intent === 'health_advice' &&
    contextAssessment.mode !== 'ask_context' &&
    containsAny(question, [
      'ยา',
      'วัคซีน',
      'ผลข้างเคียง',
      'ค่าเลือด',
      'lab',
      'metformin',
      'dose',
      'dosage',
      'guideline',
      'โรค',
      'อาการ',
      'ควรทำยังไง',
    ]);

  if (medicalSearchLikely || contextAssessment.mode === 'personalized_recommendation') {
    routes.push('controlled_web_search');
    reasons.controlled_web_search = medicalSearchLikely
      ? 'medical fact may need controlled external source'
      : 'personalized recommendation should have current medical context when internal medical RAG is missing';
  }

  if (routes.length === 0) {
    routes.push('none');
    reasons.none = 'small talk, off-topic, or current-turn context is sufficient';
  }

  return {
    emergency: false,
    reasons,
    routes: uniqueRoutes(routes),
    routesRejected,
    stage: 'heuristic',
  };
}

function categoriesForRouterRoutes(routes: RetrievalRoute[], preferredCategories: RagCategory[]) {
  const categories: RagCategory[] = [];

  if (routes.includes('product_rag')) {
    categories.push('marketplace.product');
  }

  if (routes.includes('policy_rag')) {
    categories.push(...preferredCategories.filter((category) => category.startsWith('ops.') || category === 'privacy.consent'));
  }

  if (routes.includes('controlled_web_search')) {
    categories.push(...preferredCategories.filter((category) => category === 'care.checkup_preparation' || category === 'care.patient_education'));
  }

  return uniqueCategories(categories.length ? categories : preferredCategories.filter((category) => category !== 'safety.escalation'));
}

async function getLatestHealthMemoryConsent(userId: string, authorization: string): Promise<ConsentRow | null> {
  const rows = await selectRest<ConsentRow[]>(
    `consents?select=id,status&user_id=eq.${encodeURIComponent(userId)}&purpose=eq.chat_health_memory&order=created_at.desc&limit=1`,
    authorization,
  );

  return rows?.[0] ?? null;
}

async function fetchCompanionSessionContext(userId: string, authorization: string): Promise<CompanionSessionContext> {
  const sessions = await selectRest<CompanionSessionRow[]>(
    [
      'chat_sessions?select=id,rolling_summary',
      `user_id=eq.${encodeURIComponent(userId)}`,
      'source=eq.companion_timeline',
      'ended_at=is.null',
      'order=started_at.desc',
      'limit=1',
    ].join('&'),
    authorization,
  );
  const sessionId = sessions?.[0]?.id;

  if (!sessionId) {
    return { messages: [] };
  }

  const rows = await selectRest<StoredChatMessageRow[]>(
    [
      'chat_messages?select=role,content,created_at',
      `user_id=eq.${encodeURIComponent(userId)}`,
      `session_id=eq.${encodeURIComponent(sessionId)}`,
      'order=created_at.desc',
      'limit=12',
    ].join('&'),
    authorization,
  );

  return {
    messages: (rows ?? [])
      .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content?.trim())
      .reverse()
      .map((message) => ({ content: message.content.trim(), role: message.role })),
    rollingSummary: sessions?.[0]?.rolling_summary ?? null,
    sessionId,
  };
}

async function fetchPersonalContext(userId: string, authorization: string, consentGranted: boolean) {
  if (!consentGranted) {
    return {
      agentMemory: [] as AgentMemoryRow[],
      healthFacts: [] as HealthFactContextRow[],
      recentMessages: [] as ChatMessage[],
      rollingSummary: null,
      sessionId: null,
    };
  }

  const [healthFacts, agentMemory, sessionContext] = await Promise.all([
    selectRest<HealthFactContextRow[]>(
      [
        'health_facts?select=fact_type,label,value,unit,observed_at,confidence',
        `user_id=eq.${encodeURIComponent(userId)}`,
        'status=eq.confirmed',
        'order=created_at.desc',
        'limit=12',
      ].join('&'),
      authorization,
    ),
    selectRest<AgentMemoryRow[]>(
      [
        'agent_memory?select=memory_type,summary,value,source,confidence,observed_at,valid_until',
        `user_id=eq.${encodeURIComponent(userId)}`,
        'status=eq.active',
        'order=observed_at.desc',
        'limit=12',
      ].join('&'),
      authorization,
    ),
    fetchCompanionSessionContext(userId, authorization),
  ]);

  return {
    agentMemory: agentMemory ?? [],
    healthFacts: healthFacts ?? [],
    recentMessages: sessionContext.messages,
    rollingSummary: sessionContext.rollingSummary ?? null,
    sessionId: sessionContext.sessionId ?? null,
  };
}

function formatPersonalContext({
  agentMemory,
  consentGranted,
  healthFacts,
  recentMessages,
  rollingSummary,
}: {
  agentMemory: AgentMemoryRow[];
  consentGranted: boolean;
  healthFacts: HealthFactContextRow[];
  recentMessages: ChatMessage[];
  rollingSummary?: string | null;
}) {
  if (!consentGranted) {
    return MIRACARE_EMPTY_PERSONAL_CONTEXT;
  }

  const factLines = healthFacts.slice(0, 8).map((fact) => {
    const unit = fact.unit ? ` ${fact.unit}` : '';
    const observed = fact.observed_at ? ` observed_at=${fact.observed_at}` : '';
    return `- health_fact type=${fact.fact_type} label=${fact.label} value=${fact.value}${unit} confidence=${fact.confidence ?? 0}${observed}`;
  });
  const memoryLines = agentMemory.slice(0, 8).map((memory) => {
    const validUntil = memory.valid_until ? ` valid_until=${memory.valid_until}` : '';
    return `- agent_memory type=${memory.memory_type} summary=${memory.summary} value=${memory.value ?? ''} confidence=${memory.confidence ?? 0}${validUntil}`;
  });

  if (factLines.length === 0 && memoryLines.length === 0) {
    return MIRACARE_EMPTY_PERSONAL_CONTEXT;
  }

  return [...factLines, ...memoryLines].join('\n');
}

async function getOrCreateCompanionSession(userId: string, authorization: string, question: string) {
  const rows = await selectRest<InsertedIdRow[]>(
    [
      'chat_sessions?select=id',
      `user_id=eq.${encodeURIComponent(userId)}`,
      'source=eq.companion_timeline',
      'ended_at=is.null',
      'order=started_at.desc',
      'limit=1',
    ].join('&'),
    authorization,
  );

  if (rows?.[0]?.id) {
    return rows[0].id;
  }

  return insertRestReturningId(
    'chat_sessions',
    {
      metadata: {
        timeline: 'single_companion',
      },
      source: 'companion_timeline',
      title: question.slice(0, 80),
      user_id: userId,
    },
    authorization,
  );
}

async function createTimelineMessage({
  authorization,
  content,
  model,
  ragChunkIds,
  role,
  routerRoutes,
  sessionId,
  tokenEstimate,
  userId,
}: {
  authorization: string;
  content: string;
  model?: string;
  ragChunkIds?: string[];
  role: 'assistant' | 'user';
  routerRoutes?: RetrievalRoute[];
  sessionId: string;
  tokenEstimate?: number;
  userId: string;
}) {
  return insertRestReturningId(
    'chat_messages',
    {
      content,
      metadata: {
        timeline: 'single_companion',
      },
      model,
      rag_chunk_ids: ragChunkIds ?? [],
      role,
      router_route: routerRoutes ?? [],
      session_id: sessionId,
      token_estimate: tokenEstimate ?? estimateTokenCount(content),
      user_id: userId,
    },
    authorization,
  );
}

async function updateCompanionRollingSummary({
  authorization,
  sessionId,
}: {
  authorization: string;
  sessionId: string;
}) {
  const rows = await selectRest<StoredChatMessageRow[]>(
    [
      'chat_messages?select=role,content,created_at',
      `session_id=eq.${encodeURIComponent(sessionId)}`,
      'order=created_at.desc',
      'limit=8',
    ].join('&'),
    authorization,
  );
  const messages = (rows ?? [])
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content?.trim())
    .reverse();

  if (messages.length === 0) {
    return;
  }

  const rollingSummary = messages.map((message) => `${message.role}: ${clipText(message.content.trim(), 140)}`).join(' | ');

  await updateRest(
    `chat_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    {
      message_count: messages.length,
      rolling_summary: clipText(rollingSummary, 900),
      summary_updated_at: new Date().toISOString(),
    },
    authorization,
  );
}

async function fetchActiveHospitalProducts(authorization: string, limit = 4) {
  const select = [
    'id',
    'title',
    'hospital_name',
    'description',
    'category',
    'price_amount',
    'duration',
    'hospital_address',
    'hospital_lat',
    'hospital_lng',
    'hospital_map_query',
    'includes',
    'metadata',
    'tags',
    'booking_note',
    'rag_chunk_id',
  ].join(',');

  const rows = await selectRest<HospitalProductRow[]>(
    `hospital_products?select=${encodeURIComponent(select)}&status=eq.active&order=created_at.desc&limit=${limit}`,
    authorization,
  );

  return rows ?? [];
}

function toChatProductCard(product: HospitalProductRow, reason?: string): ChatProductCard {
  return {
    bookingNote: product.booking_note,
    category: product.category,
    description: product.description,
    duration: product.duration,
    hospitalAddress: product.hospital_address,
    hospitalLat: product.hospital_lat,
    hospitalLng: product.hospital_lng,
    hospitalMapQuery: product.hospital_map_query,
    hospitalName: product.hospital_name,
    id: product.id,
    includes: product.includes ?? [],
    priceAmount: product.price_amount,
    productImagePreviewUri: product.metadata?.product_image_preview_uri ?? null,
    ragChunkId: product.rag_chunk_id,
    reason,
    tags: product.tags ?? [],
    title: product.title,
  };
}

function getMiraCarePromptId() {
  return Deno.env.get('OPENAI_CHAT_PROMPT_ID')?.trim() || Deno.env.get('MIRACARE_PROMPT_ID')?.trim() || MIRACARE_PROMPT_ID;
}

function getMiraCarePromptVersion() {
  return Deno.env.get('OPENAI_CHAT_PROMPT_VERSION')?.trim() || Deno.env.get('MIRACARE_PROMPT_VERSION')?.trim() || MIRACARE_PROMPT_VERSION;
}

function getMiraCareModelLabel() {
  return Deno.env.get('OPENAI_CHAT_MODEL') || Deno.env.get('OPENAI_MODEL') || 'gpt-5.5';
}

function resolveMiraCareBrandName(products: HospitalProductRow[]) {
  const configuredBrand = Deno.env.get('MIRACARE_BRAND_NAME')?.trim() || Deno.env.get('BRAND_NAME')?.trim();

  return configuredBrand || products.find((product) => product.hospital_name.trim())?.hospital_name.trim() || MIRACARE_DEFAULT_BRAND_NAME;
}

function resolveMiraCareUserNickname(userNickname?: string) {
  return userNickname?.trim() || Deno.env.get('DEFAULT_USER_NICKNAME')?.trim() || MIRACARE_DEFAULT_USER_NICKNAME;
}

function toPromptCatalogProduct(product: HospitalProductRow) {
  const image = product.metadata?.product_image_preview_uri?.trim();

  return {
    description: product.description,
    id: product.id,
    ...(image ? { image } : {}),
    name: product.title,
    price: product.price_amount,
  };
}

function formatProductCatalog(products: HospitalProductRow[]) {
  return JSON.stringify(products.map(toPromptCatalogProduct));
}

function formatRecentChat(messages: ChatMessage[], question: string) {
  const normalizedQuestion = question.trim();
  const recentMessages = sanitizeMessagesForModelContext(messages)
    .filter((message, index, list) => index < list.length - 1 || message.content.trim() !== normalizedQuestion)
    .slice(-8);

  if (recentMessages.length === 0) {
    return MIRACARE_EMPTY_RECENT_CHAT;
  }

  return recentMessages
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${clipText(message.content, 500)}`)
    .join('\n');
}

function parseProductMarker(text: string) {
  const markerMatch = text.match(/\n?\[\[products:\s*([^\]]+)\]\]\s*$/i);

  if (!markerMatch) {
    return {
      productIds: [] as string[],
      text: text.trim(),
    };
  }

  const productIds = [...new Set(markerMatch[1].split(',').map((id) => id.trim()).filter(Boolean))].slice(0, 2);

  return {
    productIds,
    text: text.replace(markerMatch[0], '').trim(),
  };
}

function buildProductUiCardsFromMarker(productIds: string[], products: ChatProductCard[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const resolvedProducts = productIds.map((id) => productsById.get(id)).filter((product): product is ChatProductCard => Boolean(product));
  const unknownProductIds = productIds.filter((id) => !productsById.has(id));

  return {
    uiCards:
      resolvedProducts.length > 0
        ? [
            {
              id: `product-grid-${Date.now()}`,
              products: resolvedProducts,
              title: MIRACARE_PRODUCT_CARD_TITLE,
              type: 'product_grid' as const,
            },
          ]
        : [],
    unknownProductIds,
  };
}

function createBranchCard(product: ChatProductCard): ChatBranchCard {
  return {
    address: product.hospitalAddress,
    distanceLabel: product.hospitalLat && product.hospitalLng ? 'Map ready' : 'Confirm distance',
    hospitalName: product.hospitalName,
    id: `branch-${product.id}`,
    lat: product.hospitalLat,
    lng: product.hospitalLng,
    mapQuery: product.hospitalMapQuery ?? product.hospitalName,
    name: product.hospitalName,
    nextSlot: product.bookingNote ? 'Confirm by call center' : 'Next available',
    productId: product.id,
  };
}

function scoreProductForQuestion(product: ChatProductCard, question: string, contextAssessment: ContextAssessment) {
  const normalizedQuestion = normalizeInput(question);
  const haystack = normalizeInput(
    [
      product.title,
      product.description,
      product.category,
      product.hospitalName,
      product.includes.join(' '),
      product.tags.join(' '),
      product.reason ?? '',
    ].join(' '),
  );
  let score = 0;

  for (const token of tokenize(normalizedQuestion)) {
    if (haystack.includes(token)) {
      score += product.title.toLowerCase().includes(token) ? 5 : 2;
    }
  }

  if (containsAny(question, ['ตรวจเลือด', 'เจาะเลือด', 'น้ำตาล', 'ไขมัน', 'blood', 'lab']) && product.category === 'lab_test') {
    score += 14;
  }

  if (containsAny(question, ['วัคซีน', 'vaccine', 'hpv', 'influenza']) && product.category === 'vaccine') {
    score += 14;
  }

  if (containsAny(question, ['สุขภาพ', 'ประจำปี', 'checkup']) && product.category === 'health_checkup') {
    score += contextAssessment.mode === 'personalized_recommendation' ? 10 : 6;
  }

  if (containsAny(question, ['มะเร็ง', 'cancer']) && haystack.includes('cancer')) {
    score += 10;
  }

  return score;
}

function rankProductsForQuestion(products: ChatProductCard[], question: string, contextAssessment: ContextAssessment) {
  return products
    .slice()
    .sort((a, b) => scoreProductForQuestion(b, question, contextAssessment) - scoreProductForQuestion(a, question, contextAssessment) || a.priceAmount - b.priceAmount);
}

function buildUiCards({
  contextAssessment,
  intent,
  products,
}: {
  contextAssessment: ContextAssessment;
  intent: HealthChatIntent;
  products: ChatProductCard[];
}): ChatUiCard[] {
  if (intent === 'safety_escalation' || products.length === 0 || contextAssessment.mode === 'ask_context') {
    return [];
  }

  if (intent === 'product_recommendation' || intent === 'product_compare') {
    return [
      {
        id: `product-grid-${Date.now()}`,
        products: products.slice(0, contextAssessment.mode === 'personalized_recommendation' ? 1 : 4),
        title: 'แพ็กเกจที่น่าดู',
        type: 'product_grid',
      },
    ];
  }

  return [];
}

function polishCompanionText({
  contextAssessment,
  intent,
  text,
  uiCards,
  userNickname,
}: {
  contextAssessment: ContextAssessment;
  intent: HealthChatIntent;
  text: string;
  uiCards: ChatUiCard[];
  userNickname: string;
}) {
  const hasProductGrid = uiCards.some((card) => card.type === 'product_grid');

  if (contextAssessment.mode === 'ask_context' && contextAssessment.nextQuestion) {
    return contextAssessment.nextQuestion;
  }

  if (hasProductGrid) {
    if (contextAssessment.mode === 'personalized_recommendation') {
      return `จากข้อมูลที่มี ฉันเลือกตัวเลือกที่เหมาะให้ 1 รายการค่ะ`;
    }

    return `ได้ค่ะ${formatUserDisplayName(userNickname)} ดูแพ็กเกจนี้ก่อนได้เลย ถ้าอยากให้ช่วยเลือกให้เข้ากับตัวคุณมากขึ้น ค่อยบอกอายุเพิ่มได้ค่ะ`;
  }

  const trimmed = text.trim();

  if (intent === 'small_talk' && trimmed.length > 90) {
    return `สวัสดีค่ะคุณ${userNickname} วันนี้อยากดูแลเรื่องไหนก่อนดีคะ`;
  }

  return trimmed;
}

function extractAgentMemoryCandidates(question: string): AgentMemoryRecord[] {
  const memories: AgentMemoryRecord[] = [];
  const normalized = normalizeInput(question);
  const now = new Date();
  const longTermValidUntil = new Date(now);
  longTermValidUntil.setMonth(longTermValidUntil.getMonth() + 6);

  const budgetMatch = normalized.match(/(?:งบ|budget|ไม่เกิน|ประมาณ)\s*([0-9,]{3,})/i) ?? normalized.match(/([0-9,]{3,})\s*(?:บาท|thb)/i);
  if (budgetMatch?.[1]) {
    memories.push({
      confidence: 0.86,
      memoryType: 'budget',
      status: 'skipped',
      summary: `Budget preference around ${budgetMatch[1]} THB`,
      validUntil: longTermValidUntil.toISOString(),
      value: budgetMatch[1].replace(/,/g, ''),
    });
  }

  const locationMatch = normalized.match(/(?:แถว|ใกล้|อยู่|สะดวก)\s*([\p{L}\p{M}\p{N}\s.-]{2,40})/iu);
  if (locationMatch?.[1]) {
    memories.push({
      confidence: 0.78,
      memoryType: 'location_preference',
      status: 'skipped',
      summary: `Location preference: ${locationMatch[1].trim()}`,
      validUntil: longTermValidUntil.toISOString(),
      value: locationMatch[1].trim(),
    });
  }

  if (containsAny(question, ['ตรวจสุขภาพ', 'แพ็กเกจ', 'แพ็คเกจ', 'checkup', 'package'])) {
    memories.push({
      confidence: 0.8,
      memoryType: 'product_interest',
      status: 'skipped',
      summary: 'Interested in health checkup packages',
      validUntil: longTermValidUntil.toISOString(),
      value: 'health_checkup',
    });
  }

  if (containsAny(question, ['อยากลดน้ำหนัก', 'นอนหลับ', 'เหนื่อยง่าย', 'ดูแลสุขภาพ', 'คุมความเสี่ยง', 'preventive'])) {
    memories.push({
      confidence: 0.76,
      memoryType: 'goal',
      status: 'skipped',
      summary: clipText(question, 140),
      validUntil: longTermValidUntil.toISOString(),
      value: clipText(question, 120),
    });
  }

  if (containsAny(question, ['ตอบสั้น', 'ละเอียด', 'ภาษาอังกฤษ', 'english', 'สรุปสั้น'])) {
    memories.push({
      confidence: 0.82,
      memoryType: 'communication_preference',
      status: 'skipped',
      summary: clipText(question, 140),
      value: clipText(question, 120),
    });
  }

  return memories.filter((memory) => memory.confidence >= 0.75).slice(0, 3);
}

async function saveAgentMemoryWrites({
  authorization,
  consentGranted,
  memories,
  sourceMessageId,
  userId,
}: {
  authorization: string;
  consentGranted: boolean;
  memories: AgentMemoryRecord[];
  sourceMessageId?: string | null;
  userId: string;
}) {
  if (!consentGranted || memories.length === 0 || !sourceMessageId) {
    return memories.map((memory) => ({ ...memory, status: 'skipped' as const }));
  }

  const saved: AgentMemoryRecord[] = [];

  for (const memory of memories) {
    const id = await insertRestReturningId(
      'agent_memory',
      {
        confidence: memory.confidence,
        memory_type: memory.memoryType,
        metadata: {
          captured_by: 'mira-chat-orchestrator',
        },
        source: 'chat',
        source_message_id: sourceMessageId,
        summary: memory.summary,
        user_id: userId,
        valid_until: memory.validUntil,
        value: memory.value,
      },
      authorization,
    );

    saved.push({ ...memory, id: id ?? undefined, status: id ? 'saved' : 'skipped' });
  }

  await insertRest(
    'health_memory_logs',
    {
      action: 'auto_save',
      fact_count: saved.filter((memory) => memory.status === 'saved').length,
      fact_types: saved.map((memory) => memory.memoryType),
      metadata: {
        memory_ids: saved.map((memory) => memory.id).filter(Boolean),
        memory_source: 'agent_memory',
      },
      status: saved.some((memory) => memory.status === 'saved') ? 'success' : 'skipped',
      user_id: userId,
    },
    authorization,
  );

  return saved;
}

async function saveUserContextScore({
  assessment,
  authorization,
  consentGranted,
  consentId,
  productRequestKind,
  sourceMessageId,
  userId,
}: {
  assessment: ContextAssessment;
  authorization: string;
  consentGranted: boolean;
  consentId?: string | null;
  productRequestKind: ProductRequestKind;
  sourceMessageId?: string | null;
  userId: string;
}) {
  if (!consentGranted || !consentId || !sourceMessageId) {
    return null;
  }

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  const id = await insertRestReturningId(
    'user_context_scores',
    {
      calculated_at: new Date().toISOString(),
      collected_slots: assessment.collectedSlots,
      confidence: assessment.confidence,
      consent_id: consentId,
      level: assessment.level,
      missing_slots: assessment.missingSlots,
      next_question: assessment.nextQuestion,
      purpose: assessment.purpose,
      recommendation_mode: assessment.mode,
      score: assessment.score,
      slot_summary: assessment.slotSummary,
      source_message_id: sourceMessageId,
      status: 'active',
      user_id: userId,
      valid_until: validUntil.toISOString(),
      metadata: {
        captured_by: 'mira-chat-orchestrator',
        product_request_kind: productRequestKind,
      },
    },
    authorization,
  );

  if (id) {
    await insertRest(
      'data_access_logs',
      {
        action: 'create',
        actor_type: 'edge_function',
        metadata: {
          level: assessment.level,
          mode: assessment.mode,
          score: assessment.score,
        },
        purpose: 'chat_health_memory',
        resource_id: id,
        resource_type: 'user_context_score',
        user_id: userId,
      },
      authorization,
    );
  }

  return id;
}

function clipText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

function formatRagContext(matches: RagMatch[], maxContextChars = DEFAULT_CONTEXT_CHARS) {
  if (matches.length === 0) {
    return 'No app-specific Mira package or policy snippets matched. Do not mention this to the user. Use general safe health knowledge when relevant, or answer harmless off-topic questions briefly and steer back to health.';
  }

  const blocks: string[] = [];
  let remainingChars = maxContextChars;

  for (const [index, match] of matches.entries()) {
    const body = match.summary || match.content;
    const sourceUrl = match.sourceUrl ? ` | source_url=${match.sourceUrl}` : '';
    const header = `[${index + 1}] id=${match.id} | category=${match.category} | topic=${match.topic} | risk=${
      match.riskLevel
    } | source=${match.source}${sourceUrl}`;
    const maxBodyChars = Math.max(120, Math.min(match.tokenBudget * 4, remainingChars - header.length - 12));
    const block = `${header}\n${clipText(body, maxBodyChars)}`;

    if (blocks.length > 0 && block.length > remainingChars) {
      break;
    }

    blocks.push(clipText(block, remainingChars));
    remainingChars -= block.length + 2;

    if (remainingChars <= 120) {
      break;
    }
  }

  return blocks.join('\n\n');
}

function toPublicRagMatch(match: RagMatch): PublicRagMatch {
  return {
    id: match.id,
    title: match.title,
    category: match.category,
    topic: match.topic,
    source: match.source,
    sourceUrl: match.sourceUrl,
    riskLevel: match.riskLevel,
    score: match.score,
    summary: match.summary,
  };
}

async function fetchApprovedWebSearchSources(authorization: string) {
  const rows = await selectRest<WebSearchSourceRow[]>(
    [
      'web_search_sources?select=id,domain,display_name,source_type,topics,trust_tier',
      'status=eq.approved',
      'order=trust_tier.asc,domain.asc',
      'limit=12',
    ].join('&'),
    authorization,
  );

  return rows ?? [];
}

function getUrlDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function sourceMatchesApprovedDomain(url: string, sources: WebSearchSourceRow[]) {
  const domain = getUrlDomain(url);

  return Boolean(domain) && sources.some((source) => domain === source.domain || domain.endsWith(`.${source.domain}`));
}

function toPublicSearchSource(match: PublicRagMatch, sources: WebSearchSourceRow[]): PublicSearchSource | null {
  if (!match.sourceUrl) {
    return null;
  }

  const domain = getUrlDomain(match.sourceUrl);
  const source = sources.find((candidate) => domain === candidate.domain || domain.endsWith(`.${candidate.domain}`));

  if (!domain || !source) {
    return null;
  }

  return {
    domain,
    title: match.title,
    trustTier: source.trust_tier,
    url: match.sourceUrl,
  };
}

function shouldEnableWebSearch({
  approvedSources,
  contextAssessment,
  intent,
  ragMatches,
  routerDecision,
}: {
  approvedSources: WebSearchSourceRow[];
  contextAssessment: ContextAssessment;
  intent: HealthChatIntent;
  ragMatches: RagMatch[];
  routerDecision: RouterDecision;
}) {
  if (!hasRoute(routerDecision, 'controlled_web_search') || approvedSources.length === 0 || intent === 'safety_escalation' || contextAssessment.mode === 'ask_context') {
    return false;
  }

  const hasMedicalRag = ragMatches.some((match) => match.category === 'care.checkup_preparation' || match.category === 'care.patient_education');

  return !hasMedicalRag && (intent === 'health_advice' || contextAssessment.mode === 'personalized_recommendation');
}

function extractWebSearchMatches(data: OpenAIResponse): PublicRagMatch[] {
  const seen = new Set<string>();
  const matches: PublicRagMatch[] = [];

  const addSource = (source: { title?: string; url?: string }, index: number) => {
    const url = source.url?.trim();

    if (!url || seen.has(url)) {
      return;
    }

    seen.add(url);
    matches.push({
      category: 'care.patient_education',
      id: `web-search-${index + 1}`,
      riskLevel: 'medium',
      score: Math.max(1, 10 - index),
      source: 'web_search',
      sourceUrl: url,
      summary: source.title?.trim() || url,
      title: source.title?.trim() || 'Web search source',
      topic: 'prototype_medical_search',
    });
  };

  for (const item of data.output ?? []) {
    item.action?.sources?.forEach(addSource);

    for (const content of item.content ?? []) {
      content.annotations?.forEach((annotation, index) => {
        if (annotation.type === 'url_citation') {
          addSource(annotation, index);
        }
      });
    }
  }

  return matches.slice(0, 3);
}

function filterApprovedWebSearchMatches(matches: PublicRagMatch[], approvedSources: WebSearchSourceRow[]) {
  return matches.filter((match) => match.sourceUrl && sourceMatchesApprovedDomain(match.sourceUrl, approvedSources)).slice(0, 3);
}

function uniqueSearchSources(matches: PublicRagMatch[], approvedSources: WebSearchSourceRow[]) {
  const seen = new Set<string>();
  const sources: PublicSearchSource[] = [];

  for (const match of matches) {
    const source = toPublicSearchSource(match, approvedSources);

    if (!source || seen.has(source.url)) {
      continue;
    }

    seen.add(source.url);
    sources.push(source);
  }

  return sources;
}

function uniqueWebSearchSources(matches: PublicRagMatch[]) {
  const seen = new Set<string>();
  const sources: PublicSearchSource[] = [];

  for (const match of matches) {
    const url = match.sourceUrl;

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    sources.push({
      domain: getUrlDomain(url),
      title: match.title,
      trustTier: 0,
      url,
    });
  }

  return sources;
}

async function insertRetrievalLog({
  authorization,
  cacheHit,
  contextAssessment,
  intent,
  messageId,
  ragMatches,
  requestId,
  routerLatencyMs,
  routerDecision,
  sessionId,
  totalLatencyMs,
  userId,
  webSearchMatches,
}: {
  authorization: string;
  cacheHit: boolean;
  contextAssessment: ContextAssessment;
  intent: HealthChatIntent;
  messageId?: string | null;
  ragMatches: RagMatch[];
  requestId: string;
  routerLatencyMs: number;
  routerDecision: RouterDecision;
  sessionId?: string | null;
  totalLatencyMs: number;
  userId: string;
  webSearchMatches: PublicRagMatch[];
}) {
  await insertRest(
    'retrieval_logs',
    {
      cache_hit: cacheHit,
      fetch_stats: {
        internal_rag_count: ragMatches.length,
        web_search_count: webSearchMatches.length,
      },
      message_id: messageId ?? null,
      model_intent: intent,
      router_input: {
        context_level: contextAssessment.level,
        context_mode: contextAssessment.mode,
        context_score: contextAssessment.score,
        request_id: requestId,
      },
      router_latency_ms: routerLatencyMs,
      routes_rejected: routerDecision.routesRejected,
      routes_selected: routerDecision.routes,
      session_id: sessionId ?? null,
      total_context_tokens:
        ragMatches.reduce((total, match) => total + Math.max(1, match.tokenBudget), 0) +
        webSearchMatches.reduce((total, match) => total + estimateTokenCount(match.summary), 0),
      total_latency_ms: totalLatencyMs,
      user_id: userId,
    },
    authorization,
  );
}

function getOpenAIText(data: OpenAIResponse) {
  const text =
    data.output_text?.trim() ||
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter((content): content is string => Boolean(content?.trim()))
      .join('\n')
      .trim();

  if (!text) {
    throw new Error(data.error?.message ?? 'OpenAI returned an empty response.');
  }

  return normalizeAssistantText(text);
}

function getFinishReason(data: OpenAIResponse) {
  return data.incomplete_details?.reason ?? data.status ?? 'completed';
}

function stoppedForMaxTokens(data: OpenAIResponse) {
  return data.status === 'incomplete' && data.incomplete_details?.reason === 'max_output_tokens';
}

function looksLikePromptLeak(text: string) {
  const normalizedText = text.toLowerCase();
  const blockedPhrases = [
    'if rag context is missing',
    'final polish',
    'system prompt',
    'hidden instruction',
    'mandatory safety',
    'prompt checklist',
    'internal reasoning',
    'user-facing answer',
    'no approved rag snippets',
    'no app-specific mira package',
    'no rag context',
    'missing context',
    'no data in the system',
    'ไม่มีข้อมูลในระบบ',
    'ไม่มีข้อมูลอ้างอิง',
    'ไม่พบข้อมูลในระบบ',
    'yes, i will',
  ];

  return blockedPhrases.some((phrase) => normalizedText.includes(phrase));
}

function normalizeAssistantText(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasBlockedConversationStyle(text: string) {
  const blockedPhrases = [
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
    'ไม่มีข้อมูลอ้างอิง',
    'ไม่พบข้อมูลในระบบ',
    'ระบบข้อมูล',
    'ผมครับ',
    'ในฐานะ',
  ];
  const normalizedText = text.toLowerCase();

  return blockedPhrases.some((phrase) => normalizedText.includes(phrase.toLowerCase()));
}

function countQuestionLikePhrases(text: string) {
  const normalizedText = text.replace(/\s+/g, ' ');
  const marks = normalizedText.match(/[?？]/g)?.length ?? 0;
  const thaiQuestionEndings =
    normalizedText.match(/(?:ไหม|มั้ย|หรือเปล่า|หรือไม่|เมื่อไหร่|แถวไหน|ละแวกไหน|ที่ไหน|อะไร|เท่าไหร่|กี่ปี)(?:คะ|ค่ะ|ครับ)?/g)?.length ?? 0;

  return Math.max(marks, thaiQuestionEndings);
}

function countStructuredLines(text: string) {
  return text.split(/\r?\n/).filter((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line)).length;
}

function hasUiCardType(uiCards: ChatUiCard[], type: ChatUiCard['type']) {
  return uiCards.some((card) => card.type === type);
}

function needsHumanStyleRewrite({
  contextAssessment,
  intent,
  text,
  uiCards,
}: {
  contextAssessment: ContextAssessment;
  intent: HealthChatIntent;
  text: string;
  uiCards: ChatUiCard[];
}) {
  const compactText = text.replace(/\s+/g, ' ').trim();
  const hasProductCard = hasUiCardType(uiCards, 'product_grid') || hasUiCardType(uiCards, 'branch_location') || hasUiCardType(uiCards, 'checkout_draft');

  if (hasBlockedConversationStyle(text) || looksLikePromptLeak(text)) {
    return true;
  }

  if (intent === 'small_talk' && compactText.length > 140) {
    return true;
  }

  if (contextAssessment.mode === 'ask_context' && contextAssessment.nextQuestion && compactText.length > contextAssessment.nextQuestion.length + 120) {
    return true;
  }

  if (countQuestionLikePhrases(text) > 1) {
    return true;
  }

  if (countStructuredLines(text) > 3) {
    return true;
  }

  if (contextAssessment.mode === 'ask_context' && !hasProductCard && /แพ็กเกจ|แพคเกจ|package|ซื้อ|ชำระ|จอง/i.test(text)) {
    return true;
  }

  return false;
}

function createHumanStyleRewriteInstruction({
  contextAssessment,
  previousAnswer,
  uiCards,
  userNickname,
}: {
  contextAssessment: ContextAssessment;
  previousAnswer: string;
  uiCards: ChatUiCard[];
  userNickname: string;
}) {
  const nextQuestion = contextAssessment.nextQuestion?.trim() || 'none';
  const hasProductCard = hasUiCardType(uiCards, 'product_grid') || hasUiCardType(uiCards, 'branch_location') || hasUiCardType(uiCards, 'checkout_draft');

  return `The previous answer sounded robotic, long, sales-like, or process-oriented. Rewrite only the final user-facing Thai answer.

Previous answer:
"""${clipText(previousAnswer, 900)}"""

Rewrite rules:
- Return only Thai user-facing text.
- Use a kind familiar Thai nurse tone for ${formatUserDisplayName(userNickname)}.
- Use 1-2 short sentences total.
- Ask at most one question.
- Do not mention planning, accuracy, reasons, system, database, AI, model, prompt, or RAG.
- Do not use "โซน", "budget", or "option".
- ${hasProductCard ? 'A product card is present, so a short package mention is allowed.' : 'Do not mention packages, buying, booking, or payment.'}
- If a next question is provided, use it as the main answer unless it conflicts with safety.
- next_question: ${nextQuestion}`;
}

function compactHumanStyleFallback(text: string, contextAssessment: ContextAssessment, userNickname: string) {
  if (contextAssessment.mode === 'ask_context' && contextAssessment.nextQuestion && !hasBlockedConversationStyle(contextAssessment.nextQuestion)) {
    return contextAssessment.nextQuestion;
  }

  const cleaned = normalizeAssistantText(text)
    .replace(/ถ้าจะวางแผน[^.!?\n。]*[.!?\n。]?/gi, '')
    .replace(/เพื่อให้คำแนะนำแม่นยำ[^.!?\n。]*[.!?\n。]?/gi, '')
    .replace(/เพราะคำแนะนำควร[^.!?\n。]*[.!?\n。]?/gi, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');

  if (cleaned && !hasBlockedConversationStyle(cleaned) && countQuestionLikePhrases(cleaned) <= 1) {
    return clipText(cleaned, 220);
  }

  return `โอเคค่ะ ${formatUserDisplayName(userNickname)}สะดวกตรวจแถวไหนคะ`;
}

function enforceConversationStyle(text: string, contextAssessment: ContextAssessment, userNickname: string, uiCards: ChatUiCard[] = [], intent: HealthChatIntent = 'health_advice') {
  if (!needsHumanStyleRewrite({ contextAssessment, intent, text, uiCards })) {
    return text;
  }

  if (contextAssessment.mode === 'ask_context' && contextAssessment.nextQuestion && !hasBlockedConversationStyle(contextAssessment.nextQuestion)) {
    return contextAssessment.nextQuestion;
  }

  return compactHumanStyleFallback(text, contextAssessment, userNickname);
}

async function generateOpenAIResponse({
  apiBaseUrl,
  brandName,
  openaiApiKey,
  personalContext,
  productCatalog,
  question,
  recentChat,
  userNickname,
}: {
  apiBaseUrl: string;
  brandName: string;
  openaiApiKey: string;
  personalContext: string;
  productCatalog: string;
  question: string;
  recentChat: string;
  userNickname?: string;
}) {
  const promptId = getMiraCarePromptId();
  const promptVersion = getMiraCarePromptVersion();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      include: ['web_search_call.action.sources'],
      input: question,
      prompt: {
        id: promptId,
        version: promptVersion,
        variables: {
          brand_name: brandName,
          personal_context: personalContext || MIRACARE_EMPTY_PERSONAL_CONTEXT,
          product_catalog: productCatalog || '[]',
          recent_chat: recentChat || MIRACARE_EMPTY_RECENT_CHAT,
          user_nickname: resolveMiraCareUserNickname(userNickname),
        },
      },
      store: false,
    }),
  });
  const data = (await response.json()) as OpenAIResponse;

  return { data, response };
}

function getMinuteBucket() {
  const now = new Date();
  now.setSeconds(0, 0);

  return now.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const authorization = req.headers.get('authorization') ?? '';
  const requestId = createRequestId();

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  if (!authorization.startsWith('Bearer ') || authorization.includes('sb_publishable_')) {
    return jsonResponse({ error: 'Missing authenticated user JWT.' }, 401);
  }

  const jwtPayload = parseJwtPayload(authorization);
  const userId = getUserId(jwtPayload);

  if (!userId) {
    return jsonResponse({ error: 'Unable to identify authenticated user.' }, 401);
  }

  const adminRequest = await resolveAdminRequest(jwtPayload, userId, authorization);

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  const apiBaseUrl = Deno.env.get('OPENAI_API_BASE_URL') ?? 'https://api.openai.com/v1';
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const embeddingApiBaseUrl = Deno.env.get('GEMINI_API_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta';

  try {
    const body = (await req.json()) as ChatRequest;
    const question = body.question?.trim();
    const resolvedRequestId = createRequestId(body.clientRequestId);
    const userNickname = body.userNickname?.trim() || Deno.env.get('DEFAULT_USER_NICKNAME') || DEFAULT_USER_NICKNAME;

    if (!question) {
      return jsonResponse({ error: 'Missing question.' }, 400);
    }

    const model = getMiraCareModelLabel();
    const preferredCategories = uniqueCategories(classifyRagIntent(question));
    const productRequestKind = classifyProductRequest(question);
    const healthMemoryConsent = await getLatestHealthMemoryConsent(userId, authorization);
    const consentGranted = healthMemoryConsent?.status === 'granted';
    const personalContextState = await fetchPersonalContext(userId, authorization, consentGranted);
    const rawConversationMessages = mergeConversationMessages(personalContextState.recentMessages, body.messages, { sanitize: false });
    const conversationMessages = sanitizeMessagesForModelContext(rawConversationMessages).slice(-12);
    const activeProductRequestKind = inferActiveProductRequestKind(rawConversationMessages, productRequestKind);
    const inferredIntent = inferHealthChatIntent(question, preferredCategories);
    const intent = inferredIntent === 'health_advice' && activeProductRequestKind !== 'none' ? 'product_recommendation' : inferredIntent;
    const identityContext = buildConversationIdentityContext({
      messages: rawConversationMessages,
      personalContextState,
      productRequestKind: activeProductRequestKind,
      question,
    });
    const contextAssessment = assessContext({
      identityContext,
      messages: rawConversationMessages,
      personalContextState,
      productRequestKind: activeProductRequestKind,
      question,
      userNickname,
    });
    const routerStartedAt = Date.now();
    const routerDecision = routeTurn({
      activeProductRequestKind,
      consentGranted,
      contextAssessment,
      intent,
      preferredCategories,
      question,
    });
    const routerLatencyMs = Date.now() - routerStartedAt;
    const personalContext = formatPersonalContext({
      agentMemory: personalContextState.agentMemory,
      consentGranted,
      healthFacts: personalContextState.healthFacts,
      recentMessages: personalContextState.recentMessages,
      rollingSummary: personalContextState.rollingSummary,
    });
    let timelineSessionId: string | null = null;
    let userTimelineMessageId: string | null = null;

    if (consentGranted) {
      timelineSessionId = await getOrCreateCompanionSession(userId, authorization, question);

      if (timelineSessionId) {
        userTimelineMessageId = await createTimelineMessage({
          authorization,
          content: question,
          role: 'user',
          routerRoutes: routerDecision.routes,
          sessionId: timelineSessionId,
          userId,
        });
      }
    }

    await insertRest(
      'api_process_logs',
      {
        user_id: userId,
        request_id: resolvedRequestId,
        event_name: 'chat_request_started',
        status: 'started',
        metadata: {
          backend_rag: true,
          health_memory_consent: consentGranted,
          intent,
          context_level: contextAssessment.level,
          context_mode: contextAssessment.mode,
          context_score: contextAssessment.score,
          personal_context_health_facts: personalContextState.healthFacts.length,
          personal_context_memories: personalContextState.agentMemory.length,
          personal_context_recent_messages: personalContextState.recentMessages.length,
          identity_has_known_no_recent_checkup: identityContext.hasKnownNoRecentCheckup,
          active_product_request_kind: activeProductRequestKind,
          product_request_kind: productRequestKind,
          question_chars: question.length,
          router_routes: routerDecision.routes,
          router_routes_rejected: routerDecision.routesRejected,
        },
      },
      authorization,
    );

    const usePlatformPrompt = Boolean(getMiraCarePromptId());
    const smallTalkAnswer = usePlatformPrompt ? null : createSmallTalkAnswer(question, userNickname);

    if (smallTalkAnswer) {
      const latencyMs = Date.now() - startedAt;

      if (timelineSessionId) {
        await createTimelineMessage({
          authorization,
          content: smallTalkAnswer,
          model,
          ragChunkIds: [],
          role: 'assistant',
          routerRoutes: routerDecision.routes,
          sessionId: timelineSessionId,
          userId,
        });
        await updateCompanionRollingSummary({ authorization, sessionId: timelineSessionId });
      }

      await insertRest(
        'ai_request_logs',
        {
          user_id: userId,
          request_id: resolvedRequestId,
          model,
          mode: 'supabase-edge-function',
          status: 'success',
          finish_reason: 'small_talk_shortcut',
          latency_ms: latencyMs,
          question_chars: question.length,
          answer_chars: smallTalkAnswer.length,
          metadata: {
            shortcut: 'small_talk',
          },
        },
        authorization,
      );

      await insertRest(
        'api_process_logs',
        {
          user_id: userId,
          request_id: resolvedRequestId,
          event_name: 'chat_request_completed',
          status: 'success',
          latency_ms: latencyMs,
          metadata: {
            answer_chars: smallTalkAnswer.length,
            finish_reason: 'small_talk_shortcut',
            rag_count: 0,
          },
        },
        authorization,
      );

      return jsonResponse({
        finishReason: 'small_talk_shortcut',
        intent: 'small_talk',
        latencyMs,
        memoryWrites: [],
        mode: 'supabase-edge-function',
        model,
        nextActions: [],
          promptVersion: null,
          ragMatches: [],
          requestId: resolvedRequestId,
          routerMeta: {
            cacheHit: false,
            latencyMs: {
              router: routerLatencyMs,
              total: latencyMs,
            },
            reasons: routerDecision.reasons,
            routes: routerDecision.routes,
            routesRejected: routerDecision.routesRejected,
            stage: routerDecision.stage,
          },
          searchSources: [],
          contextAssessment: toPublicContextAssessment(contextAssessment),
          text: smallTalkAnswer,
          uiCards: [],
      });
    }

    const contextQuestionAnswer =
      !usePlatformPrompt &&
      activeProductRequestKind === 'broad' &&
      contextAssessment.mode === 'ask_context' &&
      contextAssessment.nextQuestion &&
      !hasBlockedConversationStyle(contextAssessment.nextQuestion)
        ? contextAssessment.nextQuestion
        : null;

    if (contextQuestionAnswer) {
      const latencyMs = Date.now() - startedAt;
      const contextScoreId = await saveUserContextScore({
        assessment: contextAssessment,
        authorization,
        consentGranted,
        consentId: healthMemoryConsent?.id,
        productRequestKind: activeProductRequestKind,
        sourceMessageId: userTimelineMessageId,
        userId,
      });
      let assistantTimelineMessageId: string | null = null;

      if (timelineSessionId) {
        assistantTimelineMessageId = await createTimelineMessage({
          authorization,
          content: contextQuestionAnswer,
          model,
          ragChunkIds: [],
          role: 'assistant',
          routerRoutes: routerDecision.routes,
          sessionId: timelineSessionId,
          userId,
        });
        await updateCompanionRollingSummary({ authorization, sessionId: timelineSessionId });
      }

      await insertRetrievalLog({
        authorization,
        cacheHit: false,
        contextAssessment,
        intent,
        messageId: assistantTimelineMessageId,
        ragMatches: [],
        requestId: resolvedRequestId,
        routerDecision,
        routerLatencyMs,
        sessionId: timelineSessionId,
        totalLatencyMs: latencyMs,
        userId,
        webSearchMatches: [],
      });

      await insertRest(
        'ai_request_logs',
        {
          user_id: userId,
          request_id: resolvedRequestId,
          model,
          mode: 'supabase-edge-function',
          status: 'success',
          finish_reason: 'context_question_shortcut',
          latency_ms: latencyMs,
          prompt_version_id: null,
          question_chars: question.length,
          answer_chars: contextQuestionAnswer.length,
          metadata: {
            active_product_request_kind: activeProductRequestKind,
            context_level: contextAssessment.level,
            context_mode: contextAssessment.mode,
            context_score: contextAssessment.score,
            context_score_id: contextScoreId,
            intent,
            shortcut: 'context_question',
            ui_card_types: [],
          },
        },
        authorization,
      );

      await insertRest(
        'api_process_logs',
        {
          user_id: userId,
          request_id: resolvedRequestId,
          event_name: 'chat_request_completed',
          status: 'success',
          latency_ms: latencyMs,
          metadata: {
            answer_chars: contextQuestionAnswer.length,
            context_level: contextAssessment.level,
            context_mode: contextAssessment.mode,
            context_score: contextAssessment.score,
            finish_reason: 'context_question_shortcut',
            intent,
            rag_count: 0,
            router_routes: routerDecision.routes,
            router_routes_rejected: routerDecision.routesRejected,
            shortcut: 'context_question',
            ui_card_count: 0,
            web_search_count: 0,
          },
        },
        authorization,
      );

      return jsonResponse({
        contextAssessment: toPublicContextAssessment(contextAssessment),
        finishReason: 'context_question_shortcut',
        intent,
        latencyMs,
        memoryWrites: [],
        mode: 'supabase-edge-function',
        model,
        nextActions: [],
        promptVersion: null,
        ragMatches: [],
        requestId: resolvedRequestId,
        routerMeta: {
          cacheHit: false,
          latencyMs: {
            router: routerLatencyMs,
            total: latencyMs,
          },
          reasons: routerDecision.reasons,
          routes: routerDecision.routes,
          routesRejected: routerDecision.routesRejected,
          stage: routerDecision.stage,
        },
        searchSources: [],
        text: contextQuestionAnswer,
        uiCards: [],
      });
    }

    if (!openaiApiKey) {
      await insertRest(
        'api_process_logs',
        {
          user_id: userId,
          request_id: resolvedRequestId,
          event_name: 'openai_secret_check',
          status: 'error',
          error_message: 'Missing OPENAI_API_KEY Edge Function secret.',
        },
        authorization,
      );
      return jsonResponse({ error: 'Missing OPENAI_API_KEY Edge Function secret.', requestId: resolvedRequestId }, 500);
    }

    const rateLimit = getNumberEnv('OPENAI_RATE_LIMIT_PER_MINUTE', 30);
    const rateResult = await callRpc<{ allowed: boolean; request_count: number }[]>(
      'increment_ai_rate_limit',
      {
        p_bucket_start: getMinuteBucket(),
        p_limit: rateLimit,
        p_user_id: userId,
      },
      authorization,
    );
    const rateStatus = rateResult?.[0];

    if (rateStatus && !rateStatus.allowed) {
      await insertRest(
        'api_process_logs',
        {
          user_id: userId,
          request_id: resolvedRequestId,
          event_name: 'rate_limit',
          status: 'blocked',
          metadata: {
            limit: rateLimit,
            request_count: rateStatus.request_count,
          },
        },
        authorization,
      );
      return jsonResponse(
        {
          error: 'Rate limit exceeded. Please try again shortly.',
          requestId: resolvedRequestId,
        },
        429,
      );
    }

    const routedCategories = categoriesForRouterRoutes(routerDecision.routes, preferredCategories);
    const shouldRetrieveInternalRag = false;
    let retrievalMode: 'keyword' | 'skipped' | 'vector' = shouldRetrieveInternalRag ? 'vector' : 'skipped';
    let embeddingErrorMessage: string | null = null;
    let ragMatches: RagMatch[] = [];

    if (shouldRetrieveInternalRag && geminiApiKey) {
      try {
        ragMatches = await retrieveVectorRagContext({
          apiBaseUrl: embeddingApiBaseUrl,
          authorization,
          geminiApiKey,
          limit: DEFAULT_LIMIT,
          preferredCategories: routedCategories,
          question,
        });
      } catch (embeddingError) {
        embeddingErrorMessage = embeddingError instanceof Error ? embeddingError.message : 'Vector retrieval failed.';
      }
    } else if (shouldRetrieveInternalRag) {
      embeddingErrorMessage = 'Missing GEMINI_API_KEY for vector retrieval; using keyword fallback.';
    }

    let chunks: RagChunk[] = [];

    if (shouldRetrieveInternalRag && ragMatches.length === 0) {
      retrievalMode = 'keyword';
      chunks = await fetchApprovedRagChunks(authorization);
      ragMatches = retrieveRagContext(question, chunks, DEFAULT_LIMIT, routedCategories);
    }

    const ragContext = formatRagContext(ragMatches);
    const ragStatus = !shouldRetrieveInternalRag ? 'skipped' : ragMatches.length > 0 ? 'success' : chunks === localFallbackKnowledge ? 'fallback' : 'empty';
    const productRows = await fetchActiveHospitalProducts(authorization, 50);
    const products = productRows.map((product) => toChatProductCard(product, 'Matched from hospital product portal'));
    const productCatalog = formatProductCatalog(productRows);
    const brandName = resolveMiraCareBrandName(productRows);
    const recentChat = formatRecentChat(conversationMessages, question);

    await insertRest(
      'rag_retrieval_logs',
      {
        user_id: userId,
        request_id: resolvedRequestId,
        query_preview: question.slice(0, 240),
        matched_chunk_ids: ragMatches.map((match) => match.id),
        matched_categories: uniqueCategories(ragMatches.map((match) => match.category)),
        context_chars: ragContext.length,
        status: ragStatus,
        metadata: {
          backend_rag: true,
          embedding_error: embeddingErrorMessage,
          intent,
          context_level: contextAssessment.level,
          context_mode: contextAssessment.mode,
          context_score: contextAssessment.score,
          product_catalog_count: products.length,
          active_product_request_kind: activeProductRequestKind,
          product_request_kind: productRequestKind,
          retrieval_mode: retrievalMode,
          routed_categories: routedCategories,
          router_routes: routerDecision.routes,
          router_routes_rejected: routerDecision.routesRejected,
          scores: ragMatches.map((match) => ({ id: match.id, score: match.score })),
        },
      },
      authorization,
    );

    const platformPrompt = {
      id: getMiraCarePromptId(),
      versionKey: `platform-v${getMiraCarePromptVersion()}`,
    };

    await insertRest(
      'ai_request_logs',
      {
        user_id: userId,
        request_id: resolvedRequestId,
        model,
        mode: 'supabase-edge-function',
        status: 'started',
        prompt_version_id: null,
        question_chars: question.length,
        metadata: {
          active_product_request_kind: activeProductRequestKind,
          brand_name: brandName,
          context_level: contextAssessment.level,
          context_mode: contextAssessment.mode,
          context_score: contextAssessment.score,
          health_memory_consent: consentGranted,
          intent,
          personal_context_health_facts: personalContextState.healthFacts.length,
          personal_context_memories: personalContextState.agentMemory.length,
          personal_context_recent_messages: personalContextState.recentMessages.length,
          identity_has_any_personal_context: identityContext.hasAnyPersonalContext,
          identity_has_known_no_recent_checkup: identityContext.hasKnownNoRecentCheckup,
          openai_prompt_id: platformPrompt.id,
          openai_prompt_version: platformPrompt.versionKey,
          product_catalog_count: productRows.length,
          rag_chunk_ids: ragMatches.map((match) => match.id),
          rag_retrieval_mode: retrievalMode,
          rate_limit_count: rateStatus?.request_count,
          router_routes: routerDecision.routes,
          router_routes_rejected: routerDecision.routesRejected,
        },
      },
      authorization,
    );

    const { data, response: openaiResponse } = await generateOpenAIResponse({
      apiBaseUrl,
      brandName,
      openaiApiKey,
      personalContext,
      productCatalog,
      question,
      recentChat,
      userNickname,
    });

    if (!openaiResponse.ok) {
      await insertRest(
        'ai_request_logs',
        {
          user_id: userId,
          request_id: resolvedRequestId,
          model,
          mode: 'supabase-edge-function',
          status: 'error',
          prompt_version_id: null,
          question_chars: question.length,
          error_message: data.error?.message ?? 'OpenAI request failed.',
          metadata: {
            openai_prompt_id: platformPrompt.id,
            openai_prompt_version: platformPrompt.versionKey,
          },
        },
        authorization,
      );
      return jsonResponse({ error: data.error?.message ?? 'OpenAI request failed.', requestId: resolvedRequestId }, openaiResponse.status);
    }

    const text = getOpenAIText(data);
    const { productIds, text: markerStrippedText } = parseProductMarker(text);
    const { uiCards: productUiCards, unknownProductIds } = buildProductUiCardsFromMarker(productIds, products);
    const finalText = markerStrippedText || text.trim();
    const finalFinishReason = getFinishReason(data);
    const promptLeakDetected = looksLikePromptLeak(finalText);

    const latencyMs = Date.now() - startedAt;
    const webSearchMatches = extractWebSearchMatches(data);
    const searchSources = uniqueWebSearchSources(webSearchMatches);
    const memoryCandidates = extractAgentMemoryCandidates(question);
    const memoryWrites = await saveAgentMemoryWrites({
      authorization,
      consentGranted,
      memories: memoryCandidates,
      sourceMessageId: userTimelineMessageId,
      userId,
    });
    const contextScoreId = await saveUserContextScore({
      assessment: contextAssessment,
      authorization,
      consentGranted,
      consentId: healthMemoryConsent?.id,
      productRequestKind: activeProductRequestKind,
      sourceMessageId: userTimelineMessageId,
      userId,
    });
    const productNextActions =
      productUiCards.length > 0
        ? [
            {
              label: '\u0e14\u0e39\u0e41\u0e1e\u0e47\u0e01\u0e40\u0e01\u0e08',
              payload: { count: productUiCards.flatMap((card) => (card.type === 'product_grid' ? card.products : [])).length },
              type: 'show_products' as const,
            },
          ]
        : [];
    const uiCards: ChatUiCard[] = [
      ...productUiCards,
      ...(memoryWrites.some((memory) => memory.status === 'saved')
        ? [
            {
              count: memoryWrites.filter((memory) => memory.status === 'saved').length,
              id: `memory-saved-${Date.now()}`,
              summaries: memoryWrites.filter((memory) => memory.status === 'saved').map((memory) => memory.summary),
              type: 'memory_saved' as const,
            },
          ]
        : []),
    ];

    let assistantTimelineMessageId: string | null = null;

    if (timelineSessionId) {
      assistantTimelineMessageId = await createTimelineMessage({
        authorization,
        content: finalText,
        model,
        ragChunkIds: ragMatches.map((match) => match.id),
        role: 'assistant',
        routerRoutes: routerDecision.routes,
        sessionId: timelineSessionId,
        userId,
      });
      await updateCompanionRollingSummary({ authorization, sessionId: timelineSessionId });
    }

    await insertRetrievalLog({
      authorization,
      cacheHit: false,
      contextAssessment,
      intent,
      messageId: assistantTimelineMessageId,
      ragMatches,
      requestId: resolvedRequestId,
      routerDecision,
      routerLatencyMs,
      sessionId: timelineSessionId,
      totalLatencyMs: latencyMs,
      userId,
      webSearchMatches,
    });

    await insertRest(
      'ai_request_logs',
      {
        user_id: userId,
        request_id: resolvedRequestId,
        model,
        mode: 'supabase-edge-function',
        status: 'success',
        finish_reason: finalFinishReason,
        latency_ms: latencyMs,
        prompt_version_id: null,
        question_chars: question.length,
        answer_chars: finalText.length,
        metadata: {
          context_level: contextAssessment.level,
          context_mode: contextAssessment.mode,
          context_score: contextAssessment.score,
          context_score_id: contextScoreId,
          intent,
          memory_write_count: memoryWrites.filter((memory) => memory.status === 'saved').length,
          openai_prompt_id: platformPrompt.id,
          openai_prompt_version: platformPrompt.versionKey,
          product_catalog_count: productRows.length,
          product_marker_ids: productIds,
          prompt_leak_detected: promptLeakDetected,
          rag_chunk_ids: ragMatches.map((match) => match.id),
          rag_retrieval_mode: retrievalMode,
          router_routes: routerDecision.routes,
          router_routes_rejected: routerDecision.routesRejected,
          ui_card_types: uiCards.map((card) => card.type),
          unknown_product_ids: unknownProductIds,
          web_search_sources: searchSources,
        },
      },
      authorization,
    );

    await insertRest(
      'api_process_logs',
      {
        user_id: userId,
        request_id: resolvedRequestId,
        event_name: 'chat_request_completed',
        status: 'success',
        latency_ms: latencyMs,
        metadata: {
          answer_chars: finalText.length,
          finish_reason: finalFinishReason,
          context_level: contextAssessment.level,
          context_mode: contextAssessment.mode,
          context_score: contextAssessment.score,
          intent,
          memory_write_count: memoryWrites.filter((memory) => memory.status === 'saved').length,
          openai_prompt_id: platformPrompt.id,
          openai_prompt_version: platformPrompt.versionKey,
          product_marker_ids: productIds,
          prompt_leak_detected: promptLeakDetected,
          rag_count: ragMatches.length,
          router_routes: routerDecision.routes,
          router_routes_rejected: routerDecision.routesRejected,
          ui_card_count: uiCards.length,
          unknown_product_ids: unknownProductIds,
          web_search_count: webSearchMatches.length,
        },
      },
      authorization,
    );

    return jsonResponse({
      contextAssessment: toPublicContextAssessment(contextAssessment),
      finishReason: finalFinishReason,
      intent,
      latencyMs,
      memoryWrites,
      mode: 'supabase-edge-function',
      model,
      nextActions: productNextActions,
      promptVersion: platformPrompt,
      ragMatches: [...ragMatches.map(toPublicRagMatch), ...webSearchMatches],
      requestId: resolvedRequestId,
      routerMeta: {
        cacheHit: false,
        latencyMs: {
          router: routerLatencyMs,
          total: latencyMs,
        },
        reasons: routerDecision.reasons,
        routes: routerDecision.routes,
        routesRejected: routerDecision.routesRejected,
        stage: routerDecision.stage,
      },
      searchSources,
      text: finalText,
      uiCards,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected OpenAI proxy error.';
    const payload = parseJwtPayload(authorization);
    const userId = getUserId(payload);

    if (userId) {
      await insertRest(
        'api_process_logs',
        {
          user_id: userId,
          request_id: requestId,
          event_name: 'chat_request_unhandled_error',
          status: 'error',
          latency_ms: Date.now() - startedAt,
          error_message: message,
        },
        authorization,
      );
    }

    return jsonResponse({ error: message, requestId }, 500);
  }
});
