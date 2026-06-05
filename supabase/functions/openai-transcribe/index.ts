declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type TranscriptionRequest = {
  audioBase64?: string;
  fileName?: string;
  language?: string;
  mimeType?: string;
  prompt?: string;
};

type OpenAITranscriptionResponse = {
  error?: {
    message?: string;
  };
  text?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}

function decodeBase64(base64: string) {
  const normalized = base64.includes(',') ? base64.split(',').pop() ?? '' : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    return jsonResponse({ error: 'Missing OPENAI_API_KEY secret for OpenAI transcription.' }, 500);
  }

  let body: TranscriptionRequest;

  try {
    body = (await req.json()) as TranscriptionRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const audioBase64 = body.audioBase64?.trim();

  if (!audioBase64) {
    return jsonResponse({ error: 'Missing audioBase64.' }, 400);
  }

  const mimeType = body.mimeType?.trim() || 'audio/webm';
  const fileName = body.fileName?.trim() || 'mira-voice.webm';
  const model = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'gpt-4o-mini-transcribe';
  const startedAt = Date.now();

  try {
    const audioBytes = decodeBase64(audioBase64);
    const formData = new FormData();
    formData.append('file', new File([audioBytes], fileName, { type: mimeType }));
    formData.append('model', model);
    formData.append('response_format', 'json');

    if (body.language?.trim()) {
      formData.append('language', body.language.trim());
    }

    if (body.prompt?.trim()) {
      formData.append('prompt', body.prompt.trim());
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      body: formData,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      method: 'POST',
    });
    const data = (await response.json()) as OpenAITranscriptionResponse;

    if (!response.ok) {
      return jsonResponse({ error: data.error?.message ?? 'OpenAI transcription failed.' }, response.status);
    }

    const text = String(data.text ?? '').trim();

    if (!text) {
      return jsonResponse({ error: 'OpenAI returned an empty transcript.' }, 502);
    }

    return jsonResponse({
      durationMs: Date.now() - startedAt,
      model,
      text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected transcription error.';
    return jsonResponse({ error: message }, 500);
  }
});
