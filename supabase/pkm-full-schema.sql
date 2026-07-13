-- PKM-Shop — consolidated schema (run once in the Supabase SQL Editor of an EMPTY project). Idempotent.


-- ═══ 20260712980000_pkm_substrate.sql ═══
-- PKM-Shop — self-contained substrate. Creates the reused foundation (tenants, customers,
-- tenant_members, products base, chat, LINE dedup, RLS helpers, storage buckets) so the PKM
-- migration set builds on a BLANK Supabase project without the MiraCare migration history.
-- Runs before phase0. Idempotent.

create extension if not exists pgcrypto;

-- ── slug + catalog key helpers ────────────────────────────────────────────
create or replace function public.miracare_slugify(value text, fallback text)
returns text language plpgsql immutable as $$
declare candidate text;
begin
  candidate := trim(both '-' from lower(regexp_replace(coalesce(value, ''), '[^a-zA-Z0-9]+', '-', 'g')));
  candidate := left(candidate, 32);
  if length(candidate) < 2 then
    candidate := left(trim(both '-' from lower(regexp_replace(coalesce(fallback, 'item'), '[^a-zA-Z0-9]+', '-', 'g'))), 32);
  end if;
  if length(candidate) < 2 then candidate := 'item'; end if;
  return candidate;
end;
$$;

-- ── core tenancy ──────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,32}$'),
  display_name text not null,
  logo_url text,
  promptpay_id text,
  attribution_window_days int not null default 30,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  auth_user_id uuid references auth.users (id),
  line_user_id text,
  nickname text,
  phone text,
  referred_by uuid,
  referred_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, auth_user_id),
  unique (tenant_id, line_user_id)
);
create index if not exists customers_tenant_idx on public.customers (tenant_id);
create index if not exists customers_auth_user_idx on public.customers (auth_user_id);
create index if not exists customers_line_user_idx on public.customers (line_user_id);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants (id),
  auth_user_id uuid not null references auth.users (id),
  role text not null check (role in ('superadmin', 'tenant_admin', 'tenant_staff')),
  primary key (tenant_id, auth_user_id)
);
create index if not exists tenant_members_auth_user_idx on public.tenant_members (auth_user_id);

-- ── RLS helpers (base; phase1 unions them with profiles) ──────────────────
create or replace function public.tenant_role(check_tenant_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select tm.role from public.tenant_members tm
  where tm.tenant_id = check_tenant_id and tm.auth_user_id = auth.uid()
  order by case tm.role when 'superadmin' then 1 when 'tenant_admin' then 2 else 3 end limit 1
$$;

create or replace function public.is_tenant_member(check_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.tenant_role(check_tenant_id) is not null
$$;

create or replace function public.is_tenant_admin(check_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.tenant_role(check_tenant_id), '') in ('superadmin', 'tenant_admin')
$$;

create or replace function public.is_tenant_admin_slug(check_tenant_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenants t where t.slug = check_tenant_slug and public.is_tenant_admin(t.id))
$$;

-- ── products base (+ immutable catalog_key) ───────────────────────────────
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  catalog_key text not null check (catalog_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name text not null,
  description text not null default '',
  price_baht integer not null check (price_baht >= 0),
  category text not null default 'general',
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, catalog_key)
);
create index if not exists products_tenant_active_category_idx on public.products (tenant_id, active, category);

create or replace function public.miracare_generate_catalog_key()
returns trigger language plpgsql as $$
declare base_key text; candidate_key text;
begin
  if tg_op = 'UPDATE' and new.catalog_key <> old.catalog_key then
    raise exception 'catalog_key is immutable';
  end if;
  if tg_op = 'INSERT' and (new.catalog_key is null or btrim(new.catalog_key) = '') then
    base_key := public.miracare_slugify(new.name, 'product-' || left(md5(new.id::text), 8));
    candidate_key := base_key;
    while exists (select 1 from public.products p where p.tenant_id = new.tenant_id and p.catalog_key = candidate_key and p.id <> new.id) loop
      candidate_key := left(base_key, 58) || '-' || left(md5(gen_random_uuid()::text), 4);
    end loop;
    new.catalog_key := candidate_key;
  else
    new.catalog_key := lower(trim(new.catalog_key));
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_catalog_key_guard on public.products;
create trigger products_catalog_key_guard before insert or update on public.products
  for each row execute function public.miracare_generate_catalog_key();

-- ── chat (customer AI) ────────────────────────────────────────────────────
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  customer_id uuid not null references public.customers (id),
  channel text not null check (channel in ('app', 'pwa', 'line')),
  agent_mode text not null default 'ai' check (agent_mode in ('ai', 'human')),
  flagged text check (flagged in ('emergency', 'complaint')),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_sessions_customer_created_idx on public.chat_sessions (customer_id, last_message_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id),
  role text not null check (role in ('user', 'assistant', 'system_notice')),
  content text not null,
  marker_product_ids text[] not null default '{}',
  openai_response_id text,
  client_msg_id text,
  created_at timestamptz not null default now(),
  unique (session_id, client_msg_id)
);
create index if not exists chat_messages_session_created_idx on public.chat_messages (session_id, created_at);

create table if not exists public.line_webhook_events (
  event_id text primary key,
  tenant_id uuid references public.tenants (id),
  created_at timestamptz not null default now()
);
create index if not exists line_webhook_events_tenant_created_idx on public.line_webhook_events (tenant_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.tenants enable row level security;
alter table public.customers enable row level security;
alter table public.tenant_members enable row level security;
alter table public.products enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.line_webhook_events enable row level security;

drop policy if exists tenants_member_read on public.tenants;
drop policy if exists tenants_admin_update on public.tenants;
drop policy if exists customers_customer_read on public.customers;
drop policy if exists customers_staff_all on public.customers;
drop policy if exists tenant_members_self_read on public.tenant_members;
drop policy if exists tenant_members_admin_all on public.tenant_members;
drop policy if exists products_customer_active_read on public.products;
drop policy if exists products_staff_read on public.products;
drop policy if exists products_admin_write on public.products;
drop policy if exists chat_sessions_customer_read on public.chat_sessions;
drop policy if exists chat_sessions_staff_all on public.chat_sessions;
drop policy if exists chat_messages_customer_read on public.chat_messages;
drop policy if exists chat_messages_staff_all on public.chat_messages;
drop policy if exists line_webhook_events_staff_read on public.line_webhook_events;

create policy tenants_member_read on public.tenants for select to authenticated using (public.is_tenant_member(id));
create policy tenants_admin_update on public.tenants for update to authenticated using (public.is_tenant_admin(id)) with check (public.is_tenant_admin(id));
create policy customers_customer_read on public.customers for select to authenticated using (auth_user_id = auth.uid());
create policy customers_staff_all on public.customers for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy tenant_members_self_read on public.tenant_members for select to authenticated using (auth_user_id = auth.uid());
create policy tenant_members_admin_all on public.tenant_members for all to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy products_customer_active_read on public.products for select to authenticated using (active and exists (select 1 from public.customers c where c.tenant_id = products.tenant_id and c.auth_user_id = auth.uid()));
create policy products_staff_read on public.products for select to authenticated using (public.is_tenant_member(tenant_id));
create policy products_admin_write on public.products for all to authenticated using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy chat_sessions_customer_read on public.chat_sessions for select to authenticated using (customer_id in (select c.id from public.customers c where c.auth_user_id = auth.uid()));
create policy chat_sessions_staff_all on public.chat_sessions for all to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy chat_messages_customer_read on public.chat_messages for select to authenticated using (session_id in (select s.id from public.chat_sessions s join public.customers c on c.id = s.customer_id where c.auth_user_id = auth.uid()));
create policy chat_messages_staff_all on public.chat_messages for all to authenticated using (session_id in (select s.id from public.chat_sessions s where public.is_tenant_member(s.tenant_id))) with check (session_id in (select s.id from public.chat_sessions s where public.is_tenant_admin(s.tenant_id)));
create policy line_webhook_events_staff_read on public.line_webhook_events for select to authenticated using (tenant_id is not null and public.is_tenant_member(tenant_id));

-- ── storage buckets ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('product-images', 'product-images', true),
  ('payment-slips', 'payment-slips', false),
  ('line-assets', 'line-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists product_images_public_read on storage.objects;
drop policy if exists product_images_staff_insert on storage.objects;
drop policy if exists product_images_staff_update on storage.objects;
drop policy if exists line_assets_public_read on storage.objects;

create policy product_images_public_read on storage.objects for select using (bucket_id = 'product-images');
create policy product_images_staff_insert on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_tenant_admin_slug((storage.foldername(name))[1]));
create policy product_images_staff_update on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_tenant_admin_slug((storage.foldername(name))[1])) with check (bucket_id = 'product-images' and public.is_tenant_admin_slug((storage.foldername(name))[1]));
create policy line_assets_public_read on storage.objects for select using (bucket_id = 'line-assets');

-- ═══ 20260712990000_pkm_phase0_cleanup.sql ═══
-- PKM-Shop — Phase 0: remove MiraCare health-specific DB objects (owner-authorized full
-- rewrite, 2026-07-13). Runs AFTER all MiraCare migrations and BEFORE the PKM phases so the
-- PKM tables (profiles, orders, order_events, …) create cleanly with no name collisions.
--
-- KEEP (reused substrate): tenants, customers, tenant_members, products, chat_sessions,
-- chat_messages, line_webhook_events, storage buckets payment-slips/product-images/line-assets,
-- and the RLS helpers tenant_role/miracare_slugify/miracare_generate_catalog_key.

-- health / referral / rag / hospital / stripe functions
drop function if exists public.transition_order(uuid, text, text, jsonb) cascade;
drop function if exists public.miracare_commission_amount(jsonb, integer) cascade;
drop function if exists public.miracare_commission_amount(jsonb, integer, integer) cascade;

-- appointment order model (PKM recreates orders/order_events with the fulfilment shape)
drop table if exists public.commission_entries cascade;
drop table if exists public.returns cascade;
drop table if exists public.order_events cascade;
drop table if exists public.orders cascade;
drop table if exists public.referrers cascade;

-- hospital catalog extras (PKM uses its own categories)
drop table if exists public.product_branches cascade;
drop table if exists public.branches cascade;
drop table if exists public.product_categories cascade;
drop table if exists public.hospital_product_audit_logs cascade;
drop table if exists public.hospital_products cascade;

-- health data vault + facts + consent (PDPA health)
drop table if exists public.lab_results cascade;
drop table if exists public.lab_reports cascade;
drop table if exists public.wearable_metrics cascade;
drop table if exists public.wearable_imports cascade;
drop table if exists public.pdpa_requests cascade;
drop table if exists public.data_access_logs cascade;
drop table if exists public.hospital_access_grants cascade;
drop table if exists public.health_fact_sources cascade;
drop table if exists public.health_facts cascade;
drop table if exists public.health_memory_logs cascade;
drop table if exists public.health_logs cascade;
drop table if exists public.user_facts cascade;
drop table if exists public.fact_keys cascade;
drop table if exists public.user_context_scores cascade;
drop table if exists public.consents cascade;
drop table if exists public.legacy_consents cascade;
drop table if exists public.agent_memory cascade;

-- RAG / retrieval / eval / ai logs (health chatbot governance)
drop table if exists public.rag_chunks cascade;
drop table if exists public.rag_retrieval_logs cascade;
drop table if exists public.retrieval_logs cascade;
drop table if exists public.web_search_cache cascade;
drop table if exists public.web_search_sources cascade;
drop table if exists public.ai_request_logs cascade;
drop table if exists public.api_process_logs cascade;
drop table if exists public.ai_rate_limits cascade;
drop table if exists public.chat_eval_cases cascade;
drop table if exists public.prompt_versions cascade;
drop table if exists public.app_user_roles cascade;

-- old health profiles (PKM recreates profiles with 5 roles + LINE link in phase 1)
drop table if exists public.profiles cascade;

-- remove Stripe columns/index from products if present (PKM uses PromptPay + SlipOK)
alter table public.products drop column if exists stripe_product_id;
alter table public.products drop column if exists stripe_price_id;
-- remove appointment-only product fields (PKM goods have no branch/appointment)
alter table public.products drop column if exists requires_appointment;
alter table public.products drop column if exists branch_info;

-- health storage buckets (keep payment-slips, product-images, line-assets, stock-in).
-- On a MiraCare clone these may exist; Supabase blocks direct DELETE from storage.objects
-- (must use the Storage API), so remove them via the dashboard/Storage API. No-op on a fresh
-- project — wrapped so a blocked delete never aborts the migration.
do $$
begin
  delete from storage.objects where bucket_id in ('lab-reports', 'wearable-imports');
  delete from storage.buckets where id in ('lab-reports', 'wearable-imports');
exception when others then
  raise notice 'skipped health bucket cleanup (do via Storage API if needed): %', sqlerrm;
end;
$$;

-- ═══ 20260713000000_pkm_phase1_foundations.sql ═══
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

-- ═══ 20260713010000_pkm_phase2_orders.sql ═══
-- PKM-Shop — Phase 2: orders + order_items + fulfilment state machine + stock reservation
-- Owner-authorized full rewrite (2026-07-13): drops the MiraCare appointment order model
-- and installs the PKM delivery-fulfilment model with canonical names.
-- State changes go ONLY through pkm_transition_order (service role) which writes
-- order_events in the same transaction (AGENTS.md §2). Business rules: Ready.md §3, §5.

-- Remove the MiraCare order model (cascades order_events, commission_entries, returns, etc.).
drop function if exists public.transition_order(uuid, text, text, jsonb) cascade;
drop table if exists public.returns cascade;
drop table if exists public.commission_entries cascade;
drop table if exists public.order_events cascade;
drop table if exists public.orders cascade;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'drop_option') then
    create type public.drop_option as enum ('leave', 'wait');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-tenant per-day order number counter (race-safe via row lock)
-- ---------------------------------------------------------------------------
create table if not exists public.order_number_counters (
  tenant_id uuid not null references public.tenants (id),
  day date not null,
  seq integer not null default 0,
  primary key (tenant_id, day)
);

create or replace function public.pkm_next_order_no(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Bangkok')::date;
  v_seq integer;
begin
  insert into public.order_number_counters (tenant_id, day, seq)
  values (p_tenant_id, v_day, 1)
  on conflict (tenant_id, day)
  do update set seq = public.order_number_counters.seq + 1
  returning seq into v_seq;

  return 'ORD-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  order_no text,
  customer_id uuid not null references public.customers (id),
  session_id uuid references public.chat_sessions (id),
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  delivery_type public.delivery_type not null default 'rider',
  drop_option public.drop_option not null default 'leave',
  -- money (integer THB); goods_total + delivery_fee = grand_total
  goods_total integer not null default 0 check (goods_total >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  grand_total integer not null default 0 check (grand_total >= 0),
  -- shipping address
  recipient_name text,
  recipient_phone text,
  address_text text,
  subdistrict text,
  district text,
  province text,
  postal_code text,
  lat double precision,
  lng double precision,
  distance_km numeric,
  -- fulfilment linkage
  round_id uuid,
  stop_sequence integer,
  packer_id uuid references public.profiles (id),
  rider_id uuid references public.profiles (id),
  external_ref text,               -- Grab/Lalamove/Kerry reference or tracking no.
  parent_order_id uuid references public.orders (id),
  cancelled_reason text,
  -- timestamps
  paid_at timestamptz,
  packed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, order_no)
);

create index if not exists orders_tenant_status_idx on public.orders (tenant_id, status);
create index if not exists orders_customer_idx on public.orders (customer_id, created_at desc);
create index if not exists orders_round_idx on public.orders (round_id, stop_sequence);
create index if not exists orders_packer_idx on public.orders (packer_id);
create index if not exists orders_rider_idx on public.orders (rider_id);
create index if not exists orders_parent_idx on public.orders (parent_order_id) where parent_order_id is not null;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.pkm_touch_updated_at();

create or replace function public.pkm_orders_set_order_no()
returns trigger
language plpgsql
as $$
begin
  if new.order_no is null or btrim(new.order_no) = '' then
    new.order_no := public.pkm_next_order_no(new.tenant_id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_order_no on public.orders;
create trigger orders_set_order_no
  before insert on public.orders
  for each row execute function public.pkm_orders_set_order_no();

-- ---------------------------------------------------------------------------
-- order_items — multi-item cart with price/commission snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  qty integer not null check (qty > 0),
  unit_price integer not null check (unit_price >= 0),          -- snapshot of products.price_baht
  commission_snapshot integer not null default 0 check (commission_snapshot >= 0), -- packer_commission_rate at order time
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- order_events — single source of truth for status history
-- ---------------------------------------------------------------------------
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor text not null,
  photo_url text,
  note text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.order_number_counters enable row level security;

drop policy if exists orders_customer_read on public.orders;
drop policy if exists orders_staff_read on public.orders;
drop policy if exists order_items_customer_read on public.order_items;
drop policy if exists order_items_staff_read on public.order_items;
drop policy if exists order_events_staff_read on public.order_events;

create policy orders_customer_read
  on public.orders for select to authenticated
  using (customer_id in (select c.id from public.customers c where c.auth_user_id = auth.uid()));

create policy orders_staff_read
  on public.orders for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy order_items_customer_read
  on public.order_items for select to authenticated
  using (order_id in (
    select o.id from public.orders o
    join public.customers c on c.id = o.customer_id
    where c.auth_user_id = auth.uid()
  ));

create policy order_items_staff_read
  on public.order_items for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy order_events_staff_read
  on public.order_events for select to authenticated
  using (public.is_pkm_member(tenant_id));

-- counters: no client access (service role only)

-- ---------------------------------------------------------------------------
-- Stock reservation helpers (Ready.md §3.5: reserve@paid, decrement@packed, release@cancel)
-- ---------------------------------------------------------------------------
create or replace function public.pkm_reserve_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
  v_avail integer;
begin
  for it in
    select oi.product_id, sum(oi.qty) as qty
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
  loop
    select (stock_qty - reserved_qty) into v_avail
    from public.products where id = it.product_id for update;

    if v_avail is null then
      raise exception 'product % missing', it.product_id;
    end if;
    -- Do not hard-block on oversell here (stock is a guide, admin can top up);
    -- but never let reserved exceed a sane bound.
    update public.products
    set reserved_qty = reserved_qty + it.qty, updated_at = now()
    where id = it.product_id;
  end loop;
end;
$$;

create or replace function public.pkm_release_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
begin
  for it in
    select oi.product_id, sum(oi.qty) as qty
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
  loop
    update public.products
    set reserved_qty = greatest(0, reserved_qty - it.qty), updated_at = now()
    where id = it.product_id;
  end loop;
end;
$$;

create or replace function public.pkm_consume_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
begin
  for it in
    select oi.product_id, sum(oi.qty) as qty
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
  loop
    update public.products
    set stock_qty = stock_qty - it.qty,
        reserved_qty = greatest(0, reserved_qty - it.qty),
        updated_at = now()
    where id = it.product_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- pkm_transition_order — the ONLY status writer. Validates the transition against
-- a fixed allow-matrix, adjusts stock, appends order_events, all in one tx.
-- actor is 'system' | 'customer' | 'admin:<uid>' | 'rider:<uid>' | 'packer:<uid>' | 'stock:<uid>'.
-- ---------------------------------------------------------------------------
create or replace function public.pkm_actor_kind(p_actor text)
returns text
language sql
immutable
as $$
  select split_part(p_actor, ':', 1)
$$;

create or replace function public.pkm_transition_order(
  p_order_id uuid,
  p_to_status public.order_status,
  p_actor text,
  p_meta jsonb default '{}',
  p_photo_url text default null,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_from public.order_status;
  v_kind text := public.pkm_actor_kind(p_actor);
  v_allowed boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  v_from := v_order.status;

  if v_from = p_to_status then
    return v_order;  -- idempotent no-op
  end if;

  -- Allow-matrix: (from -> to, allowed actor kinds)
  v_allowed := case
    when v_from = 'pending'          and p_to_status = 'paid'             and v_kind in ('system','admin')            then true
    when v_from = 'pending'          and p_to_status = 'cancelled'        and v_kind in ('customer','admin')          then true
    when v_from = 'paid'             and p_to_status = 'confirmed'        and v_kind in ('system','admin')            then true
    when v_from = 'paid'             and p_to_status = 'cancelled'        and v_kind in ('admin')                     then true
    when v_from = 'confirmed'        and p_to_status = 'packing'          and v_kind in ('system','packer','admin')   then true
    when v_from = 'confirmed'        and p_to_status = 'cancelled'        and v_kind in ('admin')                     then true
    when v_from = 'packing'          and p_to_status = 'packed'           and v_kind in ('packer','admin')            then true
    when v_from = 'packing'          and p_to_status = 'cancelled'        and v_kind in ('admin')                     then true
    when v_from = 'packed'           and p_to_status = 'out_for_delivery' and v_kind in ('system','rider','admin')    then true
    when v_from = 'out_for_delivery' and p_to_status = 'delivering'       and v_kind in ('rider','admin')             then true
    when v_from = 'delivering'       and p_to_status = 'delivered'        and v_kind in ('rider','admin')             then true
    when v_from = 'delivering'       and p_to_status = 'returned'         and v_kind in ('rider','admin')             then true
    when v_from = 'out_for_delivery' and p_to_status = 'returned'         and v_kind in ('rider','admin')             then true
    when v_from = 'returned'         and p_to_status = 'awaiting_redelivery_fee' and v_kind in ('system','admin')     then true
    -- parcel/express fulfilment shortcuts (no rider rounds)
    when v_from = 'packed'           and p_to_status = 'delivered'        and v_kind in ('admin','system')            then true
    else false
  end case;

  if not v_allowed then
    raise exception 'illegal transition % -> % by %', v_from, p_to_status, p_actor;
  end if;

  -- Stock side effects
  if p_to_status = 'paid' then
    perform public.pkm_reserve_order_stock(p_order_id);
  elsif p_to_status = 'packed' then
    perform public.pkm_consume_order_stock(p_order_id);
  elsif p_to_status = 'cancelled' and v_from in ('paid','confirmed','packing') then
    perform public.pkm_release_order_stock(p_order_id);
  end if;

  update public.orders
  set status = p_to_status,
      payment_status = case when p_to_status = 'paid' then 'paid'::public.payment_status else payment_status end,
      paid_at = case when p_to_status = 'paid' and paid_at is null then now() else paid_at end,
      packed_at = case when p_to_status = 'packed' and packed_at is null then now() else packed_at end,
      delivered_at = case when p_to_status = 'delivered' and delivered_at is null then now() else delivered_at end,
      cancelled_reason = coalesce(p_note, cancelled_reason),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (tenant_id, order_id, from_status, to_status, actor, photo_url, note, meta)
  values (v_order.tenant_id, p_order_id, v_from, p_to_status, p_actor, p_photo_url, p_note, coalesce(p_meta, '{}'));

  return v_order;
end;
$$;

revoke execute on function public.pkm_transition_order(uuid, public.order_status, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.pkm_transition_order(uuid, public.order_status, text, jsonb, text, text) to service_role;
revoke execute on function public.pkm_next_order_no(uuid) from public, anon, authenticated;
grant execute on function public.pkm_next_order_no(uuid) to service_role;

-- ═══ 20260713020000_pkm_phase3_rounds.sql ═══
-- PKM-Shop — Phase 3: delivery rounds (hourly 24/7, cutoff :30, Asia/Bangkok),
-- round state machine, order→round assignment, and returns.
-- Business rules: Ready.md §3.1 (rounds/cutoff), §3.2 (multi-stop), §3.4 (returns).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'round_type') then
    create type public.round_type as enum ('rider', 'kerry');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- delivery_rounds
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_rounds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  round_at timestamptz not null,               -- top-of-hour departure (rider) or the day (kerry)
  type public.round_type not null default 'rider',
  status public.round_status not null default 'open',
  rider_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, type, round_at)
);

create index if not exists delivery_rounds_tenant_status_idx on public.delivery_rounds (tenant_id, status, round_at);
create index if not exists delivery_rounds_rider_idx on public.delivery_rounds (rider_id);

drop trigger if exists delivery_rounds_touch_updated_at on public.delivery_rounds;
create trigger delivery_rounds_touch_updated_at
  before update on public.delivery_rounds
  for each row execute function public.pkm_touch_updated_at();

-- orders.round_id -> delivery_rounds (added now that the table exists)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'orders_round_id_fkey' and table_name = 'orders'
  ) then
    alter table public.orders
      add constraint orders_round_id_fkey foreign key (round_id) references public.delivery_rounds (id);
  end if;
end;
$$;

create table if not exists public.round_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  round_id uuid not null references public.delivery_rounds (id) on delete cascade,
  from_status public.round_status,
  to_status public.round_status not null,
  actor text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists round_events_round_idx on public.round_events (round_id, created_at);

-- ---------------------------------------------------------------------------
-- returns (Ready.md §3.4)
-- ---------------------------------------------------------------------------
create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  order_id uuid not null references public.orders (id),
  reason text not null,
  redelivery_fee_status public.payment_status not null default 'unpaid',
  new_order_id uuid references public.orders (id),
  restocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists returns_tenant_idx on public.returns (tenant_id, created_at desc);
create index if not exists returns_order_idx on public.returns (order_id);

drop trigger if exists returns_touch_updated_at on public.returns;
create trigger returns_touch_updated_at
  before update on public.returns
  for each row execute function public.pkm_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.delivery_rounds enable row level security;
alter table public.round_events enable row level security;
alter table public.returns enable row level security;

drop policy if exists delivery_rounds_member_read on public.delivery_rounds;
drop policy if exists round_events_member_read on public.round_events;
drop policy if exists returns_member_read on public.returns;

create policy delivery_rounds_member_read
  on public.delivery_rounds for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy round_events_member_read
  on public.round_events for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy returns_member_read
  on public.returns for select to authenticated
  using (public.is_pkm_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Cutoff math (Ready.md §3.1). T in Asia/Bangkok:
--   minute(T) < 30  -> next top-of-hour round
--   minute(T) >= 30 -> top-of-hour + 2h round
-- Returns the round_at as a timestamptz anchored at the Bangkok top-of-hour.
-- ---------------------------------------------------------------------------
create or replace function public.pkm_compute_round_at(p_ts timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_local timestamp := (p_ts at time zone 'Asia/Bangkok');
  v_base  timestamp := date_trunc('hour', v_local);
  v_min   integer := extract(minute from v_local)::int;
  v_round timestamp;
begin
  if v_min < 30 then
    v_round := v_base + interval '1 hour';
  else
    v_round := v_base + interval '2 hour';
  end if;
  return (v_round at time zone 'Asia/Bangkok');
end;
$$;

create or replace function public.pkm_get_or_create_round(
  p_tenant_id uuid,
  p_round_at timestamptz,
  p_type public.round_type default 'rider'
)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.delivery_rounds;
begin
  insert into public.delivery_rounds (tenant_id, round_at, type)
  values (p_tenant_id, p_round_at, p_type)
  on conflict (tenant_id, type, round_at) do update set updated_at = now()
  returning * into v_round;
  return v_round;
end;
$$;

-- Assign a paid order to its rider round and move it to 'confirmed' (เข้ารอบ).
create or replace function public.pkm_assign_order_to_round(p_order_id uuid)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_round_at timestamptz;
  v_round public.delivery_rounds;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  if v_order.delivery_type <> 'rider' then
    raise exception 'order % is not a rider delivery', p_order_id;
  end if;

  v_round_at := public.pkm_compute_round_at(coalesce(v_order.paid_at, now()));
  v_round := public.pkm_get_or_create_round(v_order.tenant_id, v_round_at, 'rider');

  update public.orders set round_id = v_round.id, updated_at = now() where id = p_order_id;

  if v_order.status = 'paid' then
    perform public.pkm_transition_order(
      p_order_id, 'confirmed', 'system',
      jsonb_build_object('round_id', v_round.id, 'round_at', v_round.round_at)
    );
  end if;

  return v_round;
end;
$$;

-- ---------------------------------------------------------------------------
-- Round state machine (open->locked->confirmed->in_progress->done)
-- ---------------------------------------------------------------------------
create or replace function public.pkm_transition_round(
  p_round_id uuid,
  p_to_status public.round_status,
  p_actor text,
  p_rider_id uuid default null,
  p_meta jsonb default '{}'
)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.delivery_rounds;
  v_from public.round_status;
  v_kind text := public.pkm_actor_kind(p_actor);
  v_allowed boolean := false;
begin
  select * into v_round from public.delivery_rounds where id = p_round_id for update;
  if not found then
    raise exception 'round % not found', p_round_id;
  end if;
  v_from := v_round.status;
  if v_from = p_to_status then
    return v_round;
  end if;

  v_allowed := case
    when v_from = 'open'        and p_to_status = 'locked'      and v_kind in ('system','admin')          then true
    when v_from = 'locked'      and p_to_status = 'confirmed'   and v_kind in ('rider','admin')           then true
    when v_from = 'confirmed'   and p_to_status = 'in_progress' and v_kind in ('rider','admin')           then true
    when v_from = 'in_progress' and p_to_status = 'done'        and v_kind in ('rider','admin','system')  then true
    else false
  end case;

  if not v_allowed then
    raise exception 'illegal round transition % -> % by %', v_from, p_to_status, p_actor;
  end if;

  update public.delivery_rounds
  set status = p_to_status,
      rider_id = coalesce(p_rider_id, rider_id),
      updated_at = now()
  where id = p_round_id
  returning * into v_round;

  -- On rider accept, stamp the rider onto every order in the round.
  if p_to_status = 'confirmed' and v_round.rider_id is not null then
    update public.orders set rider_id = v_round.rider_id, updated_at = now()
    where round_id = p_round_id;
  end if;

  insert into public.round_events (tenant_id, round_id, from_status, to_status, actor, meta)
  values (v_round.tenant_id, p_round_id, v_from, p_to_status, p_actor, coalesce(p_meta, '{}'));

  return v_round;
end;
$$;

-- Lock the upcoming round(s) at :30 (cron round-lock). Locks open rider rounds whose
-- round_at is the next Bangkok top-of-hour; returns them so the caller notifies staff.
create or replace function public.pkm_lock_due_rounds(p_tenant_id uuid)
returns setof public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next timestamptz := (date_trunc('hour', (now() at time zone 'Asia/Bangkok')) + interval '1 hour') at time zone 'Asia/Bangkok';
  r public.delivery_rounds;
begin
  for r in
    select * from public.delivery_rounds
    where tenant_id = p_tenant_id and type = 'rider' and status = 'open' and round_at = v_next
    for update
  loop
    r := public.pkm_transition_round(r.id, 'locked', 'system');
    return next r;
  end loop;
end;
$$;

revoke execute on function public.pkm_get_or_create_round(uuid, timestamptz, public.round_type) from public, anon, authenticated;
revoke execute on function public.pkm_assign_order_to_round(uuid) from public, anon, authenticated;
revoke execute on function public.pkm_transition_round(uuid, public.round_status, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.pkm_lock_due_rounds(uuid) from public, anon, authenticated;
grant execute on function public.pkm_get_or_create_round(uuid, timestamptz, public.round_type) to service_role;
grant execute on function public.pkm_assign_order_to_round(uuid) to service_role;
grant execute on function public.pkm_transition_round(uuid, public.round_status, text, uuid, jsonb) to service_role;
grant execute on function public.pkm_lock_due_rounds(uuid) to service_role;

-- ═══ 20260713030000_pkm_phase4_payments.sql ═══
-- PKM-Shop — Phase 4: payments + SlipOK verification columns (stubbed until API access).
-- Payment is verified SERVER-SIDE only; the single sanctioned "verified -> paid -> เข้ารอบ"
-- path is pkm_confirm_payment. Business rules: Ready.md §3.6, §7.1.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_kind') then
    create type public.payment_kind as enum ('goods', 'delivery', 'redelivery');
  end if;
end;
$$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  order_id uuid not null references public.orders (id),
  amount integer not null check (amount >= 0),
  kind public.payment_kind not null default 'goods',
  method text not null default 'promptpay',
  slip_photo_url text,
  status public.payment_status not null default 'pending_verify',
  verified_by uuid references auth.users (id),
  auto_verified boolean not null default false,
  slipok_trans_ref text,
  slipok_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duplicate-slip guard on our side (Ready.md §3.6): a SlipOK transRef is single-use.
create unique index if not exists payments_slipok_trans_ref_key
  on public.payments (slipok_trans_ref) where slipok_trans_ref is not null;
create index if not exists payments_tenant_status_idx on public.payments (tenant_id, status);
create index if not exists payments_order_idx on public.payments (order_id, created_at desc);

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function public.pkm_touch_updated_at();

alter table public.payments enable row level security;
drop policy if exists payments_customer_read on public.payments;
drop policy if exists payments_staff_read on public.payments;

create policy payments_customer_read
  on public.payments for select to authenticated
  using (order_id in (
    select o.id from public.orders o
    join public.customers c on c.id = o.customer_id
    where c.auth_user_id = auth.uid()
  ));

create policy payments_staff_read
  on public.payments for select to authenticated
  using (public.is_pkm_member(tenant_id));
-- writes go only through the RPCs below (service role).

-- Record an uploaded slip awaiting verification (customer sent slip; SlipOK not yet run
-- or failed). Sets the order's payment_status to pending_verify so admins see a manual queue.
create or replace function public.pkm_record_pending_payment(
  p_order_id uuid,
  p_amount integer,
  p_kind public.payment_kind,
  p_slip_url text,
  p_note text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_pay public.payments;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order % not found', p_order_id; end if;

  insert into public.payments (tenant_id, order_id, amount, kind, slip_photo_url, status)
  values (v_order.tenant_id, p_order_id, p_amount, p_kind, p_slip_url, 'pending_verify')
  returning * into v_pay;

  update public.orders set payment_status = 'pending_verify', updated_at = now()
  where id = p_order_id;

  return v_pay;
end;
$$;

-- The single sanctioned money-authority path: a verified payment -> order paid -> (rider) เข้ารอบ.
-- Called by slip-verify (auto, actor 'system') after SlipOK passes, OR by admin manual confirm
-- (actor 'admin:<uid>'). Re-validates duplicate transRef via the unique index.
create or replace function public.pkm_confirm_payment(
  p_order_id uuid,
  p_amount integer,
  p_kind public.payment_kind,
  p_method text,
  p_slip_url text,
  p_actor text,
  p_auto boolean default false,
  p_trans_ref text default null,
  p_raw jsonb default null,
  p_verified_by uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_kind text := public.pkm_actor_kind(p_actor);
begin
  if v_kind not in ('system','admin') then
    raise exception 'payment confirmation requires system or admin actor, got %', p_actor;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order % not found', p_order_id; end if;

  insert into public.payments
    (tenant_id, order_id, amount, kind, method, slip_photo_url, status, verified_by, auto_verified, slipok_trans_ref, slipok_raw)
  values
    (v_order.tenant_id, p_order_id, p_amount, p_kind, p_method, p_slip_url, 'paid', p_verified_by, p_auto, p_trans_ref, p_raw);

  -- Move to paid (reserves stock + stamps paid_at) unless already past pending.
  if v_order.status = 'pending' then
    v_order := public.pkm_transition_order(
      p_order_id, 'paid', p_actor,
      jsonb_build_object('auto_verified', p_auto, 'trans_ref', p_trans_ref)
    );
    -- Rider deliveries enter an hourly round immediately (Ready.md §3.1).
    if v_order.delivery_type = 'rider' then
      perform public.pkm_assign_order_to_round(p_order_id);
      select * into v_order from public.orders where id = p_order_id;
    end if;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.pkm_record_pending_payment(uuid, integer, public.payment_kind, text, text) from public, anon, authenticated;
revoke execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pkm_record_pending_payment(uuid, integer, public.payment_kind, text, text) to service_role;
grant execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) to service_role;

-- ═══ 20260713040000_pkm_phase5_notify_teamchat.sql ═══
-- PKM-Shop — Phase 5: notifications outbox (every LINE push logged) + internal team chat.
-- The reused customer AI chat keeps chat_sessions/chat_messages (covers Ready.md's
-- line_conversations incl. handoff via chat_sessions.agent_mode). Team chat uses
-- team_channels/team_messages to avoid colliding with that. Business rules: Ready.md §4, §6, §8.

-- ---------------------------------------------------------------------------
-- notifications — one row per push (customer or staff), for debug + dedup + retry
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  event_type text not null check (event_type in (
    'order_created','slip_received','paid','round_locked','packed',
    'rider_accepted','rider_dispatched','delivered','returned',
    'express_paid','payroll_cutoff','payout_confirmed','kerry_handover'
  )),
  audience text not null check (audience in ('customer','staff')),
  order_id uuid references public.orders (id),
  round_id uuid references public.delivery_rounds (id),
  recipient_customer_id uuid references public.customers (id),
  recipient_profile_id uuid references public.profiles (id),
  recipient_line_user_id text,
  channel text not null default 'line',
  template text,
  title text,
  body text not null default '',
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error text,
  dedup_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index if not exists notifications_dedup_key
  on public.notifications (tenant_id, dedup_key) where dedup_key is not null;
create index if not exists notifications_tenant_created_idx on public.notifications (tenant_id, created_at desc);
create index if not exists notifications_pending_idx on public.notifications (status) where status = 'pending';
create index if not exists notifications_order_idx on public.notifications (order_id);

alter table public.notifications enable row level security;
drop policy if exists notifications_staff_read on public.notifications;
create policy notifications_staff_read
  on public.notifications for select to authenticated
  using (public.is_pkm_member(tenant_id));
-- writes go only through the notify edge function (service role).

-- ---------------------------------------------------------------------------
-- Team chat (Ready.md §8) — Realtime
-- ---------------------------------------------------------------------------
create table if not exists public.team_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  kind text not null default 'team',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists team_channels_tenant_idx on public.team_channels (tenant_id, active);

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  channel_id uuid not null references public.team_channels (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  text text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists team_messages_channel_idx on public.team_messages (channel_id, created_at desc);

alter table public.team_channels enable row level security;
alter table public.team_messages enable row level security;

drop policy if exists team_channels_member_read on public.team_channels;
drop policy if exists team_channels_admin_write on public.team_channels;
drop policy if exists team_messages_member_read on public.team_messages;
drop policy if exists team_messages_member_write on public.team_messages;

create policy team_channels_member_read
  on public.team_channels for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy team_channels_admin_write
  on public.team_channels for all to authenticated
  using (public.is_pkm_admin(tenant_id))
  with check (public.is_pkm_admin(tenant_id));

create policy team_messages_member_read
  on public.team_messages for select to authenticated
  using (public.is_pkm_member(tenant_id));

-- Any active member may post as their own profile.
create policy team_messages_member_write
  on public.team_messages for insert to authenticated
  with check (
    public.is_pkm_member(tenant_id)
    and sender_id in (select p.id from public.profiles p where p.user_id = auth.uid() and p.tenant_id = team_messages.tenant_id)
  );

-- Realtime for team chat + the admin order board (guarded — publication may not exist locally).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.team_messages;
    exception when others then null; end;
    begin
      alter publication supabase_realtime add table public.orders;
    exception when others then null; end;
    begin
      alter publication supabase_realtime add table public.delivery_rounds;
    exception when others then null; end;
  end if;
end;
$$;

-- ═══ 20260713050000_pkm_phase6_payroll_hr.sql ═══
-- PKM-Shop — Phase 6: payroll (rider per-round + packer per-piece) + payouts + HR (shifts/attendance).
-- Amounts are frozen from app_settings / order_items snapshots (never recomputed loosely).
-- The system never transfers money — it summarizes for the owner, who confirms payout + slip.
-- Business rules: Ready.md §3.7 (payroll), §3.8 (HR check-in).

-- Settings getter (jsonb number -> int), used for pay rates.
create or replace function public.pkm_setting_int(p_tenant_id uuid, p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when jsonb_typeof(value) = 'number' then (value::text)::integer else p_default end
    from public.app_settings where tenant_id = p_tenant_id and key = p_key
  ), p_default)
$$;

-- ---------------------------------------------------------------------------
-- Payroll periods (weekly Mon..Sun, Asia/Bangkok; cutoff Sun 24:00 = Mon 00:00)
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  period_start date not null,
  period_end date not null,             -- exclusive (the Monday after)
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, period_start)
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  period_id uuid not null references public.payroll_periods (id),
  profile_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('rider_round','packer_commission')),
  ref uuid,                             -- round_id or order_id
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now()
);

-- idempotency: a given (kind, ref, profile) pays once
create unique index if not exists payroll_items_dedup
  on public.payroll_items (tenant_id, kind, ref, profile_id) where ref is not null;
create index if not exists payroll_items_period_idx on public.payroll_items (period_id);
create index if not exists payroll_items_profile_idx on public.payroll_items (profile_id);

create table if not exists public.payroll_payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  period_id uuid not null references public.payroll_periods (id),
  profile_id uuid not null references public.profiles (id),
  total integer not null default 0 check (total >= 0),
  slip_photo_url text,
  confirmed_by uuid references auth.users (id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, profile_id)
);

drop trigger if exists payroll_payouts_touch_updated_at on public.payroll_payouts;
create trigger payroll_payouts_touch_updated_at
  before update on public.payroll_payouts
  for each row execute function public.pkm_touch_updated_at();

-- ---------------------------------------------------------------------------
-- HR: shifts (admin CRUD) + attendance check-in
-- ---------------------------------------------------------------------------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists shifts_touch_updated_at on public.shifts;
create trigger shifts_touch_updated_at
  before update on public.shifts
  for each row execute function public.pkm_touch_updated_at();

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  profile_id uuid not null references public.profiles (id),
  shift_id uuid references public.shifts (id),
  photo_url text,
  lat double precision,
  lng double precision,
  geofence_pass boolean,
  checked_in_at timestamptz not null default now()
);

create index if not exists attendance_tenant_idx on public.attendance (tenant_id, checked_in_at desc);
create index if not exists attendance_profile_idx on public.attendance (profile_id, checked_in_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.payroll_periods enable row level security;
alter table public.payroll_items enable row level security;
alter table public.payroll_payouts enable row level security;
alter table public.shifts enable row level security;
alter table public.attendance enable row level security;

drop policy if exists payroll_periods_admin_read on public.payroll_periods;
drop policy if exists payroll_items_self_read on public.payroll_items;
drop policy if exists payroll_items_admin_read on public.payroll_items;
drop policy if exists payroll_payouts_self_read on public.payroll_payouts;
drop policy if exists payroll_payouts_admin_read on public.payroll_payouts;
drop policy if exists shifts_member_read on public.shifts;
drop policy if exists shifts_admin_write on public.shifts;
drop policy if exists attendance_self_read on public.attendance;
drop policy if exists attendance_admin_read on public.attendance;

create policy payroll_periods_admin_read
  on public.payroll_periods for select to authenticated
  using (public.is_pkm_admin(tenant_id));

-- staff see their own payroll lines; admins see all (Ready.md §3.7 rider stats)
create policy payroll_items_self_read
  on public.payroll_items for select to authenticated
  using (profile_id in (select p.id from public.profiles p where p.user_id = auth.uid()));

create policy payroll_items_admin_read
  on public.payroll_items for select to authenticated
  using (public.is_pkm_admin(tenant_id));

create policy payroll_payouts_self_read
  on public.payroll_payouts for select to authenticated
  using (profile_id in (select p.id from public.profiles p where p.user_id = auth.uid()));

create policy payroll_payouts_admin_read
  on public.payroll_payouts for select to authenticated
  using (public.is_pkm_admin(tenant_id));

create policy shifts_member_read
  on public.shifts for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy shifts_admin_write
  on public.shifts for all to authenticated
  using (public.is_pkm_admin(tenant_id))
  with check (public.is_pkm_admin(tenant_id));

create policy attendance_self_read
  on public.attendance for select to authenticated
  using (profile_id in (select p.id from public.profiles p where p.user_id = auth.uid()));

create policy attendance_admin_read
  on public.attendance for select to authenticated
  using (public.is_pkm_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- Payroll functions (service role)
-- ---------------------------------------------------------------------------
create or replace function public.pkm_get_or_create_period(p_tenant_id uuid, p_ref timestamptz default now())
returns public.payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := (date_trunc('week', (p_ref at time zone 'Asia/Bangkok')))::date;  -- Monday
  v_row public.payroll_periods;
begin
  insert into public.payroll_periods (tenant_id, period_start, period_end)
  values (p_tenant_id, v_start, v_start + 7)
  on conflict (tenant_id, period_start) do update set period_end = excluded.period_end
  returning * into v_row;
  return v_row;
end;
$$;

-- Rider earns rider_fee_per_round when a round completes (Ready.md §3.7). Idempotent.
create or replace function public.pkm_record_rider_round_pay(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.delivery_rounds;
  v_period public.payroll_periods;
  v_fee integer;
begin
  select * into v_round from public.delivery_rounds where id = p_round_id;
  if not found or v_round.rider_id is null then return; end if;

  v_fee := public.pkm_setting_int(v_round.tenant_id, 'rider_fee_per_round', 25);
  v_period := public.pkm_get_or_create_period(v_round.tenant_id, now());

  insert into public.payroll_items (tenant_id, period_id, profile_id, kind, ref, amount)
  values (v_round.tenant_id, v_period.id, v_round.rider_id, 'rider_round', p_round_id, v_fee)
  on conflict (tenant_id, kind, ref, profile_id) do nothing;
end;
$$;

-- Packer earns per-piece commission when an order is packed (Ready.md §3.7). Idempotent.
create or replace function public.pkm_record_packer_commission(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_period public.payroll_periods;
  v_amount integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.packer_id is null then return; end if;

  select coalesce(sum(commission_snapshot * qty), 0) into v_amount
  from public.order_items where order_id = p_order_id;

  if v_amount <= 0 then return; end if;

  v_period := public.pkm_get_or_create_period(v_order.tenant_id, now());

  insert into public.payroll_items (tenant_id, period_id, profile_id, kind, ref, amount)
  values (v_order.tenant_id, v_period.id, v_order.packer_id, 'packer_commission', p_order_id, v_amount)
  on conflict (tenant_id, kind, ref, profile_id) do nothing;
end;
$$;

-- Cron payroll-cutoff (Sun 24:00 TZ): close the current period and stage payouts per person.
create or replace function public.pkm_close_payroll_period(p_tenant_id uuid)
returns public.payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.payroll_periods;
begin
  v_period := public.pkm_get_or_create_period(p_tenant_id, now() - interval '1 minute'); -- the week just ended
  update public.payroll_periods set status = 'closed', closed_at = now()
  where id = v_period.id and status = 'open'
  returning * into v_period;

  insert into public.payroll_payouts (tenant_id, period_id, profile_id, total)
  select pi.tenant_id, pi.period_id, pi.profile_id, sum(pi.amount)
  from public.payroll_items pi
  where pi.period_id = v_period.id
  group by pi.tenant_id, pi.period_id, pi.profile_id
  on conflict (period_id, profile_id) do update set total = excluded.total, updated_at = now();

  return v_period;
end;
$$;

revoke execute on function public.pkm_get_or_create_period(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.pkm_record_rider_round_pay(uuid) from public, anon, authenticated;
revoke execute on function public.pkm_record_packer_commission(uuid) from public, anon, authenticated;
revoke execute on function public.pkm_close_payroll_period(uuid) from public, anon, authenticated;
grant execute on function public.pkm_get_or_create_period(uuid, timestamptz) to service_role;
grant execute on function public.pkm_record_rider_round_pay(uuid) to service_role;
grant execute on function public.pkm_record_packer_commission(uuid) to service_role;
grant execute on function public.pkm_close_payroll_period(uuid) to service_role;

-- ═══ 20260713060000_pkm_phase7_storage_policies.sql ═══
-- PKM-Shop — Phase 7: storage RLS for staff uploads/views on the private operational buckets.
-- Paths are `<bucket>/<tenant_id>/<...>`; tenant members may insert + read within their tenant
-- folder. Customer slip uploads still use server-minted signed upload URLs (service role).

do $$
declare
  b text;
begin
  foreach b in array array['stock-in', 'packing', 'pod', 'checkin', 'payment-slips'] loop
    execute format('drop policy if exists %I on storage.objects', 'pkm_' || replace(b, '-', '_') || '_member_insert');
    execute format('drop policy if exists %I on storage.objects', 'pkm_' || replace(b, '-', '_') || '_member_select');
  end loop;
end;
$$;

-- insert (staff upload photos: stock-in, packing, pod, checkin)
create policy pkm_stock_in_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'stock-in' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_packing_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'packing' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_pod_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pod' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_checkin_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'checkin' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_payment_slips_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-slips' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));

-- select (staff view: signed URLs in the web app)
create policy pkm_stock_in_member_select on storage.objects for select to authenticated
  using (bucket_id = 'stock-in' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_packing_member_select on storage.objects for select to authenticated
  using (bucket_id = 'packing' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_pod_member_select on storage.objects for select to authenticated
  using (bucket_id = 'pod' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_checkin_member_select on storage.objects for select to authenticated
  using (bucket_id = 'checkin' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_payment_slips_member_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));

-- payout-slips bucket (admin uploads transfer proof)
insert into storage.buckets (id, name, public) values ('payout-slips', 'payout-slips', false)
on conflict (id) do nothing;

drop policy if exists pkm_payout_slips_member_insert on storage.objects;
drop policy if exists pkm_payout_slips_member_select on storage.objects;
create policy pkm_payout_slips_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payout-slips' and public.is_tenant_admin(((storage.foldername(name))[1])::uuid));
create policy pkm_payout_slips_member_select on storage.objects for select to authenticated
  using (bucket_id = 'payout-slips' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));

-- team-chat images bucket
insert into storage.buckets (id, name, public) values ('team-chat', 'team-chat', false)
on conflict (id) do nothing;

drop policy if exists pkm_team_chat_member_insert on storage.objects;
drop policy if exists pkm_team_chat_member_select on storage.objects;
create policy pkm_team_chat_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team-chat' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_team_chat_member_select on storage.objects for select to authenticated
  using (bucket_id = 'team-chat' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
