create table if not exists public.lab_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  customer_id uuid not null references public.customers (id),
  storage_path text not null,
  status text not null default 'processing' check (status in ('processing', 'needs_confirmation', 'ready', 'failed')),
  ai_summary_th text,
  collected_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.lab_reports (id) on delete cascade,
  test_code text not null,
  test_name_raw text not null,
  value numeric,
  unit text,
  ref_low numeric,
  ref_high numeric,
  confidence numeric not null check (confidence between 0 and 1),
  confirmed boolean not null default false,
  unique (report_id, test_code)
);

create table if not exists public.wearable_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  customer_id uuid not null references public.customers (id),
  source text not null check (source in ('apple_export', 'healthkit', 'manual')),
  metric text not null check (metric in ('steps', 'resting_hr', 'avg_hr', 'sleep_minutes', 'active_energy_kcal')),
  day date not null,
  value numeric not null,
  unique (customer_id, metric, day, source)
);

insert into storage.buckets (id, name, public)
values
  ('lab-reports', 'lab-reports', false),
  ('line-assets', 'line-assets', true),
  ('wearable-imports', 'wearable-imports', false)
on conflict (id) do update
set public = excluded.public;

create index if not exists lab_reports_v2_customer_created_idx
  on public.lab_reports (customer_id, created_at desc);

create index if not exists lab_reports_v2_tenant_status_idx
  on public.lab_reports (tenant_id, status, created_at desc);

create index if not exists lab_results_v2_code_idx
  on public.lab_results (test_code);

create index if not exists wearable_metrics_v2_customer_metric_day_idx
  on public.wearable_metrics (customer_id, metric, day desc);

create index if not exists wearable_metrics_v2_tenant_day_idx
  on public.wearable_metrics (tenant_id, day desc);

insert into public.fact_keys (key, value_kind, unit)
values
  ('FBS', 'number', 'mg/dL'),
  ('HBA1C', 'number', '%'),
  ('CHOL', 'number', 'mg/dL')
on conflict (key) do update
set value_kind = excluded.value_kind,
    unit = excluded.unit;

alter table public.lab_reports enable row level security;
alter table public.lab_results enable row level security;
alter table public.wearable_metrics enable row level security;

drop policy if exists lab_reports_customer_read on public.lab_reports;
drop policy if exists lab_reports_staff_all on public.lab_reports;
drop policy if exists lab_results_customer_read on public.lab_results;
drop policy if exists lab_results_staff_all on public.lab_results;
drop policy if exists wearable_metrics_customer_read on public.wearable_metrics;
drop policy if exists wearable_metrics_staff_all on public.wearable_metrics;

create policy lab_reports_customer_read
  on public.lab_reports
  for select
  to authenticated
  using (
    customer_id in (
      select c.id
      from public.customers c
      where c.auth_user_id = auth.uid()
    )
  );

create policy lab_reports_staff_all
  on public.lab_reports
  for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy lab_results_customer_read
  on public.lab_results
  for select
  to authenticated
  using (
    report_id in (
      select r.id
      from public.lab_reports r
      join public.customers c on c.id = r.customer_id
      where c.auth_user_id = auth.uid()
    )
  );

create policy lab_results_staff_all
  on public.lab_results
  for all
  to authenticated
  using (
    report_id in (
      select r.id
      from public.lab_reports r
      where public.is_tenant_member(r.tenant_id)
    )
  )
  with check (
    report_id in (
      select r.id
      from public.lab_reports r
      where public.is_tenant_admin(r.tenant_id)
    )
  );

create policy wearable_metrics_customer_read
  on public.wearable_metrics
  for select
  to authenticated
  using (
    customer_id in (
      select c.id
      from public.customers c
      where c.auth_user_id = auth.uid()
    )
  );

create policy wearable_metrics_staff_all
  on public.wearable_metrics
  for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_admin(tenant_id));
