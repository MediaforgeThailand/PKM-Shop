import { HttpError } from './http.ts';

// PKM-Shop reuses the MiraCare OpenAI Responses-API contract UNCHANGED (AGENTS.md §2):
// prompt referenced by id only, exactly five variables, store:false. Only the published
// prompt id differs — it comes from PKM_PROMPT_ID (owner-published goods-selling prompt),
// falling back to MIRACARE_PROMPT_ID for compatibility. The owner publishes the prompt.

type RuntimeDeno = {
  env: {
    get: (key: string) => string | undefined;
  };
};

type OpenAIOutputContent = {
  text?: string;
  type?: string;
};

type OpenAIOutputItem = {
  content?: OpenAIOutputContent[];
  id?: string;
  type?: string;
};

type OpenAIResponse = {
  error?: {
    message?: string;
  };
  id?: string;
  output?: OpenAIOutputItem[];
  output_text?: string;
};

function readEnv(key: string) {
  const runtime = globalThis as typeof globalThis & { Deno?: RuntimeDeno };

  return runtime.Deno?.env.get(key);
}

function envOrDefault(key: string, fallback: string) {
  return readEnv(key)?.trim() || fallback;
}

function requireOpenAIKey() {
  const apiKey = readEnv('OPENAI_API_KEY')?.trim();

  if (!apiKey) {
    throw new HttpError('UPSTREAM', 'Missing OPENAI_API_KEY.', 500);
  }

  return apiKey;
}

function requirePromptId() {
  const promptId = readEnv('PKM_PROMPT_ID')?.trim() || readEnv('MIRACARE_PROMPT_ID')?.trim();

  if (!promptId) {
    throw new HttpError('UPSTREAM', 'Missing PKM_PROMPT_ID (owner-published sales prompt).', 500);
  }

  return promptId;
}

function extractText(data: OpenAIResponse) {
  if (data.output_text?.trim()) {
    return data.output_text.trim();
  }

  const contentText = data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((text) => text?.trim());

  return contentText?.trim() ?? '';
}

async function postResponses(body: Record<string, unknown>, timeoutMs: number) {
  const apiKey = requireOpenAIKey();
  const apiBaseUrl = envOrDefault('OPENAI_API_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}/responses`, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: controller.signal,
    });
    const payload = (await response.json()) as OpenAIResponse;

    if (!response.ok || payload.error) {
      const status = response.ok || response.status >= 500 ? 502 : response.status;

      throw new HttpError('UPSTREAM', payload.error?.message ?? `OpenAI request failed with ${response.status}.`, status);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callMiraPrompt(
  vars: {
    brand_name: string;
    personal_context: string;
    product_catalog: string;
    recent_chat: string;
    user_nickname: string;
  },
  input: string,
) {
  const promptId = requirePromptId();
  const promptVersion = readEnv('MIRA_PROMPT_VERSION')?.trim();
  const timeoutMs = Number(envOrDefault('OPENAI_REQUEST_TIMEOUT_MS', '30000'));
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await postResponses(
        {
          input,
          prompt: {
            id: promptId,
            ...(promptVersion ? { version: promptVersion } : {}),
            variables: vars,
          },
          store: false,
        },
        timeoutMs,
      );
      const text = extractText(payload);

      if (!text) {
        throw new HttpError('UPSTREAM', 'OpenAI returned an empty response.', 502);
      }

      return {
        responseId: payload.id ?? null,
        text,
      };
    } catch (error) {
      lastError = error;

      if (error instanceof HttpError && error.status < 500 && error.status !== 429) {
        throw error;
      }

      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new HttpError('UPSTREAM', 'OpenAI request failed.', 502);
}
