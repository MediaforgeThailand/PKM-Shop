-- PKM-Shop — Phase 1 foundations & catalog
-- Additive on top of the reused MiraCare substrate (tenants/customers/tenant_members,
-- RLS helpers, storage). Introduces PKM enums, staff profiles (5 roles + LINE link),
-- app_settings (no hardcoded rates), categories, product stock/weight/commission,
-- and the transactional stock-movement ledger.
-- Owner-authorized pivot (2026-07-13). See docs/pkm-shop-line-commerce-plan.md.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pkm_role') then
    create type public.pkm_role as enum ('admin', 'stock', 'packer', 'rider', 'staff');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'pending', 'paid', 'confirmed', 'packing', 'packed',
      'out_for_delivery', 'delivering', 'delivered', 'returned',
      'awaiting_redelivery_fee', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'delivery_type') then
    create type public.delivery_type as enum ('rider', 'express_grab', 'lalamove', 'parcel_kerry');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('unpaid', 'pending_verify', 'paid', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'round_status') then
    create type public.round_status as enum ('open', 'locked', 'confirmed', 'in_progress', 'done');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic updated_at touch
-- ---------------------------------------------------------------------------
create or replace function public.pkm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff profiles: 5 PKM roles + LINE link-code binding (Ready.md §5, §6)
-- ---------------------------------------------------------------------------
create or replace function public.pkm_gen_link_code()
returns text
language sql
volatile
as $$
  -- 6-char ambiguity-free code (no 0/O/1/I/L). Uses built-in random() (pgcrypto's
  -- gen_random_bytes lives in Supabase's extensions schema, off the migration search_path).
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6)
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  user_id uuid references auth.users (id),
  name text not null default '',
  phone text,
  roles public.pkm_role[] not null default '{}',
  line_user_id text,
  link_code text unique default public.pkm_gen_link_code(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, line_user_id)
);

create index if not exists profiles_tenant_idx on public.profiles (tenant_id);
create index if not exists profiles_user_idx on public.profiles (user_id);
create index if not exists profiles_line_user_idx on public.profiles (line_user_id);
create index if not exists profiles_roles_idx on public.profiles using gin (roles);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.pkm_touch_updated_at();

-- ---------------------------------------------------------------------------
-- PKM role helpers (read profiles.roles). SECURITY DEFINER to bypass profiles RLS.
-- ---------------------------------------------------------------------------
create or replace function public.pkm_has_role(check_tenant_id uuid, need public.pkm_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.tenant_id = check_tenant_id
      and p.user_id = auth.uid()
      and p.active
      and need = any (p.roles)
  )
$$;

create or replace function public.is_pkm_member(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.tenant_id = check_tenant_id
      and p.user_id = auth.uid()
      and p.active
      and array_length(p.roles, 1) is not null
  )
$$;

create or replace function public.is_pkm_admin(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.pkm_has_role(check_tenant_id, 'admin')
$$;

-- Bridge the reused MiraCare policies (products/customers/chat use is_tenant_member/
-- is_tenant_admin) so PKM staff in `profiles` are recognized too. Union with the
-- legacy tenant_members gate; either source grants access.
create or replace function public.is_tenant_member(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tenant_role(check_tenant_id) is not null
      or public.is_pkm_member(check_tenant_id)
$$;

create or replace function public.is_tenant_admin(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.tenant_role(check_tenant_id), '') in ('superadmin', 'tenant_admin')
      or public.is_pkm_admin(check_tenant_id)
$$;

alter table public.profiles enable row level security;
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_member_read on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;

create policy profiles_self_read
  on public.profiles for select to authenticated
  using (user_id = auth.uid());

create policy profiles_member_read
  on public.profiles for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy profiles_admin_all
  on public.profiles for all to authenticated
  using (public.is_pkm_admin(tenant_id))
  with check (public.is_pkm_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- app_settings: every rate/fee/radius/time lives here, never hardcoded (Ready.md §5, §9)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  tenant_id uuid not null references public.tenants (id),
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.pkm_touch_updated_at();

alter table public.app_settings enable row level security;
drop policy if exists app_settings_member_read on public.app_settings;
drop policy if exists app_settings_admin_write on public.app_settings;

create policy app_settings_member_read
  on public.app_settings for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy app_settings_admin_write
  on public.app_settings for all to authenticated
  using (public.is_pkm_admin(tenant_id))
  with check (public.is_pkm_admin(tenant_id));

-- Seed DEFAULT settings for a tenant. Numbers Ready.md gives explicitly are used as-is;
-- the rest are clearly-marked PLACEHOLDERS to be confirmed by the owner in the UI
-- (Ready.md marks them [DEFAULT] / settings-driven). Idempotent (no overwrite).
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
    (p_tenant_id, 'service_radius_km', '8'::jsonb),                 -- PLACEHOLDER (Ready.md: settings-driven)
    (p_tenant_id, 'store_lat', 'null'::jsonb),                      -- owner must set
    (p_tenant_id, 'store_lng', 'null'::jsonb),                      -- owner must set
    (p_tenant_id, 'checkin_radius_m', '150'::jsonb),                -- PLACEHOLDER
    (p_tenant_id, 'payment_window_min', '30'::jsonb),               -- PLACEHOLDER
    (p_tenant_id, 'ai_model', '"gpt-5.5"'::jsonb)                   -- matches reused engine
  on conflict (tenant_id, key) do nothing;
$$;

-- Auto-seed settings for any future tenant.
create or replace function public.pkm_seed_settings_on_tenant()
returns trigger
language plpgsql
as $$
begin
  perform public.pkm_seed_default_settings(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_seed_pkm_settings on public.tenants;
create trigger tenants_seed_pkm_settings
  after insert on public.tenants
  for each row execute function public.pkm_seed_settings_on_tenant();

-- Backfill existing tenants once.
do $$
declare
  t record;
begin
  for t in select id from public.tenants loop
    perform public.pkm_seed_default_settings(t.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- categories: team CRUD (Ready.md §3.5)
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_tenant_active_idx on public.categories (tenant_id, active, sort);

drop trigger if exists categories_touch_updated_at on public.categories;
create trigger categories_touch_updated_at
  before update on public.categories
  for each row execute function public.pkm_touch_updated_at();

alter table public.categories enable row level security;
drop policy if exists categories_member_read on public.categories;
drop policy if exists categories_manage_write on public.categories;

create policy categories_member_read
  on public.categories for select to authenticated
  using (public.is_pkm_member(tenant_id));

-- stock or admin may manage categories/products (Ready.md §4)
create policy categories_manage_write
  on public.categories for all to authenticated
  using (public.is_pkm_admin(tenant_id) or public.pkm_has_role(tenant_id, 'stock'))
  with check (public.is_pkm_admin(tenant_id) or public.pkm_has_role(tenant_id, 'stock'));

-- ---------------------------------------------------------------------------
-- products: physical-goods attributes (stock, weight, per-piece packer commission)
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists category_id uuid references public.categories (id);
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists stock_qty integer not null default 0;
alter table public.products add column if not exists reserved_qty integer not null default 0 check (reserved_qty >= 0);
alter table public.products add column if not exists weight_g integer not null default 0 check (weight_g >= 0);
alter table public.products add column if not exists packer_commission_rate integer not null default 0 check (packer_commission_rate >= 0);

create index if not exists products_category_idx on public.products (category_id);

-- stock or admin may write products (broaden the reused admin-only write).
drop policy if exists products_stock_manage_write on public.products;
create policy products_stock_manage_write
  on public.products for all to authenticated
  using (public.pkm_has_role(tenant_id, 'stock'))
  with check (public.pkm_has_role(tenant_id, 'stock'));

-- ---------------------------------------------------------------------------
-- stock_movements: audit ledger; inbound (qty > 0) requires a photo (Ready.md §3.5)
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  product_id uuid not null references public.products (id),
  qty integer not null check (qty <> 0),
  photo_url text,
  actor_id uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now(),
  constraint stock_movements_inbound_photo check (qty < 0 or (photo_url is not null and btrim(photo_url) <> ''))
);

create index if not exists stock_movements_tenant_idx on public.stock_movements (tenant_id, created_at desc);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

alter table public.stock_movements enable row level security;
drop policy if exists stock_movements_member_read on public.stock_movements;
create policy stock_movements_member_read
  on public.stock_movements for select to authenticated
  using (public.is_pkm_member(tenant_id));
-- writes go only through the RPC below (service role) — no client insert policy.

-- Apply a stock movement + adjust products.stock_qty in one transaction.
-- Service-role only (edge functions); revoked from client roles.
create or replace function public.pkm_apply_stock_movement(
  p_tenant_id uuid,
  p_product_id uuid,
  p_qty integer,
  p_actor uuid,
  p_reason text default null,
  p_photo_url text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stock_movements;
  v_stock integer;
begin
  if p_qty = 0 then
    raise exception 'stock movement qty must be non-zero';
  end if;
  if p_qty > 0 and (p_photo_url is null or btrim(p_photo_url) = '') then
    raise exception 'inbound stock movement requires a photo';
  end if;

  select stock_qty into v_stock
  from public.products
  where id = p_product_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'product % not found for tenant %', p_product_id, p_tenant_id;
  end if;

  if v_stock + p_qty < 0 then
    raise exception 'insufficient stock: have %, delta %', v_stock, p_qty;
  end if;

  update public.products
  set stock_qty = stock_qty + p_qty, updated_at = now()
  where id = p_product_id and tenant_id = p_tenant_id;

  insert into public.stock_movements (tenant_id, product_id, qty, photo_url, actor_id, reason)
  values (p_tenant_id, p_product_id, p_qty, p_photo_url, p_actor, p_reason)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.pkm_apply_stock_movement(uuid, uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pkm_apply_stock_movement(uuid, uuid, integer, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Storage buckets for stock-in photos (private; signed-URL only, no object policies)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('stock-in', 'stock-in', false)
on conflict (id) do nothing;
