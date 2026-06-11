import type { ReferrerRow } from './types.ts';

export type CommissionScheme = ReferrerRow['commission_scheme'];

function finiteNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function calculateCommissionAmount(amountBaht: number, category: string, scheme: CommissionScheme) {
  const categoryValue = finiteNumber(scheme.by_category?.[category]);
  const defaultValue = finiteNumber(scheme.default);
  const rateOrAmount = categoryValue ?? defaultValue ?? 0;

  if (scheme.mode === 'flat_baht') {
    return Math.max(0, Math.round(rateOrAmount));
  }

  return Math.max(0, Math.round(amountBaht * rateOrAmount / 100));
}
