-- V3-8: live agent console — human takeover.
-- Additive only.
--  * chat_sessions.agent_mode: 'ai' (default) or 'human'. When 'human', the LINE
--    webhook records inbound messages but the AI stays silent so staff can reply.
--  * Tenant staff may READ their tenant's conversations + messages for the console.
--    Writes (toggling agent_mode, sending a manual reply) go through a service-role
--    edge function (V3-8 Phase 2), so no broad client write policy is added here.

alter table public.chat_sessions
  add column if not exists agent_mode text not null default 'ai'
  check (agent_mode in ('ai', 'human'));

-- Staff read access for the console (customer self-access policies are unchanged).
drop policy if exists chat_sessions_staff_read on public.chat_sessions;

create policy chat_sessions_staff_read
  on public.chat_sessions
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists chat_messages_staff_read on public.chat_messages;

create policy chat_messages_staff_read
  on public.chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chat_sessions s
      where s.id = chat_messages.session_id
        and public.is_tenant_member(s.tenant_id)
    )
  );
