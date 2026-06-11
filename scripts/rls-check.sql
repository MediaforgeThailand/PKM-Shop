-- Run against a Supabase shadow database after MiraCare v2 migrations.
-- The script raises an exception if tenant/customer/staff/admin RLS isolation is broken.

begin;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-0000000000a3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-customer-a@example.test',
    crypt('not-used', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000b3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-customer-b@example.test',
    crypt('not-used', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000a4',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-staff-a@example.test',
    crypt('not-used', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000a10',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-admin-a@example.test',
    crypt('not-used', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000b4',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-staff-b@example.test',
    crypt('not-used', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.tenants (id, slug, display_name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-tenant-a', 'RLS Tenant A'),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-tenant-b', 'RLS Tenant B')
on conflict (slug) do nothing;

insert into public.customers (id, tenant_id, auth_user_id, nickname)
values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'Customer A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3', 'Customer B')
on conflict (tenant_id, auth_user_id) do nothing;

insert into public.tenant_members (tenant_id, auth_user_id, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'tenant_staff'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000a10', 'tenant_admin'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b4', 'tenant_staff')
on conflict (tenant_id, auth_user_id) do nothing;

insert into public.products (tenant_id, catalog_key, name, description, price_baht, category, active)
values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a-product', 'RLS A Product', 'Tenant A visible product.', 1000, 'checkup', true),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-b-product', 'RLS B Product', 'Tenant B hidden product.', 1000, 'checkup', true)
on conflict (tenant_id, catalog_key) do nothing;

insert into public.user_facts (
  id,
  tenant_id,
  customer_id,
  key,
  value_text,
  confidence,
  status,
  source,
  source_ref
)
values
  (
    '00000000-0000-0000-0000-0000000000a5',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    'nickname',
    'Customer A private fact',
    1,
    'active',
    'user_form',
    '00000000-0000-0000-0000-00000000a501'
  ),
  (
    '00000000-0000-0000-0000-0000000000b5',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b2',
    'nickname',
    'Customer B private fact',
    1,
    'active',
    'user_form',
    '00000000-0000-0000-0000-00000000b501'
  )
on conflict (id) do nothing;

insert into public.consents (id, tenant_id, customer_id, kind, granted)
values
  (
    '00000000-0000-0000-0000-0000000000a6',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    'health_data_collection',
    true
  ),
  (
    '00000000-0000-0000-0000-0000000000b6',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b2',
    'health_data_collection',
    true
  )
on conflict (id) do nothing;

insert into public.chat_sessions (id, tenant_id, customer_id, channel, last_message_at)
values
  (
    '00000000-0000-0000-0000-000000000a20',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    'app',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000b20',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b2',
    'app',
    now()
  )
on conflict (id) do nothing;

insert into public.chat_messages (id, session_id, role, content, marker_product_ids, client_msg_id)
values
  (
    '00000000-0000-0000-0000-000000000a21',
    '00000000-0000-0000-0000-000000000a20',
    'user',
    'Customer A private message',
    '{}'::text[],
    'rls-a-message'
  ),
  (
    '00000000-0000-0000-0000-000000000b21',
    '00000000-0000-0000-0000-000000000b20',
    'user',
    'Customer B private message',
    '{}'::text[],
    'rls-b-message'
  )
on conflict (id) do nothing;

insert into public.referrers (
  id,
  tenant_id,
  ref_code,
  name,
  type,
  phone,
  auth_user_id,
  commission_scheme,
  active
)
values
  (
    '00000000-0000-0000-0000-000000000a30',
    '00000000-0000-0000-0000-0000000000a1',
    'RLS-A',
    'Tenant A Referrer',
    'staff',
    '0800000001',
    null,
    '{"mode":"percent","default":10,"by_category":{"checkup":12}}'::jsonb,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000b30',
    '00000000-0000-0000-0000-0000000000b1',
    'RLS-B',
    'Tenant B Referrer',
    'staff',
    '0800000002',
    null,
    '{"mode":"percent","default":10,"by_category":{"checkup":12}}'::jsonb,
    true
  )
on conflict (id) do nothing;

insert into public.orders (
  id,
  tenant_id,
  customer_id,
  session_id,
  product_id,
  qty,
  amount_baht,
  buyer_name,
  buyer_phone,
  channel,
  referrer_id,
  status
)
values
  (
    '00000000-0000-0000-0000-000000000a40',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-000000000a20',
    (select id from public.products where tenant_id = '00000000-0000-0000-0000-0000000000a1' and catalog_key = 'rls-a-product'),
    1,
    1000,
    'Customer A',
    '0811111111',
    'chat_app',
    '00000000-0000-0000-0000-000000000a30',
    'submitted'
  ),
  (
    '00000000-0000-0000-0000-000000000b40',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-000000000b20',
    (select id from public.products where tenant_id = '00000000-0000-0000-0000-0000000000b1' and catalog_key = 'rls-b-product'),
    1,
    1000,
    'Customer B',
    '0822222222',
    'chat_app',
    '00000000-0000-0000-0000-000000000b30',
    'submitted'
  )
on conflict (id) do nothing;

insert into public.order_events (id, order_id, from_status, to_status, actor, meta)
values
  (
    '00000000-0000-0000-0000-000000000a41',
    '00000000-0000-0000-0000-000000000a40',
    'awaiting_payment',
    'submitted',
    'customer',
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000b41',
    '00000000-0000-0000-0000-000000000b40',
    'awaiting_payment',
    'submitted',
    'customer',
    '{}'::jsonb
  )
on conflict (id) do nothing;

insert into public.commission_entries (
  id,
  tenant_id,
  referrer_id,
  order_id,
  scheme_snapshot,
  amount_baht,
  status
)
values
  (
    '00000000-0000-0000-0000-000000000a42',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000a30',
    '00000000-0000-0000-0000-000000000a40',
    '{"mode":"percent","default":10}'::jsonb,
    100,
    'pending'
  ),
  (
    '00000000-0000-0000-0000-000000000b42',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-000000000b30',
    '00000000-0000-0000-0000-000000000b40',
    '{"mode":"percent","default":10}'::jsonb,
    100,
    'pending'
  )
on conflict (id) do nothing;

insert into public.lab_reports (
  id,
  tenant_id,
  customer_id,
  storage_path,
  status,
  collected_date
)
values
  (
    '00000000-0000-0000-0000-000000000a50',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    'rls/a/report.jpg',
    'ready',
    current_date
  ),
  (
    '00000000-0000-0000-0000-000000000b50',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b2',
    'rls/b/report.jpg',
    'ready',
    current_date
  )
on conflict (id) do nothing;

insert into public.lab_results (
  id,
  report_id,
  test_code,
  test_name_raw,
  value,
  unit,
  confidence,
  confirmed
)
values
  (
    '00000000-0000-0000-0000-000000000a51',
    '00000000-0000-0000-0000-000000000a50',
    'FBS',
    'FBS',
    90,
    'mg/dL',
    0.95,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000b51',
    '00000000-0000-0000-0000-000000000b50',
    'FBS',
    'FBS',
    91,
    'mg/dL',
    0.95,
    true
  )
on conflict (id) do nothing;

insert into public.wearable_metrics (
  id,
  tenant_id,
  customer_id,
  source,
  metric,
  day,
  value
)
values
  (
    '00000000-0000-0000-0000-000000000a60',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    'apple_export',
    'steps',
    current_date,
    7000
  ),
  (
    '00000000-0000-0000-0000-000000000b60',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b2',
    'apple_export',
    'steps',
    current_date,
    7100
  )
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);

do $$
declare
  fact_key_count integer;
  own_consent_count integer;
  own_catalog_count integer;
  own_customer_count integer;
  own_fact_count integer;
  own_inserted_consent_count integer;
  own_inserted_fact_count integer;
  other_consent_count integer;
  other_catalog_count integer;
  other_customer_count integer;
  other_fact_count integer;
  updated_count integer;
begin
  select count(*) into own_customer_count
  from public.customers
  where id = '00000000-0000-0000-0000-0000000000a2';

  if own_customer_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own customer row';
  end if;

  select count(*) into other_customer_count
  from public.customers
  where id = '00000000-0000-0000-0000-0000000000b2';

  if other_customer_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B row';
  end if;

  select count(*) into other_catalog_count
  from public.products
  where tenant_id = '00000000-0000-0000-0000-0000000000b1';

  if other_catalog_count <> 0 then
    raise exception 'RLS failure: customer A can read tenant B catalog';
  end if;

  select count(*) into own_catalog_count
  from public.products
  where tenant_id = '00000000-0000-0000-0000-0000000000a1'
    and active = true;

  if own_catalog_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own active catalog';
  end if;

  select count(*) into fact_key_count
  from public.fact_keys
  where key = 'nickname';

  if fact_key_count <> 1 then
    raise exception 'RLS failure: authenticated customer cannot read fact key registry';
  end if;

  select count(*) into own_fact_count
  from public.user_facts
  where id = '00000000-0000-0000-0000-0000000000a5';

  if own_fact_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own user_facts row';
  end if;

  select count(*) into other_fact_count
  from public.user_facts
  where id = '00000000-0000-0000-0000-0000000000b5';

  if other_fact_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B user_facts row';
  end if;

  insert into public.user_facts (
    id,
    tenant_id,
    customer_id,
    key,
    value_text,
    confidence,
    status,
    source,
    source_ref
  )
  values (
    '00000000-0000-0000-0000-0000000000a7',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    'nickname',
    'Customer A allowed insert',
    1,
    'active',
    'user_form',
    '00000000-0000-0000-0000-00000000a701'
  )
  on conflict (id) do nothing;

  select count(*) into own_inserted_fact_count
  from public.user_facts
  where id = '00000000-0000-0000-0000-0000000000a7';

  if own_inserted_fact_count <> 1 then
    raise exception 'RLS failure: customer A cannot insert own user_form fact';
  end if;

  begin
    insert into public.user_facts (
      id,
      tenant_id,
      customer_id,
      key,
      value_text,
      confidence,
      status,
      source,
      source_ref
    )
    values (
      '00000000-0000-0000-0000-0000000000b7',
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-0000000000b2',
      'nickname',
      'Customer B forbidden insert',
      1,
      'active',
      'user_form',
      '00000000-0000-0000-0000-00000000b701'
    );

    raise exception 'RLS failure: customer A can insert customer B user_facts row';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    insert into public.user_facts (
      id,
      tenant_id,
      customer_id,
      key,
      value_text,
      confidence,
      status,
      source,
      source_ref
    )
    values (
      '00000000-0000-0000-0000-0000000000a8',
      '00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-0000000000a2',
      'nickname',
      'Customer A forbidden source insert',
      1,
      'active',
      'chat_extraction',
      '00000000-0000-0000-0000-00000000a801'
    );

    raise exception 'RLS failure: customer A can insert non-user_form facts';
  exception
    when insufficient_privilege then
      null;
  end;

  update public.user_facts
  set value_text = 'Customer A forbidden update'
  where id = '00000000-0000-0000-0000-0000000000a5';
  get diagnostics updated_count = row_count;

  if updated_count <> 0 then
    raise exception 'RLS failure: customer A can update own user_facts row';
  end if;

  select count(*) into own_consent_count
  from public.consents
  where id = '00000000-0000-0000-0000-0000000000a6';

  if own_consent_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own consent row';
  end if;

  select count(*) into other_consent_count
  from public.consents
  where id = '00000000-0000-0000-0000-0000000000b6';

  if other_consent_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B consent row';
  end if;

  insert into public.consents (id, tenant_id, customer_id, kind, granted)
  values (
    '00000000-0000-0000-0000-0000000000a9',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a2',
    'health_data_collection',
    false
  )
  on conflict (id) do nothing;

  select count(*) into own_inserted_consent_count
  from public.consents
  where id = '00000000-0000-0000-0000-0000000000a9';

  if own_inserted_consent_count <> 1 then
    raise exception 'RLS failure: customer A cannot insert own consent row';
  end if;

  begin
    insert into public.consents (id, tenant_id, customer_id, kind, granted)
    values (
      '00000000-0000-0000-0000-0000000000b9',
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-0000000000b2',
      'health_data_collection',
      false
    );

    raise exception 'RLS failure: customer A can insert customer B consent row';
  exception
    when insufficient_privilege then
      null;
  end;

  update public.consents
  set granted = false
  where id = '00000000-0000-0000-0000-0000000000a6';
  get diagnostics updated_count = row_count;

  if updated_count <> 0 then
    raise exception 'RLS failure: customer A can update own append-only consent row';
  end if;
end;
$$;

do $$
declare
  own_count integer;
  other_count integer;
begin
  select count(*) into own_count
  from public.chat_sessions
  where id = '00000000-0000-0000-0000-000000000a20';

  if own_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own chat session';
  end if;

  select count(*) into other_count
  from public.chat_sessions
  where id = '00000000-0000-0000-0000-000000000b20';

  if other_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B chat session';
  end if;

  select count(*) into own_count
  from public.chat_messages
  where id = '00000000-0000-0000-0000-000000000a21';

  if own_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own chat message';
  end if;

  select count(*) into other_count
  from public.chat_messages
  where id = '00000000-0000-0000-0000-000000000b21';

  if other_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B chat message';
  end if;

  select count(*) into own_count
  from public.orders
  where id = '00000000-0000-0000-0000-000000000a40';

  if own_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own order';
  end if;

  select count(*) into other_count
  from public.orders
  where id = '00000000-0000-0000-0000-000000000b40';

  if other_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B order';
  end if;

  select count(*) into own_count
  from public.order_events
  where id in (
    '00000000-0000-0000-0000-000000000a41',
    '00000000-0000-0000-0000-000000000b41'
  );

  if own_count <> 0 then
    raise exception 'RLS failure: customer A can read staff-only order events';
  end if;

  select count(*) into own_count
  from public.referrers
  where id in (
    '00000000-0000-0000-0000-000000000a30',
    '00000000-0000-0000-0000-000000000b30'
  );

  if own_count <> 0 then
    raise exception 'RLS failure: customer A can read staff/referrer-only referrer rows';
  end if;

  select count(*) into own_count
  from public.commission_entries
  where id in (
    '00000000-0000-0000-0000-000000000a42',
    '00000000-0000-0000-0000-000000000b42'
  );

  if own_count <> 0 then
    raise exception 'RLS failure: customer A can read staff/referrer-only commission rows';
  end if;

  select count(*) into own_count
  from public.lab_reports
  where id = '00000000-0000-0000-0000-000000000a50';

  if own_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own lab report';
  end if;

  select count(*) into other_count
  from public.lab_reports
  where id = '00000000-0000-0000-0000-000000000b50';

  if other_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B lab report';
  end if;

  select count(*) into own_count
  from public.lab_results
  where id = '00000000-0000-0000-0000-000000000a51';

  if own_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own lab result';
  end if;

  select count(*) into other_count
  from public.lab_results
  where id = '00000000-0000-0000-0000-000000000b51';

  if other_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B lab result';
  end if;

  select count(*) into own_count
  from public.wearable_metrics
  where id = '00000000-0000-0000-0000-000000000a60';

  if own_count <> 1 then
    raise exception 'RLS failure: customer A cannot read own wearable metric';
  end if;

  select count(*) into other_count
  from public.wearable_metrics
  where id = '00000000-0000-0000-0000-000000000b60';

  if other_count <> 0 then
    raise exception 'RLS failure: customer A can read customer B wearable metric';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);

do $$
declare
  own_customer_count integer;
  own_member_count integer;
  own_tenant_count integer;
  other_customer_count integer;
  other_member_count integer;
  other_tenant_count integer;
  updated_count integer;
begin
  select count(*) into own_tenant_count
  from public.tenants
  where id = '00000000-0000-0000-0000-0000000000a1';

  if own_tenant_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read own tenant';
  end if;

  select count(*) into other_tenant_count
  from public.tenants
  where id = '00000000-0000-0000-0000-0000000000b1';

  if other_tenant_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B';
  end if;

  select count(*) into own_customer_count
  from public.customers
  where tenant_id = '00000000-0000-0000-0000-0000000000a1';

  if own_customer_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A customer rows';
  end if;

  select count(*) into other_customer_count
  from public.customers
  where tenant_id = '00000000-0000-0000-0000-0000000000b1';

  if other_customer_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B customer rows';
  end if;

  select count(*) into own_member_count
  from public.tenant_members
  where tenant_id = '00000000-0000-0000-0000-0000000000a1'
    and auth_user_id = '00000000-0000-0000-0000-0000000000a4';

  if own_member_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read own tenant_members row';
  end if;

  select count(*) into other_member_count
  from public.tenant_members
  where tenant_id = '00000000-0000-0000-0000-0000000000b1';

  if other_member_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B member rows';
  end if;

  update public.products
  set active = false
  where tenant_id = '00000000-0000-0000-0000-0000000000a1'
    and catalog_key = 'rls-a-product';
  get diagnostics updated_count = row_count;

  if updated_count <> 0 then
    raise exception 'RLS failure: tenant A staff can update tenant A catalog rows';
  end if;
end;
$$;

do $$
declare
  own_count integer;
  other_count integer;
begin
  select count(*) into own_count
  from public.chat_sessions
  where id = '00000000-0000-0000-0000-000000000a20';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A chat session';
  end if;

  select count(*) into other_count
  from public.chat_sessions
  where id = '00000000-0000-0000-0000-000000000b20';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B chat session';
  end if;

  select count(*) into own_count
  from public.chat_messages
  where id = '00000000-0000-0000-0000-000000000a21';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A chat message';
  end if;

  select count(*) into other_count
  from public.chat_messages
  where id = '00000000-0000-0000-0000-000000000b21';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B chat message';
  end if;

  select count(*) into own_count
  from public.orders
  where id = '00000000-0000-0000-0000-000000000a40';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A order';
  end if;

  select count(*) into other_count
  from public.orders
  where id = '00000000-0000-0000-0000-000000000b40';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B order';
  end if;

  select count(*) into own_count
  from public.order_events
  where id = '00000000-0000-0000-0000-000000000a41';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A order event';
  end if;

  select count(*) into other_count
  from public.order_events
  where id = '00000000-0000-0000-0000-000000000b41';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B order event';
  end if;

  select count(*) into own_count
  from public.referrers
  where id = '00000000-0000-0000-0000-000000000a30';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A referrer';
  end if;

  select count(*) into other_count
  from public.referrers
  where id = '00000000-0000-0000-0000-000000000b30';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B referrer';
  end if;

  select count(*) into own_count
  from public.commission_entries
  where id = '00000000-0000-0000-0000-000000000a42';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A commission';
  end if;

  select count(*) into other_count
  from public.commission_entries
  where id = '00000000-0000-0000-0000-000000000b42';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B commission';
  end if;

  select count(*) into own_count
  from public.lab_reports
  where id = '00000000-0000-0000-0000-000000000a50';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A lab report';
  end if;

  select count(*) into other_count
  from public.lab_reports
  where id = '00000000-0000-0000-0000-000000000b50';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B lab report';
  end if;

  select count(*) into own_count
  from public.lab_results
  where id = '00000000-0000-0000-0000-000000000a51';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A lab result';
  end if;

  select count(*) into other_count
  from public.lab_results
  where id = '00000000-0000-0000-0000-000000000b51';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B lab result';
  end if;

  select count(*) into own_count
  from public.wearable_metrics
  where id = '00000000-0000-0000-0000-000000000a60';

  if own_count <> 1 then
    raise exception 'RLS failure: tenant A staff cannot read tenant A wearable metric';
  end if;

  select count(*) into other_count
  from public.wearable_metrics
  where id = '00000000-0000-0000-0000-000000000b60';

  if other_count <> 0 then
    raise exception 'RLS failure: tenant A staff can read tenant B wearable metric';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a10', true);

do $$
declare
  own_update_count integer;
  other_update_count integer;
begin
  update public.products
  set price_baht = 1001
  where tenant_id = '00000000-0000-0000-0000-0000000000a1'
    and catalog_key = 'rls-a-product';
  get diagnostics own_update_count = row_count;

  if own_update_count <> 1 then
    raise exception 'RLS failure: tenant A admin cannot update tenant A catalog rows';
  end if;

  update public.products
  set price_baht = 1001
  where tenant_id = '00000000-0000-0000-0000-0000000000b1'
    and catalog_key = 'rls-b-product';
  get diagnostics other_update_count = row_count;

  if other_update_count <> 0 then
    raise exception 'RLS failure: tenant A admin can update tenant B catalog rows';
  end if;

  update public.chat_sessions
  set flagged = 'complaint'
  where id = '00000000-0000-0000-0000-000000000a20';
  get diagnostics own_update_count = row_count;

  if own_update_count <> 1 then
    raise exception 'RLS failure: tenant A admin cannot update tenant A chat session';
  end if;

  update public.chat_sessions
  set flagged = 'complaint'
  where id = '00000000-0000-0000-0000-000000000b20';
  get diagnostics other_update_count = row_count;

  if other_update_count <> 0 then
    raise exception 'RLS failure: tenant A admin can update tenant B chat session';
  end if;

  update public.orders
  set admin_note = 'Tenant A admin note'
  where id = '00000000-0000-0000-0000-000000000a40';
  get diagnostics own_update_count = row_count;

  if own_update_count <> 1 then
    raise exception 'RLS failure: tenant A admin cannot update tenant A order';
  end if;

  update public.orders
  set admin_note = 'Tenant A admin note'
  where id = '00000000-0000-0000-0000-000000000b40';
  get diagnostics other_update_count = row_count;

  if other_update_count <> 0 then
    raise exception 'RLS failure: tenant A admin can update tenant B order';
  end if;

  update public.referrers
  set active = false
  where id = '00000000-0000-0000-0000-000000000a30';
  get diagnostics own_update_count = row_count;

  if own_update_count <> 1 then
    raise exception 'RLS failure: tenant A admin cannot update tenant A referrer';
  end if;

  update public.referrers
  set active = false
  where id = '00000000-0000-0000-0000-000000000b30';
  get diagnostics other_update_count = row_count;

  if other_update_count <> 0 then
    raise exception 'RLS failure: tenant A admin can update tenant B referrer';
  end if;

  update public.commission_entries
  set status = 'approved'
  where id = '00000000-0000-0000-0000-000000000a42';
  get diagnostics own_update_count = row_count;

  if own_update_count <> 1 then
    raise exception 'RLS failure: tenant A admin cannot update tenant A commission';
  end if;

  update public.commission_entries
  set status = 'approved'
  where id = '00000000-0000-0000-0000-000000000b42';
  get diagnostics other_update_count = row_count;

  if other_update_count <> 0 then
    raise exception 'RLS failure: tenant A admin can update tenant B commission';
  end if;

  update public.lab_reports
  set status = 'failed'
  where id = '00000000-0000-0000-0000-000000000a50';
  get diagnostics own_update_count = row_count;

  if own_update_count <> 1 then
    raise exception 'RLS failure: tenant A admin cannot update tenant A lab report';
  end if;

  update public.lab_reports
  set status = 'failed'
  where id = '00000000-0000-0000-0000-000000000b50';
  get diagnostics other_update_count = row_count;

  if other_update_count <> 0 then
    raise exception 'RLS failure: tenant A admin can update tenant B lab report';
  end if;

  update public.lab_results
  set confirmed = false
  where id = '00000000-0000-0000-0000-000000000a51';
  get diagnostics own_update_count = row_count;

  if own_update_count <> 1 then
    raise exception 'RLS failure: tenant A admin cannot update tenant A lab result';
  end if;

  update public.lab_results
  set confirmed = false
  where id = '00000000-0000-0000-0000-000000000b51';
  get diagnostics other_update_count = row_count;

  if other_update_count <> 0 then
    raise exception 'RLS failure: tenant A admin can update tenant B lab result';
  end if;

  update public.wearable_metrics
  set value = 8000
  where id = '00000000-0000-0000-0000-000000000a60';
  get diagnostics own_update_count = row_count;

  if own_update_count <> 1 then
    raise exception 'RLS failure: tenant A admin cannot update tenant A wearable metric';
  end if;

  update public.wearable_metrics
  set value = 8000
  where id = '00000000-0000-0000-0000-000000000b60';
  get diagnostics other_update_count = row_count;

  if other_update_count <> 0 then
    raise exception 'RLS failure: tenant A admin can update tenant B wearable metric';
  end if;
end;
$$;

rollback;
