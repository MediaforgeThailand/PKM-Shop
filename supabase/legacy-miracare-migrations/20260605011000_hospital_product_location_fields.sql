alter table public.hospital_products
  add column if not exists hospital_address text,
  add column if not exists hospital_map_query text,
  add column if not exists hospital_lat numeric,
  add column if not exists hospital_lng numeric;

create index if not exists hospital_products_hospital_name_idx
  on public.hospital_products (hospital_name, created_at desc);
