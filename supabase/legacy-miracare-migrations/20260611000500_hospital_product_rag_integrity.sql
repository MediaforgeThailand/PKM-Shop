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
  hospital_address text,
  hospital_map_query text,
  hospital_lat numeric,
  hospital_lng numeric,
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

create policy "Anyone can read active hospital products"
  on public.hospital_products
  for select
  to anon, authenticated
  using (status = 'active');

alter table public.hospital_products
  add column if not exists rag_status text not null default 'not_published',
  add column if not exists rag_embedding_status text not null default 'not_published',
  add column if not exists rag_embedding_error text,
  add column if not exists rag_embedding_model text,
  add column if not exists rag_embedding_dimensions integer,
  add column if not exists rag_embedding_updated_at timestamptz;

alter table public.hospital_products
  drop constraint if exists hospital_products_rag_status_check,
  drop constraint if exists hospital_products_rag_embedding_status_check;

alter table public.hospital_products
  add constraint hospital_products_rag_status_check
    check (rag_status in ('not_published', 'published', 'archived', 'error')),
  add constraint hospital_products_rag_embedding_status_check
    check (rag_embedding_status in ('not_published', 'pending', 'embedded', 'error', 'skipped'));

alter table public.rag_chunks
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists linked_hospital_product_id uuid references public.hospital_products (id) on delete set null;

update public.hospital_products
set
  rag_status = case
    when rag_chunk_id is null then 'not_published'
    when status = 'archived' then 'archived'
    else 'published'
  end,
  rag_embedding_status = case
    when rag_chunk_id is null then 'not_published'
    else coalesce(nullif(rag_embedding_status, 'not_published'), 'pending')
  end
where true;

update public.rag_chunks
set linked_hospital_product_id = hospital_products.id
from public.hospital_products
where rag_chunks.id = hospital_products.rag_chunk_id
  and rag_chunks.linked_hospital_product_id is null;

create or replace function public._jsonb_text_scope_contains(p_scope jsonb, p_value text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(coalesce(p_scope, '[]'::jsonb)) = 'array' then coalesce(p_scope, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as scope(value)
    where lower(trim(scope.value)) = lower(trim(coalesce(p_value, '')))
  );
$$;

create or replace function public._hospital_scope_matches(p_metadata jsonb, p_hospital_name text)
returns boolean
language sql
stable
as $$
  select
    length(trim(coalesce(p_hospital_name, ''))) > 0
    and (
      lower(trim(coalesce(p_metadata ->> 'hospital_name', ''))) = lower(trim(p_hospital_name))
      or public._jsonb_text_scope_contains(p_metadata -> 'hospital_names', p_hospital_name)
    );
$$;

create or replace function public.is_hospital_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin()
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'hospital_staff'
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'hospital_staff'
    or exists (
      select 1
      from public.app_user_roles
      where user_id = auth.uid()
        and role = 'hospital_staff'
    );
$$;

create or replace function public.can_manage_hospital_product(p_hospital_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin()
    or (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'hospital_staff'
      and public._hospital_scope_matches(auth.jwt() -> 'app_metadata', p_hospital_name)
    )
    or (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'hospital_staff'
      and public._hospital_scope_matches(auth.jwt() -> 'user_metadata', p_hospital_name)
    )
    or exists (
      select 1
      from public.app_user_roles
      where user_id = auth.uid()
        and role = 'hospital_staff'
        and public._hospital_scope_matches(metadata, p_hospital_name)
    );
$$;

drop policy if exists "Authenticated users can create hospital products" on public.hospital_products;
drop policy if exists "Product creators and admins can update hospital products" on public.hospital_products;
drop policy if exists "Product creators and admins can read managed hospital products" on public.hospital_products;

create policy "Scoped hospital staff can create hospital products"
  on public.hospital_products
  for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and public.can_manage_hospital_product(hospital_name)
  );

create policy "Scoped creators and admins can update hospital products"
  on public.hospital_products
  for update
  to authenticated
  using (
    public.is_app_admin()
    or (
      auth.uid() = created_by
      and public.can_manage_hospital_product(hospital_name)
    )
  )
  with check (
    public.is_app_admin()
    or (
      auth.uid() = created_by
      and public.can_manage_hospital_product(hospital_name)
    )
  );

create policy "Scoped staff can read managed hospital products"
  on public.hospital_products
  for select
  to authenticated
  using (
    auth.uid() = created_by
    or public.is_app_admin()
    or public.can_manage_hospital_product(hospital_name)
  );

drop policy if exists "Hospital staff can insert product RAG chunks" on public.rag_chunks;
drop policy if exists "Hospital staff can update product RAG chunks" on public.rag_chunks;

create policy "Admins can insert product RAG chunks"
  on public.rag_chunks
  for insert
  to authenticated
  with check (
    public.is_app_admin()
    and category = 'marketplace.product'
    and source_type = 'hospital_operational'
    and source_url like 'mira://hospital-products/%'
  );

create policy "Scoped staff can update linked product RAG chunks"
  on public.rag_chunks
  for update
  to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1
      from public.hospital_products
      where hospital_products.rag_chunk_id = rag_chunks.id
        and auth.uid() = hospital_products.created_by
        and public.can_manage_hospital_product(hospital_products.hospital_name)
    )
  )
  with check (
    category = 'marketplace.product'
    and source_type = 'hospital_operational'
    and source_url like 'mira://hospital-products/%'
    and (
      public.is_app_admin()
      or exists (
        select 1
        from public.hospital_products
        where hospital_products.rag_chunk_id = rag_chunks.id
          and auth.uid() = hospital_products.created_by
          and public.can_manage_hospital_product(hospital_products.hospital_name)
      )
    )
  );

create or replace function public.create_hospital_product_with_rag(
  p_hospital_name text,
  p_hospital_address text,
  p_hospital_map_query text,
  p_hospital_lat numeric,
  p_hospital_lng numeric,
  p_title text,
  p_description text,
  p_category text,
  p_price_amount integer,
  p_includes text[],
  p_tags text[],
  p_preparation_notes text,
  p_booking_note text,
  p_auto_category_confidence numeric,
  p_metadata jsonb,
  p_rag_content text,
  p_rag_keywords text[],
  p_rag_summary text,
  p_rag_risk_level text,
  p_rag_topic text,
  p_expires_at timestamptz default null,
  p_rag_token_budget integer default 260,
  p_rag_priority integer default 42
)
returns public.hospital_products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.hospital_products;
  v_rag_chunk_id text;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'ต้อง login ก่อนเพิ่มสินค้าโรงพยาบาล';
  end if;

  if not public.can_manage_hospital_product(p_hospital_name) then
    raise exception 'บัญชีนี้ยังไม่ได้รับสิทธิ์จัดการสินค้าของโรงพยาบาลนี้';
  end if;

  if length(trim(coalesce(p_hospital_name, ''))) < 3 then
    raise exception 'กรุณาระบุชื่อโรงพยาบาล';
  end if;

  if length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'กรุณาระบุชื่อสินค้า';
  end if;

  if length(trim(coalesce(p_description, ''))) < 20 then
    raise exception 'กรุณาระบุรายละเอียดสินค้าให้เพียงพอสำหรับ RAG';
  end if;

  if coalesce(p_price_amount, 0) <= 0 then
    raise exception 'กรุณาระบุราคาสินค้ามากกว่า 0';
  end if;

  insert into public.hospital_products (
    auto_category_confidence,
    booking_note,
    category,
    created_by,
    description,
    duration,
    hospital_address,
    hospital_lat,
    hospital_lng,
    hospital_map_query,
    hospital_name,
    includes,
    location,
    metadata,
    preparation_notes,
    price_amount,
    rag_embedding_status,
    rag_status,
    status,
    tags,
    title
  )
  values (
    least(1, greatest(0, coalesce(p_auto_category_confidence, 0))),
    trim(coalesce(p_booking_note, '')),
    p_category,
    v_user_id,
    trim(p_description),
    null,
    trim(coalesce(p_hospital_address, '')),
    p_hospital_lat,
    p_hospital_lng,
    trim(coalesce(nullif(p_hospital_map_query, ''), p_hospital_name)),
    trim(p_hospital_name),
    coalesce(p_includes, '{}'),
    trim(coalesce(p_hospital_address, '')),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('rag_auto_publish', true),
    trim(coalesce(p_preparation_notes, '')),
    p_price_amount,
    'pending',
    'published',
    'active',
    coalesce(p_tags, '{}'),
    trim(p_title)
  )
  returning * into v_product;

  v_rag_chunk_id := 'hospital-product-' || v_product.id::text;

  insert into public.rag_chunks (
    audience,
    category,
    content,
    created_by,
    embedding,
    embedding_dimensions,
    embedding_model,
    embedding_updated_at,
    expires_at,
    id,
    is_active,
    keywords,
    language,
    last_reviewed_at,
    linked_hospital_product_id,
    priority,
    review_status,
    risk_level,
    source,
    source_type,
    source_url,
    summary,
    title,
    token_budget,
    topic
  )
  values (
    'patient',
    'marketplace.product',
    trim(p_rag_content),
    v_user_id,
    null,
    null,
    null,
    null,
    coalesce(p_expires_at, v_now + interval '1 year'),
    v_rag_chunk_id,
    true,
    coalesce(p_rag_keywords, '{}'),
    'th',
    v_now,
    v_product.id,
    least(100, greatest(1, coalesce(p_rag_priority, 42))),
    'approved',
    case when p_rag_risk_level in ('low', 'medium', 'high') then p_rag_risk_level else 'low' end,
    v_product.hospital_name || ' product portal',
    'hospital_operational',
    'mira://hospital-products/' || v_product.id::text,
    trim(p_rag_summary),
    v_product.title,
    least(2000, greatest(80, coalesce(p_rag_token_budget, 260))),
    p_rag_topic
  )
  on conflict (id) do update
  set
    audience = excluded.audience,
    category = excluded.category,
    content = excluded.content,
    created_by = excluded.created_by,
    embedding = null,
    embedding_dimensions = null,
    embedding_model = null,
    embedding_updated_at = null,
    expires_at = excluded.expires_at,
    is_active = true,
    keywords = excluded.keywords,
    language = excluded.language,
    last_reviewed_at = excluded.last_reviewed_at,
    linked_hospital_product_id = excluded.linked_hospital_product_id,
    priority = excluded.priority,
    review_status = 'approved',
    risk_level = excluded.risk_level,
    source = excluded.source,
    source_type = excluded.source_type,
    source_url = excluded.source_url,
    summary = excluded.summary,
    title = excluded.title,
    token_budget = excluded.token_budget,
    topic = excluded.topic,
    updated_at = v_now;

  update public.hospital_products
  set
    rag_chunk_id = v_rag_chunk_id,
    rag_embedding_status = 'pending',
    rag_embedding_error = null,
    rag_embedding_model = null,
    rag_embedding_dimensions = null,
    rag_embedding_updated_at = null,
    rag_status = 'published',
    updated_at = v_now
  where id = v_product.id
  returning * into v_product;

  return v_product;
end;
$$;

create or replace function public.update_hospital_product_status_with_rag(
  p_product_id uuid,
  p_status text
)
returns public.hospital_products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.hospital_products;
  v_is_active boolean;
begin
  if v_user_id is null then
    raise exception 'ต้อง login ก่อนจัดการสินค้าโรงพยาบาล';
  end if;

  if p_status not in ('active', 'archived', 'draft') then
    raise exception 'Unsupported product status: %', p_status;
  end if;

  select *
  into v_product
  from public.hospital_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'ไม่พบสินค้าโรงพยาบาล';
  end if;

  if not (
    public.is_app_admin()
    or (
      v_product.created_by = v_user_id
      and public.can_manage_hospital_product(v_product.hospital_name)
    )
  ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์จัดการสินค้านี้';
  end if;

  v_is_active := p_status = 'active';

  update public.hospital_products
  set
    status = p_status,
    rag_status = case
      when rag_chunk_id is null then 'not_published'
      when v_is_active then 'published'
      else 'archived'
    end,
    updated_at = now()
  where id = p_product_id
  returning * into v_product;

  if v_product.rag_chunk_id is not null then
    update public.rag_chunks
    set
      is_active = v_is_active,
      review_status = case when v_is_active then 'approved' else 'archived' end,
      updated_at = now()
    where id = v_product.rag_chunk_id;
  end if;

  return v_product;
end;
$$;

create or replace function public.update_rag_chunk_embedding(
  p_chunk_id text,
  p_embedding text,
  p_embedding_model text,
  p_embedding_dimensions integer default 768
)
returns table (
  id text,
  embedding_model text,
  embedding_dimensions integer,
  embedding_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.hospital_products;
begin
  if v_user_id is null then
    raise exception 'Missing authenticated user.';
  end if;

  if p_embedding_dimensions <> 768 then
    raise exception 'Unsupported embedding dimensions: %', p_embedding_dimensions;
  end if;

  select hospital_products.*
  into v_product
  from public.hospital_products
  join public.rag_chunks
    on rag_chunks.id = hospital_products.rag_chunk_id
  where rag_chunks.id = p_chunk_id
    and rag_chunks.category = 'marketplace.product'
  for update;

  if not found then
    raise exception 'Linked hospital product RAG chunk not found.';
  end if;

  if not (
    public.is_app_admin()
    or (
      v_product.created_by = v_user_id
      and public.can_manage_hospital_product(v_product.hospital_name)
    )
  ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์อัปเดต embedding ของ RAG นี้';
  end if;

  return query
  update public.rag_chunks
  set
    embedding = p_embedding::extensions.vector(768),
    embedding_model = p_embedding_model,
    embedding_dimensions = p_embedding_dimensions,
    embedding_updated_at = now(),
    updated_at = now()
  where rag_chunks.id = p_chunk_id
  returning
    rag_chunks.id,
    rag_chunks.embedding_model,
    rag_chunks.embedding_dimensions,
    rag_chunks.embedding_updated_at;

  update public.hospital_products
  set
    rag_embedding_status = 'embedded',
    rag_embedding_error = null,
    rag_embedding_model = p_embedding_model,
    rag_embedding_dimensions = p_embedding_dimensions,
    rag_embedding_updated_at = now(),
    updated_at = now()
  where hospital_products.id = v_product.id;
end;
$$;

create or replace function public.mark_hospital_product_rag_embedding_error(
  p_chunk_id text,
  p_error text
)
returns public.hospital_products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.hospital_products;
begin
  if v_user_id is null then
    raise exception 'Missing authenticated user.';
  end if;

  select hospital_products.*
  into v_product
  from public.hospital_products
  where hospital_products.rag_chunk_id = p_chunk_id
  for update;

  if not found then
    raise exception 'Linked hospital product RAG chunk not found.';
  end if;

  if not (
    public.is_app_admin()
    or (
      v_product.created_by = v_user_id
      and public.can_manage_hospital_product(v_product.hospital_name)
    )
  ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์อัปเดตสถานะ embedding ของ RAG นี้';
  end if;

  update public.hospital_products
  set
    rag_embedding_status = 'error',
    rag_embedding_error = left(coalesce(p_error, 'Embedding failed.'), 1000),
    rag_embedding_updated_at = now(),
    updated_at = now()
  where id = v_product.id
  returning * into v_product;

  return v_product;
end;
$$;

create or replace function public.match_rag_chunks(
  query_embedding text,
  match_threshold float default 0.62,
  match_count integer default 6,
  category_filter text[] default null
)
returns table (
  id text,
  title text,
  category text,
  topic text,
  audience text,
  language text,
  summary text,
  content text,
  keywords text[],
  source text,
  source_url text,
  source_type text,
  review_status text,
  risk_level text,
  medical_reviewer text,
  last_reviewed_at timestamptz,
  expires_at timestamptz,
  token_budget integer,
  priority integer,
  similarity float
)
language sql stable
as $$
  select
    rag_chunks.id,
    rag_chunks.title,
    rag_chunks.category,
    rag_chunks.topic,
    rag_chunks.audience,
    rag_chunks.language,
    rag_chunks.summary,
    rag_chunks.content,
    rag_chunks.keywords,
    rag_chunks.source,
    rag_chunks.source_url,
    rag_chunks.source_type,
    rag_chunks.review_status,
    rag_chunks.risk_level,
    rag_chunks.medical_reviewer,
    rag_chunks.last_reviewed_at,
    rag_chunks.expires_at,
    rag_chunks.token_budget,
    rag_chunks.priority,
    1 - (rag_chunks.embedding OPERATOR(extensions.<=>) query_embedding::extensions.vector(768)) as similarity
  from public.rag_chunks
  where rag_chunks.is_active = true
    and rag_chunks.review_status = 'approved'
    and rag_chunks.embedding is not null
    and (rag_chunks.expires_at is null or rag_chunks.expires_at > now())
    and (
      category_filter is null
      or cardinality(category_filter) = 0
      or rag_chunks.category = any(category_filter)
    )
    and 1 - (rag_chunks.embedding OPERATOR(extensions.<=>) query_embedding::extensions.vector(768)) >= match_threshold
  order by rag_chunks.embedding OPERATOR(extensions.<=>) query_embedding::extensions.vector(768) asc, rag_chunks.priority asc, rag_chunks.created_at asc
  limit least(match_count, 20);
$$;

revoke execute on function public.is_hospital_staff() from public;
revoke execute on function public.can_manage_hospital_product(text) from public;
revoke execute on function public.create_hospital_product_with_rag(
  text, text, text, numeric, numeric, text, text, text, integer, text[], text[], text, text, numeric, jsonb, text, text[], text, text, text, timestamptz, integer, integer
) from public;
revoke execute on function public.update_hospital_product_status_with_rag(uuid, text) from public;
revoke execute on function public.update_rag_chunk_embedding(text, text, text, integer) from public;
revoke execute on function public.mark_hospital_product_rag_embedding_error(text, text) from public;

grant execute on function public.is_hospital_staff() to authenticated;
grant execute on function public.can_manage_hospital_product(text) to authenticated;
grant execute on function public.create_hospital_product_with_rag(
  text, text, text, numeric, numeric, text, text, text, integer, text[], text[], text, text, numeric, jsonb, text, text[], text, text, text, timestamptz, integer, integer
) to authenticated;
grant execute on function public.update_hospital_product_status_with_rag(uuid, text) to authenticated;
grant execute on function public.update_rag_chunk_embedding(text, text, text, integer) to authenticated;
grant execute on function public.mark_hospital_product_rag_embedding_error(text, text) to authenticated;
