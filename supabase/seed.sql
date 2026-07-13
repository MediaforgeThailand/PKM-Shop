-- PKM-Shop seed (dev). Safe to run after migrations. Idempotent.
-- Creates the PKM tenant (which auto-seeds app_settings via trigger), a few categories,
-- and sample in-stock products. The first admin PROFILE needs a real auth.users id, so it
-- is created separately (see the commented block at the bottom).

insert into public.tenants (slug, display_name, promptpay_id)
values ('pkm-shop', 'PKM Shop', '0000000000')
on conflict (slug) do update set display_name = excluded.display_name;

-- Categories
with t as (select id from public.tenants where slug = 'pkm-shop')
insert into public.categories (tenant_id, name, sort)
select t.id, c.name, c.sort
from t, (values ('เครื่องดื่ม', 10), ('ของทานเล่น', 20), ('ของใช้', 30)) as c(name, sort)
on conflict do nothing;

-- Sample products (in stock)
with t as (select id from public.tenants where slug = 'pkm-shop')
insert into public.products (tenant_id, catalog_key, name, description, price_baht, category_id, stock_qty, weight_g, packer_commission_rate, active)
select
  t.id,
  p.catalog_key,
  p.name,
  p.description,
  p.price,
  (select id from public.categories c where c.tenant_id = t.id and c.name = p.category limit 1),
  p.stock,
  p.weight,
  p.commission,
  true
from t, (values
  ('nam-manao', 'น้ำมะนาว', 'สดชื่น คั้นสด', 35, 'เครื่องดื่ม', 100, 350, 2),
  ('cha-yen', 'ชาเย็น', 'ชาไทยเข้มข้น', 40, 'เครื่องดื่ม', 100, 350, 2),
  ('khao-kriab', 'ข้าวเกรียบ', 'กรอบอร่อย', 20, 'ของทานเล่น', 200, 120, 1),
  ('sabu', 'สบู่สมุนไพร', 'หอมสดชื่น', 60, 'ของใช้', 80, 150, 3)
) as p(catalog_key, name, description, price, category, stock, weight, commission)
on conflict (tenant_id, catalog_key) do nothing;

-- Owner must set the store coordinates for zone/fare (Ready.md §3.3):
--   update public.app_settings set value = to_jsonb(13.7563::numeric) where key='store_lat' and tenant_id=(select id from public.tenants where slug='pkm-shop');
--   update public.app_settings set value = to_jsonb(100.5018::numeric) where key='store_lng' and tenant_id=(select id from public.tenants where slug='pkm-shop');

-- First admin profile (create an auth user first, then bind it):
--   insert into public.profiles (tenant_id, user_id, name, roles, active)
--   values ((select id from public.tenants where slug='pkm-shop'), '<auth-user-uuid>', 'Owner', array['admin']::public.pkm_role[], true);
