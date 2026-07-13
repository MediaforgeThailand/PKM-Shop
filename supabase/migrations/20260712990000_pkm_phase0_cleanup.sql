-- PKM-Shop — Phase 0: remove MiraCare health-specific DB objects (owner-authorized full
-- rewrite, 2026-07-13). Runs AFTER all MiraCare migrations and BEFORE the PKM phases so the
-- PKM tables (profiles, orders, order_events, …) create cleanly with no name collisions.
--
-- KEEP (reused substrate): tenants, customers, tenant_members, products, chat_sessions,
-- chat_messages, line_webhook_events, storage buckets payment-slips/product-images/line-assets,
-- and the RLS helpers tenant_role/miracare_slugify/miracare_generate_catalog_key.

-- health / referral / rag / hospital / stripe functions
drop function if exists public.transition_order(uuid, text, text, jsonb) cascade;
drop function if exists public.miracare_commission_amount(jsonb, integer) cascade;
drop function if exists public.miracare_commission_amount(jsonb, integer, integer) cascade;

-- appointment order model (PKM recreates orders/order_events with the fulfilment shape)
drop table if exists public.commission_entries cascade;
drop table if exists public.returns cascade;
drop table if exists public.order_events cascade;
drop table if exists public.orders cascade;
drop table if exists public.referrers cascade;

-- hospital catalog extras (PKM uses its own categories)
drop table if exists public.product_branches cascade;
drop table if exists public.branches cascade;
drop table if exists public.product_categories cascade;
drop table if exists public.hospital_product_audit_logs cascade;
drop table if exists public.hospital_products cascade;

-- health data vault + facts + consent (PDPA health)
drop table if exists public.lab_results cascade;
drop table if exists public.lab_reports cascade;
drop table if exists public.wearable_metrics cascade;
drop table if exists public.wearable_imports cascade;
drop table if exists public.pdpa_requests cascade;
drop table if exists public.data_access_logs cascade;
drop table if exists public.hospital_access_grants cascade;
drop table if exists public.health_fact_sources cascade;
drop table if exists public.health_facts cascade;
drop table if exists public.health_memory_logs cascade;
drop table if exists public.health_logs cascade;
drop table if exists public.user_facts cascade;
drop table if exists public.fact_keys cascade;
drop table if exists public.user_context_scores cascade;
drop table if exists public.consents cascade;
drop table if exists public.legacy_consents cascade;
drop table if exists public.agent_memory cascade;

-- RAG / retrieval / eval / ai logs (health chatbot governance)
drop table if exists public.rag_chunks cascade;
drop table if exists public.rag_retrieval_logs cascade;
drop table if exists public.retrieval_logs cascade;
drop table if exists public.web_search_cache cascade;
drop table if exists public.web_search_sources cascade;
drop table if exists public.ai_request_logs cascade;
drop table if exists public.api_process_logs cascade;
drop table if exists public.ai_rate_limits cascade;
drop table if exists public.chat_eval_cases cascade;
drop table if exists public.prompt_versions cascade;
drop table if exists public.app_user_roles cascade;

-- old health profiles (PKM recreates profiles with 5 roles + LINE link in phase 1)
drop table if exists public.profiles cascade;

-- remove Stripe columns/index from products if present (PKM uses PromptPay + SlipOK)
alter table public.products drop column if exists stripe_product_id;
alter table public.products drop column if exists stripe_price_id;
-- remove appointment-only product fields (PKM goods have no branch/appointment)
alter table public.products drop column if exists requires_appointment;
alter table public.products drop column if exists branch_info;

-- health storage buckets (keep payment-slips, product-images, line-assets, stock-in)
delete from storage.objects where bucket_id in ('lab-reports', 'wearable-imports');
delete from storage.buckets where id in ('lab-reports', 'wearable-imports');
