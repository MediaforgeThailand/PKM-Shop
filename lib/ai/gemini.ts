import { formatRagContext, type RagMatch } from '@/lib/rag/retriever';
import { supabase, supabaseConfigStatus } from '@/lib/supabase';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sources?: RagMatch[];
};

export const geminiConfig = {
  model: process.env.EXPO_PUBLIC_GEMINI_MODEL ?? 'gemini-3.5-flash',
  proxyUrl: process.env.EXPO_PUBLIC_AI_PROXY_URL,
};

const hasExternalProxy = Boolean(geminiConfig.proxyUrl);
const hasSupabaseProxy = supabaseConfigStatus.isConfigured;

export const geminiConfigStatus = {
  model: geminiConfig.model,
  hasProxy: hasExternalProxy || hasSupabaseProxy,
  hasSupabaseProxy,
  mode: hasExternalProxy ? 'external-proxy' : hasSupabaseProxy ? 'supabase-edge-function' : 'offline',
};

async function callProxy({
  messages,
  question,
  ragMatches,
}: {
  messages: ChatMessage[];
  question: string;
  ragMatches: RagMatch[];
}) {
  const payload = {
    messages,
    model: geminiConfig.model,
    question,
    ragContext: formatRagContext(ragMatches),
  };

  if (!geminiConfig.proxyUrl) {
    const { data, error } = await supabase.functions.invoke('gemini-chat', {
      body: payload,
    });

    if (error) {
      throw new Error(error.message);
    }

    const text = String(data?.text ?? data?.answer ?? '').trim();

    if (!text) {
      throw new Error('Gemini proxy returned an empty response.');
    }

    return text;
  }

  const response = await fetch(geminiConfig.proxyUrl, {
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

  return String(data.text ?? data.answer ?? '').trim();
}

export async function askGeminiWithRag({
  messages,
  question,
  ragMatches,
}: {
  messages: ChatMessage[];
  question: string;
  ragMatches: RagMatch[];
}) {
  if (geminiConfigStatus.hasProxy) {
    return callProxy({ messages, question, ragMatches });
  }
  throw new Error('Missing AI proxy. Configure Supabase or EXPO_PUBLIC_AI_PROXY_URL.');
}

export function createOfflineRagAnswer(question: string, ragMatches: RagMatch[]) {
  if (ragMatches.length === 0) {
    return `I found no matching RAG context for "${question}". Configure the Gemini proxy or expand the RAG corpus to answer this safely.`;
  }

  return [
    'The Gemini proxy is unavailable or not configured yet, so this is a local RAG preview.',
    '',
    ...ragMatches.map((match, index) => `${index + 1}. ${match.title}: ${match.content}`),
    '',
    'Configure Supabase Edge Function gemini-chat or EXPO_PUBLIC_AI_PROXY_URL to generate a real Gemini answer.',
  ].join('\n');
}
