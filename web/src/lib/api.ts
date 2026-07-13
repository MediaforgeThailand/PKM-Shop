import { supabase, TENANT_SLUG } from './supabase';

// Invoke a PKM edge function with the current user's JWT (supabase-js attaches it).
// tenant_slug is injected automatically. Throws on an { ok:false } envelope.
export async function invokeFn<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: { tenant_slug: TENANT_SLUG, ...body },
  });
  if (error) {
    throw new Error(error.message);
  }
  const envelope = data as { ok?: boolean; data?: T; error?: { message?: string } };
  if (envelope && envelope.ok === false) {
    throw new Error(envelope.error?.message ?? 'Request failed');
  }
  return (envelope?.data ?? envelope) as T;
}

// Upload a file to a private bucket via a signed upload URL minted server-side is ideal,
// but for staff (authenticated) we can upload directly through RLS-guarded storage.
export async function uploadToBucket(bucket: string, path: string, file: File): Promise<string> {
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
