import type { RagMatch } from '@/lib/rag/retriever';
import { supabase, supabaseConfigStatus } from '@/lib/supabase';
import type {
  ChatContextAssessment,
  ChatMemoryWrite,
  ChatNextAction,
  ChatRetrievalRoute,
  ChatRouterMeta,
  ChatSearchSource,
  ChatUiCard,
  HealthChatIntent,
} from './healthChatTypes';
import { createNaturalHealthFallbackAnswer } from './prototypeConversationPolicy';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: ChatSource[];
  uiCards?: ChatUiCard[];
};

export type ChatSource = Pick<RagMatch, 'category' | 'id' | 'riskLevel' | 'score' | 'source' | 'sourceUrl' | 'summary' | 'title' | 'topic'>;

export type PromptVersionInfo = {
  id: string;
  versionKey: string;
};

export type AskAiResult = {
  contextAssessment?: ChatContextAssessment;
  finishReason?: string;
  intent?: HealthChatIntent;
  latencyMs: number;
  memoryWrites: ChatMemoryWrite[];
  mode: 'external-proxy' | 'supabase-edge-function';
  model: string;
  nextActions: ChatNextAction[];
  promptVersion?: PromptVersionInfo | null;
  ragMatches: ChatSource[];
  requestId?: string;
  routerMeta?: ChatRouterMeta;
  searchSources: ChatSearchSource[];
  text: string;
  uiCards: ChatUiCard[];
};

const FALLBACK_USER_NICKNAME = '\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32';

export const DEFAULT_USER_NICKNAME = process.env.EXPO_PUBLIC_USER_NICKNAME?.trim() || FALLBACK_USER_NICKNAME;

export function formatUserDisplayName(userNickname = DEFAULT_USER_NICKNAME) {
  const nickname = userNickname.trim() || FALLBACK_USER_NICKNAME;

  return nickname.startsWith('คุณ') ? nickname : `คุณ${nickname}`;
}

export const aiChatConfig = {
  model: process.env.EXPO_PUBLIC_OPENAI_MODEL ?? 'gpt-5.5',
  proxyUrl: process.env.EXPO_PUBLIC_AI_PROXY_URL,
};

const hasExternalProxy = Boolean(aiChatConfig.proxyUrl);
const hasSupabaseProxy = supabaseConfigStatus.isConfigured;

export const aiChatConfigStatus = {
  model: aiChatConfig.model,
  hasProxy: hasExternalProxy || hasSupabaseProxy,
  hasSupabaseProxy,
  mode: hasExternalProxy ? 'external-proxy' : hasSupabaseProxy ? 'supabase-edge-function' : 'offline',
};

async function callProxy({
  messages,
  question,
}: {
  messages: ChatMessage[];
  question: string;
}): Promise<AskAiResult> {
  const startedAt = Date.now();
  const payload = {
    clientRequestId: `client-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    messages: messages.slice(-6).map(({ role, content }) => ({ role, content })),
    model: aiChatConfig.model,
    question,
    userNickname: DEFAULT_USER_NICKNAME,
  };

  if (!aiChatConfig.proxyUrl) {
    const { data, error } = await supabase.functions.invoke('mira-chat', {
      body: payload,
    });

    if (error) {
      throw new Error(error.message);
    }

    const text = String(data?.text ?? data?.answer ?? '').trim();

    if (!text) {
      throw new Error('AI proxy returned an empty response.');
    }

    return {
      contextAssessment: parseContextAssessment(data?.contextAssessment),
      finishReason: typeof data?.finishReason === 'string' ? data.finishReason : undefined,
      intent: parseIntent(data?.intent),
      latencyMs: Date.now() - startedAt,
      memoryWrites: parseMemoryWrites(data?.memoryWrites),
      mode: 'supabase-edge-function',
      model: String(data?.model ?? aiChatConfig.model),
      nextActions: parseNextActions(data?.nextActions),
      promptVersion: parsePromptVersion(data?.promptVersion),
      ragMatches: parseChatSources(data?.ragMatches),
      requestId: typeof data?.requestId === 'string' ? data.requestId : undefined,
      routerMeta: parseRouterMeta(data?.routerMeta),
      searchSources: parseSearchSources(data?.searchSources),
      text,
      uiCards: parseUiCards(data?.uiCards),
    };
  }

  const response = await fetch(aiChatConfig.proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? 'AI proxy request failed.');
  }

  const text = String(data.text ?? data.answer ?? '').trim();

  if (!text) {
    throw new Error('AI proxy returned an empty response.');
  }

  return {
    contextAssessment: parseContextAssessment(data?.contextAssessment),
    finishReason: typeof data?.finishReason === 'string' ? data.finishReason : undefined,
    intent: parseIntent(data?.intent),
    latencyMs: Date.now() - startedAt,
    memoryWrites: parseMemoryWrites(data?.memoryWrites),
    mode: 'external-proxy',
    model: String(data?.model ?? aiChatConfig.model),
    nextActions: parseNextActions(data?.nextActions),
    promptVersion: parsePromptVersion(data?.promptVersion),
    ragMatches: parseChatSources(data?.ragMatches),
    requestId: typeof data?.requestId === 'string' ? data.requestId : undefined,
    routerMeta: parseRouterMeta(data?.routerMeta),
    searchSources: parseSearchSources(data?.searchSources),
    text,
    uiCards: parseUiCards(data?.uiCards),
  };
}

function parseIntent(value: unknown): HealthChatIntent | undefined {
  const allowed: HealthChatIntent[] = [
    'booking',
    'checkout',
    'health_advice',
    'off_topic',
    'product_compare',
    'product_recommendation',
    'safety_escalation',
    'small_talk',
  ];

  return typeof value === 'string' && allowed.includes(value as HealthChatIntent) ? (value as HealthChatIntent) : undefined;
}

function parseContextAssessment(value: unknown): ChatContextAssessment | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const level = candidate.level;
  const mode = candidate.mode;
  const score = typeof candidate.score === 'number' ? Math.max(0, Math.min(100, candidate.score)) : undefined;

  if (
    score === undefined ||
    (level !== 'insufficient' && level !== 'partial' && level !== 'ready') ||
    (mode !== 'ask_context' && mode !== 'direct_product' && mode !== 'personalized_recommendation')
  ) {
    return undefined;
  }

  const toStringList = (input: unknown) => (Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : []);

  return {
    collectedSlots: toStringList(candidate.collectedSlots),
    confidence: typeof candidate.confidence === 'number' ? Math.max(0, Math.min(1, candidate.confidence)) : 0.7,
    level,
    missingSlots: toStringList(candidate.missingSlots),
    mode,
    nextQuestion: typeof candidate.nextQuestion === 'string' ? candidate.nextQuestion : null,
    purpose: 'health_package_recommendation',
    score,
  };
}

function parsePromptVersion(value: unknown): PromptVersionInfo | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id : '';
  const versionKey = typeof candidate.versionKey === 'string' ? candidate.versionKey : '';

  return id && versionKey ? { id, versionKey } : null;
}

function parseChatSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): ChatSource | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const source = item as Record<string, unknown>;
      const id = typeof source.id === 'string' ? source.id : '';
      const title = typeof source.title === 'string' ? source.title : '';
      const category = typeof source.category === 'string' ? source.category : '';
      const topic = typeof source.topic === 'string' ? source.topic : 'general';
      const summary = typeof source.summary === 'string' ? source.summary : '';

      if (!id || !title || !category) {
        return null;
      }

      return {
        category: category as ChatSource['category'],
        id,
        riskLevel: (typeof source.riskLevel === 'string' ? source.riskLevel : 'low') as ChatSource['riskLevel'],
        score: typeof source.score === 'number' ? source.score : 0,
        source: typeof source.source === 'string' ? source.source : 'RAG corpus',
        sourceUrl: typeof source.sourceUrl === 'string' ? source.sourceUrl : undefined,
        summary,
        title,
        topic,
      };
    })
    .filter((item): item is ChatSource => Boolean(item));
}

function parseSearchSources(value: unknown): ChatSearchSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): ChatSearchSource | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const source = item as Record<string, unknown>;
      const domain = typeof source.domain === 'string' ? source.domain : '';
      const title = typeof source.title === 'string' ? source.title : domain;
      const url = typeof source.url === 'string' ? source.url : '';

      if (!domain || !url) {
        return null;
      }

      return {
        domain,
        title,
        trustTier: typeof source.trustTier === 'number' ? source.trustTier : 3,
        url,
      };
    })
    .filter((item): item is ChatSearchSource => Boolean(item));
}

function parseRouterMeta(value: unknown): ChatRouterMeta | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const allowedRoutes: ChatRetrievalRoute[] = [
    'controlled_web_search',
    'emergency',
    'none',
    'personal_memory_deep',
    'policy_rag',
    'product_rag',
    'recent_chat',
  ];
  const routes = Array.isArray(candidate.routes)
    ? candidate.routes.filter((route): route is ChatRetrievalRoute => typeof route === 'string' && allowedRoutes.includes(route as ChatRetrievalRoute))
    : [];

  if (routes.length === 0) {
    return undefined;
  }

  const latency = candidate.latencyMs && typeof candidate.latencyMs === 'object' ? (candidate.latencyMs as Record<string, unknown>) : {};

  return {
    cacheHit: typeof candidate.cacheHit === 'boolean' ? candidate.cacheHit : undefined,
    latencyMs: {
      router: typeof latency.router === 'number' ? latency.router : undefined,
      total: typeof latency.total === 'number' ? latency.total : undefined,
    },
    reasons: parseStringRecord(candidate.reasons),
    routes,
    routesRejected: parseStringRecord(candidate.routesRejected),
    stage: candidate.stage === 'heuristic' || candidate.stage === 'llm' ? candidate.stage : undefined,
  };
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string');

  return entries.length ? Object.fromEntries(entries) : undefined;
}

export async function askAiWithRag({
  messages,
  question,
}: {
  messages: ChatMessage[];
  question: string;
}) {
  if (aiChatConfigStatus.hasProxy) {
    return callProxy({ messages, question });
  }
  throw new Error('Missing AI proxy. Configure Supabase or EXPO_PUBLIC_AI_PROXY_URL.');
}

function parseUiCards(value: unknown): ChatUiCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ChatUiCard => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return (
      candidate.type === 'product_grid' ||
      candidate.type === 'branch_location' ||
      candidate.type === 'checkout_draft' ||
      candidate.type === 'memory_saved'
    );
  });
}

function parseMemoryWrites(value: unknown): ChatMemoryWrite[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ChatMemoryWrite => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return typeof candidate.summary === 'string' && typeof candidate.memoryType === 'string';
  });
}

function parseNextActions(value: unknown): ChatNextAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ChatNextAction => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return typeof candidate.label === 'string' && typeof candidate.type === 'string';
  });
}

export function createSmallTalkAnswer(question: string, userNickname = DEFAULT_USER_NICKNAME) {
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

export function createOfflineRagAnswer(question: string, ragMatches: RagMatch[]) {
  const smallTalkAnswer = createSmallTalkAnswer(question);

  if (smallTalkAnswer) {
    return smallTalkAnswer;
  }

  return createNaturalHealthFallbackAnswer(question, { hasMatches: ragMatches.length > 0, userNickname: DEFAULT_USER_NICKNAME });
}
