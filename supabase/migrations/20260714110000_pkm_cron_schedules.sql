-- PKM-Shop — pg_cron wiring (Ready.md §3.1 round-lock ทุกนาทีที่ :30, §3.7 payroll cutoff
-- คืนวันอาทิตย์เที่ยงคืนไทย). Previously no schedule existed anywhere: on a fresh deploy no
-- round ever locked and no payroll period ever closed.
--
-- Two layers:
--   1. Preferred: the cron tick POSTs to the edge function (round-lock / payroll-cutoff),
--      which does the work AND fans out LINE notifications. This needs two Vault secrets
--      the owner creates once (SQL editor):
--        select vault.create_secret('<service_role_key>', 'pkm_service_role_key');
--        select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'pkm_functions_base_url');
--   2. Fallback: if the secrets are missing, the tick does the state work in SQL
--      (rounds still lock, payroll still closes) — notifications catch up on the next
--      successful edge call (notify dedup makes that safe).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent close: returns the period even when it was already closed, so a retried
-- edge call can still stage payouts + notify (payout upsert + notify dedup are idempotent).
create or replace function public.pkm_close_payroll_period(p_tenant_id uuid)
returns public.payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.payroll_periods;
begin
  v_period := public.pkm_get_or_create_period(p_tenant_id, now() - interval '1 day');
  update public.payroll_periods
  set status = 'closed', closed_at = coalesce(closed_at, now())
  where id = v_period.id
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

create or replace function public.pkm_cron_edge_call(p_path text)
returns boolean  -- true when the HTTP call was dispatched
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_url text;
begin
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'pkm_service_role_key' limit 1;
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'pkm_functions_base_url' limit 1;
  exception when others then
    return false;
  end;
  if v_key is null or v_url is null then
    return false;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || p_path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  return true;
end;
$$;
revoke execute on function public.pkm_cron_edge_call(text) from public, anon, authenticated;

create or replace function public.pkm_cron_tick_round_lock()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if public.pkm_cron_edge_call('/round-lock') then
    return;  -- edge function locks + notifies
  end if;
  for t in select id from public.tenants loop
    perform public.pkm_lock_due_rounds(t.id);
  end loop;
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
  if public.pkm_cron_edge_call('/payroll-cutoff') then
    return;  -- edge function closes + notifies
  end if;
  for t in select id from public.tenants loop
    perform public.pkm_close_payroll_period(t.id);
  end loop;
end;
$$;
revoke execute on function public.pkm_cron_tick_payroll() from public, anon, authenticated;

-- Schedule (idempotent re-create). pg_cron runs in UTC:
--   :30 every hour  -> round lock (Ready.md §3.1)
--   Sun 17:00 UTC   -> Mon 00:00 Asia/Bangkok payroll cutoff (Ready.md §3.7)
do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname in ('pkm-round-lock', 'pkm-payroll-cutoff') loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('pkm-round-lock', '30 * * * *', 'select public.pkm_cron_tick_round_lock()');
  perform cron.schedule('pkm-payroll-cutoff', '0 17 * * 0', 'select public.pkm_cron_tick_payroll()');
end;
$$;
