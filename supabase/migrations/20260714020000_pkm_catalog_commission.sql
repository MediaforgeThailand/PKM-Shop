-- PKM-Shop — catalog UX + GLOBAL packer commission (owner directive 2026-07-14).
-- The owner runs a small shop, not an e-commerce platform: packer commission is a single
-- shop-wide per-piece rate set in Settings, NOT a per-product field. Weight is dropped from
-- the product UI (column kept, harmless). Product images use the existing product-images
-- bucket + products.image_url. Catalog writes now go through the service-role catalog-action
-- edge function (no fragile client insert, no manual catalog_key — the trigger auto-generates
-- it from the name).

-- 1) New global setting: packer_commission_per_piece (THB per packed piece). Seed + backfill.
create or replace function public.pkm_seed_default_settings(p_tenant_id uuid)
returns void
language sql
volatile
as $$
  insert into public.app_settings (tenant_id, key, value) values
    (p_tenant_id, 'normal_fee', '40'::jsonb),                       -- PLACEHOLDER (Ready.md: settings-driven)
    (p_tenant_id, 'express_surcharge', '55'::jsonb),                -- Ready.md §3.3
    (p_tenant_id, 'lalamove_tiers', '[{"max_km":5,"fee":50},{"max_km":10,"fee":80},{"max_km":14,"fee":100}]'::jsonb), -- Ready.md §3.3
    (p_tenant_id, 'lalamove_per_km_over_14', '10'::jsonb),          -- Ready.md §3.3
    (p_tenant_id, 'kerry_fee', '100'::jsonb),                       -- Ready.md §3.3
    (p_tenant_id, 'kerry_pickup_window', '"11:00-14:00"'::jsonb),   -- Ready.md §3.3
    (p_tenant_id, 'rider_fee_per_round', '25'::jsonb),              -- Ready.md §3.7
    (p_tenant_id, 'packer_commission_per_piece', '3'::jsonb),       -- Owner 2026-07-14: shop-wide, per piece
    (p_tenant_id, 'service_radius_km', '8'::jsonb),                 -- PLACEHOLDER (Ready.md: settings-driven)
    (p_tenant_id, 'store_lat', 'null'::jsonb),                      -- owner must set
    (p_tenant_id, 'store_lng', 'null'::jsonb),                      -- owner must set
    (p_tenant_id, 'checkin_radius_m', '150'::jsonb),                -- PLACEHOLDER
    (p_tenant_id, 'payment_window_min', '30'::jsonb),               -- PLACEHOLDER
    (p_tenant_id, 'ai_model', '"gpt-5.5"'::jsonb)                   -- matches reused engine
  on conflict (tenant_id, key) do nothing;
$$;

-- Backfill the new key for tenants that were seeded before this migration.
insert into public.app_settings (tenant_id, key, value)
select t.id, 'packer_commission_per_piece', '3'::jsonb
from public.tenants t
on conflict (tenant_id, key) do nothing;

-- 2) Packer commission is now the shop-wide per-piece rate × total pieces packed.
--    (Previously summed order_items.commission_snapshot, a per-product rate.) Still idempotent.
create or replace function public.pkm_record_packer_commission(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_period public.payroll_periods;
  v_rate integer;
  v_pieces integer;
  v_amount integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.packer_id is null then return; end if;

  v_rate := public.pkm_setting_int(v_order.tenant_id, 'packer_commission_per_piece', 3);

  select coalesce(sum(qty), 0) into v_pieces
  from public.order_items where order_id = p_order_id;

  v_amount := v_rate * v_pieces;
  if v_amount <= 0 then return; end if;

  v_period := public.pkm_get_or_create_period(v_order.tenant_id, now());

  insert into public.payroll_items (tenant_id, period_id, profile_id, kind, ref, amount)
  values (v_order.tenant_id, v_period.id, v_order.packer_id, 'packer_commission', p_order_id, v_amount)
  on conflict (tenant_id, kind, ref, profile_id) do nothing;
end;
$$;

revoke execute on function public.pkm_record_packer_commission(uuid) from public, anon, authenticated;
grant execute on function public.pkm_record_packer_commission(uuid) to service_role;
