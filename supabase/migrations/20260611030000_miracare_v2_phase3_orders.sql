create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  customer_id uuid references public.customers (id),
  session_id uuid references public.chat_sessions (id),
  product_id uuid not null references public.products (id),
  qty int not null default 1 check (qty > 0),
  amount_baht integer not null,
  buyer_name text,
  buyer_phone text,
  preferred_branch text,
  preferred_date date,
  channel text not null check (channel in ('chat_app', 'chat_pwa', 'chat_line', 'referrer')),
  referrer_id uuid,
  status text not null default 'collecting_info'
    check (status in ('collecting_info', 'awaiting_payment', 'submitted', 'confirmed', 'booked', 'done', 'cancelled')),
  slip_url text,
  booking_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  from_status text,
  to_status text not null,
  actor text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_v2_tenant_status_created_idx
  on public.orders (tenant_id, status, created_at desc);

create index if not exists orders_v2_customer_created_idx
  on public.orders (customer_id, created_at desc);

create index if not exists orders_v2_session_created_idx
  on public.orders (session_id, created_at desc);

create index if not exists orders_v2_product_idx
  on public.orders (product_id);

create index if not exists order_events_v2_order_created_idx
  on public.order_events (order_id, created_at);

alter table public.orders enable row level security;
alter table public.order_events enable row level security;

drop policy if exists orders_customer_read on public.orders;
drop policy if exists orders_staff_all on public.orders;
drop policy if exists order_events_staff_read on public.order_events;

create policy orders_customer_read
  on public.orders
  for select
  to authenticated
  using (
    customer_id in (
      select c.id
      from public.customers c
      where c.auth_user_id = auth.uid()
    )
  );

create policy orders_staff_all
  on public.orders
  for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy order_events_staff_read
  on public.order_events
  for select
  to authenticated
  using (
    order_id in (
      select o.id
      from public.orders o
      where public.is_tenant_member(o.tenant_id)
    )
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
  v_product_name text;
  v_notice text;
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

  if v_order.session_id is not null and p_to_status in ('submitted', 'confirmed', 'booked') then
    select name into v_product_name
    from public.products
    where id = v_order.product_id;

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
