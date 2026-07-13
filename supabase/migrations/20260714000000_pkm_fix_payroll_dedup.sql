-- PKM-Shop — fix: payroll_items dedup index was PARTIAL (where ref is not null), so the
-- `on conflict (tenant_id, kind, ref, profile_id) do nothing` in pkm_record_packer_commission
-- and pkm_record_rider_round_pay could not infer it ("no unique or exclusion constraint
-- matching the ON CONFLICT specification"). Make it a plain unique index (all payroll items
-- always carry a ref, so nulls-distinct is irrelevant) — the on-conflict now infers cleanly.
-- Found by the E2E harness.

drop index if exists public.payroll_items_dedup;
create unique index if not exists payroll_items_dedup
  on public.payroll_items (tenant_id, kind, ref, profile_id);
