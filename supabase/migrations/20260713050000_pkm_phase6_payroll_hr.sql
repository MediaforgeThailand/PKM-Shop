-- PKM-Shop — Phase 6: payroll (rider per-round + packer per-piece) + payouts + HR (shifts/attendance).
-- Amounts are frozen from app_settings / order_items snapshots (never recomputed loosely).
-- The system never transfers money — it summarizes for the owner, who confirms payout + slip.
-- Business rules: Ready.md §3.7 (payroll), §3.8 (HR check-in).

-- Settings getter (jsonb number -> int), used for pay rates.
create or replace function public.pkm_setting_int(p_tenant_id uuid, p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when jsonb_typeof(value) = 'number' then (value::text)::integer else p_default end
    from public.app_settings where tenant_id = p_tenant_id and key = p_key
  ), p_default)
$$;

-- ---------------------------------------------------------------------------
-- Payroll periods (weekly Mon..Sun, Asia/Bangkok; cutoff Sun 24:00 = Mon 00:00)
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  period_start date not null,
  period_end date not null,             -- exclusive (the Monday after)
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, period_start)
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  period_id uuid not null references public.payroll_periods (id),
  profile_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('rider_round','packer_commission')),
  ref uuid,                             -- round_id or order_id
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now()
);

-- idempotency: a given (kind, ref, profile) pays once
create unique index if not exists payroll_items_dedup
  on public.payroll_items (tenant_id, kind, ref, profile_id) where ref is not null;
create index if not exists payroll_items_period_idx on public.payroll_items (period_id);
create index if not exists payroll_items_profile_idx on public.payroll_items (profile_id);

create table if not exists public.payroll_payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  period_id uuid not null references public.payroll_periods (id),
  profile_id uuid not null references public.profiles (id),
  total integer not null default 0 check (total >= 0),
  slip_photo_url text,
  confirmed_by uuid references auth.users (id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, profile_id)
);

drop trigger if exists payroll_payouts_touch_updated_at on public.payroll_payouts;
create trigger payroll_payouts_touch_updated_at
  before update on public.payroll_payouts
  for each row execute function public.pkm_touch_updated_at();

-- ---------------------------------------------------------------------------
-- HR: shifts (admin CRUD) + attendance check-in
-- ---------------------------------------------------------------------------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists shifts_touch_updated_at on public.shifts;
create trigger shifts_touch_updated_at
  before update on public.shifts
  for each row execute function public.pkm_touch_updated_at();

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  profile_id uuid not null references public.profiles (id),
  shift_id uuid references public.shifts (id),
  photo_url text,
  lat double precision,
  lng double precision,
  geofence_pass boolean,
  checked_in_at timestamptz not null default now()
);

create index if not exists attendance_tenant_idx on public.attendance (tenant_id, checked_in_at desc);
create index if not exists attendance_profile_idx on public.attendance (profile_id, checked_in_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.payroll_periods enable row level security;
alter table public.payroll_items enable row level security;
alter table public.payroll_payouts enable row level security;
alter table public.shifts enable row level security;
alter table public.attendance enable row level security;

drop policy if exists payroll_periods_admin_read on public.payroll_periods;
drop policy if exists payroll_items_self_read on public.payroll_items;
drop policy if exists payroll_items_admin_read on public.payroll_items;
drop policy if exists payroll_payouts_self_read on public.payroll_payouts;
drop policy if exists payroll_payouts_admin_read on public.payroll_payouts;
drop policy if exists shifts_member_read on public.shifts;
drop policy if exists shifts_admin_write on public.shifts;
drop policy if exists attendance_self_read on public.attendance;
drop policy if exists attendance_admin_read on public.attendance;

create policy payroll_periods_admin_read
  on public.payroll_periods for select to authenticated
  using (public.is_pkm_admin(tenant_id));

-- staff see their own payroll lines; admins see all (Ready.md §3.7 rider stats)
create policy payroll_items_self_read
  on public.payroll_items for select to authenticated
  using (profile_id in (select p.id from public.profiles p where p.user_id = auth.uid()));

create policy payroll_items_admin_read
  on public.payroll_items for select to authenticated
  using (public.is_pkm_admin(tenant_id));

create policy payroll_payouts_self_read
  on public.payroll_payouts for select to authenticated
  using (profile_id in (select p.id from public.profiles p where p.user_id = auth.uid()));

create policy payroll_payouts_admin_read
  on public.payroll_payouts for select to authenticated
  using (public.is_pkm_admin(tenant_id));

create policy shifts_member_read
  on public.shifts for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy shifts_admin_write
  on public.shifts for all to authenticated
  using (public.is_pkm_admin(tenant_id))
  with check (public.is_pkm_admin(tenant_id));

create policy attendance_self_read
  on public.attendance for select to authenticated
  using (profile_id in (select p.id from public.profiles p where p.user_id = auth.uid()));

create policy attendance_admin_read
  on public.attendance for select to authenticated
  using (public.is_pkm_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- Payroll functions (service role)
-- ---------------------------------------------------------------------------
create or replace function public.pkm_get_or_create_period(p_tenant_id uuid, p_ref timestamptz default now())
returns public.payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := (date_trunc('week', (p_ref at time zone 'Asia/Bangkok')))::date;  -- Monday
  v_row public.payroll_periods;
begin
  insert into public.payroll_periods (tenant_id, period_start, period_end)
  values (p_tenant_id, v_start, v_start + 7)
  on conflict (tenant_id, period_start) do update set period_end = excluded.period_end
  returning * into v_row;
  return v_row;
end;
$$;

-- Rider earns rider_fee_per_round when a round completes (Ready.md §3.7). Idempotent.
create or replace function public.pkm_record_rider_round_pay(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.delivery_rounds;
  v_period public.payroll_periods;
  v_fee integer;
begin
  select * into v_round from public.delivery_rounds where id = p_round_id;
  if not found or v_round.rider_id is null then return; end if;

  v_fee := public.pkm_setting_int(v_round.tenant_id, 'rider_fee_per_round', 25);
  v_period := public.pkm_get_or_create_period(v_round.tenant_id, now());

  insert into public.payroll_items (tenant_id, period_id, profile_id, kind, ref, amount)
  values (v_round.tenant_id, v_period.id, v_round.rider_id, 'rider_round', p_round_id, v_fee)
  on conflict (tenant_id, kind, ref, profile_id) do nothing;
end;
$$;

-- Packer earns per-piece commission when an order is packed (Ready.md §3.7). Idempotent.
create or replace function public.pkm_record_packer_commission(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_period public.payroll_periods;
  v_amount integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.packer_id is null then return; end if;

  select coalesce(sum(commission_snapshot * qty), 0) into v_amount
  from public.order_items where order_id = p_order_id;

  if v_amount <= 0 then return; end if;

  v_period := public.pkm_get_or_create_period(v_order.tenant_id, now());

  insert into public.payroll_items (tenant_id, period_id, profile_id, kind, ref, amount)
  values (v_order.tenant_id, v_period.id, v_order.packer_id, 'packer_commission', p_order_id, v_amount)
  on conflict (tenant_id, kind, ref, profile_id) do nothing;
end;
$$;

-- Cron payroll-cutoff (Sun 24:00 TZ): close the current period and stage payouts per person.
create or replace function public.pkm_close_payroll_period(p_tenant_id uuid)
returns public.payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.payroll_periods;
begin
  v_period := public.pkm_get_or_create_period(p_tenant_id, now() - interval '1 minute'); -- the week just ended
  update public.payroll_periods set status = 'closed', closed_at = now()
  where id = v_period.id and status = 'open'
  returning * into v_period;

  insert into public.payroll_payouts (tenant_id, period_id, profile_id, total)
  select pi.tenant_id, pi.period_id, pi.profile_id, sum(pi.amount)
  from public.payroll_items pi
  where pi.period_id = v_period.id
  group by pi.tenant_id, pi.period_id, pi.profile_id
  on conflict (period_id, profile_id) do update set total = excluded.total, updated_at = now();

  return v_period;
end;
$$;

revoke execute on function public.pkm_get_or_create_period(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.pkm_record_rider_round_pay(uuid) from public, anon, authenticated;
revoke execute on function public.pkm_record_packer_commission(uuid) from public, anon, authenticated;
revoke execute on function public.pkm_close_payroll_period(uuid) from public, anon, authenticated;
grant execute on function public.pkm_get_or_create_period(uuid, timestamptz) to service_role;
grant execute on function public.pkm_record_rider_round_pay(uuid) to service_role;
grant execute on function public.pkm_record_packer_commission(uuid) to service_role;
grant execute on function public.pkm_close_payroll_period(uuid) to service_role;
