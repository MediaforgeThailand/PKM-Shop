import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, TENANT_SLUG } from './supabase';
import { invokeFn } from './api';
import type { PkmRole, Profile } from './types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  roles: PkmRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// link_code is column-restricted (only the server hands it out), so the profile always
// comes from staff-admin ensure_self (service role), which also bootstraps nothing and is
// safe to call on every login.
async function loadProfile(): Promise<Profile | null> {
  try {
    const res = await invokeFn<{ profile: Profile | null }>('staff-admin', { action: 'ensure_self' });
    return res.profile ?? null;
  } catch {
    // Fallback: direct read without link_code (e.g. transient function outage).
    const { data } = await supabase
      .from('profiles')
      .select('id,tenant_id,user_id,name,phone,roles,line_user_id,active')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle();
    return data ? ({ ...(data as Omit<Profile, 'link_code'>), link_code: null } as Profile) : null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function hydrate(nextSession: Session | null) {
    setSession(nextSession);
    if (nextSession) {
      // ensure_self reports null for a user no admin has added yet → pending-access state.
      setProfile(await loadProfile());
    } else {
      setProfile(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => hydrate(next));
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthState = {
    session,
    profile,
    roles: profile?.roles ?? [],
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshProfile: async () => setProfile(await loadProfile()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function hasRole(roles: PkmRole[], ...need: PkmRole[]): boolean {
  return roles.includes('admin') || need.some((r) => roles.includes(r));
}

export { TENANT_SLUG };
