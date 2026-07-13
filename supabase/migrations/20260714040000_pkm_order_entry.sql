-- PKM-Shop — server-side order creation (2026-07-14). One trusted path to build a complete
-- order in a single transaction: resolve/create the customer (by phone), snapshot item prices
-- from products, compute goods_total from items and delivery_fee from settings (never trust a
-- client-sent total — AGENTS.md money integrity), and set the shipping fields. Used by the
-- staff "manual order" screen (phone orders) and by the E2E harness. Also the shape a future
-- AI "close the sale" step can call. Returns the created order row.
create or replace function public.pkm_create_order(
  p_tenant_id uuid,
  p_items jsonb,                    -- [{ "product_id": uuid, "qty": int }]
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

  -- resolve or create the customer (by phone within the tenant)
  if p_customer_phone is not null and btrim(p_customer_phone) <> '' then
    select id into v_customer_id from public.customers
    where tenant_id = p_tenant_id and phone = p_customer_phone limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (tenant_id, phone, nickname)
    values (p_tenant_id, nullif(btrim(coalesce(p_customer_phone, '')), ''), nullif(btrim(coalesce(p_recipient_name, '')), ''))
    returning id into v_customer_id;
  end if;

  -- delivery fee from settings by type (server-authoritative)
  v_fee := case p_delivery_type
    when 'rider'        then public.pkm_setting_int(p_tenant_id, 'normal_fee', 40)
    when 'express_grab' then public.pkm_setting_int(p_tenant_id, 'normal_fee', 40) + public.pkm_setting_int(p_tenant_id, 'express_surcharge', 55)
    when 'parcel_kerry' then public.pkm_setting_int(p_tenant_id, 'kerry_fee', 100)
    when 'lalamove'     then public.pkm_setting_int(p_tenant_id, 'normal_fee', 40)
    else public.pkm_setting_int(p_tenant_id, 'normal_fee', 40)
  end;

  -- create the pending order (order_no filled by trigger)
  insert into public.orders (tenant_id, customer_id, status, delivery_type, address_text, recipient_name, recipient_phone, lat, lng)
  values (p_tenant_id, v_customer_id, 'pending', p_delivery_type, p_address, p_recipient_name, p_recipient_phone, p_lat, p_lng)
  returning * into v_order;

  -- items: snapshot unit_price from products; commission is now global so snapshot 0
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and tenant_id = p_tenant_id;
    if not found then
      raise exception 'product % not found', v_item->>'product_id';
    end if;
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
