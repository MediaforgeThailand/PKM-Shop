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
