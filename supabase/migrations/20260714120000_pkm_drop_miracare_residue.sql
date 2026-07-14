-- PKM-Shop — drop the remaining MiraCare residue from the live database.
-- The security advisor flags ~13 leftover health/hospital/referral SQL functions (several
-- anon-executable over PostgREST), two legacy chat tables, two health storage buckets, and
-- the pgvector extension. None are referenced by PKM code. The two functions the products
-- trigger still uses are renamed to pkm_* first.
-- Each drop runs in its own guarded block so an unexpected dependency degrades to a NOTICE
-- instead of failing the whole migration.

-- ── rename the two live helpers ─────────────────────────────────────────────
create or replace function public.pkm_slugify(value text, fallback text)
returns text language plpgsql immutable as $$
declare candidate text;
begin
  candidate := trim(both '-' from lower(regexp_replace(coalesce(value, ''), '[^a-zA-Z0-9]+', '-', 'g')));
  candidate := left(candidate, 32);
  if length(candidate) < 2 then
    candidate := left(trim(both '-' from lower(regexp_replace(coalesce(fallback, 'item'), '[^a-zA-Z0-9]+', '-', 'g'))), 32);
  end if;
  if length(candidate) < 2 then candidate := 'item'; end if;
  return candidate;
end;
$$;

create or replace function public.pkm_generate_catalog_key()
returns trigger language plpgsql
set search_path = public
as $$
declare base_key text; candidate_key text;
begin
  if tg_op = 'UPDATE' and new.catalog_key <> old.catalog_key then
    raise exception 'catalog_key is immutable';
  end if;
  if tg_op = 'INSERT' and (new.catalog_key is null or btrim(new.catalog_key) = '') then
    base_key := public.pkm_slugify(new.name, 'product-' || left(md5(new.id::text), 8));
    candidate_key := base_key;
    while exists (select 1 from public.products p where p.tenant_id = new.tenant_id and p.catalog_key = candidate_key and p.id <> new.id) loop
      candidate_key := left(base_key, 58) || '-' || left(md5(gen_random_uuid()::text), 4);
    end loop;
    new.catalog_key := candidate_key;
  else
    new.catalog_key := lower(trim(new.catalog_key));
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_catalog_key_guard on public.products;
create trigger products_catalog_key_guard before insert or update on public.products
  for each row execute function public.pkm_generate_catalog_key();

-- ── drop MiraCare functions (guarded one-by-one) ────────────────────────────
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'drop function if exists public.miracare_generate_catalog_key()',
    'drop function if exists public.miracare_slugify(text, text)',
    'drop function if exists public._hospital_scope_matches(jsonb, text)',
    'drop function if exists public._jsonb_text_scope_contains(jsonb, text)',
    'drop function if exists public.can_manage_hospital_product(text)',
    'drop function if exists public.delete_context_scores_on_health_memory_revoke()',
    'drop function if exists public.is_hospital_staff()',
    'drop function if exists public.is_app_admin()',
    'drop function if exists public.is_tenant_admin_slug(text)',
    'drop function if exists public.miracare_claim_customer_account(text, text, text)',
    'drop function if exists public.miracare_commission_amount(integer, text, jsonb)',
    'drop function if exists public.miracare_commission_hold_guard()',
    'drop function if exists public.miracare_commission_set_available_at()',
    'drop function if exists public.miracare_generate_ref_code(uuid)',
    'drop function if exists public.miracare_is_referrer_member(uuid)',
    'drop function if exists public.miracare_product_commission_amount(integer, text, numeric)',
    'drop function if exists public.miracare_referrer_ref_code_guard()'
  ] loop
    begin
      execute stmt;
    exception when others then
      raise notice 'skipped (%): %', stmt, sqlerrm;
    end;
  end loop;
end;
$$;

-- ── legacy MiraCare chat tables ─────────────────────────────────────────────
drop table if exists public.legacy_chat_messages;
drop table if exists public.legacy_chat_sessions;

-- ── referral-era columns nothing in PKM reads (edge code updated in lockstep) ─
do $$
begin
  begin
    alter table public.customers drop column if exists referred_by;
    alter table public.customers drop column if exists referred_at;
  exception when others then
    raise notice 'customers referral columns kept: %', sqlerrm;
  end;
  begin
    alter table public.tenants drop column if exists attribution_window_days;
  exception when others then
    raise notice 'tenants.attribution_window_days kept: %', sqlerrm;
  end;
end;
$$;

-- ── health storage buckets (objects first; line-assets stays — QR uploads use it) ─
do $$
begin
  delete from storage.objects where bucket_id in ('lab-reports', 'wearable-imports');
  delete from storage.buckets where id in ('lab-reports', 'wearable-imports');
exception when others then
  raise notice 'bucket cleanup skipped: %', sqlerrm;
end;
$$;

-- ── pgvector (RAG is gone) ──────────────────────────────────────────────────
do $$
begin
  drop extension if exists vector;
exception when others then
  raise notice 'vector extension kept: %', sqlerrm;
end;
$$;

-- ── advisor hygiene: pin search_path on remaining helpers, trim anon EXECUTE ─
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'alter function public.is_pkm_admin(uuid) set search_path = public',
    'alter function public.is_pkm_member(uuid) set search_path = public',
    'alter function public.pkm_has_role(uuid, public.pkm_role) set search_path = public',
    'alter function public.is_tenant_admin(uuid) set search_path = public',
    'alter function public.is_tenant_member(uuid) set search_path = public',
    'alter function public.tenant_role(uuid) set search_path = public',
    'alter function public.pkm_gen_link_code() set search_path = public',
    'alter function public.pkm_slugify(text, text) set search_path = public',
    'alter function public.pkm_touch_updated_at() set search_path = public',
    -- policy helpers stay executable by authenticated (RLS needs them) but not anon
    'revoke execute on function public.is_pkm_admin(uuid) from anon',
    'revoke execute on function public.is_pkm_member(uuid) from anon',
    'revoke execute on function public.pkm_has_role(uuid, public.pkm_role) from anon',
    'revoke execute on function public.is_tenant_admin(uuid) from anon',
    'revoke execute on function public.is_tenant_member(uuid) from anon',
    'revoke execute on function public.tenant_role(uuid) from anon',
    -- service-role-only helpers should not be callable by clients at all
    'revoke execute on function public.pkm_reserve_order_stock(uuid) from anon, authenticated',
    'revoke execute on function public.pkm_release_order_stock(uuid) from anon, authenticated',
    'revoke execute on function public.pkm_consume_order_stock(uuid) from anon, authenticated',
    'revoke execute on function public.pkm_setting_int(uuid, text, integer) from anon, authenticated',
    'revoke execute on function public.pkm_gen_link_code() from anon, authenticated'
  ] loop
    begin
      execute stmt;
    exception when others then
      raise notice 'skipped (%): %', stmt, sqlerrm;
    end;
  end loop;
end;
$$;
