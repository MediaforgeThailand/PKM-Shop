import { createClient } from '@supabase/supabase-js';

// Fall back to the PKM project URL + PUBLIC anon key so the app works even when the build-time
// env is empty (the Vercel project had empty VITE_ vars that overrode .env.production). The
// anon key is a public client key — safe to ship in the bundle. Override via env if needed.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://mrygwthvyzrkxghgjimh.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeWd3dGh2eXpya3hnaGdqaW1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMDg4NTMsImV4cCI6MjA5ODg4NDg1M30.lBa-3sRFau0pzbYsWXR-djyxR8pqyK9f7aG52w8UR2A';

export const TENANT_SLUG = (import.meta.env.VITE_TENANT_SLUG as string) || 'pkm-shop';

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
