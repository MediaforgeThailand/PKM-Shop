import type { User } from '@supabase/supabase-js';

const salesPortalStaffEmailAllowlist = new Set(['chatchawarn.p@mediaforge.co']);

export type ReferralAccount = {
  code: string;
  id: string;
  label: string;
  name: string;
  rate: number;
  role: 'doctor' | 'staff';
};

export type ReferralProductLike = {
  hospitalName: string;
  id: string;
  title: string;
};

export function createReferralAccountFromUser(user: User | null): ReferralAccount | null {
  if (!user) {
    return null;
  }

  const metadata = { ...(user.user_metadata ?? {}), ...(user.app_metadata ?? {}) };
  const displayName = stringMetadata(metadata.display_name) ?? stringMetadata(metadata.full_name) ?? user.email?.split('@')[0] ?? 'Staff account';
  const role = resolveSalesRole(user, metadata);

  if (!role) {
    return null;
  }

  const ownerPrefix = toReferralCodePart(displayName, role === 'doctor' ? 'DOCTOR' : 'STAFF').slice(0, 6);
  const stableSuffix = toReferralCodePart(user.id, 'ACCOUNT').slice(-4);

  return {
    code: `${ownerPrefix}${stableSuffix}`,
    id: user.id,
    label: role === 'doctor' ? 'Doctor account' : 'Staff account',
    name: displayName,
    rate: role === 'doctor' ? 0.05 : 0.03,
    role,
  };
}

function resolveSalesRole(user: User, metadata: Record<string, unknown>): ReferralAccount['role'] | null {
  const roleText = [
    metadata.role,
    metadata.account_type,
    metadata.app_role,
    metadata.sales_role,
    metadata.portal_role,
  ]
    .map(stringMetadata)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const normalizedEmail = user.email?.trim().toLowerCase() ?? '';
  const emailHandle = normalizedEmail.split('@')[0] ?? '';

  if (includesAny(roleText, ['doctor', 'physician', 'clinician']) || emailHandle.startsWith('dr')) {
    return 'doctor';
  }

  if (
    salesPortalStaffEmailAllowlist.has(normalizedEmail) ||
    includesAny(roleText, ['staff', 'hospital_staff', 'employee', 'sales', 'admin', 'hospital_admin']) ||
    includesAny(emailHandle, ['staff', 'sales', 'hospital'])
  ) {
    return 'staff';
  }

  return null;
}

export function createProductReferralCode(product: ReferralProductLike, account: ReferralAccount) {
  const hospital = toReferralCodePart(product.hospitalName, 'HOSP').slice(0, 4);
  const productCode = toReferralCodePart(product.title, 'PRODUCT').slice(0, 6);

  return `${hospital}-${productCode}-${account.code}`;
}

export function createProductReferralLink(product: ReferralProductLike, referralCode: string) {
  return `https://portal.mira.health/referral-intake?productId=${encodeURIComponent(product.id)}&ref=${encodeURIComponent(referralCode)}`;
}

export function createAccountReferralLink(account: ReferralAccount) {
  return `https://mira.health/r/${encodeURIComponent(account.code)}?source=sales_portal`;
}

export function createAppReferralDeepLink(account: ReferralAccount) {
  return `mira://referral?ref=${encodeURIComponent(account.code)}`;
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function toReferralCodePart(value: string, fallback: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toUpperCase();

  if (normalized.length > 0) {
    return normalized;
  }

  return fallback.replace(/[^a-z0-9]+/gi, '').toUpperCase() || 'MIRA';
}

function stringMetadata(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}
