do $$
begin
  if to_regclass('public.chat_messages') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'chat_messages'
        and column_name = 'user_id'
    ) then
    if to_regclass('public.legacy_chat_messages') is null then
      alter table public.chat_messages rename to legacy_chat_messages;
    else
      alter table public.chat_messages rename to legacy_chat_messages_20260611020000;
    end if;
  end if;

  if to_regclass('public.chat_sessions') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'chat_sessions'
        and column_name = 'user_id'
    ) then
    if to_regclass('public.legacy_chat_sessions') is null then
      alter table public.chat_sessions rename to legacy_chat_sessions;
    else
      alter table public.chat_sessions rename to legacy_chat_sessions_20260611020000;
    end if;
  end if;
end;
$$;

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  customer_id uuid not null references public.customers (id),
  channel text not null check (channel in ('app', 'pwa', 'line')),
  flagged text check (flagged in ('emergency', 'complaint')),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id),
  role text not null check (role in ('user', 'assistant', 'system_notice')),
  content text not null,
  marker_product_ids text[] not null default '{}',
  openai_response_id text,
  client_msg_id text,
  created_at timestamptz not null default now(),
  unique (session_id, client_msg_id)
);

create index if not exists chat_sessions_v2_tenant_last_message_idx
  on public.chat_sessions (tenant_id, last_message_at desc);

create index if not exists chat_sessions_v2_customer_created_idx
  on public.chat_sessions (customer_id, created_at desc);

create index if not exists chat_messages_v2_session_created_idx
  on public.chat_messages (session_id, created_at);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_sessions_customer_read on public.chat_sessions;
drop policy if exists chat_sessions_staff_all on public.chat_sessions;
drop policy if exists chat_messages_customer_read on public.chat_messages;
drop policy if exists chat_messages_staff_all on public.chat_messages;

create policy chat_sessions_customer_read
  on public.chat_sessions
  for select
  to authenticated
  using (
    customer_id in (
      select c.id
      from public.customers c
      where c.auth_user_id = auth.uid()
    )
  );

create policy chat_sessions_staff_all
  on public.chat_sessions
  for all
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy chat_messages_customer_read
  on public.chat_messages
  for select
  to authenticated
  using (
    session_id in (
      select s.id
      from public.chat_sessions s
      join public.customers c on c.id = s.customer_id
      where c.auth_user_id = auth.uid()
    )
  );

create policy chat_messages_staff_all
  on public.chat_messages
  for all
  to authenticated
  using (
    session_id in (
      select s.id
      from public.chat_sessions s
      where public.is_tenant_member(s.tenant_id)
    )
  )
  with check (
    session_id in (
      select s.id
      from public.chat_sessions s
      where public.is_tenant_admin(s.tenant_id)
    )
  );
