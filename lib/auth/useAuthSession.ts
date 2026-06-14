import { useCallback, useEffect, useState } from 'react';

import { supabase, supabaseConfigStatus } from '@/lib/supabase';

import type { Session, User } from '@supabase/supabase-js';

export type AuthSessionState = {
  isConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
  user: User | null;
};

export function useAuthSession(): AuthSessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    if (!supabaseConfigStatus.isConfigured) {
      setIsLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session ?? null);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    isConfigured: supabaseConfigStatus.isConfigured,
    isLoading,
    session,
    user: session?.user ?? null,
  };
}

export function useSignOut() {
  return useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }
  }, []);
}

export async function signInWithEmailPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.session && data.user) {
    await ensureProfile(data.user.id, data.user.user_metadata?.display_name || data.user.email || email);
  }

  return data;
}

export async function signUpWithEmailPassword(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        display_name: displayName?.trim() || email.trim(),
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.session && data.user) {
    await ensureProfile(data.user.id, displayName || data.user.email || email);
  }

  return data;
}

export async function ensureProfile(userId: string, displayName?: string | null) {
  // `profiles` is a legacy v1 table that is not part of the v2 customer model
  // (customers are resolved server-side per tenant). Keep writing it for v1
  // compatibility, but best-effort: a missing table or a denied write must never
  // break sign-in/sign-up (L1, deep-risk-audit-2026-06-14).
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    display_name: displayName?.trim() || null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('ensureProfile (legacy profiles) skipped:', error.message);
  }
}
