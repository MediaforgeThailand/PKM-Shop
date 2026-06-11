import type { CustomerRow, TenantRow } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

type AttributionCustomer = Pick<CustomerRow, 'referred_at' | 'referred_by'>;
type AttributionTenant = Pick<TenantRow, 'attribution_window_days'>;

export function resolveAttributedReferrerId(
  customer: AttributionCustomer,
  tenant: AttributionTenant,
  nowMs = Date.now(),
) {
  if (!customer.referred_by || !customer.referred_at) {
    return null;
  }

  const referredAtMs = Date.parse(customer.referred_at);

  if (!Number.isFinite(referredAtMs)) {
    return null;
  }

  const windowDays = Math.max(0, tenant.attribution_window_days);
  const expiresAtMs = referredAtMs + windowDays * DAY_MS;

  return expiresAtMs >= nowMs ? customer.referred_by : null;
}
