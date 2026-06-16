import { useCallback, useEffect, useState } from 'react';

import { supabase, supabaseConfigStatus } from '@/lib/supabase';
import { bindStoredReferralToCustomer } from '@/lib/referrals/bind';

import type { Session, User } from '@supabase/supabase-js';

export type AuthAccountKind = 'customer' | 'referrer' | 'staff';

export type AuthAccessOptions = {
  accountKind?: AuthAccountKind;
  displayName?: string | null;
  phone?: string | null;
  refCode?: string | null;
  tenantSlug?: string;
};

export type AuthSessionState = {
  isConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
  user: User | null;
};

const defaultTenantSlug = process.env.EXPO_PUBLIC_MIRA_TENANT_SLUG?.trim() || 'demo-hospital';
const accountKindLabels: Record<AuthAccountKind, string> = {
  customer: 'บัญชีลูกค้า Chat AI',
  referrer: 'บัญชี Referral',
  staff: 'บัญชีทีมงาน Admin Panel',
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

export async function signInWithEmailPassword(email: string, password: string, options: AuthAccessOptions = {}) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.session && data.user) {
    await ensureProfile(data.user.id, data.user.user_metadata?.display_name || data.user.email || email);
    await ensureAccountAccess(data.user, options);
  }

  return data;
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  displayName?: string,
  options: AuthAccessOptions = {},
) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        ...(options.accountKind ? { mira_account_kind: options.accountKind } : {}),
        display_name: displayName?.trim() || email.trim(),
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.session && data.user) {
    await ensureProfile(data.user.id, displayName || data.user.email || email);
    await ensureAccountAccess(data.user, { ...options, displayName: displayName ?? options.displayName });
  }

  return data;
}

function normalizeAccountKind(value: unknown): AuthAccountKind | null {
  return value === 'customer' || value === 'referrer' || value === 'staff' ? value : null;
}

function accountKindFromMetadata(user: User) {
  return normalizeAccountKind(user.user_metadata?.mira_account_kind ?? user.user_metadata?.account_kind);
}

function accountKindMismatchMessage(expected: AuthAccountKind, actual: AuthAccountKind) {
  return `บัญชีนี้สมัครไว้เป็น ${accountKindLabels[actual]} กรุณาใช้หน้า login ของ ${accountKindLabels[expected]} แยกกัน`;
}

function friendlyAuthError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    if (error.message.includes('TENANT_NOT_FOUND')) {
      return `ยังไม่พบ tenant "${defaultTenantSlug}" ในฐานข้อมูล`;
    }

    if (error.message.includes('INVALID_REF_CODE')) {
      return 'รหัสแนะนำไม่ถูกต้อง กรุณาใช้ ref code 6 ตัวจากทีมแอดมิน';
    }

    if (error.message.includes('REF_CODE_NOT_AVAILABLE')) {
      return 'ref code นี้ไม่พร้อมให้ claim แล้ว หรือยังไม่ได้สร้างโดย admin';
    }

    return error.message;
  }

  return fallback;
}

async function hasStaffMembership(userId: string) {
  const { data, error } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('auth_user_id', userId)
    .limit(1);

  if (error) {
    return false;
  }

  return Boolean(data?.length);
}

async function visibleTenantId(tenantSlug: string) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return (data as { id: string }).id;
}

async function hasReferrerAccount(userId: string, tenantSlug?: string) {
  const tenantId = tenantSlug ? await visibleTenantId(tenantSlug) : null;

  if (tenantSlug && !tenantId) {
    return false;
  }

  const query = supabase
    .from('referrers')
    .select('id')
    .eq('auth_user_id', userId)
    .eq('active', true)
    .limit(1);

  if (tenantId) {
    query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;

  if (error) {
    return false;
  }

  return Boolean(data?.length);
}

async function ensureCustomerAccount(user: User, options: AuthAccessOptions) {
  const [isStaff, isReferrer] = await Promise.all([hasStaffMembership(user.id), hasReferrerAccount(user.id)]);

  if (isStaff) {
    throw new Error(`บัญชีนี้เป็น ${accountKindLabels.staff} อยู่แล้ว กรุณาสมัครบัญชีลูกค้าแยกต่างหาก`);
  }

  if (isReferrer) {
    throw new Error(`บัญชีนี้เป็น ${accountKindLabels.referrer} อยู่แล้ว กรุณาสมัครบัญชีลูกค้าแยกต่างหาก`);
  }

  const { error } = await supabase.rpc('miracare_claim_customer_account', {
    p_nickname: options.displayName?.trim() || user.user_metadata?.display_name || user.email || null,
    p_phone: options.phone?.trim() || null,
    p_tenant_slug: options.tenantSlug ?? defaultTenantSlug,
  });

  if (error) {
    // Older databases can still create the customer through chat-orchestrator on
    // the first live message. Do not block customer login while a migration is
    // waiting to be applied.
    console.warn('customer account claim skipped:', error.message);
  }

  await bindStoredReferralToCustomer(options.tenantSlug ?? defaultTenantSlug);
}

async function ensureStaffAccount(user: User, options: AuthAccessOptions) {
  const tenantSlug = options.tenantSlug ?? defaultTenantSlug;
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (tenantError || !tenant) {
    throw new Error(tenantError?.message ?? `ยังไม่พบ tenant "${tenantSlug}" สำหรับทีมงาน`);
  }

  const { data: member, error: memberError } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', (tenant as { id: string }).id)
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (memberError || !member) {
    throw new Error('บัญชีทีมงานนี้ยังไม่ได้ถูกเพิ่มใน tenant_members โดย admin');
  }
}

async function ensureReferrerAccount(user: User, options: AuthAccessOptions) {
  const refCode = options.refCode?.trim();
  const tenantSlug = options.tenantSlug ?? defaultTenantSlug;
  let claimedCurrentTenantReferrer = false;

  if (refCode) {
    const { error } = await supabase.rpc('miracare_claim_referrer_account', {
      p_name: options.displayName?.trim() || user.user_metadata?.display_name || user.email || null,
      p_phone: options.phone?.trim() || null,
      p_ref_code: refCode,
      p_tenant_slug: tenantSlug,
    });

    if (error) {
      throw new Error(friendlyAuthError(error, 'claim ref code ไม่สำเร็จ'));
    }

    claimedCurrentTenantReferrer = true;
  }

  const isReferrer = claimedCurrentTenantReferrer || (await hasReferrerAccount(user.id, tenantSlug));

  if (!isReferrer) {
    throw new Error('บัญชีนี้ยังไม่มีโปรไฟล์ Referral ที่ผูกกับ ref code ของระบบ');
  }
}

async function ensureAccountAccess(user: User, options: AuthAccessOptions) {
  const accountKind = options.accountKind;

  if (!accountKind) {
    return;
  }

  const metadataKind = accountKindFromMetadata(user);

  if (metadataKind && metadataKind !== accountKind) {
    await supabase.auth.signOut();
    throw new Error(accountKindMismatchMessage(accountKind, metadataKind));
  }

  try {
    if (accountKind === 'customer') {
      await ensureCustomerAccount(user, options);
    } else if (accountKind === 'staff') {
      await ensureStaffAccount(user, options);
    } else {
      await ensureReferrerAccount(user, options);
    }
  } catch (error) {
    await supabase.auth.signOut();
    throw error;
  }
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
