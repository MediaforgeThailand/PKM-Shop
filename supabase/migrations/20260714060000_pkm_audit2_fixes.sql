-- PKM-Shop — audit round 2 fixes (adversarial audit, 2026-07-14). The DB is a SHARED
-- multi-tenant project (pkm-shop + other tenants), which changes several assumptions.

-- 1) returns: one row per order (blocks duplicate return rows -> double restock). ------------
create unique index if not exists returns_order_unique on public.returns (order_id);

-- 2) pkm_reassign_order_next_round: never reassign a straggler to the SAME round it is leaving
--    (admin early-lock edge case made compute_round_at(now()) == current round_at).
create or replace function public.pkm_reassign_order_next_round(p_order_id uuid)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_at timestamptz;
  v_cur timestamptz;
  v_round public.delivery_rounds;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return null; end if;
  if v_order.delivery_type <> 'rider' then return null; end if;

  v_at := public.pkm_compute_round_at(now());
  if v_order.round_id is not null then
    select round_at into v_cur from public.delivery_rounds where id = v_order.round_id;
    while v_cur is not null and v_at <= v_cur loop
      v_at := v_at + interval '1 hour';
    end loop;
  end if;
  v_round := public.pkm_get_or_create_round(v_order.tenant_id, v_at, 'rider');
  update public.orders set round_id = v_round.id, updated_at = now() where id = p_order_id;
  return v_round;
end;
$$;
revoke execute on function public.pkm_reassign_order_next_round(uuid) from public, anon, authenticated;
grant execute on function public.pkm_reassign_order_next_round(uuid) to service_role;

-- 3) pkm_setting_int: tolerate decimal jsonb numbers (round) instead of hard-crashing. --------
create or replace function public.pkm_setting_int(p_tenant_id uuid, p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when jsonb_typeof(value) = 'number' then round((value::text)::numeric)::integer else p_default end
    from public.app_settings where tenant_id = p_tenant_id and key = p_key
  ), p_default)
$$;

-- 4) pkm_create_order: do NOT silently undercharge Lalamove (distance-based) as flat normal_fee.
--    Manual entry has no location; reject Lalamove here (the UI doesn't offer it either).
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

  update public.orders
  set goods_total = v_goods, delivery_fee = v_fee, grand_total = v_goods + v_fee, updated_at = now()
  where id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;
revoke execute on function public.pkm_create_order(uuid, jsonb, public.delivery_type, text, text, text, text, double precision, double precision) from public, anon, authenticated;
grant execute on function public.pkm_create_order(uuid, jsonb, public.delivery_type, text, text, text, text, double precision, double precision) to service_role;

-- 5) pkm_confirm_payment: enforce the money-authority invariant (goods amount == order total).
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
  if p_kind = 'goods' and p_amount <> v_order.grand_total then
    raise exception 'payment amount % does not match order total %', p_amount, v_order.grand_total;
  end if;

  insert into public.payments
    (tenant_id, order_id, amount, kind, method, slip_photo_url, status, verified_by, auto_verified, slipok_trans_ref, slipok_raw)
  values
    (v_order.tenant_id, p_order_id, p_amount, p_kind, p_method, p_slip_url, 'paid', p_verified_by, p_auto, p_trans_ref, p_raw);

  v_order := public.pkm_transition_order(p_order_id, 'paid', p_actor, jsonb_build_object('auto_verified', p_auto, 'trans_ref', p_trans_ref));
  if v_order.delivery_type = 'rider' then
    perform public.pkm_assign_order_to_round(p_order_id);
  else
    perform public.pkm_transition_order(p_order_id, 'confirmed', 'system', jsonb_build_object('delivery_type', v_order.delivery_type));
  end if;
  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end;
$$;
revoke execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) to service_role;

-- 6) Drop orphan MiraCare RPCs that reference dropped tables and were EXECUTE-granted to
--    anon/authenticated (live stale attack surface -> 500s if any leftover path calls them).
drop function if exists public.match_rag_chunks(text, double precision, integer, text[]);
drop function if exists public.update_rag_chunk_embedding(text, text, text, integer);
drop function if exists public.increment_ai_rate_limit(uuid, timestamptz, integer);
