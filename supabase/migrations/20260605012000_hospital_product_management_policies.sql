drop policy if exists "Product creators and admins can read managed hospital products" on public.hospital_products;

create policy "Product creators and admins can read managed hospital products"
  on public.hospital_products
  for select
  to authenticated
  using (auth.uid() = created_by or public.is_app_admin());
