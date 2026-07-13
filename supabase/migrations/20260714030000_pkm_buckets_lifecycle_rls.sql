-- PKM-Shop — fixes found by the deep recon (2026-07-14):
-- 1) BLOCKER: the checkin/packing/pod storage buckets were never created (phase-7 only made
--    their RLS policies), so staff check-in, pack-complete and rider POD threw "Bucket not
--    found" before their edge functions ran. Create them (private).
-- 2) Round-completion deadlock: an order still confirmed/packing when a rider claims a round
--    orphans the round (never reaches 'done' -> rider never paid). Add a helper to bump such a
--    straggler to the NEXT round so the claimed round only holds dispatched stops.
-- 3) Returned goods were never restocked. Add a restock helper (called from the return path).
-- 4) Over-permission: customers/chat_sessions/chat_messages used FOR ALL with a member USING
--    clause, so any staff role could DELETE customer/chat rows. Restrict writes to admin.

-- 1) Missing private buckets -------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('checkin', 'checkin', false),
  ('packing', 'packing', false),
  ('pod', 'pod', false)
on conflict (id) do nothing;

-- 2) Move an un-packed straggler to the next rider round (computed from NOW, not paid_at,
--    so it lands in a FUTURE round instead of the same past one). Leaves status untouched
--    (already 'confirmed'/'packing'); the packer/next round handles it normally.
create or replace function public.pkm_reassign_order_next_round(p_order_id uuid)
returns public.delivery_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_at timestamptz;
  v_round public.delivery_rounds;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return null; end if;
  if v_order.delivery_type <> 'rider' then return null; end if;

  v_at := public.pkm_compute_round_at(now());
  v_round := public.pkm_get_or_create_round(v_order.tenant_id, v_at, 'rider');
  update public.orders set round_id = v_round.id, updated_at = now() where id = p_order_id;
  return v_round;
end;
$$;

revoke execute on function public.pkm_reassign_order_next_round(uuid) from public, anon, authenticated;
grant execute on function public.pkm_reassign_order_next_round(uuid) to service_role;

-- 3) Restock the goods from a returned order (idempotent via returns.restocked).
create or replace function public.pkm_restock_returned_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
begin
  -- only if there is an un-restocked return row for this order
  if not exists (select 1 from public.returns r where r.order_id = p_order_id and not r.restocked) then
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

  update public.returns set restocked = true, updated_at = now()
  where order_id = p_order_id and not restocked;
end;
$$;

revoke execute on function public.pkm_restock_returned_order(uuid) from public, anon, authenticated;
grant execute on function public.pkm_restock_returned_order(uuid) to service_role;

-- 4) Tighten customer/chat client policies: member READ, admin-only WRITE (incl. DELETE).
--    (Runtime writes go through service-role functions, which bypass RLS, so this is safe.)
drop policy if exists customers_staff_all on public.customers;
drop policy if exists customers_member_read on public.customers;
drop policy if exists customers_admin_write on public.customers;
create policy customers_member_read on public.customers for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy customers_admin_write on public.customers for all to authenticated
  using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

drop policy if exists chat_sessions_staff_all on public.chat_sessions;
drop policy if exists chat_sessions_member_read on public.chat_sessions;
drop policy if exists chat_sessions_admin_write on public.chat_sessions;
create policy chat_sessions_member_read on public.chat_sessions for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy chat_sessions_admin_write on public.chat_sessions for all to authenticated
  using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

drop policy if exists chat_messages_staff_all on public.chat_messages;
drop policy if exists chat_messages_member_read on public.chat_messages;
drop policy if exists chat_messages_admin_write on public.chat_messages;
create policy chat_messages_member_read on public.chat_messages for select to authenticated
  using (public.is_tenant_member((select s.tenant_id from public.chat_sessions s where s.id = chat_messages.session_id)));
create policy chat_messages_admin_write on public.chat_messages for all to authenticated
  using (public.is_tenant_admin((select s.tenant_id from public.chat_sessions s where s.id = chat_messages.session_id)))
  with check (public.is_tenant_admin((select s.tenant_id from public.chat_sessions s where s.id = chat_messages.session_id)));
