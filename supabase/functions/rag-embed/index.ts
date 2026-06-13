declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type RagEmbedRequest = {
  chunkId?: string;
};

type RagChunkRow = {
  category: string;
  content: string;
  id: string;
  is_active: boolean;
  keywords: string[] | null;
  review_status: string | null;
  source: string | null;
  source_type: string | null;
  source_url: string | null;
  summary: string | null;
  title: string;
  topic: string | null;
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
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

function normalizeModelName(model: string) {
  return model.replace(/^models\//, '').trim();
}

function modelResource(model: string) {
  const normalized = normalizeModelName(model);

  return `models/${normalized}`;
}

function buildEmbeddingText(chunk: RagChunkRow) {
  return [
    `Title: ${chunk.title}`,
    `Category: ${chunk.category}`,
    chunk.topic ? `Topic: ${chunk.topic}` : '',
    chunk.summary ? `Summary: ${chunk.summary}` : '',
    `Content: ${chunk.content}`,
    chunk.keywords?.length ? `Keywords: ${chunk.keywords.join(', ')}` : '',
    chunk.source ? `Source: ${chunk.source}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatEmbeddingInput(model: string, text: string, title: string) {
  if (normalizeModelName(model) === 'gemini-embedding-2') {
    return `title: ${title || 'none'} | text: ${text}`;
  }

  return text;
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function normalizeEmbeddingDimensions(values: number[]) {
  if (values.length < EMBEDDING_DIMENSIONS) {
    throw new Error(`Gemini embedding returned ${values.length} dimensions, expected at least ${EMBEDDING_DIMENSIONS}.`);
  }

  const adjustedValues = values.length === EMBEDDING_DIMENSIONS ? values : values.slice(0, EMBEDDING_DIMENSIONS);
  const magnitude = Math.sqrt(adjustedValues.reduce((sum, value) => sum + value * value, 0));

  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return adjustedValues;
  }

  return adjustedValues.map((value) => value / magnitude);
}

async function fetchRagChunk(chunkId: string, authorization: string): Promise<RagChunkRow | null> {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  const select = [
    'id',
    'title',
    'category',
    'topic',
    'summary',
    'content',
    'keywords',
    'source',
    'source_url',
    'source_type',
    'is_active',
    'review_status',
  ].join(',');
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/rag_chunks?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(chunkId)}&limit=1`,
    { headers: restHeaders(authorization) },
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as RagChunkRow[];

  return rows[0] ?? null;
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
    const errorText = await response.text();

    throw new Error(errorText || `RPC ${functionName} failed.`);
  }

  return (await response.json()) as T;
}

async function markEmbeddingError(chunkId: string, message: string, authorization: string) {
  try {
    await callRpc(
      'mark_hospital_product_rag_embedding_error',
      {
        p_chunk_id: chunkId,
        p_error: message,
      },
      authorization,
    );
  } catch {
    // Keep the original embedding failure as the response error.
  }
}

async function generateEmbedding({
  apiBaseUrl,
  geminiApiKey,
  model,
  text,
  title,
}: {
  apiBaseUrl: string;
  geminiApiKey: string;
  model: string;
  text: string;
  title: string;
}) {
  const normalizedModel = normalizeModelName(model);
  const response = await fetch(`${apiBaseUrl}/${modelResource(normalizedModel)}:embedContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiApiKey,
    },
    body: JSON.stringify({
      model: modelResource(normalizedModel),
      content: {
        parts: [{ text: formatEmbeddingInput(normalizedModel, text, title) }],
      },
      output_dimensionality: EMBEDDING_DIMENSIONS,
      ...(normalizedModel === 'gemini-embedding-2' ? {} : { taskType: 'RETRIEVAL_DOCUMENT' }),
    }),
  });
  const data = (await response.json()) as GeminiEmbeddingResponse;

  if (!response.ok || !data.embedding?.values?.length) {
    throw new Error(data.error?.message ?? 'Gemini embedding request failed.');
  }

  return {
    model: normalizedModel,
    usageMetadata: data.usageMetadata,
    values: normalizeEmbeddingDimensions(data.embedding.values),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const authorization = req.headers.get('authorization') ?? '';

  if (!authorization.startsWith('Bearer ') || authorization.includes('sb_publishable_')) {
    return jsonResponse({ error: 'Missing authenticated user JWT.' }, 401);
  }

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const apiBaseUrl = Deno.env.get('GEMINI_API_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta';
  const embeddingModel = Deno.env.get('GEMINI_EMBEDDING_MODEL') ?? DEFAULT_EMBEDDING_MODEL;

  if (!geminiApiKey) {
    return jsonResponse({ error: 'Missing GEMINI_API_KEY Edge Function secret.' }, 500);
  }

  let chunkId = '';

  try {
    const body = (await req.json()) as RagEmbedRequest;
    chunkId = body.chunkId?.trim() ?? '';

    if (!chunkId) {
      return jsonResponse({ error: 'Missing chunkId.' }, 400);
    }

    const chunk = await fetchRagChunk(chunkId, authorization);

    if (!chunk) {
      return jsonResponse({ error: 'RAG chunk not found or not readable.' }, 404);
    }

    if (chunk.category !== 'marketplace.product') {
      return jsonResponse({ error: 'Only marketplace.product chunks can be embedded from this product RAG endpoint.' }, 403);
    }

    if (!chunk.is_active || chunk.review_status !== 'approved') {
      return jsonResponse({ error: 'Product RAG must be approved and active before embedding.', status: 'skipped' }, 409);
    }

    const embedding = await generateEmbedding({
      apiBaseUrl,
      geminiApiKey,
      model: embeddingModel,
      text: buildEmbeddingText(chunk),
      title: chunk.title,
    });

    await callRpc(
      'update_rag_chunk_embedding',
      {
        p_chunk_id: chunk.id,
        p_embedding: vectorLiteral(embedding.values),
        p_embedding_dimensions: EMBEDDING_DIMENSIONS,
        p_embedding_model: embedding.model,
      },
      authorization,
    );

    return jsonResponse({
      chunkId: chunk.id,
      dimensions: EMBEDDING_DIMENSIONS,
      model: embedding.model,
      promptTokens: embedding.usageMetadata?.promptTokenCount ?? null,
      status: 'embedded',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected embedding error.';

    if (chunkId) {
      await markEmbeddingError(chunkId, message, authorization);
    }

    return jsonResponse(
      {
        error: message,
        status: 'error',
      },
      500,
    );
  }
});
