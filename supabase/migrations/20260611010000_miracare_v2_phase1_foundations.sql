create extension if not exists pgcrypto;

create or replace function public.miracare_slugify(value text, fallback text)
returns text
language plpgsql
immutable
as $$
declare
  candidate text;
begin
  candidate := lower(regexp_replace(coalesce(value, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  candidate := trim(both '-' from candidate);
  candidate := left(candidate, 32);

  if length(candidate) < 2 then
    candidate := lower(regexp_replace(coalesce(fallback, 'item'), '[^a-zA-Z0-9]+', '-', 'g'));
    candidate := trim(both '-' from candidate);
    candidate := left(candidate, 32);
  end if;

  if length(candidate) < 2 then
    candidate := 'item';
  end if;

  return candidate;
end;
$$;

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

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants (id),
  auth_user_id uuid not null references auth.users (id),
  role text not null check (role in ('superadmin', 'tenant_admin', 'tenant_staff')),
  primary key (tenant_id, auth_user_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  catalog_key text not null check (catalog_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name text not null,
  description text not null default '',
  price_baht integer not null check (price_baht >= 0),
  category text not null default 'general',
  image_url text,
  branch_info text,
  requires_appointment boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, catalog_key)
);

create index if not exists customers_tenant_idx on public.customers (tenant_id);
create index if not exists customers_auth_user_idx on public.customers (auth_user_id);
create index if not exists customers_line_user_idx on public.customers (line_user_id);
create index if not exists tenant_members_auth_user_idx on public.tenant_members (auth_user_id);
create index if not exists products_tenant_active_category_idx on public.products (tenant_id, active, category);

create or replace function public.miracare_generate_catalog_key()
returns trigger
language plpgsql
as $$
declare
  base_key text;
  candidate_key text;
begin
  if tg_op = 'UPDATE' and new.catalog_key <> old.catalog_key then
    raise exception 'catalog_key is immutable';
  end if;

  if tg_op = 'INSERT' and (new.catalog_key is null or btrim(new.catalog_key) = '') then
    base_key := public.miracare_slugify(new.name, 'product-' || left(md5(new.id::text), 8));
    candidate_key := base_key;

    while exists (
      select 1
      from public.products p
      where p.tenant_id = new.tenant_id
        and p.catalog_key = candidate_key
        and p.id <> new.id
    ) loop
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
create trigger products_catalog_key_guard
  before insert or update on public.products
  for each row execute function public.miracare_generate_catalog_key();

create table if not exists public.fact_keys (
  key text primary key,
  value_kind text not null check (value_kind in ('number', 'text', 'text_list', 'date_fuzzy')),
  unit text
);

create table if not exists public.user_facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  customer_id uuid not null references public.customers (id),
  key text not null references public.fact_keys (key),
  value_text text,
  value_num numeric,
  confidence numeric not null check (confidence between 0 and 1),
  status text not null default 'active' check (status in ('active', 'candidate', 'superseded', 'retracted')),
  source text not null check (source in ('chat_extraction', 'lab_import', 'wearable', 'user_form', 'referrer_form', 'user_confirmation')),
  source_ref uuid,
  superseded_by uuid references public.user_facts (id),
  created_at timestamptz not null default now()
);

create index if not exists user_facts_tenant_idx on public.user_facts (tenant_id);
create index if not exists user_facts_customer_idx on public.user_facts (customer_id);
create index if not exists user_facts_key_idx on public.user_facts (key);
create index if not exists user_facts_active_customer_key_idx on public.user_facts (customer_id, key) where status = 'active';
create index if not exists user_facts_superseded_by_idx on public.user_facts (superseded_by) where superseded_by is not null;
create unique index if not exists user_facts_dedupe on public.user_facts (customer_id, key, source, source_ref);

do $$
begin
  if to_regclass('public.consents') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'consents'
        and column_name = 'customer_id'
    ) then
    if to_regclass('public.legacy_consents') is null then
      alter table public.consents rename to legacy_consents;
    else
      alter table public.consents rename to legacy_consents_20260611010000;
    end if;
  end if;
end;
$$;

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  customer_id uuid not null references public.customers (id),
  kind text not null check (kind in ('health_data_collection')),
  granted boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists consents_tenant_idx on public.consents (tenant_id);
create index if not exists consents_customer_kind_created_idx on public.consents (customer_id, kind, created_at desc);

insert into public.fact_keys (key, value_kind, unit)
values
  ('age', 'number', 'year'),
  ('sex', 'text', null),
  ('weight_kg', 'number', 'kg'),
  ('height_cm', 'number', 'cm'),
  ('chronic_conditions', 'text_list', null),
  ('allergies', 'text_list', null),
  ('medications', 'text_list', null),
  ('smoking', 'text', null),
  ('alcohol', 'text', null),
  ('exercise_freq', 'text', null),
  ('last_checkup', 'date_fuzzy', null),
  ('health_concerns', 'text_list', null),
  ('family_history', 'text_list', null),
  ('location_area', 'text', null),
  ('nickname', 'text', null),
  ('birth_year', 'number', 'year')
on conflict (key) do update
set value_kind = excluded.value_kind,
    unit = excluded.unit;

do $$
begin
  if to_regclass('public.hospital_products') is not null then
    execute $sql$
      with source_hospitals as (
        select distinct coalesce(nullif(trim(hospital_name), ''), 'Legacy Hospital') as display_name
        from public.hospital_products
      ),
      normalized as (
        select
          display_name,
          public.miracare_slugify(display_name, 'tenant-' || left(md5(display_name), 8)) as base_slug
        from source_hospitals
      ),
      deduped as (
        select
          display_name,
          case
            when count(*) over (partition by base_slug) = 1 then base_slug
            else left(base_slug, 27) || '-' || left(md5(display_name), 4)
          end as slug
        from normalized
      )
      insert into public.tenants (slug, display_name, features)
      select slug, display_name, '{"dashboard": true}'::jsonb
      from deduped
      on conflict (slug) do update
      set display_name = excluded.display_name
    $sql$;

    execute $sql$
      with legacy_products as (
        select
          hp.*,
          coalesce(nullif(trim(hp.hospital_name), ''), 'Legacy Hospital') as resolved_hospital_name
        from public.hospital_products hp
      ),
      mapped_products as (
        select
          lp.*,
          public.miracare_slugify(lp.resolved_hospital_name, 'tenant-' || left(md5(lp.resolved_hospital_name), 8)) as tenant_slug,
          case
            when lp.category = 'vaccine' then 'vaccine'
            when lp.category in ('health_checkup', 'lab_test', 'imaging') then 'checkup'
            else 'general'
          end as v2_category
        from legacy_products lp
      )
      insert into public.products (
        tenant_id,
        catalog_key,
        name,
        description,
        price_baht,
        category,
        image_url,
        branch_info,
        requires_appointment,
        active,
        created_at,
        updated_at
      )
      select
        t.id,
        public.miracare_slugify(mp.title, 'product-' || left(md5(mp.id::text), 8)) || '-' || left(md5(mp.id::text), 4),
        mp.title,
        mp.description,
        mp.price_amount,
        mp.v2_category,
        nullif(mp.metadata ->> 'product_image_preview_uri', ''),
        nullif(concat_ws(E'\n', mp.hospital_name, mp.hospital_address, mp.location, mp.booking_note), ''),
        true,
        mp.status = 'active',
        mp.created_at,
        coalesce(mp.updated_at, mp.created_at, now())
      from mapped_products mp
      join public.tenants t on t.slug = mp.tenant_slug
      on conflict (tenant_id, catalog_key) do update
      set name = excluded.name,
          description = excluded.description,
          price_baht = excluded.price_baht,
          category = excluded.category,
          image_url = excluded.image_url,
          branch_info = excluded.branch_info,
          requires_appointment = excluded.requires_appointment,
          active = excluded.active,
          updated_at = excluded.updated_at
    $sql$;
  end if;
end;
$$;

drop policy if exists "Hospital staff can insert product RAG chunks" on public.rag_chunks;
drop policy if exists "Hospital staff can update product RAG chunks" on public.rag_chunks;
drop policy if exists "Anyone can read active hospital products" on public.hospital_products;
drop policy if exists "Authenticated users can create hospital products" on public.hospital_products;
drop policy if exists "Product creators and admins can read managed hospital products" on public.hospital_products;
drop policy if exists "Product creators and admins can update hospital products" on public.hospital_products;
drop table if exists public.hospital_products;

create or replace function public.tenant_role(check_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tm.role
  from public.tenant_members tm
  where tm.tenant_id = check_tenant_id
    and tm.auth_user_id = auth.uid()
  order by case tm.role
    when 'superadmin' then 1
    when 'tenant_admin' then 2
    else 3
  end
  limit 1
$$;

create or replace function public.is_tenant_member(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tenant_role(check_tenant_id) is not null
$$;

create or replace function public.is_tenant_admin(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.tenant_role(check_tenant_id), '') in ('superadmin', 'tenant_admin')
$$;

create or replace function public.is_tenant_admin_slug(check_tenant_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenants t
    where t.slug = check_tenant_slug
      and public.is_tenant_admin(t.id)
  )
$$;

alter table public.tenants enable row level security;
alter table public.customers enable row level security;
alter table public.tenant_members enable row level security;
alter table public.products enable row level security;
alter table public.fact_keys enable row level security;
alter table public.user_facts enable row level security;
alter table public.consents enable row level security;

drop policy if exists tenants_member_read on public.tenants;
drop policy if exists tenants_admin_update on public.tenants;
drop policy if exists customers_customer_read on public.customers;
drop policy if exists customers_staff_all on public.customers;
drop policy if exists tenant_members_self_read on public.tenant_members;
drop policy if exists tenant_members_admin_all on public.tenant_members;
drop policy if exists products_customer_active_read on public.products;
drop policy if exists products_staff_read on public.products;
drop policy if exists products_admin_write on public.products;
drop policy if exists fact_keys_authenticated_read on public.fact_keys;
drop policy if exists user_facts_customer_read on public.user_facts;
drop policy if exists user_facts_customer_insert on public.user_facts;
drop policy if exists user_facts_staff_all on public.user_facts;
drop policy if exists consents_customer_read on public.consents;
drop policy if exists consents_customer_insert on public.consents;
drop policy if exists consents_staff_all on public.consents;

create policy tenants_member_read
  on public.tenants
  for select
  to authenticated
  using (public.is_tenant_member(id));

create policy tenants_admin_update
  on public.tenants
  for update
  to authenticated
  using (public.is_tenant_admin(id))
  with check (public.is_tenant_admin(id));

create policy customers_customer_read
  on public.customers
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy customers_staff_all
  on public.customers
  for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy tenant_members_self_read
  on public.tenant_members
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy tenant_members_admin_all
  on public.tenant_members
  for all
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy products_customer_active_read
  on public.products
  for select
  to authenticated
  using (
    active
    and exists (
      select 1
      from public.customers c
      where c.tenant_id = products.tenant_id
        and c.auth_user_id = auth.uid()
    )
  );

create policy products_staff_read
  on public.products
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy products_admin_write
  on public.products
  for all
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy fact_keys_authenticated_read
  on public.fact_keys
  for select
  to authenticated
  using (true);

create policy user_facts_customer_read
  on public.user_facts
  for select
  to authenticated
  using (
    customer_id in (
      select c.id
      from public.customers c
      where c.auth_user_id = auth.uid()
    )
  );

create policy user_facts_customer_insert
  on public.user_facts
  for insert
  to authenticated
  with check (
    source = 'user_form'
    and customer_id in (
      select c.id
      from public.customers c
      where c.auth_user_id = auth.uid()
        and c.tenant_id = user_facts.tenant_id
    )
  );

create policy user_facts_staff_all
  on public.user_facts
  for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy consents_customer_read
  on public.consents
  for select
  to authenticated
  using (
    customer_id in (
      select c.id
      from public.customers c
      where c.auth_user_id = auth.uid()
    )
  );

create policy consents_customer_insert
  on public.consents
  for insert
  to authenticated
  with check (
    customer_id in (
      select c.id
      from public.customers c
      where c.auth_user_id = auth.uid()
        and c.tenant_id = consents.tenant_id
    )
  );

create policy consents_staff_all
  on public.consents
  for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

insert into storage.buckets (id, name, public)
values
  ('lab-reports', 'lab-reports', false),
  ('payment-slips', 'payment-slips', false),
  ('product-images', 'product-images', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists product_images_public_read on storage.objects;
drop policy if exists product_images_staff_insert on storage.objects;
drop policy if exists product_images_staff_update on storage.objects;

create policy product_images_public_read
  on storage.objects
  for select
  using (bucket_id = 'product-images');

create policy product_images_staff_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.is_tenant_admin_slug((storage.foldername(name))[1])
  );

create policy product_images_staff_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_tenant_admin_slug((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'product-images'
    and public.is_tenant_admin_slug((storage.foldername(name))[1])
  );
