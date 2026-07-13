-- PKM-Shop — Phase 7: storage RLS for staff uploads/views on the private operational buckets.
-- Paths are `<bucket>/<tenant_id>/<...>`; tenant members may insert + read within their tenant
-- folder. Customer slip uploads still use server-minted signed upload URLs (service role).

do $$
declare
  b text;
begin
  foreach b in array array['stock-in', 'packing', 'pod', 'checkin', 'payment-slips'] loop
    execute format('drop policy if exists %I on storage.objects', 'pkm_' || replace(b, '-', '_') || '_member_insert');
    execute format('drop policy if exists %I on storage.objects', 'pkm_' || replace(b, '-', '_') || '_member_select');
  end loop;
end;
$$;

-- insert (staff upload photos: stock-in, packing, pod, checkin)
create policy pkm_stock_in_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'stock-in' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_packing_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'packing' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_pod_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pod' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_checkin_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'checkin' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_payment_slips_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-slips' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));

-- select (staff view: signed URLs in the web app)
create policy pkm_stock_in_member_select on storage.objects for select to authenticated
  using (bucket_id = 'stock-in' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_packing_member_select on storage.objects for select to authenticated
  using (bucket_id = 'packing' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_pod_member_select on storage.objects for select to authenticated
  using (bucket_id = 'pod' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_checkin_member_select on storage.objects for select to authenticated
  using (bucket_id = 'checkin' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_payment_slips_member_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));

-- payout-slips bucket (admin uploads transfer proof)
insert into storage.buckets (id, name, public) values ('payout-slips', 'payout-slips', false)
on conflict (id) do nothing;

drop policy if exists pkm_payout_slips_member_insert on storage.objects;
drop policy if exists pkm_payout_slips_member_select on storage.objects;
create policy pkm_payout_slips_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payout-slips' and public.is_tenant_admin(((storage.foldername(name))[1])::uuid));
create policy pkm_payout_slips_member_select on storage.objects for select to authenticated
  using (bucket_id = 'payout-slips' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));

-- team-chat images bucket
insert into storage.buckets (id, name, public) values ('team-chat', 'team-chat', false)
on conflict (id) do nothing;

drop policy if exists pkm_team_chat_member_insert on storage.objects;
drop policy if exists pkm_team_chat_member_select on storage.objects;
create policy pkm_team_chat_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team-chat' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy pkm_team_chat_member_select on storage.objects for select to authenticated
  using (bucket_id = 'team-chat' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
