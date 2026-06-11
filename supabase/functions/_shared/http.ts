import { z } from 'zod';

import type { ApiEnvelope } from './types.ts';

export { z };

export const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

export class HttpError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function json<TData>(data: TData, status = 200) {
  const body: ApiEnvelope<TData> = {
    data,
    ok: true,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}

export function error(code: string, message: string, status = 400) {
  const body: ApiEnvelope<never> = {
    error: {
      code,
      message,
    },
    ok: false,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}

export async function validateJson<TSchema extends z.ZodType>(req: Request, schema: TSchema): Promise<z.infer<TSchema>> {
  let raw: unknown;

  try {
    raw = await req.json();
  } catch {
    throw new HttpError('VALIDATION', 'Invalid JSON body.', 400);
  }

  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    throw new HttpError('VALIDATION', parsed.error.issues.map((issue) => issue.message).join('; '), 400);
  }

  return parsed.data;
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return null;
}

export function toErrorResponse(cause: unknown) {
  if (cause instanceof HttpError) {
    return error(cause.code, cause.message, cause.status);
  }

  const message = cause instanceof Error ? cause.message : 'Unexpected server error.';

  return error('UPSTREAM', message, 500);
}
