-- PKM-Shop v1.1 — adversarial review, round 2 fixes (DB side).
-- 1) pkm_assign_order_to_round: never attach a paid order to a round a rider has already
--    claimed (confirmed/in_progress) or finished — the order would have no rider stamped
--    and could never be dispatched. Walk forward hour by hour to the first open/locked slot.
-- 2) pkm_transition_round: a losing concurrent claim no longer succeeds silently — claiming
--    a round that is already confirmed for ANOTHER rider raises instead of no-op'ing.
-- 3) pkm_confirm_pending_payment (goods): re-validate the pending amount against the
--    order's CURRENT grand_total (the cart can change between slip and confirmation).
-- 4) pkm_restock_returned_order: claim the restocked flag atomically first (TOCTOU race
--    could double-restock on a double-tapped return).
-- 5) Realtime: chat_messages joins the supabase_realtime publication so the admin chat
--    console updates live.

-- ── (1) round assignment skips claimed rounds ────────────────────────────────
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
  v_existing public.delivery_rounds;
  v_hops integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  if v_order.delivery_type <> 'rider' then
    raise exception 'order % is not a rider delivery', p_order_id;
  end if;

  v_round_at := public.pkm_compute_round_at(coalesce(v_order.paid_at, now()));
  -- Skip rounds a rider already owns (or that are done): a late joiner would never be
  -- dispatched. Cap the walk defensively; a fresh round is always creatable.
  loop
    select * into v_existing from public.delivery_rounds
    where tenant_id = v_order.tenant_id and type = 'rider' and round_at = v_round_at;
    exit when not found or v_existing.status in ('open', 'locked');
    v_round_at := v_round_at + interval '1 hour';
    v_hops := v_hops + 1;
    if v_hops > 48 then
      raise exception 'no assignable round within 48h for order %', p_order_id;
    end if;
  end loop;

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
revoke execute on function public.pkm_assign_order_to_round(uuid) from public, anon, authenticated;
grant execute on function public.pkm_assign_order_to_round(uuid) to service_role;

-- ── (2) losing claim raises instead of silent success ────────────────────────
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
    -- Idempotent replay is fine — but a DIFFERENT rider "re-claiming" a confirmed round
    -- is a lost race, not a replay (both callers would otherwise see success).
    if p_to_status = 'confirmed' and p_rider_id is not null and v_round.rider_id is distinct from p_rider_id then
      raise exception 'round % already claimed by another rider', p_round_id;
    end if;
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
revoke execute on function public.pkm_transition_round(uuid, public.round_status, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pkm_transition_round(uuid, public.round_status, text, uuid, jsonb) to service_role;

-- ── (3) manual goods confirm re-validates the CURRENT total ──────────────────
create or replace function public.pkm_confirm_pending_payment(
  p_payment_id uuid,
  p_actor text,
  p_verified_by uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_order public.orders;
  v_child public.orders;
  v_return public.returns;
begin
  if public.pkm_actor_kind(p_actor) not in ('admin','system') then
    raise exception 'manual confirmation requires admin actor, got %', p_actor;
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment % not found', p_payment_id; end if;
  if v_pay.status <> 'pending_verify' then
    select * into v_order from public.orders where id = v_pay.order_id;
    return v_order;  -- already decided (idempotent)
  end if;

  select * into v_order from public.orders where id = v_pay.order_id for update;

  if v_pay.kind = 'redelivery' and v_order.status = 'awaiting_redelivery_fee' then
    select * into v_return from public.returns where order_id = v_order.id;
    if found and v_return.new_order_id is not null then
      return v_order;  -- fee already settled; leave this row pending for the admin to reject
    end if;
    if v_pay.amount <> v_order.delivery_fee then
      raise exception 'ยอดสลิป (%) ไม่ตรงกับค่าส่งที่ต้องชำระ (%) — ปฏิเสธสลิปนี้แทน', v_pay.amount, v_order.delivery_fee;
    end if;
    v_child := public.pkm_create_redelivery_child(v_order.id);
    update public.payments
    set order_id = v_child.id, status = 'paid', verified_by = p_verified_by, auto_verified = false, updated_at = now()
    where id = p_payment_id;
    v_child := public.pkm_after_payment_confirmed(v_child.id, p_actor, jsonb_build_object('manual_queue', true, 'kind', 'redelivery'));
    insert into public.returns (tenant_id, order_id, reason, redelivery_fee_status, new_order_id)
    values (v_order.tenant_id, v_order.id, coalesce(v_order.cancelled_reason, 'ตีกลับ'), 'paid', v_child.id)
    on conflict (order_id) do update
      set redelivery_fee_status = 'paid', new_order_id = v_child.id, updated_at = now();
    insert into public.order_events (tenant_id, order_id, from_status, to_status, actor, note, meta)
    values (v_order.tenant_id, v_order.id, 'awaiting_redelivery_fee', 'awaiting_redelivery_fee', p_actor,
            'redelivery fee confirmed from manual queue', jsonb_build_object('child_order_id', v_child.id, 'payment_id', p_payment_id));
    return v_child;
  end if;

  if v_order.status <> 'pending' then
    return v_order;  -- order moved on; leave the payment pending for the admin to reject
  end if;

  -- The cart can change between the slip being queued and the admin confirming it:
  -- the recorded amount must still match what the order costs NOW.
  if v_pay.amount <> v_order.grand_total then
    raise exception 'ยอดสลิป (%) ไม่ตรงกับยอดออเดอร์ปัจจุบัน (%) — ปฏิเสธสลิปนี้ หรือตรวจสอบออเดอร์ก่อน', v_pay.amount, v_order.grand_total;
  end if;

  update public.payments
  set status = 'paid', verified_by = p_verified_by, auto_verified = false, updated_at = now()
  where id = p_payment_id;

  return public.pkm_after_payment_confirmed(v_order.id, p_actor, jsonb_build_object('manual_queue', true, 'payment_id', p_payment_id));
end;
$$;
revoke execute on function public.pkm_confirm_pending_payment(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.pkm_confirm_pending_payment(uuid, text, uuid) to service_role;

-- ── (4) restock claims the flag atomically first ─────────────────────────────
create or replace function public.pkm_restock_returned_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
  v_claimed integer;
begin
  -- Claim first: only ONE caller may perform the restock, ever.
  update public.returns set restocked = true, updated_at = now()
  where order_id = p_order_id and not restocked;
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    return;
  end if;

  for it in
    select oi.product_id, sum(oi.qty) as qty
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
  loop
    update public.products
    set stock_qty = stock_qty + it.qty, updated_at = now()
    where id = it.product_id;
  end loop;
end;
$$;
revoke execute on function public.pkm_restock_returned_order(uuid) from public, anon, authenticated;
grant execute on function public.pkm_restock_returned_order(uuid) to service_role;

-- ── (5) admin chat console realtime ──────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when others then
  raise notice 'chat_messages already in publication or publication missing: %', sqlerrm;
end;
$$;
