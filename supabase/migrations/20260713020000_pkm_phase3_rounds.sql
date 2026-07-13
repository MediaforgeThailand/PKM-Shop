-- PKM-Shop — Phase 3: delivery rounds (hourly 24/7, cutoff :30, Asia/Bangkok),
-- round state machine, order→round assignment, and returns.
-- Business rules: Ready.md §3.1 (rounds/cutoff), §3.2 (multi-stop), §3.4 (returns).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'round_type') then
    create type public.round_type as enum ('rider', 'kerry');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- delivery_rounds
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_rounds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  round_at timestamptz not null,               -- top-of-hour departure (rider) or the day (kerry)
  type public.round_type not null default 'rider',
  status public.round_status not null default 'open',
  rider_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, type, round_at)
);

create index if not exists delivery_rounds_tenant_status_idx on public.delivery_rounds (tenant_id, status, round_at);
create index if not exists delivery_rounds_rider_idx on public.delivery_rounds (rider_id);

drop trigger if exists delivery_rounds_touch_updated_at on public.delivery_rounds;
create trigger delivery_rounds_touch_updated_at
  before update on public.delivery_rounds
  for each row execute function public.pkm_touch_updated_at();

-- orders.round_id -> delivery_rounds (added now that the table exists)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'orders_round_id_fkey' and table_name = 'orders'
  ) then
    alter table public.orders
      add constraint orders_round_id_fkey foreign key (round_id) references public.delivery_rounds (id);
  end if;
end;
$$;

create table if not exists public.round_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  round_id uuid not null references public.delivery_rounds (id) on delete cascade,
  from_status public.round_status,
  to_status public.round_status not null,
  actor text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists round_events_round_idx on public.round_events (round_id, created_at);

-- ---------------------------------------------------------------------------
-- returns (Ready.md §3.4)
-- ---------------------------------------------------------------------------
create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  order_id uuid not null references public.orders (id),
  reason text not null,
  redelivery_fee_status public.payment_status not null default 'unpaid',
  new_order_id uuid references public.orders (id),
  restocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists returns_tenant_idx on public.returns (tenant_id, created_at desc);
create index if not exists returns_order_idx on public.returns (order_id);

drop trigger if exists returns_touch_updated_at on public.returns;
create trigger returns_touch_updated_at
  before update on public.returns
  for each row execute function public.pkm_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.delivery_rounds enable row level security;
alter table public.round_events enable row level security;
alter table public.returns enable row level security;

drop policy if exists delivery_rounds_member_read on public.delivery_rounds;
drop policy if exists round_events_member_read on public.round_events;
drop policy if exists returns_member_read on public.returns;

create policy delivery_rounds_member_read
  on public.delivery_rounds for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy round_events_member_read
  on public.round_events for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy returns_member_read
  on public.returns for select to authenticated
  using (public.is_pkm_member(tenant_id));

-- ---------------------------------------------------------------------------
-- Cutoff math (Ready.md §3.1). T in Asia/Bangkok:
--   minute(T) < 30  -> next top-of-hour round
--   minute(T) >= 30 -> top-of-hour + 2h round
-- Returns the round_at as a timestamptz anchored at the Bangkok top-of-hour.
-- ---------------------------------------------------------------------------
create or replace function public.pkm_compute_round_at(p_ts timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_local timestamp := (p_ts at time zone 'Asia/Bangkok');
  v_base  timestamp := date_trunc('hour', v_local);
  v_min   integer := extract(minute from v_local)::int;
  v_round timestamp;
begin
  if v_min < 30 then
    v_round := v_base + interval '1 hour';
  else
    v_round := v_base + interval '2 hour';
  end if;
  return (v_round at time zone 'Asia/Bangkok');
end;
$$;

create or replace function public.pkm_get_or_create_round(
  p_tenant_id uuid,
  p_round_at timestamptz,
  p_type public.round_type default 'rider'
)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.delivery_rounds;
begin
  insert into public.delivery_rounds (tenant_id, round_at, type)
  values (p_tenant_id, p_round_at, p_type)
  on conflict (tenant_id, type, round_at) do update set updated_at = now()
  returning * into v_round;
  return v_round;
end;
$$;

-- Assign a paid order to its rider round and move it to 'confirmed' (เข้ารอบ).
create or replace function public.pkm_assign_order_to_round(p_order_id uuid)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_round_at timestamptz;
  v_round public.delivery_rounds;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  if v_order.delivery_type <> 'rider' then
    raise exception 'order % is not a rider delivery', p_order_id;
  end if;

  v_round_at := public.pkm_compute_round_at(coalesce(v_order.paid_at, now()));
  v_round := public.pkm_get_or_create_round(v_order.tenant_id, v_round_at, 'rider');

  update public.orders set round_id = v_round.id, updated_at = now() where id = p_order_id;

  if v_order.status = 'paid' then
    perform public.pkm_transition_order(
      p_order_id, 'confirmed', 'system',
      jsonb_build_object('round_id', v_round.id, 'round_at', v_round.round_at)
    );
  end if;

  return v_round;
end;
$$;

-- ---------------------------------------------------------------------------
-- Round state machine (open->locked->confirmed->in_progress->done)
-- ---------------------------------------------------------------------------
create or replace function public.pkm_transition_round(
  p_round_id uuid,
  p_to_status public.round_status,
  p_actor text,
  p_rider_id uuid default null,
  p_meta jsonb default '{}'
)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.delivery_rounds;
  v_from public.round_status;
  v_kind text := public.pkm_actor_kind(p_actor);
  v_allowed boolean := false;
begin
  select * into v_round from public.delivery_rounds where id = p_round_id for update;
  if not found then
    raise exception 'round % not found', p_round_id;
  end if;
  v_from := v_round.status;
  if v_from = p_to_status then
    return v_round;
  end if;

  v_allowed := case
    when v_from = 'open'        and p_to_status = 'locked'      and v_kind in ('system','admin')          then true
    when v_from = 'locked'      and p_to_status = 'confirmed'   and v_kind in ('rider','admin')           then true
    when v_from = 'confirmed'   and p_to_status = 'in_progress' and v_kind in ('rider','admin')           then true
    when v_from = 'in_progress' and p_to_status = 'done'        and v_kind in ('rider','admin','system')  then true
    else false
  end case;

  if not v_allowed then
    raise exception 'illegal round transition % -> % by %', v_from, p_to_status, p_actor;
  end if;

  update public.delivery_rounds
  set status = p_to_status,
      rider_id = coalesce(p_rider_id, rider_id),
      updated_at = now()
  where id = p_round_id
  returning * into v_round;

  -- On rider accept, stamp the rider onto every order in the round.
  if p_to_status = 'confirmed' and v_round.rider_id is not null then
    update public.orders set rider_id = v_round.rider_id, updated_at = now()
    where round_id = p_round_id;
  end if;

  insert into public.round_events (tenant_id, round_id, from_status, to_status, actor, meta)
  values (v_round.tenant_id, p_round_id, v_from, p_to_status, p_actor, coalesce(p_meta, '{}'));

  return v_round;
end;
$$;

-- Lock the upcoming round(s) at :30 (cron round-lock). Locks open rider rounds whose
-- round_at is the next Bangkok top-of-hour; returns them so the caller notifies staff.
create or replace function public.pkm_lock_due_rounds(p_tenant_id uuid)
returns setof public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next timestamptz := (date_trunc('hour', (now() at time zone 'Asia/Bangkok')) + interval '1 hour') at time zone 'Asia/Bangkok';
  r public.delivery_rounds;
begin
  for r in
    select * from public.delivery_rounds
    where tenant_id = p_tenant_id and type = 'rider' and status = 'open' and round_at = v_next
    for update
  loop
    r := public.pkm_transition_round(r.id, 'locked', 'system');
    return next r;
  end loop;
end;
$$;

revoke execute on function public.pkm_get_or_create_round(uuid, timestamptz, public.round_type) from public, anon, authenticated;
revoke execute on function public.pkm_assign_order_to_round(uuid) from public, anon, authenticated;
revoke execute on function public.pkm_transition_round(uuid, public.round_status, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.pkm_lock_due_rounds(uuid) from public, anon, authenticated;
grant execute on function public.pkm_get_or_create_round(uuid, timestamptz, public.round_type) to service_role;
grant execute on function public.pkm_assign_order_to_round(uuid) to service_role;
grant execute on function public.pkm_transition_round(uuid, public.round_status, text, uuid, jsonb) to service_role;
grant execute on function public.pkm_lock_due_rounds(uuid) to service_role;
