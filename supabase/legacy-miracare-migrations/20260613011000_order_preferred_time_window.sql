alter table public.orders
  add column if not exists preferred_date_end date,
  add column if not exists preferred_time_window text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_preferred_time_window_length'
  ) then
    alter table public.orders
      add constraint orders_preferred_time_window_length
      check (
        preferred_time_window is null
        or char_length(preferred_time_window) <= 120
      );
  end if;
end
$$;
