import { HttpError } from './http.ts';
import {
  LAB_SUMMARY_DISCLAIMER_TH,
  SUPPORTED_LAB_TEST_CODES,
  formatLabCodeNormalizationTable,
  sanitizeLabSummary,
} from './lab.ts';
import type { FactKeyRow } from './types.ts';

export type LabVisionResult = {
  confidence: number;
  mapped_code: string | null;
  ref_high: number | null;
  ref_low: number | null;
  test_name_raw: string;
  unit: string | null;
  value: number | null;
};

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

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
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
      // Preserve 4xx vs 5xx so callers can decide whether a retry makes sense.
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
  const promptId = envOrDefault('MIRACARE_PROMPT_ID', 'pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021');
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

      // 4xx responses (bad request, invalid prompt id, quota) will not succeed on
      // retry — surface them immediately instead of doubling the failed call.
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

export async function callFactExtractor(message: string, registry: FactKeyRow[]) {
  const model = envOrDefault('FACT_MODEL', 'gpt-5-mini');
  const schema = {
    additionalProperties: false,
    properties: {
      facts: {
        items: {
          additionalProperties: false,
          properties: {
            confidence: {
              maximum: 1,
              minimum: 0,
              type: 'number',
            },
            key: {
              enum: registry.map((row) => row.key),
              type: 'string',
            },
            value: {
              type: 'string',
            },
          },
          required: ['key', 'value', 'confidence'],
          type: 'object',
        },
        type: 'array',
      },
    },
    required: ['facts'],
    type: 'object',
  };
  const payload = await postResponses(
    {
      input: [
        {
          content:
            'Extract personal health facts explicitly stated by the USER message (Thai). Output [] if none. Never infer beyond the text. Buddhist years -> subtract 543.',
          role: 'system',
        },
        {
          content: message,
          role: 'user',
        },
      ],
      model,
      store: false,
      text: {
        format: {
          name: 'mira_fact_extraction',
          schema,
          strict: true,
          type: 'json_schema',
        },
      },
    },
    30000,
  );
  const text = extractText(payload);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError('UPSTREAM', 'Fact extractor returned invalid JSON.', 502);
  }
}

export async function callOrderFieldExtractor(message: string) {
  const model = envOrDefault('FACT_MODEL', 'gpt-5-mini');
  const schema = {
    additionalProperties: false,
    properties: {
      buyer_age: {
        type: ['number', 'null'],
      },
      buyer_name: {
        type: ['string', 'null'],
      },
      buyer_phone: {
        type: ['string', 'null'],
      },
      confirmed: {
        type: 'boolean',
      },
      preferred_date: {
        type: ['string', 'null'],
      },
    },
    required: ['buyer_age', 'buyer_name', 'buyer_phone', 'confirmed', 'preferred_date'],
    type: 'object',
  };
  const payload = await postResponses(
    {
      input: [
        {
          content:
            'Extract only explicitly stated order form fields from the Thai user message. Do not infer. buyer_age must be a numeric age in years when explicit, otherwise null. preferred_date must be ISO YYYY-MM-DD when explicit enough, otherwise null. Set confirmed to true ONLY when the message simply approves or agrees that previously provided booking details are correct (e.g. "ใช่", "ถูกต้อง", "ยืนยัน", "โอเค") and provides no new details; otherwise false.',
          role: 'system',
        },
        {
          content: message,
          role: 'user',
        },
      ],
      model,
      store: false,
      text: {
        format: {
          name: 'mira_order_field_extraction',
          schema,
          strict: true,
          type: 'json_schema',
        },
      },
    },
    30000,
  );
  const text = extractText(payload);

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const buyerAge = typeof parsed.buyer_age === 'number' && Number.isInteger(parsed.buyer_age) && parsed.buyer_age >= 1 && parsed.buyer_age <= 120
      ? parsed.buyer_age
      : undefined;

    return {
      buyer_age: buyerAge,
      buyer_name: typeof parsed.buyer_name === 'string' && parsed.buyer_name.trim() ? parsed.buyer_name.trim() : undefined,
      buyer_phone: typeof parsed.buyer_phone === 'string' && parsed.buyer_phone.trim() ? parsed.buyer_phone.trim() : undefined,
      confirmed: parsed.confirmed === true,
      preferred_date:
        typeof parsed.preferred_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.preferred_date)
          ? parsed.preferred_date
          : undefined,
    };
  } catch {
    return {};
  }
}

export async function callLabVisionExtractor(bytes: Uint8Array, contentType: string) {
  const model = envOrDefault('VISION_MODEL', envOrDefault('FACT_MODEL', 'gpt-5-mini'));
  const normalizationTable = formatLabCodeNormalizationTable();
  const schema = {
    additionalProperties: false,
    properties: {
      results: {
        items: {
          additionalProperties: false,
          properties: {
            confidence: {
              maximum: 1,
              minimum: 0,
              type: 'number',
            },
            mapped_code: {
              enum: [...SUPPORTED_LAB_TEST_CODES, null],
            },
            ref_high: {
              type: ['number', 'null'],
            },
            ref_low: {
              type: ['number', 'null'],
            },
            test_name_raw: {
              type: 'string',
            },
            unit: {
              type: ['string', 'null'],
            },
            value: {
              type: ['number', 'null'],
            },
          },
          required: ['test_name_raw', 'mapped_code', 'value', 'unit', 'ref_low', 'ref_high', 'confidence'],
          type: 'object',
        },
        type: 'array',
      },
    },
    required: ['results'],
    type: 'object',
  };
  const imageUrl = `data:${contentType};base64,${bytesToBase64(bytes)}`;
  const payload = await postResponses(
    {
      input: [
        {
          content:
            `Extract lab result rows from Thai/English medical lab images. Return only values visible in the image. Do not infer values not visible. Use this normalization table for mapped_code:\n${normalizationTable}`,
          role: 'system',
        },
        {
          content: [
            {
              text: 'Read the attached lab report image. Use null mapped_code when the raw row does not explicitly match the normalization table.',
              type: 'input_text',
            },
            {
              image_url: imageUrl,
              type: 'input_image',
            },
          ],
          role: 'user',
        },
      ],
      model,
      store: false,
      text: {
        format: {
          name: 'mira_lab_result_extraction',
          schema,
          strict: true,
          type: 'json_schema',
        },
      },
    },
    45000,
  );
  const text = extractText(payload);

  try {
    const parsed = JSON.parse(text) as { results?: unknown };

    if (!Array.isArray(parsed.results)) {
      return [];
    }

    return parsed.results.filter((item): item is LabVisionResult => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const row = item as Record<string, unknown>;

      return typeof row.test_name_raw === 'string' && typeof row.confidence === 'number';
    });
  } catch {
    throw new HttpError('UPSTREAM', 'Lab extractor returned invalid JSON.', 502);
  }
}

export async function callLabSummary(results: LabVisionResult[]) {
  const model = envOrDefault('FACT_MODEL', 'gpt-5-mini');
  const payload = await postResponses(
    {
      input: [
        {
          content:
            `Write a plain Thai health-check summary in 3-5 sentences from the provided lab rows. Do not use the Thai word for diagnosis. Always include: "${LAB_SUMMARY_DISCLAIMER_TH}".`,
          role: 'system',
        },
        {
          content: JSON.stringify(results.slice(0, 30)),
          role: 'user',
        },
      ],
      model,
      store: false,
    },
    30000,
  );
  return sanitizeLabSummary(extractText(payload));
}
