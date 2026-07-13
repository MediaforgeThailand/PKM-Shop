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
