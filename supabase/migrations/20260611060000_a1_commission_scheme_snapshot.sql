alter table public.orders
  add column if not exists commission_scheme_snapshot jsonb;

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
  v_product_category text;
  v_product_name text;
  v_notice text;
  v_referrer_scheme jsonb;
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

  select p.name, p.category
    into v_product_name, v_product_category
  from public.products p
  where p.id = v_order.product_id;

  if p_to_status = 'confirmed' and v_order.referrer_id is not null then
    v_referrer_scheme := v_order.commission_scheme_snapshot;

    if v_referrer_scheme is null then
      select r.commission_scheme
        into v_referrer_scheme
      from public.referrers r
      where r.id = v_order.referrer_id
        and r.tenant_id = v_order.tenant_id;
    end if;

    if v_referrer_scheme is not null then
      insert into public.commission_entries (
        tenant_id,
        referrer_id,
        order_id,
        scheme_snapshot,
        amount_baht
      )
      values (
        v_order.tenant_id,
        v_order.referrer_id,
        v_order.id,
        v_referrer_scheme,
        public.miracare_commission_amount(v_order.amount_baht, v_product_category, v_referrer_scheme)
      )
      on conflict (order_id) do nothing;
    end if;
  end if;

  if v_order.session_id is not null and p_to_status in ('submitted', 'confirmed', 'booked') then
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
