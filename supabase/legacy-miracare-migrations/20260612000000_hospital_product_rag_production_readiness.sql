insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'hospital-product-images',
  'hospital-product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists "Public can read hospital product images" on storage.objects;
drop policy if exists "Hospital staff can upload hospital product images" on storage.objects;
drop policy if exists "Hospital staff can update hospital product images" on storage.objects;
drop policy if exists "Hospital staff can delete hospital product images" on storage.objects;

create policy "Public can read hospital product images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'hospital-product-images');

create policy "Hospital staff can upload hospital product images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'hospital-product-images'
    and public.is_hospital_staff()
  );

create policy "Hospital staff can update hospital product images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'hospital-product-images'
    and public.is_hospital_staff()
  )
  with check (
    bucket_id = 'hospital-product-images'
    and public.is_hospital_staff()
  );

create policy "Hospital staff can delete hospital product images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'hospital-product-images'
    and public.is_hospital_staff()
  );

alter table public.hospital_products
  add column if not exists review_status text not null default 'pending_review',
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists submitted_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists product_image_bucket text,
  add column if not exists product_image_path text,
  add column if not exists product_image_url text,
  add column if not exists product_image_mime_type text,
  add column if not exists product_image_size integer;

alter table public.hospital_products
  drop constraint if exists hospital_products_status_check,
  drop constraint if exists hospital_products_review_status_check,
  drop constraint if exists hospital_products_rag_status_check,
  drop constraint if exists hospital_products_product_image_size_check,
  drop constraint if exists hospital_products_product_image_mime_type_check;

alter table public.hospital_products
  add constraint hospital_products_status_check
    check (status in ('draft', 'pending_review', 'active', 'archived', 'rejected')),
  add constraint hospital_products_review_status_check
    check (review_status in ('draft', 'pending_review', 'approved', 'rejected', 'archived')),
  add constraint hospital_products_rag_status_check
    check (rag_status in ('not_published', 'pending_review', 'published', 'archived', 'error', 'rejected')),
  add constraint hospital_products_product_image_size_check
    check (product_image_size is null or product_image_size between 1 and 5242880),
  add constraint hospital_products_product_image_mime_type_check
    check (
      product_image_mime_type is null
      or product_image_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    );

update public.hospital_products
set
  review_status = case
    when status = 'active' then 'approved'
    when status = 'archived' then 'archived'
    when status = 'rejected' then 'rejected'
    else 'pending_review'
  end,
  submitted_at = coalesce(submitted_at, created_at),
  published_at = case
    when status = 'active' then coalesce(published_at, created_at)
    else published_at
  end,
  archived_at = case
    when status = 'archived' then coalesce(archived_at, updated_at, created_at)
    else archived_at
  end,
  product_image_bucket = coalesce(product_image_bucket, nullif(metadata ->> 'product_image_storage_bucket', '')),
  product_image_path = coalesce(product_image_path, nullif(metadata ->> 'product_image_storage_path', '')),
  product_image_url = coalesce(
    product_image_url,
    nullif(metadata ->> 'product_image_public_url', ''),
    case
      when coalesce(metadata ->> 'product_image_preview_uri', '') like 'http%' then metadata ->> 'product_image_preview_uri'
      else null
    end
  ),
  product_image_mime_type = coalesce(
    product_image_mime_type,
    case
      when metadata ->> 'product_image_mime_type' in ('image/jpeg', 'image/png', 'image/webp') then metadata ->> 'product_image_mime_type'
      else null
    end
  ),
  product_image_size = case
    when coalesce(metadata ->> 'product_image_size', '') ~ '^[0-9]+$'
      and (metadata ->> 'product_image_size')::integer between 1 and 5242880
      then (metadata ->> 'product_image_size')::integer
    else product_image_size
  end
where review_status is null
  or submitted_at is null
  or product_image_url is null;

create table if not exists public.hospital_product_audit_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.hospital_products (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in (
    'submitted_for_review',
    'approved',
    'rejected',
    'archived',
    'restored',
    'moved_to_draft',
    'embedding_retry_requested',
    'embedding_embedded',
    'embedding_error'
  )),
  from_status text,
  to_status text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.hospital_product_audit_logs enable row level security;

drop policy if exists "Admins can read hospital product audit logs" on public.hospital_product_audit_logs;
drop policy if exists "Scoped staff can read hospital product audit logs" on public.hospital_product_audit_logs;

create policy "Admins can read hospital product audit logs"
  on public.hospital_product_audit_logs
  for select
  to authenticated
  using (public.is_app_admin());

create policy "Scoped staff can read hospital product audit logs"
  on public.hospital_product_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.hospital_products
      where hospital_products.id = hospital_product_audit_logs.product_id
        and public.can_manage_hospital_product(hospital_products.hospital_name)
    )
  );

create index if not exists hospital_products_review_status_idx
  on public.hospital_products (review_status, status, created_at desc);

create index if not exists hospital_product_audit_logs_product_idx
  on public.hospital_product_audit_logs (product_id, created_at desc);

drop policy if exists "Anyone can read active hospital products" on public.hospital_products;

create policy "Anyone can read active hospital products"
  on public.hospital_products
  for select
  to anon, authenticated
  using (
    status = 'active'
    and review_status = 'approved'
  );

create or replace function public.log_hospital_product_audit(
  p_product_id uuid,
  p_action text,
  p_from_status text default null,
  p_to_status text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hospital_product_audit_logs (
    product_id,
    actor_id,
    action,
    from_status,
    to_status,
    metadata
  )
  values (
    p_product_id,
    auth.uid(),
    p_action,
    p_from_status,
    p_to_status,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

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
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
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
    product_image_bucket,
    product_image_mime_type,
    product_image_path,
    product_image_size,
    product_image_url,
    rag_embedding_status,
    rag_status,
    review_status,
    status,
    submitted_at,
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
    v_metadata || jsonb_build_object('rag_auto_publish', false, 'review_required', true),
    trim(coalesce(p_preparation_notes, '')),
    p_price_amount,
    nullif(v_metadata ->> 'product_image_storage_bucket', ''),
    case
      when v_metadata ->> 'product_image_mime_type' in ('image/jpeg', 'image/png', 'image/webp') then v_metadata ->> 'product_image_mime_type'
      else null
    end,
    nullif(v_metadata ->> 'product_image_storage_path', ''),
    case
      when coalesce(v_metadata ->> 'product_image_size', '') ~ '^[0-9]+$'
        and (v_metadata ->> 'product_image_size')::integer between 1 and 5242880
        then (v_metadata ->> 'product_image_size')::integer
      else null
    end,
    nullif(v_metadata ->> 'product_image_public_url', ''),
    'not_published',
    'pending_review',
    'pending_review',
    'pending_review',
    v_now,
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
    false,
    coalesce(p_rag_keywords, '{}'),
    'th',
    null,
    v_product.id,
    least(100, greatest(1, coalesce(p_rag_priority, 42))),
    'draft',
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
    is_active = false,
    keywords = excluded.keywords,
    language = excluded.language,
    last_reviewed_at = null,
    linked_hospital_product_id = excluded.linked_hospital_product_id,
    priority = excluded.priority,
    review_status = 'draft',
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
    rag_embedding_status = 'not_published',
    rag_embedding_error = null,
    rag_embedding_model = null,
    rag_embedding_dimensions = null,
    rag_embedding_updated_at = null,
    rag_status = 'pending_review',
    updated_at = v_now
  where id = v_product.id
  returning * into v_product;

  perform public.log_hospital_product_audit(
    v_product.id,
    'submitted_for_review',
    null,
    v_product.status,
    jsonb_build_object(
      'rag_chunk_id', v_rag_chunk_id,
      'risk_level', case when p_rag_risk_level in ('low', 'medium', 'high') then p_rag_risk_level else 'low' end,
      'has_preparation_notes', length(trim(coalesce(p_preparation_notes, ''))) > 0
    )
  );

  return v_product;
end;
$$;

create or replace function public.approve_hospital_product_rag(
  p_product_id uuid,
  p_review_note text default null
)
returns public.hospital_products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.hospital_products;
  v_from_status text;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'ต้อง login ก่อน approve สินค้าโรงพยาบาล';
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
    or public.can_manage_hospital_product(v_product.hospital_name)
  ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์ approve สินค้านี้';
  end if;

  if v_product.rag_chunk_id is null then
    raise exception 'สินค้านี้ยังไม่มี RAG chunk';
  end if;

  v_from_status := v_product.status;

  update public.hospital_products
  set
    status = 'active',
    review_status = 'approved',
    reviewed_by = v_user_id,
    reviewed_at = v_now,
    review_note = nullif(trim(coalesce(p_review_note, '')), ''),
    published_at = coalesce(published_at, v_now),
    archived_at = null,
    rag_status = 'published',
    rag_embedding_status = case
      when rag_embedding_status = 'embedded' then 'embedded'
      else 'pending'
    end,
    rag_embedding_error = null,
    updated_at = v_now
  where id = p_product_id
  returning * into v_product;

  update public.rag_chunks
  set
    is_active = true,
    review_status = 'approved',
    last_reviewed_at = v_now,
    medical_reviewer = coalesce(auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'name', 'hospital reviewer'),
    updated_at = v_now
  where id = v_product.rag_chunk_id;

  perform public.log_hospital_product_audit(
    v_product.id,
    'approved',
    v_from_status,
    v_product.status,
    jsonb_build_object('rag_chunk_id', v_product.rag_chunk_id)
  );

  return v_product;
end;
$$;

create or replace function public.reject_hospital_product_rag(
  p_product_id uuid,
  p_review_note text default null
)
returns public.hospital_products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.hospital_products;
  v_from_status text;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'ต้อง login ก่อน reject สินค้าโรงพยาบาล';
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
    or public.can_manage_hospital_product(v_product.hospital_name)
  ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์ reject สินค้านี้';
  end if;

  v_from_status := v_product.status;

  update public.hospital_products
  set
    status = 'rejected',
    review_status = 'rejected',
    reviewed_by = v_user_id,
    reviewed_at = v_now,
    review_note = nullif(trim(coalesce(p_review_note, '')), ''),
    rag_status = 'rejected',
    rag_embedding_status = 'not_published',
    rag_embedding_error = null,
    updated_at = v_now
  where id = p_product_id
  returning * into v_product;

  if v_product.rag_chunk_id is not null then
    update public.rag_chunks
    set
      is_active = false,
      review_status = 'archived',
      updated_at = v_now
    where id = v_product.rag_chunk_id;
  end if;

  perform public.log_hospital_product_audit(
    v_product.id,
    'rejected',
    v_from_status,
    v_product.status,
    jsonb_build_object('review_note', nullif(trim(coalesce(p_review_note, '')), ''))
  );

  return v_product;
end;
$$;

create or replace function public.request_hospital_product_embedding_retry(
  p_product_id uuid
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
    raise exception 'ต้อง login ก่อน retry embedding';
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
    or public.can_manage_hospital_product(v_product.hospital_name)
  ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์ retry embedding ของสินค้านี้';
  end if;

  if v_product.status <> 'active'
    or v_product.review_status <> 'approved'
    or v_product.rag_status <> 'published'
    or v_product.rag_chunk_id is null
  then
    raise exception 'ต้อง approve และ publish product RAG ก่อน retry embedding';
  end if;

  update public.hospital_products
  set
    rag_embedding_status = 'pending',
    rag_embedding_error = null,
    rag_embedding_updated_at = now(),
    updated_at = now()
  where id = p_product_id
  returning * into v_product;

  perform public.log_hospital_product_audit(
    v_product.id,
    'embedding_retry_requested',
    null,
    v_product.rag_embedding_status,
    jsonb_build_object('rag_chunk_id', v_product.rag_chunk_id)
  );

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
  v_from_status text;
  v_is_active boolean;
  v_action text;
begin
  if v_user_id is null then
    raise exception 'ต้อง login ก่อนจัดการสินค้าโรงพยาบาล';
  end if;

  if p_status not in ('active', 'archived', 'draft', 'pending_review', 'rejected') then
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

  if p_status = 'active' and v_product.review_status <> 'approved' then
    raise exception 'ต้อง approve product RAG ก่อนเปิดขาย';
  end if;

  v_from_status := v_product.status;
  v_is_active := p_status = 'active';
  v_action := case
    when p_status = 'archived' then 'archived'
    when p_status = 'active' then 'restored'
    when p_status = 'draft' then 'moved_to_draft'
    when p_status = 'rejected' then 'rejected'
    else 'submitted_for_review'
  end;

  update public.hospital_products
  set
    status = p_status,
    review_status = case
      when p_status = 'draft' then 'draft'
      when p_status = 'pending_review' then 'pending_review'
      when p_status = 'rejected' then 'rejected'
      when p_status = 'archived' then review_status
      else review_status
    end,
    rag_status = case
      when rag_chunk_id is null then 'not_published'
      when p_status = 'active' then 'published'
      when p_status = 'pending_review' then 'pending_review'
      when p_status = 'rejected' then 'rejected'
      else 'archived'
    end,
    rag_embedding_status = case
      when p_status = 'active' and rag_embedding_status = 'embedded' then 'embedded'
      when p_status = 'active' then 'pending'
      when p_status in ('draft', 'pending_review', 'rejected') then 'not_published'
      else rag_embedding_status
    end,
    archived_at = case when p_status = 'archived' then now() else archived_at end,
    updated_at = now()
  where id = p_product_id
  returning * into v_product;

  if v_product.rag_chunk_id is not null then
    update public.rag_chunks
    set
      is_active = v_is_active,
      review_status = case
        when v_is_active then 'approved'
        when p_status in ('draft', 'pending_review') then 'draft'
        else 'archived'
      end,
      updated_at = now()
    where id = v_product.rag_chunk_id;
  end if;

  perform public.log_hospital_product_audit(
    v_product.id,
    v_action,
    v_from_status,
    v_product.status,
    jsonb_build_object('rag_chunk_id', v_product.rag_chunk_id)
  );

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

  if v_product.status <> 'active'
    or v_product.review_status <> 'approved'
    or v_product.rag_status <> 'published'
  then
    raise exception 'Product RAG must be approved and active before embedding.';
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
    and rag_chunks.is_active = true
    and rag_chunks.review_status = 'approved'
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

  perform public.log_hospital_product_audit(
    v_product.id,
    'embedding_embedded',
    null,
    'embedded',
    jsonb_build_object(
      'rag_chunk_id', p_chunk_id,
      'embedding_model', p_embedding_model,
      'embedding_dimensions', p_embedding_dimensions
    )
  );
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
  v_message text := left(coalesce(p_error, 'Embedding failed.'), 1000);
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
    rag_embedding_error = v_message,
    rag_embedding_updated_at = now(),
    updated_at = now()
  where id = v_product.id
  returning * into v_product;

  perform public.log_hospital_product_audit(
    v_product.id,
    'embedding_error',
    null,
    'error',
    jsonb_build_object('rag_chunk_id', p_chunk_id, 'error', v_message)
  );

  return v_product;
end;
$$;

revoke execute on function public.log_hospital_product_audit(uuid, text, text, text, jsonb) from public;
revoke execute on function public.approve_hospital_product_rag(uuid, text) from public;
revoke execute on function public.reject_hospital_product_rag(uuid, text) from public;
revoke execute on function public.request_hospital_product_embedding_retry(uuid) from public;

grant execute on function public.approve_hospital_product_rag(uuid, text) to authenticated;
grant execute on function public.reject_hospital_product_rag(uuid, text) to authenticated;
grant execute on function public.request_hospital_product_embedding_retry(uuid) to authenticated;
