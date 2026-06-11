create table if not exists public.referrers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  ref_code text not null unique check (ref_code ~ '^[A-Z0-9-]{3,32}$'),
  name text not null,
  type text not null check (type in ('doctor', 'nurse', 'creator', 'staff')),
  phone text,
  auth_user_id uuid references auth.users (id),
  commission_scheme jsonb not null default '{"mode":"percent","default":10,"by_category":{}}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  referrer_id uuid not null references public.referrers (id),
  order_id uuid not null references public.orders (id) unique,
  scheme_snapshot jsonb not null,
  amount_baht integer not null check (amount_baht >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'void')),
  created_at timestamptz not null default now()
);

create index if not exists referrers_v2_tenant_active_idx
  on public.referrers (tenant_id, active, created_at desc);

create index if not exists referrers_v2_auth_user_idx
  on public.referrers (auth_user_id)
  where auth_user_id is not null;

create index if not exists commission_entries_v2_tenant_status_idx
  on public.commission_entries (tenant_id, status, created_at desc);

create index if not exists commission_entries_v2_referrer_created_idx
  on public.commission_entries (referrer_id, created_at desc);

create index if not exists customers_v2_tenant_phone_idx
  on public.customers (tenant_id, phone)
  where phone is not null;

create index if not exists customers_v2_referred_by_idx
  on public.customers (referred_by)
  where referred_by is not null;

create index if not exists orders_v2_referrer_idx
  on public.orders (referrer_id)
  where referrer_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_referred_by_fkey'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_referred_by_fkey foreign key (referred_by) references public.referrers (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_referrer_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_referrer_fkey foreign key (referrer_id) references public.referrers (id);
  end if;
end;
$$;

alter table public.referrers enable row level security;
alter table public.commission_entries enable row level security;

drop policy if exists referrers_staff_read on public.referrers;
drop policy if exists referrers_admin_insert on public.referrers;
drop policy if exists referrers_admin_update on public.referrers;
drop policy if exists referrers_admin_delete on public.referrers;
drop policy if exists referrers_own_read on public.referrers;
drop policy if exists commission_entries_staff_read on public.commission_entries;
drop policy if exists commission_entries_admin_update on public.commission_entries;
drop policy if exists commission_entries_referrer_read on public.commission_entries;

create policy referrers_staff_read
  on public.referrers
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy referrers_own_read
  on public.referrers
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy referrers_admin_insert
  on public.referrers
  for insert
  to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy referrers_admin_update
  on public.referrers
  for update
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy referrers_admin_delete
  on public.referrers
  for delete
  to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy commission_entries_staff_read
  on public.commission_entries
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

create policy commission_entries_referrer_read
  on public.commission_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.referrers r
      where r.id = commission_entries.referrer_id
        and r.auth_user_id = auth.uid()
    )
  );

create policy commission_entries_admin_update
  on public.commission_entries
  for update
  to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create or replace function public.miracare_commission_amount(
  p_amount_baht integer,
  p_category text,
  p_scheme jsonb
)
returns integer
language plpgsql
immutable
as $$
declare
  v_mode text;
  v_rate numeric;
begin
  v_mode := coalesce(p_scheme ->> 'mode', 'percent');
  v_rate := coalesce(
    nullif(p_scheme -> 'by_category' ->> p_category, '')::numeric,
    nullif(p_scheme ->> 'default', '')::numeric,
    0
  );

  if v_mode = 'flat_baht' then
    return greatest(0, round(v_rate)::integer);
  end if;

  return greatest(0, round(coalesce(p_amount_baht, 0) * v_rate / 100)::integer);
end;
$$;

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
  v_product_name text;
  v_notice text;
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

  if p_to_status not in ('collecting_info', 'awaiting_payment', 'submitted', 'confirmed', 'booked', 'done', 'cancelled') then
    raise exception 'ILLEGAL_TRANSITION';
  end if;

  if not (
    (v_from = 'collecting_info' and p_to_status = 'awaiting_payment' and nullif(btrim(coalesce(v_order.buyer_name, '')), '') is not null and nullif(btrim(coalesce(v_order.buyer_phone, '')), '') is not null)
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

  select p.name, p.category
    into v_product_name, v_product_category
  from public.products p
  where p.id = v_order.product_id;

  if p_to_status = 'confirmed' and v_order.referrer_id is not null then
    select r.commission_scheme
      into v_referrer_scheme
    from public.referrers r
    where r.id = v_order.referrer_id
      and r.tenant_id = v_order.tenant_id
      and r.active;

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

  if v_order.session_id is not null and p_to_status in ('submitted', 'confirmed', 'booked') then
    if p_to_status = 'submitted' then
      v_notice := 'ส่งข้อมูลการชำระเงินแล้วค่ะ ทีมโรงพยาบาลจะตรวจสอบและยืนยันให้เร็วที่สุด';
    elsif p_to_status = 'confirmed' then
      v_notice := 'โรงพยาบาลยืนยันคำสั่งซื้อ ' || coalesce(v_product_name, 'แพ็กเกจ') || ' แล้วค่ะ';
    elsif p_to_status = 'booked' then
      v_notice := 'ยืนยันการจอง ' || coalesce(v_product_name, 'แพ็กเกจ') || ' วันที่ ' || to_char(v_order.booking_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') || ' เรียบร้อยค่ะ';
    end if;

    insert into public.chat_messages (session_id, role, content)
    values (v_order.session_id, 'system_notice', v_notice);
  end if;

  return v_order;
end;
$$;
