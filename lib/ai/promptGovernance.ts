import { supabase, supabaseConfigStatus } from '@/lib/supabase';

import type { User } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'hospital_staff' | 'user';

export type ActivePromptVersion = {
  activatedAt?: string | null;
  id: string;
  promptText: string;
  versionKey: string;
};

type AppRoleRow = {
  role: AppRole;
};

type PromptVersionRow = {
  activated_at: string | null;
  id: string;
  prompt_text: string;
  version_key: string;
};

function metadataRole(user: User | null): AppRole | null {
  const role =
    user?.app_metadata?.role ??
    user?.user_metadata?.role ??
    user?.app_metadata?.app_role ??
    user?.user_metadata?.app_role;

  return role === 'admin' || role === 'hospital_staff' || role === 'user' ? role : null;
}

export async function resolveAppRole(user: User | null): Promise<AppRole> {
  const roleFromToken = metadataRole(user);

  if (roleFromToken) {
    return roleFromToken;
  }

  if (!user || !supabaseConfigStatus.isConfigured) {
    return 'user';
  }

  const { data, error } = await supabase
    .from('app_user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    return 'user';
  }

  return (data as AppRoleRow).role;
}

export async function loadActivePromptVersion(): Promise<ActivePromptVersion | null> {
  if (!supabaseConfigStatus.isConfigured) {
    return null;
  }

  const { data, error } = await supabase
    .from('prompt_versions')
    .select('id,version_key,prompt_text,activated_at')
    .eq('status', 'active')
    .order('activated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as PromptVersionRow;

  return {
    activatedAt: row.activated_at,
    id: row.id,
    promptText: row.prompt_text,
    versionKey: row.version_key,
  };
}

export async function saveActivePromptVersion(promptText: string): Promise<ActivePromptVersion> {
  const normalizedPrompt = promptText.trim();

  if (!normalizedPrompt) {
    throw new Error('Prompt cannot be empty.');
  }

  if (!supabaseConfigStatus.isConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const { error: archiveError } = await supabase.from('prompt_versions').update({ status: 'archived' }).eq('status', 'active');

  if (archiveError) {
    throw new Error(archiveError.message);
  }

  const activatedAt = new Date().toISOString();
  const versionKey = `mira-health-chatbot-${Date.now()}`;
  const { data, error } = await supabase
    .from('prompt_versions')
    .insert({
      activated_at: activatedAt,
      metadata: {
        source: 'chatbot_admin_prompt_editor',
      },
      prompt_text: normalizedPrompt,
      status: 'active',
      version_key: versionKey,
    })
    .select('id,version_key,prompt_text,activated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to save prompt version.');
  }

  const row = data as PromptVersionRow;

  return {
    activatedAt: row.activated_at,
    id: row.id,
    promptText: row.prompt_text,
    versionKey: row.version_key,
  };
}
