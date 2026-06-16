import { invokeFunction } from '@/lib/api/client';
import { clearStoredReferralCode, readStoredReferralCode } from '@/lib/referrals/attribution';
import type { ReferralBindRequest, ReferralBindResponse } from '@/lib/types/api';

const defaultTenantSlug = process.env.EXPO_PUBLIC_MIRA_TENANT_SLUG?.trim() || 'demo-hospital';

export type StoredReferralBindResult = (ReferralBindResponse & { ref_code: string }) | null;

export async function bindStoredReferralToCustomer(tenantSlug = defaultTenantSlug): Promise<StoredReferralBindResult> {
  const refCode = await readStoredReferralCode();

  if (!refCode) {
    return null;
  }

  const response = await invokeFunction<ReferralBindRequest, ReferralBindResponse>('referral-bind', {
    ref_code: refCode,
    tenant_slug: tenantSlug,
  });

  if (response.bound || response.already_referred) {
    await clearStoredReferralCode();
    return { ...response, ref_code: refCode };
  }

  throw new Error('ไม่สามารถผูก referral code กับบัญชีนี้ได้ กรุณาขอ link ใหม่จากผู้แนะนำ');
}
