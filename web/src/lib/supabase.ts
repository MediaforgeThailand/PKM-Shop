import { createClient } from '@supabase/supabase-js';

// Fall back to the PKM project URL + a placeholder key so the app always renders even before
// env is configured (e.g. a preview build). Set VITE_SUPABASE_ANON_KEY for real auth/data.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://yonnvlhgwdxkuirhdfaz.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'anon-key-not-set';

export const TENANT_SLUG = (import.meta.env.VITE_TENANT_SLUG as string) || 'pkm-shop';

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
