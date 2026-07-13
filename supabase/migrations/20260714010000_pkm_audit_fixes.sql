-- PKM-Shop — audit fixes (found by the deep audit + E2E).
-- 1) Non-rider delivery types (express_grab/lalamove/parcel_kerry) were stranded at 'paid' and
--    never reached the packer queue. Now they advance paid→confirmed too (no hourly round).
-- 2) pkm_confirm_payment could insert duplicate 'paid' payment rows on the admin path — guard
--    so only a 'pending' order is confirmed once.
-- 3) pkm_close_payroll_period closed the wrong (empty new) week if the cron fired >1 min late —
--    derive "the week that ended" from now() - 1 day instead of a fragile 1-minute offset.
-- 4) pkm_compute_round_at is timezone-dependent → STABLE, not IMMUTABLE.

-- (4) IMMUTABLE → STABLE
create or replace function public.pkm_compute_round_at(p_ts timestamptz)
returns timestamptz
language plpgsql
stable
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

-- (1)+(2) confirm payment: guard duplicates + route non-rider into the packer queue
create or replace function public.pkm_confirm_payment(
  p_order_id uuid,
  p_amount integer,
  p_kind public.payment_kind,
  p_method text,
  p_slip_url text,
  p_actor text,
  p_auto boolean default false,
  p_trans_ref text default null,
  p_raw jsonb default null,
  p_verified_by uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_kind text := public.pkm_actor_kind(p_actor);
begin
  if v_kind not in ('system','admin') then
    raise exception 'payment confirmation requires system or admin actor, got %', p_actor;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order % not found', p_order_id; end if;

  -- Idempotency / no double bookkeeping: only a still-pending order gets confirmed.
  if v_order.status <> 'pending' then
    return v_order;
  end if;

  insert into public.payments
    (tenant_id, order_id, amount, kind, method, slip_photo_url, status, verified_by, auto_verified, slipok_trans_ref, slipok_raw)
  values
    (v_order.tenant_id, p_order_id, p_amount, p_kind, p_method, p_slip_url, 'paid', p_verified_by, p_auto, p_trans_ref, p_raw);

  v_order := public.pkm_transition_order(
    p_order_id, 'paid', p_actor,
    jsonb_build_object('auto_verified', p_auto, 'trans_ref', p_trans_ref)
  );

  if v_order.delivery_type = 'rider' then
    -- hourly round (Ready.md §3.1)
    perform public.pkm_assign_order_to_round(p_order_id);
  else
    -- express_grab / lalamove / parcel_kerry: no round — go straight to the packer queue
    perform public.pkm_transition_order(p_order_id, 'confirmed', 'system',
      jsonb_build_object('delivery_type', v_order.delivery_type));
  end if;
  select * into v_order from public.orders where id = p_order_id;

  return v_order;
end;
$$;

revoke execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) to service_role;

-- (3) payroll cutoff: robust "week that ended" boundary
create or replace function public.pkm_close_payroll_period(p_tenant_id uuid)
returns public.payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.payroll_periods;
begin
  -- one day back from a Monday-morning run lands squarely in the week that just ended,
  -- tolerant of the cron firing minutes/hours late.
  v_period := public.pkm_get_or_create_period(p_tenant_id, now() - interval '1 day');
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

revoke execute on function public.pkm_close_payroll_period(uuid) from public, anon, authenticated;
grant execute on function public.pkm_close_payroll_period(uuid) to service_role;
