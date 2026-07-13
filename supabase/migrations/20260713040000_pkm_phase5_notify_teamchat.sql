-- PKM-Shop — Phase 5: notifications outbox (every LINE push logged) + internal team chat.
-- The reused customer AI chat keeps chat_sessions/chat_messages (covers Ready.md's
-- line_conversations incl. handoff via chat_sessions.agent_mode). Team chat uses
-- team_channels/team_messages to avoid colliding with that. Business rules: Ready.md §4, §6, §8.

-- ---------------------------------------------------------------------------
-- notifications — one row per push (customer or staff), for debug + dedup + retry
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  event_type text not null check (event_type in (
    'order_created','slip_received','paid','round_locked','packed',
    'rider_accepted','rider_dispatched','delivered','returned',
    'express_paid','payroll_cutoff','payout_confirmed','kerry_handover'
  )),
  audience text not null check (audience in ('customer','staff')),
  order_id uuid references public.orders (id),
  round_id uuid references public.delivery_rounds (id),
  recipient_customer_id uuid references public.customers (id),
  recipient_profile_id uuid references public.profiles (id),
  recipient_line_user_id text,
  channel text not null default 'line',
  template text,
  title text,
  body text not null default '',
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error text,
  dedup_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index if not exists notifications_dedup_key
  on public.notifications (tenant_id, dedup_key) where dedup_key is not null;
create index if not exists notifications_tenant_created_idx on public.notifications (tenant_id, created_at desc);
create index if not exists notifications_pending_idx on public.notifications (status) where status = 'pending';
create index if not exists notifications_order_idx on public.notifications (order_id);

alter table public.notifications enable row level security;
drop policy if exists notifications_staff_read on public.notifications;
create policy notifications_staff_read
  on public.notifications for select to authenticated
  using (public.is_pkm_member(tenant_id));
-- writes go only through the notify edge function (service role).

-- ---------------------------------------------------------------------------
-- Team chat (Ready.md §8) — Realtime
-- ---------------------------------------------------------------------------
create table if not exists public.team_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  kind text not null default 'team',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists team_channels_tenant_idx on public.team_channels (tenant_id, active);

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  channel_id uuid not null references public.team_channels (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  text text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists team_messages_channel_idx on public.team_messages (channel_id, created_at desc);

alter table public.team_channels enable row level security;
alter table public.team_messages enable row level security;

drop policy if exists team_channels_member_read on public.team_channels;
drop policy if exists team_channels_admin_write on public.team_channels;
drop policy if exists team_messages_member_read on public.team_messages;
drop policy if exists team_messages_member_write on public.team_messages;

create policy team_channels_member_read
  on public.team_channels for select to authenticated
  using (public.is_pkm_member(tenant_id));

create policy team_channels_admin_write
  on public.team_channels for all to authenticated
  using (public.is_pkm_admin(tenant_id))
  with check (public.is_pkm_admin(tenant_id));

create policy team_messages_member_read
  on public.team_messages for select to authenticated
  using (public.is_pkm_member(tenant_id));

-- Any active member may post as their own profile.
create policy team_messages_member_write
  on public.team_messages for insert to authenticated
  with check (
    public.is_pkm_member(tenant_id)
    and sender_id in (select p.id from public.profiles p where p.user_id = auth.uid() and p.tenant_id = team_messages.tenant_id)
  );

-- Realtime for team chat + the admin order board (guarded — publication may not exist locally).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.team_messages;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table public.orders;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table public.delivery_rounds;
    exception when duplicate_object then null; end;
  end if;
end;
$$;
