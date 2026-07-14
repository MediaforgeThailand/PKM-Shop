-- PKM-Shop v1.1 — redelivery flow (Ready.md §3.4), payment hardening, security fixes.
-- 1) Redelivery: paying the redelivery fee on a returned order creates the child order
--    (parent_order_id) and routes it through the normal paid→confirmed→round pipeline.
--    Previously awaiting_redelivery_fee was a dead end: SlipOK consumed the slip and we
--    recorded nothing.
-- 2) pkm_confirm_payment validates the amount for EVERY kind (was goods-only).
-- 3) pkm_record_pending_payment / rejections now write order_events (single source of truth).
-- 4) pkm_reject_payment: admin can reject a manual-queue slip (Ready.md §3.6 ยืนยัน/ปฏิเสธ).
-- 5) Cancel from 'packing' removed (Ready.md §3.5: cancellable only before packing).
-- 6) Stock: consume clamps at 0 (no phantom negative stock).
-- 7) round-lock catch-up: a missed :30 tick no longer strands a round in 'open'.
-- 8) Kerry: daily round keyed to the Bangkok day + paid kerry orders auto-attach.
-- 9) link_code hidden from colleagues (column-level grant + pkm_my_link_code RPC).
-- 10) orders.delivery_chosen so the payment QR only renders after a delivery type is chosen.
-- 11) customers.zone_override (Ready.md §3.3 admin override), chat 'admin' role,
--     notifications event_type list extended, ai_model default now claude-sonnet-4-6.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists delivery_chosen boolean not null default false;
-- Existing orders that already picked a type (fee > 0 or past pending) count as chosen.
update public.orders set delivery_chosen = true where delivery_fee > 0 or status <> 'pending';

alter table public.customers add column if not exists zone_override text
  check (zone_override in ('in_zone', 'out_zone'));

-- Provider-neutral column name for the model response id (was openai_response_id).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'openai_response_id') then
    alter table public.chat_messages rename column openai_response_id to model_response_id;
  end if;
end;
$$;

-- Admin console replies land in the same transcript (Ready.md §4: admin ตอบแทน AI).
-- Drop whatever CHECK currently guards the column (name may vary), then re-add.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.chat_messages'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%role%'
  loop
    execute format('alter table public.chat_messages drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.chat_messages add constraint chat_messages_role_check
  check (role in ('user', 'assistant', 'admin', 'system_notice'));

-- New notification events: handoff + manual queue + SlipOK quota + per-staff payroll.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.notifications'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%event_type%'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type in (
    'order_created','slip_received','paid','round_locked','packed',
    'rider_accepted','rider_dispatched','delivered','returned',
    'express_paid','payroll_cutoff','payroll_self','payout_confirmed','kerry_handover',
    'handoff','slip_manual_queue','slipok_quota','payment_rejected'
  ));

-- The manual queue shows WHY a slip failed (slip-verify passes the SlipOK reason).
alter table public.payments add column if not exists note text;

-- Ready.md §2: Anthropic API, starting at claude-sonnet-4-6 (model stays editable in settings).
update public.app_settings set value = to_jsonb('claude-sonnet-4-6'::text)
where key = 'ai_model' and value = to_jsonb('gpt-5.5'::text);

-- ---------------------------------------------------------------------------
-- (5)+(6) Transition matrix: drop packing→cancelled; consume clamps at 0
-- ---------------------------------------------------------------------------
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
    set stock_qty = greatest(0, stock_qty - it.qty),
        reserved_qty = greatest(0, reserved_qty - it.qty),
        updated_at = now()
    where id = it.product_id;
  end loop;
end;
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

  v_allowed := case
    when v_from = 'pending'          and p_to_status = 'paid'             and v_kind in ('system','admin')            then true
    when v_from = 'pending'          and p_to_status = 'cancelled'        and v_kind in ('customer','admin')          then true
    when v_from = 'paid'             and p_to_status = 'confirmed'        and v_kind in ('system','admin')            then true
    when v_from = 'paid'             and p_to_status = 'cancelled'        and v_kind in ('admin')                     then true
    when v_from = 'confirmed'        and p_to_status = 'packing'          and v_kind in ('system','packer','admin')   then true
    when v_from = 'confirmed'        and p_to_status = 'cancelled'        and v_kind in ('admin')                     then true
    when v_from = 'packing'          and p_to_status = 'packed'           and v_kind in ('packer','admin')            then true
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

  if p_to_status = 'paid' then
    perform public.pkm_reserve_order_stock(p_order_id);
  elsif p_to_status = 'packed' then
    perform public.pkm_consume_order_stock(p_order_id);
  elsif p_to_status = 'cancelled' and v_from in ('paid','confirmed') then
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

-- ---------------------------------------------------------------------------
-- (2) Payment confirmation, refactored around one post-confirmation path:
--     pkm_after_payment_confirmed = paid -> round (rider) / confirmed (+kerry attach).
--     pkm_confirm_payment (auto/SlipOK) validates the amount for EVERY kind.
--     pkm_confirm_pending_payment (admin queue) confirms the EXISTING pending row
--     instead of inserting a duplicate and stranding the queue entry forever.
-- ---------------------------------------------------------------------------
create or replace function public.pkm_after_payment_confirmed(p_order_id uuid, p_actor text, p_meta jsonb default '{}')
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_kerry_round uuid;
begin
  v_order := public.pkm_transition_order(p_order_id, 'paid', p_actor, coalesce(p_meta, '{}'));
  if v_order.delivery_type = 'rider' then
    perform public.pkm_assign_order_to_round(p_order_id);
  else
    perform public.pkm_transition_order(p_order_id, 'confirmed', 'system', jsonb_build_object('delivery_type', v_order.delivery_type));
    -- Kerry parcels join today's daily round if the admin already opened it (Ready.md §3.3).
    if v_order.delivery_type = 'parcel_kerry' then
      select id into v_kerry_round from public.delivery_rounds
      where tenant_id = v_order.tenant_id and type = 'kerry'
        and round_at = (date_trunc('day', now() at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok'
      limit 1;
      if v_kerry_round is not null then
        update public.orders set round_id = v_kerry_round, updated_at = now() where id = p_order_id;
      end if;
    end if;
  end if;
  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end;
$$;
revoke execute on function public.pkm_after_payment_confirmed(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.pkm_after_payment_confirmed(uuid, text, jsonb) to service_role;

create or replace function public.pkm_confirm_payment(
  p_order_id uuid, p_amount integer, p_kind public.payment_kind, p_method text, p_slip_url text,
  p_actor text, p_auto boolean default false, p_trans_ref text default null, p_raw jsonb default null, p_verified_by uuid default null
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
  if v_order.status <> 'pending' then return v_order; end if;
  if p_amount <> v_order.grand_total then
    raise exception 'payment amount % does not match order total %', p_amount, v_order.grand_total;
  end if;

  insert into public.payments
    (tenant_id, order_id, amount, kind, method, slip_photo_url, status, verified_by, auto_verified, slipok_trans_ref, slipok_raw)
  values
    (v_order.tenant_id, p_order_id, p_amount, p_kind, p_method, p_slip_url, 'paid', p_verified_by, p_auto, p_trans_ref, p_raw);

  return public.pkm_after_payment_confirmed(p_order_id, p_actor,
    jsonb_build_object('auto_verified', p_auto, 'trans_ref', p_trans_ref, 'kind', p_kind));
end;
$$;
revoke execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) to service_role;

-- Admin manual-queue confirmation: flips the EXISTING pending payment row to paid and
-- runs the same post-confirmation path. Handles both goods and redelivery kinds.
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
    v_child := public.pkm_create_redelivery_child(v_order.id);
    -- The payment settles the redelivery order: move the row onto the child, mark paid.
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

  update public.payments
  set status = 'paid', verified_by = p_verified_by, auto_verified = false, updated_at = now()
  where id = p_payment_id;

  return public.pkm_after_payment_confirmed(v_order.id, p_actor, jsonb_build_object('manual_queue', true, 'payment_id', p_payment_id));
end;
$$;
revoke execute on function public.pkm_confirm_pending_payment(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.pkm_confirm_pending_payment(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- (1) Redelivery: pay the fee on a returned order -> child order via the normal pipeline
-- ---------------------------------------------------------------------------
-- Child order factory: same goods (for packing + stock re-reservation), money owed = fee only.
-- Caller must already hold the parent's row lock.
create or replace function public.pkm_create_redelivery_child(p_parent_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.orders;
  v_child public.orders;
begin
  select * into v_parent from public.orders where id = p_parent_id;
  if not found then raise exception 'order % not found', p_parent_id; end if;

  insert into public.orders
    (tenant_id, customer_id, session_id, status, delivery_type, drop_option,
     goods_total, delivery_fee, grand_total, delivery_chosen,
     recipient_name, recipient_phone, address_text, subdistrict, district, province, postal_code,
     lat, lng, distance_km, parent_order_id)
  values
    (v_parent.tenant_id, v_parent.customer_id, v_parent.session_id, 'pending', v_parent.delivery_type, v_parent.drop_option,
     0, v_parent.delivery_fee, v_parent.delivery_fee, true,
     v_parent.recipient_name, v_parent.recipient_phone, v_parent.address_text, v_parent.subdistrict, v_parent.district, v_parent.province, v_parent.postal_code,
     v_parent.lat, v_parent.lng, v_parent.distance_km, v_parent.id)
  returning * into v_child;

  insert into public.order_items (tenant_id, order_id, product_id, qty, unit_price, commission_snapshot)
  select tenant_id, v_child.id, product_id, qty, unit_price, commission_snapshot
  from public.order_items where order_id = v_parent.id;

  return v_child;
end;
$$;
revoke execute on function public.pkm_create_redelivery_child(uuid) from public, anon, authenticated;
grant execute on function public.pkm_create_redelivery_child(uuid) to service_role;

create or replace function public.pkm_process_redelivery_payment(
  p_order_id uuid,          -- the RETURNED parent order
  p_amount integer,
  p_slip_url text,
  p_actor text,
  p_auto boolean default false,
  p_trans_ref text default null,
  p_raw jsonb default null,
  p_verified_by uuid default null
)
returns public.orders      -- the child order that will be delivered
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.orders;
  v_child public.orders;
  v_return public.returns;
begin
  if public.pkm_actor_kind(p_actor) not in ('system','admin') then
    raise exception 'redelivery confirmation requires system or admin actor, got %', p_actor;
  end if;

  select * into v_parent from public.orders where id = p_order_id for update;
  if not found then raise exception 'order % not found', p_order_id; end if;
  if v_parent.status <> 'awaiting_redelivery_fee' then
    raise exception 'order % is not awaiting a redelivery fee (status %)', p_order_id, v_parent.status;
  end if;

  select * into v_return from public.returns where order_id = p_order_id;
  if found and v_return.new_order_id is not null then
    select * into v_child from public.orders where id = v_return.new_order_id;
    return v_child;  -- already processed (idempotent replay)
  end if;

  if p_amount <> v_parent.delivery_fee then
    raise exception 'redelivery fee % does not match required fee %', p_amount, v_parent.delivery_fee;
  end if;

  v_child := public.pkm_create_redelivery_child(v_parent.id);

  -- Standard money-authority path: reserves stock, assigns the next round, stamps paid_at.
  perform public.pkm_confirm_payment(
    v_child.id, p_amount, 'redelivery', 'promptpay', p_slip_url, p_actor, p_auto, p_trans_ref, p_raw, p_verified_by);

  insert into public.returns (tenant_id, order_id, reason, redelivery_fee_status, new_order_id)
  values (v_parent.tenant_id, v_parent.id, coalesce(v_parent.cancelled_reason, 'ตีกลับ'), 'paid', v_child.id)
  on conflict (order_id) do update
    set redelivery_fee_status = 'paid', new_order_id = v_child.id, updated_at = now();

  -- Audit on the parent (status itself stays awaiting_redelivery_fee — terminal per Ready.md §5).
  insert into public.order_events (tenant_id, order_id, from_status, to_status, actor, note, meta)
  values (v_parent.tenant_id, v_parent.id, 'awaiting_redelivery_fee', 'awaiting_redelivery_fee', p_actor,
          'redelivery fee paid', jsonb_build_object('child_order_id', v_child.id, 'amount', p_amount));

  select * into v_child from public.orders where id = v_child.id;
  return v_child;
end;
$$;
revoke execute on function public.pkm_process_redelivery_payment(uuid, integer, text, text, boolean, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pkm_process_redelivery_payment(uuid, integer, text, text, boolean, text, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- (3) pending payments are logged to order_events too
-- ---------------------------------------------------------------------------
create or replace function public.pkm_record_pending_payment(
  p_order_id uuid,
  p_amount integer,
  p_kind public.payment_kind,
  p_slip_url text,
  p_note text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_pay public.payments;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order % not found', p_order_id; end if;

  insert into public.payments (tenant_id, order_id, amount, kind, slip_photo_url, status, note)
  values (v_order.tenant_id, p_order_id, p_amount, p_kind, p_slip_url, 'pending_verify', p_note)
  returning * into v_pay;

  update public.orders set payment_status = 'pending_verify', updated_at = now()
  where id = p_order_id;

  insert into public.order_events (tenant_id, order_id, from_status, to_status, actor, note, meta)
  values (v_order.tenant_id, p_order_id, v_order.status, v_order.status, 'system',
          'slip pending manual verification', jsonb_build_object('payment_id', v_pay.id, 'reason', p_note));

  return v_pay;
end;
$$;
revoke execute on function public.pkm_record_pending_payment(uuid, integer, public.payment_kind, text, text) from public, anon, authenticated;
grant execute on function public.pkm_record_pending_payment(uuid, integer, public.payment_kind, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- (4) Admin rejects a manual-queue slip
-- ---------------------------------------------------------------------------
create or replace function public.pkm_reject_payment(
  p_payment_id uuid,
  p_actor text,
  p_note text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_order public.orders;
  v_open integer;
begin
  if public.pkm_actor_kind(p_actor) not in ('admin','system') then
    raise exception 'payment rejection requires admin actor, got %', p_actor;
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment % not found', p_payment_id; end if;
  if v_pay.status <> 'pending_verify' then
    return v_pay;  -- idempotent: already decided
  end if;

  update public.payments set status = 'rejected', updated_at = now()
  where id = p_payment_id returning * into v_pay;

  select * into v_order from public.orders where id = v_pay.order_id for update;
  -- Back to unpaid only if nothing else is pending/paid on this order.
  select count(*) into v_open from public.payments
  where order_id = v_pay.order_id and status in ('pending_verify', 'paid');
  if v_open = 0 and v_order.payment_status = 'pending_verify' then
    update public.orders set payment_status = 'unpaid', updated_at = now() where id = v_order.id;
  end if;

  insert into public.order_events (tenant_id, order_id, from_status, to_status, actor, note, meta)
  values (v_order.tenant_id, v_order.id, v_order.status, v_order.status, p_actor,
          coalesce(p_note, 'slip rejected'), jsonb_build_object('payment_id', v_pay.id));

  return v_pay;
end;
$$;
revoke execute on function public.pkm_reject_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.pkm_reject_payment(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- (7) round-lock catch-up: lock every open rider round due by the next top-of-hour
-- ---------------------------------------------------------------------------
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
    where tenant_id = p_tenant_id and type = 'rider' and status = 'open' and round_at <= v_next
    for update
  loop
    r := public.pkm_transition_round(r.id, 'locked', 'system');
    return next r;
  end loop;
end;
$$;
revoke execute on function public.pkm_lock_due_rounds(uuid) from public, anon, authenticated;
grant execute on function public.pkm_lock_due_rounds(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- (8) Kerry daily round: one per Bangkok day; attach eligible parcel orders
-- ---------------------------------------------------------------------------
create or replace function public.pkm_get_or_create_daily_kerry_round(p_tenant_id uuid)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.delivery_rounds;
  v_day timestamptz := (date_trunc('day', now() at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok';
begin
  v_round := public.pkm_get_or_create_round(p_tenant_id, v_day, 'kerry');
  -- Sweep in every kerry parcel that is paid and not yet in a round.
  update public.orders set round_id = v_round.id, updated_at = now()
  where tenant_id = p_tenant_id and delivery_type = 'parcel_kerry' and round_id is null
    and status in ('paid', 'confirmed', 'packing', 'packed');
  return v_round;
end;
$$;
revoke execute on function public.pkm_get_or_create_daily_kerry_round(uuid) from public, anon, authenticated;
grant execute on function public.pkm_get_or_create_daily_kerry_round(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- (9) link_code: readable only via RPC (self) or staff-admin (service role)
-- ---------------------------------------------------------------------------
do $$
begin
  revoke select on public.profiles from anon;
  revoke select on public.profiles from authenticated;
  grant select (id, tenant_id, user_id, name, phone, roles, line_user_id, active, created_at, updated_at)
    on public.profiles to authenticated;
exception when others then
  raise notice 'profiles column grant skipped: %', sqlerrm;
end;
$$;

create or replace function public.pkm_my_link_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select link_code from public.profiles where user_id = auth.uid() limit 1
$$;
revoke execute on function public.pkm_my_link_code() from public, anon;
grant execute on function public.pkm_my_link_code() to authenticated;
