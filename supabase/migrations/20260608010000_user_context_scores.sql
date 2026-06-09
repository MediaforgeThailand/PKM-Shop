create table if not exists public.user_context_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_id uuid references public.consents (id) on delete set null,
  source_message_id uuid references public.chat_messages (id) on delete set null,
  purpose text not null default 'health_package_recommendation' check (purpose in ('health_package_recommendation')),
  score integer not null check (score >= 0 and score <= 100),
  level text not null check (level in ('insufficient', 'partial', 'ready')),
  recommendation_mode text not null check (recommendation_mode in ('ask_context', 'direct_product', 'personalized_recommendation')),
  collected_slots text[] not null default '{}',
  missing_slots text[] not null default '{}',
  next_question text,
  slot_summary jsonb not null default '{}',
  confidence numeric(4, 3) not null default 0.700 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active', 'deleted', 'expired')),
  calculated_at timestamptz not null default now(),
  valid_until timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_context_scores enable row level security;

drop policy if exists "Users can read own context scores" on public.user_context_scores;
drop policy if exists "Users can create own context scores" on public.user_context_scores;
drop policy if exists "Users can update own context scores" on public.user_context_scores;
drop policy if exists "Admins can read context scores" on public.user_context_scores;

create policy "Users can read own context scores"
  on public.user_context_scores
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own context scores"
  on public.user_context_scores
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own context scores"
  on public.user_context_scores
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admins can read context scores"
  on public.user_context_scores
  for select
  to authenticated
  using (public.is_app_admin());

create index if not exists user_context_scores_user_purpose_status_idx
  on public.user_context_scores (user_id, purpose, status, calculated_at desc);

create index if not exists user_context_scores_source_message_idx
  on public.user_context_scores (source_message_id);

create or replace function public.delete_context_scores_on_health_memory_revoke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purpose = 'chat_health_memory' and new.status = 'revoked' then
    update public.user_context_scores
      set
        status = 'deleted',
        updated_at = now(),
        metadata = metadata || jsonb_build_object(
          'deleted_by', 'consent_revoke',
          'revoked_consent_id', new.id
        )
      where user_id = new.user_id
        and status = 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists delete_context_scores_on_health_memory_revoke on public.consents;

create trigger delete_context_scores_on_health_memory_revoke
  after insert on public.consents
  for each row
  execute function public.delete_context_scores_on_health_memory_revoke();
