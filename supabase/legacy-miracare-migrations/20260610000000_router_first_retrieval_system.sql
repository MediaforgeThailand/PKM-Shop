alter table public.chat_sessions
  add column if not exists rolling_summary text,
  add column if not exists summary_updated_at timestamptz,
  add column if not exists message_count int not null default 0;

alter table public.chat_messages
  add column if not exists token_estimate int,
  add column if not exists router_route text[] not null default '{}';

create table if not exists public.web_search_sources (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  display_name text not null,
  source_type text not null check (source_type in ('intl_authority', 'thai_authority', 'hospital_partner', 'medical_reference')),
  language text[] not null default '{en}',
  topics text[] not null default '{}',
  trust_tier int not null default 2 check (trust_tier between 1 and 3),
  status text not null default 'pending' check (status in ('approved', 'pending', 'suspended')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.web_search_cache (
  id uuid primary key default gen_random_uuid(),
  query_hash text not null unique,
  normalized_query text not null,
  results jsonb not null,
  source_ids uuid[] not null default '{}',
  ttl_class text not null default 'standard' check (ttl_class in ('stable', 'standard', 'volatile')),
  expires_at timestamptz not null,
  hit_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.retrieval_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.chat_sessions (id) on delete cascade,
  message_id uuid references public.chat_messages (id) on delete set null,
  router_input jsonb not null default '{}',
  routes_selected text[] not null default '{}',
  routes_rejected jsonb not null default '{}',
  fetch_stats jsonb not null default '{}',
  cache_hit boolean,
  total_context_tokens int,
  router_latency_ms int,
  total_latency_ms int,
  model_intent text,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_created_desc_idx
  on public.chat_messages (session_id, created_at desc);

create index if not exists retrieval_logs_session_created_idx
  on public.retrieval_logs (session_id, created_at desc);

create index if not exists retrieval_logs_user_created_idx
  on public.retrieval_logs (user_id, created_at desc);

create index if not exists web_search_sources_status_domain_idx
  on public.web_search_sources (status, domain);

alter table public.web_search_sources enable row level security;
alter table public.web_search_cache enable row level security;
alter table public.retrieval_logs enable row level security;

drop policy if exists "Authenticated users can read approved web search sources" on public.web_search_sources;
drop policy if exists "Authenticated users can read web search cache" on public.web_search_cache;
drop policy if exists "Authenticated users can write web search cache" on public.web_search_cache;
drop policy if exists "Users can read own retrieval logs" on public.retrieval_logs;
drop policy if exists "Users can create own retrieval logs" on public.retrieval_logs;

create policy "Authenticated users can read approved web search sources"
  on public.web_search_sources
  for select
  to authenticated
  using (status = 'approved');

create policy "Authenticated users can read web search cache"
  on public.web_search_cache
  for select
  to authenticated
  using (true);

create policy "Authenticated users can write web search cache"
  on public.web_search_cache
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Users can read own retrieval logs"
  on public.retrieval_logs
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own retrieval logs"
  on public.retrieval_logs
  for insert
  to authenticated
  with check (user_id = auth.uid());

insert into public.web_search_sources (domain, display_name, source_type, language, topics, trust_tier, status, approved_at, notes)
values
  ('who.int', 'World Health Organization', 'intl_authority', '{en}', '{general_health,vaccine,infectious_disease}', 1, 'approved', now(), 'Seeded authority source for controlled medical search'),
  ('cdc.gov', 'U.S. Centers for Disease Control and Prevention', 'intl_authority', '{en}', '{vaccine,infectious_disease,screening}', 1, 'approved', now(), 'Seeded authority source for controlled medical search'),
  ('nhs.uk', 'NHS', 'medical_reference', '{en}', '{patient_education,screening,medication}', 2, 'approved', now(), 'Seeded patient education source'),
  ('mayoclinic.org', 'Mayo Clinic', 'medical_reference', '{en}', '{patient_education,condition,medication}', 2, 'approved', now(), 'Seeded patient education source'),
  ('ddc.moph.go.th', 'Department of Disease Control Thailand', 'thai_authority', '{th}', '{vaccine,infectious_disease,thai_guideline}', 1, 'approved', now(), 'Seeded Thai authority source'),
  ('moph.go.th', 'Ministry of Public Health Thailand', 'thai_authority', '{th}', '{thai_guideline,public_health}', 1, 'approved', now(), 'Seeded Thai authority source')
on conflict (domain) do update
set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  language = excluded.language,
  topics = excluded.topics,
  trust_tier = excluded.trust_tier,
  status = excluded.status,
  approved_at = coalesce(public.web_search_sources.approved_at, excluded.approved_at),
  notes = excluded.notes;
