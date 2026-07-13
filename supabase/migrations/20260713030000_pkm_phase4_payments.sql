-- PKM-Shop — Phase 4: payments + SlipOK verification columns (stubbed until API access).
-- Payment is verified SERVER-SIDE only; the single sanctioned "verified -> paid -> เข้ารอบ"
-- path is pkm_confirm_payment. Business rules: Ready.md §3.6, §7.1.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_kind') then
    create type public.payment_kind as enum ('goods', 'delivery', 'redelivery');
  end if;
end;
$$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  order_id uuid not null references public.orders (id),
  amount integer not null check (amount >= 0),
  kind public.payment_kind not null default 'goods',
  method text not null default 'promptpay',
  slip_photo_url text,
  status public.payment_status not null default 'pending_verify',
  verified_by uuid references auth.users (id),
  auto_verified boolean not null default false,
  slipok_trans_ref text,
  slipok_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duplicate-slip guard on our side (Ready.md §3.6): a SlipOK transRef is single-use.
create unique index if not exists payments_slipok_trans_ref_key
  on public.payments (slipok_trans_ref) where slipok_trans_ref is not null;
create index if not exists payments_tenant_status_idx on public.payments (tenant_id, status);
create index if not exists payments_order_idx on public.payments (order_id, created_at desc);

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function public.pkm_touch_updated_at();

alter table public.payments enable row level security;
drop policy if exists payments_customer_read on public.payments;
drop policy if exists payments_staff_read on public.payments;

create policy payments_customer_read
  on public.payments for select to authenticated
  using (order_id in (
    select o.id from public.orders o
    join public.customers c on c.id = o.customer_id
    where c.auth_user_id = auth.uid()
  ));

create policy payments_staff_read
  on public.payments for select to authenticated
  using (public.is_pkm_member(tenant_id));
-- writes go only through the RPCs below (service role).

-- Record an uploaded slip awaiting verification (customer sent slip; SlipOK not yet run
-- or failed). Sets the order's payment_status to pending_verify so admins see a manual queue.
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

  insert into public.payments (tenant_id, order_id, amount, kind, slip_photo_url, status)
  values (v_order.tenant_id, p_order_id, p_amount, p_kind, p_slip_url, 'pending_verify')
  returning * into v_pay;

  update public.orders set payment_status = 'pending_verify', updated_at = now()
  where id = p_order_id;

  return v_pay;
end;
$$;

-- The single sanctioned money-authority path: a verified payment -> order paid -> (rider) เข้ารอบ.
-- Called by slip-verify (auto, actor 'system') after SlipOK passes, OR by admin manual confirm
-- (actor 'admin:<uid>'). Re-validates duplicate transRef via the unique index.
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

  insert into public.payments
    (tenant_id, order_id, amount, kind, method, slip_photo_url, status, verified_by, auto_verified, slipok_trans_ref, slipok_raw)
  values
    (v_order.tenant_id, p_order_id, p_amount, p_kind, p_method, p_slip_url, 'paid', p_verified_by, p_auto, p_trans_ref, p_raw);

  -- Move to paid (reserves stock + stamps paid_at) unless already past pending.
  if v_order.status = 'pending' then
    v_order := public.pkm_transition_order(
      p_order_id, 'paid', p_actor,
      jsonb_build_object('auto_verified', p_auto, 'trans_ref', p_trans_ref)
    );
    -- Rider deliveries enter an hourly round immediately (Ready.md §3.1).
    if v_order.delivery_type = 'rider' then
      perform public.pkm_assign_order_to_round(p_order_id);
      select * into v_order from public.orders where id = p_order_id;
    end if;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.pkm_record_pending_payment(uuid, integer, public.payment_kind, text, text) from public, anon, authenticated;
revoke execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.pkm_record_pending_payment(uuid, integer, public.payment_kind, text, text) to service_role;
grant execute on function public.pkm_confirm_payment(uuid, integer, public.payment_kind, text, text, text, boolean, text, jsonb, uuid) to service_role;
