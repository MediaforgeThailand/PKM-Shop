-- H2 (deep-risk-audit-2026-06-14): make LINE webhook processing idempotent.
--
-- LINE redelivers webhook events on timeout/error. Postback events carried a
-- fresh random client_msg_id every time, so a redelivered `select_product`
-- created a duplicate order. This table lets the webhook claim each event by its
-- globally-unique webhookEventId before doing any side effect; a second delivery
-- of the same event is skipped.
--
-- Only the edge function (service role) writes this table; staff may read it for
-- observability. Additive + idempotent.

create table if not exists public.line_webhook_events (
  event_id text primary key,
  tenant_id uuid references public.tenants (id),
  created_at timestamptz not null default now()
);

create index if not exists line_webhook_events_tenant_created_idx
  on public.line_webhook_events (tenant_id, created_at desc);

alter table public.line_webhook_events enable row level security;

drop policy if exists line_webhook_events_staff_read on public.line_webhook_events;

create policy line_webhook_events_staff_read
  on public.line_webhook_events
  for select
  to authenticated
  using (tenant_id is not null and public.is_tenant_member(tenant_id));
