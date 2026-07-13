create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_message_id uuid references public.chat_messages (id) on delete set null,
  memory_type text not null check (memory_type in (
    'budget',
    'communication_preference',
    'goal',
    'location_preference',
    'product_interest',
    'lifestyle_preference',
    'other'
  )),
  summary text not null,
  value text,
  source text not null default 'chat' check (source in ('chat', 'intake', 'hospital_result', 'partner_booking', 'manual_note')),
  confidence numeric(4, 3) not null default 0.700 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active', 'deleted', 'expired')),
  observed_at timestamptz not null default now(),
  valid_until timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_memory enable row level security;

drop policy if exists "Users can read own agent memory" on public.agent_memory;
drop policy if exists "Users can create own agent memory" on public.agent_memory;
drop policy if exists "Users can update own agent memory" on public.agent_memory;
drop policy if exists "Admins can read agent memory" on public.agent_memory;

create policy "Users can read own agent memory"
  on public.agent_memory
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own agent memory"
  on public.agent_memory
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own agent memory"
  on public.agent_memory
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admins can read agent memory"
  on public.agent_memory
  for select
  to authenticated
  using (public.is_app_admin());

create index if not exists agent_memory_user_status_type_idx
  on public.agent_memory (user_id, status, memory_type, observed_at desc);

create index if not exists agent_memory_source_message_idx
  on public.agent_memory (source_message_id);

create index if not exists chat_sessions_user_companion_idx
  on public.chat_sessions (user_id, source, started_at desc)
  where source = 'companion_timeline';
