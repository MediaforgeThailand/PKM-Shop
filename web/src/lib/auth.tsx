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

async function loadProfile(): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id,tenant_id,user_id,name,phone,roles,line_user_id,link_code,active')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .maybeSingle();
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function hydrate(nextSession: Session | null) {
    setSession(nextSession);
    if (nextSession) {
      let p = await loadProfile();
      // No profile bound yet → let the server bootstrap the owner (first login) or report
      // that an admin must add this user. Then re-read.
      if (!p) {
        try {
          await invokeFn('staff-admin', { action: 'ensure_self' });
          p = await loadProfile();
        } catch {
          // leave p null; UI shows the pending-access state
        }
      }
      setProfile(p);
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
