import { supabase, TENANT_SLUG } from './supabase';

// Invoke a PKM edge function with the current user's JWT (supabase-js attaches it).
// tenant_slug is injected automatically. Throws on an { ok:false } envelope.
export async function invokeFn<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: { tenant_slug: TENANT_SLUG, ...body },
  });
  if (error) {
    // Surface the function's own error message (edge returns { ok:false, error:{message} }).
    const ctx = (error as { context?: { body?: unknown } }).context?.body;
    const msg = typeof ctx === 'string' ? safeErr(ctx) : null;
    throw new Error(msg ?? error.message);
  }
  const envelope = data as { ok?: boolean; data?: T; error?: { message?: string } };
  if (envelope && envelope.ok === false) {
    throw new Error(envelope.error?.message ?? 'ทำรายการไม่สำเร็จ');
  }
  return (envelope?.data ?? envelope) as T;
}

function safeErr(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed?.error?.message ?? null;
  } catch {
    return null;
  }
}

// Convenience wrapper for the catalog management function.
export async function catalogAction<T = unknown>(body: Record<string, unknown>): Promise<T> {
  return invokeFn<T>('catalog-action', body);
}

// Upload a file to a private bucket (staff, RLS-guarded storage). Used for packing / POD /
// check-in / payout / stock-in photos.
export async function uploadToBucket(bucket: string, path: string, file: File | Blob): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) {
    throw new Error(error.message);
  }
  return path;
}

export async function signedUrl(bucket: string, path: string, expires = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}

// Downscale a chosen photo in the browser to a sane size, returned as a base64 JPEG payload
// for catalog-action (product images). Keeps uploads small and avoids the admin-only
// product-images storage policy (the function writes with the service role).
export async function fileToImagePayload(
  file: File,
  maxDim = 1200,
  quality = 0.82,
): Promise<{ image_base64: string; content_type: 'image/jpeg' }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ไม่สามารถประมวลผลรูปได้');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return { image_base64: canvas.toDataURL('image/jpeg', quality), content_type: 'image/jpeg' };
}
