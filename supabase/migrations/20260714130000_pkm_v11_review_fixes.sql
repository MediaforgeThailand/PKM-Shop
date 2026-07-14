-- PKM-Shop v1.1 — fixes from the adversarial review of the v1.1 diff.
-- 1) CRITICAL: pkm_confirm_pending_payment's redelivery branch could create a SECOND child
--    order (double stock + double shipment) when a stale pending slip was confirmed after
--    the fee had already been settled by another slip. Guard on returns.new_order_id, same
--    as pkm_process_redelivery_payment.
-- 2) pkm_record_pending_payment no longer downgrades an already-paid order's payment_status
--    (a failed REDELIVERY slip was knocking goods-paid parents out of Analytics forever).
-- 3) pkm_create_order marks delivery_chosen (the admin picked the type explicitly) so
--    LINE shows the PromptPay QR for manual phone orders.
-- 4) Cron ticks: do the SQL state work unconditionally, then fire the edge call for
--    notifications (pg_net enqueue success said nothing about the edge call succeeding).
-- 5) pkm_consume_order_stock keeps a real deficit on stock_qty (clamping forgave oversell
--    and inflated stock after the next stock-in); reserved_qty still clamps at 0.
-- 6) Seed function defaults ai_model to claude-sonnet-4-6; one-time update broadened to
--    any non-Claude value. Backstop unique index: one redelivery child per parent.

-- ── (1) redelivery double-child guard ───────────────────────────────────────
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
      -- Fee already settled by another payment: never mint a second child. Leave this
      -- row pending so the admin rejects it (same convention as the goods branch below).
      return v_order;
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

  update public.payments
  set status = 'paid', verified_by = p_verified_by, auto_verified = false, updated_at = now()
  where id = p_payment_id;

  return public.pkm_after_payment_confirmed(v_order.id, p_actor, jsonb_build_object('manual_queue', true, 'payment_id', p_payment_id));
end;
$$;
revoke execute on function public.pkm_confirm_pending_payment(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.pkm_confirm_pending_payment(uuid, text, uuid) to service_role;

-- Backstop: a parent can only ever have ONE redelivery child.
create unique index if not exists orders_one_child_per_parent
  on public.orders (parent_order_id) where parent_order_id is not null;

-- ── (2) never downgrade a paid order's payment_status ───────────────────────
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

  -- A goods-paid parent awaiting its redelivery fee stays 'paid' (Analytics + boards
  -- key off payment_status); the admin queue reads payments.status, not this column.
  update public.orders set payment_status = 'pending_verify', updated_at = now()
  where id = p_order_id and payment_status <> 'paid';

  insert into public.order_events (tenant_id, order_id, from_status, to_status, actor, note, meta)
  values (v_order.tenant_id, p_order_id, v_order.status, v_order.status, 'system',
          'slip pending manual verification', jsonb_build_object('payment_id', v_pay.id, 'reason', p_note));

  return v_pay;
end;
$$;
revoke execute on function public.pkm_record_pending_payment(uuid, integer, public.payment_kind, text, text) from public, anon, authenticated;
grant execute on function public.pkm_record_pending_payment(uuid, integer, public.payment_kind, text, text) to service_role;

-- ── (3) manual orders have an explicitly-chosen delivery type ────────────────
create or replace function public.pkm_create_order(
  p_tenant_id uuid,
  p_items jsonb,
  p_delivery_type public.delivery_type default 'rider',
  p_address text default null,
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_customer_phone text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_qty integer;
  v_goods integer := 0;
  v_fee integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'order needs at least one item';
  end if;
  if p_delivery_type = 'lalamove' then
    raise exception 'lalamove is distance-priced and not supported for manual orders';
  end if;

  if p_customer_phone is not null and btrim(p_customer_phone) <> '' then
    select id into v_customer_id from public.customers
    where tenant_id = p_tenant_id and phone = p_customer_phone limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (tenant_id, phone, nickname)
    values (p_tenant_id, nullif(btrim(coalesce(p_customer_phone, '')), ''), nullif(btrim(coalesce(p_recipient_name, '')), ''))
    returning id into v_customer_id;
  end if;

  v_fee := case p_delivery_type
    when 'rider'        then public.pkm_setting_int(p_tenant_id, 'normal_fee', 40)
    when 'express_grab' then public.pkm_setting_int(p_tenant_id, 'normal_fee', 40) + public.pkm_setting_int(p_tenant_id, 'express_surcharge', 55)
    when 'parcel_kerry' then public.pkm_setting_int(p_tenant_id, 'kerry_fee', 100)
    else public.pkm_setting_int(p_tenant_id, 'normal_fee', 40)
  end;

  insert into public.orders (tenant_id, customer_id, status, delivery_type, address_text, recipient_name, recipient_phone, lat, lng)
  values (p_tenant_id, v_customer_id, 'pending', p_delivery_type, p_address, p_recipient_name, p_recipient_phone, p_lat, p_lng)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and tenant_id = p_tenant_id;
    if not found then raise exception 'product % not found', v_item->>'product_id'; end if;
    insert into public.order_items (tenant_id, order_id, product_id, qty, unit_price, commission_snapshot)
    values (p_tenant_id, v_order.id, v_product.id, v_qty, v_product.price_baht, 0);
    v_goods := v_goods + v_qty * v_product.price_baht;
  end loop;

  -- delivery_chosen: the admin picked the type explicitly, so LINE may show the QR.
  update public.orders
  set goods_total = v_goods, delivery_fee = v_fee, grand_total = v_goods + v_fee,
      delivery_chosen = true, updated_at = now()
  where id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;
revoke execute on function public.pkm_create_order(uuid, jsonb, public.delivery_type, text, text, text, text, double precision, double precision) from public, anon, authenticated;
grant execute on function public.pkm_create_order(uuid, jsonb, public.delivery_type, text, text, text, text, double precision, double precision) to service_role;

-- ── (4) cron ticks: SQL state first (always), edge call after (notifications) ─
create or replace function public.pkm_cron_tick_round_lock()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  for t in select id from public.tenants loop
    perform public.pkm_lock_due_rounds(t.id);
  end loop;
  -- Best-effort: the edge function re-runs the (idempotent) lock and fans out the
  -- LINE notifications; its catch-up sweep + notify dedup absorb the double work.
  perform public.pkm_cron_edge_call('/round-lock');
end;
$$;
revoke execute on function public.pkm_cron_tick_round_lock() from public, anon, authenticated;

create or replace function public.pkm_cron_tick_payroll()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  for t in select id from public.tenants loop
    perform public.pkm_close_payroll_period(t.id);
  end loop;
  perform public.pkm_cron_edge_call('/payroll-cutoff');
end;
$$;
revoke execute on function public.pkm_cron_tick_payroll() from public, anon, authenticated;

-- ── (5) stock ledger keeps real deficits ─────────────────────────────────────
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
    -- stock_qty may go negative: an oversell is a real deficit the next stock-in must
    -- absorb (clamping here inflated stock). reserved_qty still clamps at 0.
    update public.products
    set stock_qty = stock_qty - it.qty,
        reserved_qty = greatest(0, reserved_qty - it.qty),
        updated_at = now()
    where id = it.product_id;
  end loop;
end;
$$;

-- ── (6) new tenants seed the Anthropic model; broaden the one-time update ────
create or replace function public.pkm_seed_default_settings(p_tenant_id uuid)
returns void
language sql
volatile
as $$
  insert into public.app_settings (tenant_id, key, value) values
    (p_tenant_id, 'normal_fee', '40'::jsonb),
    (p_tenant_id, 'express_surcharge', '55'::jsonb),
    (p_tenant_id, 'lalamove_tiers', '[{"max_km":5,"fee":50},{"max_km":10,"fee":80},{"max_km":14,"fee":100}]'::jsonb),
    (p_tenant_id, 'lalamove_per_km_over_14', '10'::jsonb),
    (p_tenant_id, 'kerry_fee', '100'::jsonb),
    (p_tenant_id, 'kerry_pickup_window', '"11:00-14:00"'::jsonb),
    (p_tenant_id, 'rider_fee_per_round', '25'::jsonb),
    (p_tenant_id, 'packer_commission_per_piece', '3'::jsonb),
    (p_tenant_id, 'service_radius_km', '8'::jsonb),
    (p_tenant_id, 'store_lat', 'null'::jsonb),
    (p_tenant_id, 'store_lng', 'null'::jsonb),
    (p_tenant_id, 'store_receiver_account', '""'::jsonb),
    (p_tenant_id, 'checkin_radius_m', '150'::jsonb),
    (p_tenant_id, 'payment_window_min', '30'::jsonb),
    (p_tenant_id, 'ai_model', '"claude-sonnet-4-6"'::jsonb)      -- Ready.md §2 (Anthropic)
  on conflict (tenant_id, key) do nothing;
$$;

update public.app_settings set value = to_jsonb('claude-sonnet-4-6'::text)
where key = 'ai_model' and (value #>> '{}') not like 'claude-%';

-- Existing tenants get the receiver-account key (empty = defer to SlipOK 1014).
insert into public.app_settings (tenant_id, key, value)
select t.id, 'store_receiver_account', '""'::jsonb from public.tenants t
on conflict (tenant_id, key) do nothing;
