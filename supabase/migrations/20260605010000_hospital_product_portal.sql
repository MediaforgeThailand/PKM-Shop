alter table public.rag_chunks
  drop constraint if exists rag_chunks_category_taxonomy_check;

alter table public.rag_chunks
  add constraint rag_chunks_category_taxonomy_check
    check (category in (
      'care.checkup_preparation',
      'care.patient_education',
      'marketplace.product',
      'ops.booking',
      'ops.call_center',
      'ops.payment',
      'ops.referral',
      'privacy.consent',
      'safety.escalation'
    ));

create table if not exists public.hospital_products (
  id uuid primary key default gen_random_uuid(),
  hospital_name text not null,
  title text not null,
  description text not null,
  category text not null check (category in (
    'health_checkup',
    'lab_test',
    'imaging',
    'vaccine',
    'specialty_consult',
    'wellness',
    'procedure',
    'other'
  )),
  price_amount integer not null check (price_amount >= 0),
  currency text not null default 'THB' check (currency = 'THB'),
  duration text,
  location text,
  includes text[] not null default '{}',
  tags text[] not null default '{}',
  preparation_notes text,
  booking_note text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  rag_chunk_id text references public.rag_chunks (id) on delete set null,
  auto_category_confidence numeric not null default 0 check (auto_category_confidence >= 0 and auto_category_confidence <= 1),
  created_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hospital_products enable row level security;

drop policy if exists "Anyone can read active hospital products" on public.hospital_products;
drop policy if exists "Authenticated users can create hospital products" on public.hospital_products;
drop policy if exists "Product creators and admins can update hospital products" on public.hospital_products;
drop policy if exists "Hospital staff can insert product RAG chunks" on public.rag_chunks;
drop policy if exists "Hospital staff can update product RAG chunks" on public.rag_chunks;

create policy "Anyone can read active hospital products"
  on public.hospital_products
  for select
  to anon, authenticated
  using (status = 'active');

create policy "Authenticated users can create hospital products"
  on public.hospital_products
  for insert
  to authenticated
  with check (auth.uid() = created_by or public.is_app_admin());

create policy "Product creators and admins can update hospital products"
  on public.hospital_products
  for update
  to authenticated
  using (auth.uid() = created_by or public.is_app_admin())
  with check (auth.uid() = created_by or public.is_app_admin());

create policy "Hospital staff can insert product RAG chunks"
  on public.rag_chunks
  for insert
  to authenticated
  with check (
    category = 'marketplace.product'
    and source_type = 'hospital_operational'
    and source_url like 'mira://hospital-products/%'
  );

create policy "Hospital staff can update product RAG chunks"
  on public.rag_chunks
  for update
  to authenticated
  using (
    category = 'marketplace.product'
    and source_type = 'hospital_operational'
    and source_url like 'mira://hospital-products/%'
  )
  with check (
    category = 'marketplace.product'
    and source_type = 'hospital_operational'
    and source_url like 'mira://hospital-products/%'
  );

create index if not exists hospital_products_status_category_idx
  on public.hospital_products (status, category, created_at desc);

create index if not exists hospital_products_tags_idx
  on public.hospital_products using gin (tags);
