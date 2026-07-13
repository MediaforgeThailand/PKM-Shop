create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in (
    'chat_history',
    'chat_health_memory',
    'health_analytics',
    'hospital_data_sharing',
    'ai_processing'
  )),
  status text not null check (status in ('granted', 'revoked')),
  version text not null default '2026-06-04',
  source text not null default 'app',
  granted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  source text not null default 'chatbot',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  message_kind text not null default 'chat' check (message_kind in ('chat', 'health_fact_review', 'safety_escalation')),
  rag_chunk_ids text[] not null default '{}',
  model text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.health_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_id uuid references public.consents (id) on delete set null,
  source_message_id uuid references public.chat_messages (id) on delete set null,
  fact_type text not null check (fact_type in (
    'allergy',
    'condition',
    'medication',
    'surgery',
    'family_history',
    'lifestyle',
    'vital',
    'lab_result',
    'symptom',
    'pregnancy',
    'other'
  )),
  label text not null,
  value text not null,
  normalized_value text,
  unit text,
  observed_at date,
  confidence numeric(4, 3) not null default 0.500 check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'deleted')),
  source text not null default 'chatbot_extraction',
  sensitive boolean not null default true,
  metadata jsonb not null default '{}',
  confirmed_at timestamptz,
  rejected_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_fact_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  health_fact_id uuid not null references public.health_facts (id) on delete cascade,
  chat_message_id uuid references public.chat_messages (id) on delete set null,
  source_type text not null default 'chat_message' check (source_type in ('chat_message', 'manual_entry', 'hospital_record')),
  evidence_quote text,
  created_at timestamptz not null default now()
);

create table if not exists public.hospital_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_id uuid references public.consents (id) on delete set null,
  hospital_id text not null,
  scopes text[] not null default '{}',
  status text not null default 'granted' check (status in ('granted', 'revoked', 'expired')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'
);

create table if not exists public.data_access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'hospital_staff', 'admin', 'edge_function', 'system')),
  action text not null check (action in ('create', 'read', 'update', 'delete', 'export', 'share', 'revoke')),
  resource_type text not null,
  resource_id uuid,
  purpose text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.consents enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.health_facts enable row level security;
alter table public.health_fact_sources enable row level security;
alter table public.hospital_access_grants enable row level security;
alter table public.data_access_logs enable row level security;

drop policy if exists "Users can read own consents" on public.consents;
drop policy if exists "Users can create own consents" on public.consents;
drop policy if exists "Users can read own chat sessions" on public.chat_sessions;
drop policy if exists "Users can create own chat sessions" on public.chat_sessions;
drop policy if exists "Users can update own chat sessions" on public.chat_sessions;
drop policy if exists "Users can read own chat messages" on public.chat_messages;
drop policy if exists "Users can create own chat messages" on public.chat_messages;
drop policy if exists "Users can read own health facts" on public.health_facts;
drop policy if exists "Users can create own health facts" on public.health_facts;
drop policy if exists "Users can update own health facts" on public.health_facts;
drop policy if exists "Users can read own health fact sources" on public.health_fact_sources;
drop policy if exists "Users can create own health fact sources" on public.health_fact_sources;
drop policy if exists "Users can read own hospital grants" on public.hospital_access_grants;
drop policy if exists "Users can create own hospital grants" on public.hospital_access_grants;
drop policy if exists "Users can update own hospital grants" on public.hospital_access_grants;
drop policy if exists "Users can read own data access logs" on public.data_access_logs;
drop policy if exists "Users can create own data access logs" on public.data_access_logs;

create policy "Users can read own consents"
  on public.consents
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own consents"
  on public.consents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read own chat sessions"
  on public.chat_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own chat sessions"
  on public.chat_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own chat sessions"
  on public.chat_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own chat messages"
  on public.chat_messages
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own chat messages"
  on public.chat_messages
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read own health facts"
  on public.health_facts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own health facts"
  on public.health_facts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own health facts"
  on public.health_facts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own health fact sources"
  on public.health_fact_sources
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own health fact sources"
  on public.health_fact_sources
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read own hospital grants"
  on public.hospital_access_grants
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own hospital grants"
  on public.hospital_access_grants
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own hospital grants"
  on public.hospital_access_grants
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own data access logs"
  on public.data_access_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own data access logs"
  on public.data_access_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create index if not exists consents_user_purpose_created_idx
  on public.consents (user_id, purpose, created_at desc);

create index if not exists chat_sessions_user_started_idx
  on public.chat_sessions (user_id, started_at desc);

create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);

create index if not exists health_facts_user_status_type_idx
  on public.health_facts (user_id, status, fact_type, created_at desc);

create index if not exists health_fact_sources_fact_idx
  on public.health_fact_sources (health_fact_id);

create index if not exists hospital_access_grants_user_hospital_idx
  on public.hospital_access_grants (user_id, hospital_id, status);

create index if not exists data_access_logs_user_created_idx
  on public.data_access_logs (user_id, created_at desc);
