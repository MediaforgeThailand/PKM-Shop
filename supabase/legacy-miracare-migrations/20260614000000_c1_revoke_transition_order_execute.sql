-- C1 (deep-risk-audit-2026-06-14): lock down public.transition_order execution.
--
-- transition_order is SECURITY DEFINER (bypasses RLS on orders) and its only
-- privilege gate is `p_actor like 'admin:%'`, which the caller fully controls.
-- PostgreSQL grants EXECUTE to PUBLIC by default, and Supabase exposes public
-- functions to the anon/authenticated PostgREST roles — so without this revoke
-- any logged-in customer could POST /rest/v1/rpc/transition_order with
-- p_actor:'admin:x' to self-confirm their own order (bypassing staff payment
-- confirmation, AGENTS.md §2 Money) and trigger a commission_entries insert.
--
-- Only the edge functions (which call it through the service role) must be able
-- to invoke it. This migration is additive and idempotent; it does NOT change
-- the state machine, statuses, or transitions.

revoke execute on function public.transition_order(uuid, text, text, jsonb) from public;
revoke execute on function public.transition_order(uuid, text, text, jsonb) from anon;
revoke execute on function public.transition_order(uuid, text, text, jsonb) from authenticated;
grant execute on function public.transition_order(uuid, text, text, jsonb) to service_role;
