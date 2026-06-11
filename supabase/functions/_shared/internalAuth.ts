import { HttpError } from './http.ts';

type RuntimeDeno = {
  env: {
    get: (key: string) => string | undefined;
  };
};

function readEnv(key: string) {
  const runtime = globalThis as typeof globalThis & { Deno?: RuntimeDeno };

  return runtime.Deno?.env.get(key);
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

export function assertInternalServiceRoleAuthorization(authorization: string | null) {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!serviceRoleKey) {
    throw new HttpError('UPSTREAM', 'Missing Supabase service configuration.', 500);
  }

  if (!constantTimeEqual(token, serviceRoleKey)) {
    throw new HttpError('VALIDATION', 'Internal service-role authorization required.', 401);
  }
}
