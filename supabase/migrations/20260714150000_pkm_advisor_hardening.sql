-- PKM-Shop — Supabase security-advisor hardening (post round-2 review).
--
-- Findings addressed (from `get_advisors type=security`, 2026-07-14):
--   1. pkm_reserve_order_stock / pkm_consume_order_stock / pkm_release_order_stock are
--      SECURITY DEFINER money/stock mutators but were executable by anon + authenticated
--      via /rest/v1/rpc — any signed-in staff (or unauthenticated caller) could corrupt
--      stock counters for an arbitrary order id. AGENTS.md: stock moves are server-side
--      only → service_role exclusively.
--   2. pkm_setting_int leaked settings reads to anon. No RLS policy references it
--      (verified against pg_policies), and definer functions run as owner, so revoking
--      client roles breaks nothing.
--   3. Four functions still had a role-mutable search_path (missed by the 120000 sweep):
--      pkm_seed_settings_on_tenant, pkm_orders_set_order_no, pkm_actor_kind,
--      pkm_seed_default_settings.
--
-- Deliberately NOT changed:
--   - is_pkm_admin / is_pkm_member / is_tenant_* / pkm_has_role / tenant_role stay
--     executable by authenticated: they are the RLS helper predicates and run as the
--     querying role inside policies. They only read membership and return false for
--     strangers — flagged by the linter but intentional.
--   - pkm_my_link_code() stays authenticated — that is its whole purpose.
--   - pg_net stays registered in public: the extension is not relocatable on this
--     image and its callable objects live in the `net` schema regardless.

-- (1) stock mutators: service_role only
revoke execute on function public.pkm_reserve_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.pkm_consume_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.pkm_release_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.pkm_reserve_order_stock(uuid) to service_role;
grant execute on function public.pkm_consume_order_stock(uuid) to service_role;
grant execute on function public.pkm_release_order_stock(uuid) to service_role;

-- (2) settings reader: no client roles
revoke execute on function public.pkm_setting_int(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.pkm_setting_int(uuid, text, integer) to service_role;

-- (3) pin search_path on the stragglers
alter function public.pkm_seed_settings_on_tenant() set search_path = public;
alter function public.pkm_orders_set_order_no() set search_path = public;
alter function public.pkm_actor_kind(text) set search_path = public;
alter function public.pkm_seed_default_settings(uuid) set search_path = public;
