-- MiraCare v3 phase 1: real branches/categories and selecting_branch order state.

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  address text,
  district text,
  phone text,
  map_url text,
  image_url text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_branches (
  product_id uuid not null references public.products (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  primary key (product_id, branch_id)
);

create table if not exists public.product_categories (
  tenant_id uuid not null references public.tenants (id),
  key text not null,
  label_th text not null,
  icon text,
  image_url text,
  sort int not null default 0,
  active boolean not null default true,
  primary key (tenant_id, key)
);

alter table public.orders
  add column if not exists branch_id uuid references public.branches (id),
  add column if not exists buyer_age int check (buyer_age between 1 and 120);

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
    check (status in ('selecting_branch', 'collecting_info', 'awaiting_payment', 'submitted', 'confirmed', 'booked', 'done', 'cancelled'));

create index if not exists branches_v3_tenant_active_sort_idx
  on public.branches (tenant_id, active, sort, created_at);

create index if not exists product_branches_v3_branch_idx
  on public.product_branches (branch_id);

create index if not exists product_categories_v3_tenant_active_sort_idx
  on public.product_categories (tenant_id, active, sort);

create index if not exists orders_v3_branch_idx
  on public.orders (tenant_id, branch_id, created_at desc)
  where branch_id is not null;

alter table public.branches enable row level security;
alter table public.product_branches enable row level security;
alter table public.product_categories enable row level security;

drop policy if exists branches_customer_active_read on public.branches;
drop policy if exists branches_staff_read on public.branches;
drop policy if exists branches_admin_write on public.branches;
drop policy if exists product_branches_customer_active_read on public.product_branches;
drop policy if exists product_branches_staff_read on public.product_branches;
drop policy if exists product_branches_admin_write on public.product_branches;
drop policy if exists product_categories_customer_active_read on public.product_categories;
drop policy if exists product_categories_staff_read on public.product_categories;
drop policy if exists product_categories_admin_write on public.product_categories;

create policy branches_customer_active_read
  on public.branches
  for select
  to authenticated
  using (
    active
    and exists (
      select 1
      from public.customers c
      where c.tenant_id = branches.tenant_id
        and c.auth_user_id = auth.uid()
    )
  );

create policy branches_staff_read
  on public.branches
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy branches_admin_write
  on public.branches
  for all
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy product_branches_customer_active_read
  on public.product_branches
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.branches b on b.id = product_branches.branch_id
      join public.customers c on c.tenant_id = p.tenant_id
      where p.id = product_branches.product_id
        and p.tenant_id = b.tenant_id
        and p.active
        and b.active
        and c.auth_user_id = auth.uid()
    )
  );

create policy product_branches_staff_read
  on public.product_branches
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_branches.product_id
        and public.is_tenant_member(p.tenant_id)
    )
  );

create policy product_branches_admin_write
  on public.product_branches
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.branches b on b.id = product_branches.branch_id
      where p.id = product_branches.product_id
        and p.tenant_id = b.tenant_id
        and public.is_tenant_admin(p.tenant_id)
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      join public.branches b on b.id = product_branches.branch_id
      where p.id = product_branches.product_id
        and p.tenant_id = b.tenant_id
        and public.is_tenant_admin(p.tenant_id)
    )
  );

create policy product_categories_customer_active_read
  on public.product_categories
  for select
  to authenticated
  using (
    active
    and exists (
      select 1
      from public.customers c
      where c.tenant_id = product_categories.tenant_id
        and c.auth_user_id = auth.uid()
    )
  );

create policy product_categories_staff_read
  on public.product_categories
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy product_categories_admin_write
  on public.product_categories
  for all
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

insert into public.product_categories (tenant_id, key, label_th, icon, sort)
select t.id, seed.key, seed.label_th, seed.icon, seed.sort
from public.tenants t
cross join (
  values
    ('checkup', 'ตรวจสุขภาพ', '🩺', 10),
    ('vaccine', 'วัคซีน', '💉', 20)
) as seed(key, label_th, icon, sort)
on conflict (tenant_id, key) do nothing;

insert into public.branches (tenant_id, name, image_url, sort)
select t.id, t.display_name, t.logo_url, 0
from public.tenants t
where not exists (
  select 1
  from public.branches b
  where b.tenant_id = t.id
);

insert into public.product_branches (product_id, branch_id)
select p.id, b.id
from public.products p
join lateral (
  select id
  from public.branches b
  where b.tenant_id = p.tenant_id
  order by b.sort asc, b.created_at asc
  limit 1
) b on true
where not exists (
  select 1
  from public.product_branches pb
  where pb.product_id = p.id
);

create or replace function public.transition_order(
  p_order_id uuid,
  p_to_status text,
  p_actor text,
  p_meta jsonb default '{}'::jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_is_admin boolean;
  v_order public.orders%rowtype;
  v_product_category text;
  v_referrer_scheme jsonb;
begin
  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  v_from := v_order.status;
  v_is_admin := p_actor like 'admin:%';

  if p_to_status = v_from then
    return v_order;
  end if;

  if p_to_status not in ('selecting_branch', 'collecting_info', 'awaiting_payment', 'submitted', 'confirmed', 'booked', 'done', 'cancelled') then
    raise exception 'ILLEGAL_TRANSITION';
  end if;

  if not (
    (v_from = 'selecting_branch' and p_to_status in ('collecting_info', 'cancelled') and p_actor = 'customer')
    or (v_from = 'collecting_info' and p_to_status = 'awaiting_payment' and nullif(btrim(coalesce(v_order.buyer_name, '')), '') is not null and nullif(btrim(coalesce(v_order.buyer_phone, '')), '') is not null and v_order.buyer_age is not null)
    or (v_from = 'collecting_info' and p_to_status = 'cancelled')
    or (v_from = 'awaiting_payment' and p_to_status in ('submitted', 'cancelled'))
    or (v_from = 'submitted' and p_to_status in ('confirmed', 'cancelled') and v_is_admin)
    or (v_from = 'confirmed' and p_to_status = 'booked' and v_is_admin and v_order.booking_at is not null)
    or (v_from = 'confirmed' and p_to_status = 'cancelled' and v_is_admin)
    or (v_from = 'booked' and p_to_status in ('done', 'cancelled') and v_is_admin)
  ) then
    raise exception 'ILLEGAL_TRANSITION';
  end if;

  update public.orders
  set status = p_to_status,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor, meta)
  values (p_order_id, v_from, p_to_status, p_actor, coalesce(p_meta, '{}'::jsonb));

  select p.category
    into v_product_category
  from public.products p
  where p.id = v_order.product_id;

  if p_to_status = 'confirmed' and v_order.referrer_id is not null then
    v_referrer_scheme := v_order.commission_scheme_snapshot;

    if v_referrer_scheme is null then
      select r.commission_scheme
        into v_referrer_scheme
      from public.referrers r
      where r.id = v_order.referrer_id
        and r.tenant_id = v_order.tenant_id;
    end if;

    if v_referrer_scheme is not null then
      insert into public.commission_entries (
        tenant_id,
        referrer_id,
        order_id,
        scheme_snapshot,
        amount_baht
      )
      values (
        v_order.tenant_id,
        v_order.referrer_id,
        v_order.id,
        v_referrer_scheme,
        public.miracare_commission_amount(v_order.amount_baht, v_product_category, v_referrer_scheme)
      )
      on conflict (order_id) do nothing;
    end if;
  end if;

  return v_order;
end;
$$;
