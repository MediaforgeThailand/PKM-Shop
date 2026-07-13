create or replace function public.miracare_generate_ref_code(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text;
begin
  for _attempt in 1..100 loop
    v_code := '';

    for _position in 1..6 loop
      v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1);
    end loop;

    if not exists (
      select 1
      from public.referrers r
      where r.tenant_id = p_tenant_id
        and r.ref_code = v_code
    ) then
      return v_code;
    end if;
  end loop;

  raise exception 'unable to generate unique ref_code';
end;
$$;

update public.referrers r
set ref_code = public.miracare_generate_ref_code(r.tenant_id)
where r.ref_code !~ '^[0-9A-HJKMNP-TV-Z]{6}$';

alter table public.referrers
  alter column commission_scheme set default '{"mode":"percent","default":10,"by_category":{}}'::jsonb;

alter table public.referrers
  drop constraint if exists referrers_ref_code_key;

alter table public.referrers
  drop constraint if exists referrers_ref_code_check;

alter table public.referrers
  add constraint referrers_ref_code_check
  check (ref_code ~ '^[0-9A-HJKMNP-TV-Z]{6}$');

create unique index if not exists referrers_tenant_ref_code_key
  on public.referrers (tenant_id, ref_code);

create or replace function public.miracare_referrer_ref_code_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.ref_code is null or btrim(new.ref_code) = '' then
      new.ref_code := public.miracare_generate_ref_code(new.tenant_id);
    else
      new.ref_code := upper(btrim(new.ref_code));
    end if;

    if new.ref_code !~ '^[0-9A-HJKMNP-TV-Z]{6}$' then
      raise exception 'ref_code must be 6 Crockford base32 characters';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' and new.ref_code is distinct from old.ref_code then
    raise exception 'ref_code is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists referrers_ref_code_guard on public.referrers;
create trigger referrers_ref_code_guard
  before insert or update on public.referrers
  for each row execute function public.miracare_referrer_ref_code_guard();
