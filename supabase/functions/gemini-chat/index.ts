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
  messages?: ChatMessage[];
  model?: string;
  question?: string;
  ragContext?: string;
};

type GeminiPart = {
  text: string;
};

type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: GeminiPart[];
    };
  }[];
  error?: {
    message?: string;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function createSystemInstruction(ragContext: string) {
  return `You are Mira, a healthcare marketplace assistant for Thailand.

Primary jobs:
- Help users understand checkup packages, booking steps, referral-code flow, and care navigation.
- Use the RAG context below when relevant. If context is missing, say what you do not know.
- Keep answers concise, warm, and practical.

Medical safety:
- Do not diagnose, prescribe, change medication, or replace a licensed medical professional.
- For urgent symptoms such as chest pain, difficulty breathing, sudden weakness, fainting, severe allergic reaction, heavy bleeding, or severe pain, advise urgent medical care immediately.
- Encourage users to verify preparation details with the hospital call center before an appointment.

RAG context:
${ragContext || 'No RAG context provided.'}`;
}

function toGeminiHistory(messages: ChatMessage[]) {
  return messages.slice(-8).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

function getGeminiText(data: GeminiResponse) {
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n').trim();

  if (!text) {
    throw new Error(data.error?.message ?? 'Gemini returned an empty response.');
  }

  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const apiBaseUrl = Deno.env.get('GEMINI_API_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta';

  if (!geminiApiKey) {
    return jsonResponse({ error: 'Missing GEMINI_API_KEY Edge Function secret.' }, 500);
  }

  try {
    const body = (await req.json()) as ChatRequest;
    const question = body.question?.trim();

    if (!question) {
      return jsonResponse({ error: 'Missing question.' }, 400);
    }

    const model = body.model?.trim() || Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash';
    const geminiResponse = await fetch(`${apiBaseUrl}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: createSystemInstruction(body.ragContext ?? '') }],
        },
        contents: [...toGeminiHistory(body.messages ?? []), { role: 'user', parts: [{ text: question }] }],
      }),
    });

    const data = (await geminiResponse.json()) as GeminiResponse;

    if (!geminiResponse.ok) {
      return jsonResponse({ error: data.error?.message ?? 'Gemini request failed.' }, geminiResponse.status);
    }

    return jsonResponse({ text: getGeminiText(data), model });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected Gemini proxy error.';
    return jsonResponse({ error: message }, 500);
  }
});
