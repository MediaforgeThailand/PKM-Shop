-- Keep the three MiraCare account surfaces separate while sharing one Supabase
-- project: customers, hospital staff, and referrers each resolve through their
-- existing business table instead of a single generic profile.

create or replace function public.miracare_is_referrer_member(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.referrers r
    where r.tenant_id = check_tenant_id
      and r.auth_user_id = auth.uid()
      and r.active
  )
$$;

grant execute on function public.miracare_is_referrer_member(uuid) to authenticated;

create or replace function public.miracare_claim_customer_account(
  p_tenant_slug text,
  p_nickname text default null,
  p_phone text default null
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_tenant public.tenants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
    into v_tenant
  from public.tenants
  where slug = p_tenant_slug;

  if not found then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  insert into public.customers (
    tenant_id,
    auth_user_id,
    nickname,
    phone
  )
  values (
    v_tenant.id,
    auth.uid(),
    nullif(btrim(coalesce(p_nickname, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), '')
  )
  on conflict (tenant_id, auth_user_id) do update
  set nickname = coalesce(nullif(btrim(coalesce(p_nickname, '')), ''), public.customers.nickname),
      phone = coalesce(nullif(btrim(coalesce(p_phone, '')), ''), public.customers.phone)
  returning * into v_customer;

  return v_customer;
end;
$$;

grant execute on function public.miracare_claim_customer_account(text, text, text) to authenticated;

create or replace function public.miracare_claim_referrer_account(
  p_tenant_slug text,
  p_ref_code text,
  p_name text default null,
  p_phone text default null
)
returns public.referrers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_code text;
  v_referrer public.referrers%rowtype;
  v_tenant public.tenants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_ref_code := upper(btrim(coalesce(p_ref_code, '')));

  if v_ref_code !~ '^[0-9A-HJKMNP-TV-Z]{6}$' then
    raise exception 'INVALID_REF_CODE';
  end if;

  select *
    into v_tenant
  from public.tenants
  where slug = p_tenant_slug;

  if not found then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  update public.referrers
  set auth_user_id = auth.uid(),
      name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
      phone = coalesce(nullif(btrim(coalesce(p_phone, '')), ''), phone)
  where tenant_id = v_tenant.id
    and ref_code = v_ref_code
    and active
    and (auth_user_id is null or auth_user_id = auth.uid())
  returning * into v_referrer;

  if not found then
    raise exception 'REF_CODE_NOT_AVAILABLE';
  end if;

  return v_referrer;
end;
$$;

grant execute on function public.miracare_claim_referrer_account(text, text, text, text) to authenticated;

drop policy if exists tenants_customer_read on public.tenants;
drop policy if exists tenants_referrer_read on public.tenants;
drop policy if exists products_referrer_active_read on public.products;
drop policy if exists branches_referrer_active_read on public.branches;
drop policy if exists product_branches_referrer_active_read on public.product_branches;
drop policy if exists product_categories_referrer_active_read on public.product_categories;

create policy tenants_customer_read
  on public.tenants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.customers c
      where c.tenant_id = tenants.id
        and c.auth_user_id = auth.uid()
    )
  );

create policy tenants_referrer_read
  on public.tenants
  for select
  to authenticated
  using (public.miracare_is_referrer_member(id));

create policy products_referrer_active_read
  on public.products
  for select
  to authenticated
  using (active and public.miracare_is_referrer_member(tenant_id));

create policy branches_referrer_active_read
  on public.branches
  for select
  to authenticated
  using (active and public.miracare_is_referrer_member(tenant_id));

create policy product_branches_referrer_active_read
  on public.product_branches
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.branches b on b.id = product_branches.branch_id
      where p.id = product_branches.product_id
        and p.tenant_id = b.tenant_id
        and p.active
        and b.active
        and public.miracare_is_referrer_member(p.tenant_id)
    )
  );

create policy product_categories_referrer_active_read
  on public.product_categories
  for select
  to authenticated
  using (active and public.miracare_is_referrer_member(tenant_id));
