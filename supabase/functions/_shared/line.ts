// PKM-Shop — LINE transport (signature verify, reply/push, profile, loading, text). Pure
// transport, vertical-agnostic; PKM Flex builders + postback parsing live in pkmLine.ts.
import { HttpError } from './http.ts';

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

export type LineTextMessage = {
  text: string;
  type: 'text';
};

export type LineFlexMessage = {
  altText: string;
  contents: Record<string, unknown>;
  type: 'flex';
};

export type LineImageMessage = {
  originalContentUrl: string;
  previewImageUrl: string;
  type: 'image';
};

export type LineMessage = LineFlexMessage | LineImageMessage | LineTextMessage;

function requireEnv(key: string) {
  const value = Deno.env.get(key)?.trim();

  if (!value) {
    throw new HttpError('UPSTREAM', `Missing ${key}.`, 500);
  }

  return value;
}

function getTenantEnv(baseKey: string, tenantSlug: string) {
  const directKey = `${baseKey}__${tenantSlug}`;
  const underscoreKey = `${baseKey}__${tenantSlug.replace(/-/g, '_')}`;

  return Deno.env.get(directKey)?.trim() || Deno.env.get(underscoreKey)?.trim();
}

export function requireTenantEnv(baseKey: string, tenantSlug: string) {
  return getTenantEnv(baseKey, tenantSlug) || requireEnv(baseKey);
}

export function requireLineChannelToken(tenantSlug: string) {
  const token =
    getTenantEnv('LINE_CHANNEL_TOKEN', tenantSlug) ||
    getTenantEnv('LINE_CHANNEL_ACCESS_TOKEN', tenantSlug) ||
    Deno.env.get('LINE_CHANNEL_TOKEN')?.trim() ||
    Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')?.trim();

  if (!token) {
    throw new HttpError('UPSTREAM', 'Missing LINE_CHANNEL_TOKEN.', 500);
  }

  return token;
}

function base64ToBytes(value: string) {
  let binary: string;

  try {
    binary = atob(value);
  } catch {
    throw new HttpError('VALIDATION', 'Invalid LINE signature.', 401);
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export async function verifyLineSignature(body: string, signature: string | null, tenantSlug: string) {
  const secret = requireTenantEnv('LINE_CHANNEL_SECRET', tenantSlug);

  if (!signature) {
    throw new HttpError('VALIDATION', 'Missing LINE signature.', 401);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['verify'],
  );
  const bodyBytes = new TextEncoder().encode(body);
  const signatureBytes = base64ToBytes(signature);
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, bodyBytes);

  if (!valid) {
    throw new HttpError('VALIDATION', 'Invalid LINE signature.', 401);
  }
}

export async function replyLineMessages(replyToken: string, messages: LineMessage[], tenantSlug: string) {
  const token = requireLineChannelToken(tenantSlug);
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    body: JSON.stringify({ messages, replyToken }),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new HttpError('UPSTREAM', `LINE reply failed with ${response.status}.`, 502);
  }
}

export async function pushLineMessages(tenantSlug: string, lineUserId: string, messages: LineMessage[]) {
  const token = requireLineChannelToken(tenantSlug);
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    body: JSON.stringify({ messages, to: lineUserId }),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new HttpError('UPSTREAM', `LINE push failed with ${response.status}.`, 502);
  }
}

export async function fetchLineProfile(
  tenantSlug: string,
  lineUserId: string,
): Promise<{ displayName: string; pictureUrl?: string } | null> {
  try {
    const token = requireLineChannelToken(tenantSlug);
    const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.warn('line_profile_failed', response.status);
      return null;
    }

    const data = (await response.json()) as { displayName?: string; pictureUrl?: string };

    return data?.displayName ? { displayName: data.displayName, pictureUrl: data.pictureUrl } : null;
  } catch (error) {
    console.warn('line_profile_error', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function startLineLoading(tenantSlug: string, lineUserId: string, seconds = 20) {
  const token = requireLineChannelToken(tenantSlug);
  const response = await fetch('https://api.line.me/v2/bot/chat/loading/start', {
    body: JSON.stringify({ chatId: lineUserId, loadingSeconds: seconds }),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    console.warn('line_loading_failed', response.status);
  }
}

export function textLineMessage(text: string): LineTextMessage {
  return { text: text.slice(0, 4500), type: 'text' };
}
