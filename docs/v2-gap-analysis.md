# MiraCare v2 Gap Analysis

Updated: 2026-06-11

Scope: current worktree audit against `docs/miracare-v2-technical-spec.md`, with `docs/miracare-codex-handoff.md` and `docs/miracare-v2-product-plan.md` treated as higher/lower companion documents per the technical spec precedence rules.

Status legend:

- `Exists`: implemented in the current worktree with local evidence.
- `Partial`: meaningful implementation exists, but a required detail is missing or unverified.
- `Blocked`: implementation stopped because the spec does not define a safe contract; the question is logged in `docs/v2-open-questions.md`.
- `Missing`: not implemented and not currently blocked by an ambiguity.

## Current Verification Baseline

- `npm run v2:verify`: passing, deterministic local gate for typecheck, static audits, Deno edge check, and shared Deno tests.
- `npm run v2:external-preflight`: runs successfully; reports four external gates waiting on local prerequisites in this environment.
- `npm run typecheck`: passing.
- `npm run v2:type-safety-audit`: passing, 106 TypeScript files scanned.
- `npm run chat:quality`: passing.
- `npm run orders:status-audit`: passing.
- `npm run v2:schema-audit`: passing.
- `npm run v2:open-questions-audit`: passing, 20 unresolved-contract topics and 3 blocked rows checked.
- `npm run v2:local-readiness-audit`: passing, 0 Missing rows, 18 decision blockers, and 4 external gates checked.
- `npm run v2:docs-audit`: passing, 11 docs checked for stale verification evidence.
- `npm run v2:client-audit`: passing, 29 production files scanned.
- `npm run v2:edge-security-audit`: passing, 16 edge/shared/storage/template files scanned.
- `npm run v2:health-safety-audit`: passing, 14 health/lab/wearable files scanned.
- `npm run types:mirror-audit`: passing, 36 exported types checked.
- `git diff --check`: passing, with Windows line-ending warnings only.
- `npx.cmd -y deno@2.8.2 test --allow-env --allow-net --import-map=supabase/functions/import_map.json supabase/functions/_shared/__tests__/`: passing, 83 tests.
- `npm run v2:deno-check`: passing for 7 v2 edge entrypoints.
- `npm run v2:rls-check`: live linked-project RLS check is available as a secret-backed gate and is wired into the optional `live-regression` CI job.
- Browser smoke checks have rendered the changed production routes on `http://localhost:8082` with zero console errors.

## Phase 0 - Discovery And Gap Analysis

| Requirement | Status | Evidence | Gap / Next Step |
|---|---|---|---|
| Produce `docs/v2-gap-analysis.md` mapping requirements to exists/partial/missing/files | Exists | This file | Keep current as gaps close. |
| Correct plan section 1 if current state changes | Exists | `docs/miracare-v2-product-plan.md` now references `chat-orchestrator`, `app/admin/*`, canonical `products`, and dated audit checklist statuses | Remaining red checklist items point to real blockers/open questions, not stale plan text. |
| Produce v2 audit report with pass/fail evidence and severity | Exists | `docs/v2-audit-report-2026-06-11.md` | Re-run after each owner decision or external integration proof closes a blocker. |

## Phase 1 - Foundations

| Requirement | Status | Evidence | Gap / Next Step |
|---|---|---|---|
| Tenancy, customers, tenant members, products, fact keys, user facts, consents | Exists | `supabase/migrations/20260611010000_miracare_v2_phase1_foundations.sql`, `npm run v2:schema-audit` | The schema audit now checks the v2 table contracts, RLS enables/policies, and required FK/query indexes. |
| Catalog consolidation from legacy `hospital_products` to canonical `products` | Exists | Phase 1 migration and `lib/marketplace/hospitalProducts.ts` | Keep old migration/docs references historical only. |
| Admin catalog CRUD, read-only `catalog_key`, image upload to `product-images` | Exists | `app/admin/catalog.tsx`, `components/admin/CatalogCrud.tsx`, product-image storage policies, `npm run v2:client-audit` | Client audit now asserts catalog writes are role-gated, image upload uses `product-images`, public URLs are returned, and save payloads do not write `catalog_key`; browser smoke verifies `/admin/catalog`. Production deploy still needs real tenant/member testing. |
| Tenant-member admin guard | Exists | `loadTenantMemberContext`, `canWriteTenantCatalog`, `CatalogCrud` read-only handling, `npm run v2:client-audit` | Client audit asserts read-only state for tenant_staff and disabled image upload for non-writers. |
| Seed and RLS checks | Exists | `scripts/seed-demo.mjs`, `scripts/rls-check.mjs`, optional `live-regression` CI job | `scripts/rls-check.mjs` creates two disposable auth users in the demo tenant, seeds customer-owned rows, verifies customer A cannot read customer B `customers`, `user_facts`, `orders`, `chat_messages`, or `lab_reports` rows through PostgREST, denies a cross-tenant `products` insert, and cleans up created rows/users. |
| Canonical seven-product catalog | Blocked | `docs/v2-open-questions.md` Phase 1 | Owner must confirm canonical catalog; demo seed rows are deterministic placeholders. |
| Legacy consent migration semantics | Blocked | `docs/v2-open-questions.md` Phase 1 | Owner must define legacy-to-v2 consent mapping if old data matters. |

## Phase 2 - Chat Foundation

| Requirement | Status | Evidence | Gap / Next Step |
|---|---|---|---|
| Replace customer chat path with `chat-orchestrator` | Exists | `supabase/functions/chat-orchestrator`, `lib/ai/miraChat.ts`, deleted `supabase/functions/mira-chat` | Deployment must ensure the old function is not used. |
| Shared Deno modules and §10 unit coverage | Exists | `supabase/functions/_shared/*`, `_shared/__tests__/*`, `.github/workflows/miracare-v2.yml` import-map Deno step | `npx.cmd -y deno@2.8.2 test --allow-env --allow-net --import-map=supabase/functions/import_map.json supabase/functions/_shared/__tests__/` passes locally via npm cache with 83 tests. Tests cover marker's 8 spec cases plus unknown-key drop/log, PromptPay fixtures, state-machine legal/illegal transitions, slip path/content-type/ownership guards, commission calculation, referral attribution windows including zero/negative boundaries, context empty/full/overflow, fact normalizer Thai numerals/Buddhist year/kg parsing, lab, wearable, LINE token/signature/text/Flex carousel/QR image/payment postback helpers including underscore tenant env fallback and empty-product handling, lab-summary safety, lab vision normalization table, fixture-backed lab/wearable sample parsing, Apple Health XML chunk streaming, Apple Health zip `export.xml` streaming, and constant-time internal service-role guard coverage for fact/lab/wearable functions. |
| Published OpenAI prompt variables, `store:false`, no local system prompt layering | Exists | `supabase/functions/_shared/openai.ts`, `npm run chat:quality` assertions, `docs/v2-local-readiness.md` | `chat:quality` asserts the customer chat screen does not import/use prompt-version reads or local prompt override paths. Prompt-content verification is owner-owned and evidenced by the owner's Platform playground review plus live 7-case regression on 2026-06-10/11; Codex must not fetch prompt content from code. |
| Marker parser and product cards | Exists | `_shared/marker.ts`, `components/chat/ProductCarousel.tsx`, `app/(tabs)/chatbot.tsx`, `npm run v2:client-audit`, chat quality checks | `ProductCarousel` now receives API-shaped `ChatProduct[]`; the chat container adapts persisted product-grid cards, and the client audit guards presentational chat components from direct fetch/Supabase/React Query reads. |
| Fact extractor with consent gate and idempotent inserts | Exists | `supabase/functions/fact-extractor`, `_shared/facts.ts`, `user_facts_dedupe` index, service-role-only guard in `_shared/db.ts` | End-to-end fact personalization still needs integration evidence against a seeded DB. |
| Consent UI/client action | Partial | `components/chat/ConsentSheet.tsx`, `app/(tabs)/chatbot.tsx`, `loadHealthDataConsent`, `consent_granted` action in orchestrator | Needs seeded Supabase proof that the consent row appears and fact extraction subsequently runs. The action-side-effect ordering versus `client_msg_id` idempotency is logged in `docs/v2-open-questions.md` because §3.2 and §0.1 need an owner decision before tightening. |
| Chat screen messages list from DB, paged, with optimistic append | Exists | `loadLatestChatHistoryPage`, `loadChatHistoryPage`, `refreshActiveOrderPanel`, React Query hydration in `app/(tabs)/chatbot.tsx`, local optimistic append on send | Persisted reload reconstructs text, `system_notice`, and product cards from `marker_product_ids`; `refresh_order` rebuilds the active order panel deterministically from `loadActiveOrder` without persisting QR payloads. |
| React Query for caching/retries in typed API client | Exists | `@tanstack/react-query`, `miraQueryClient`, `QueryClientProvider`, chat history/consent query keys | None known. |
| 7-case chat regression suite in CI | Exists | `scripts/chat-regression.mjs`, `scripts/create-test-jwt.mjs`, optional `live-regression` CI job | Script now enforces exact q2/q3 question counts, seeded product IDs for recommendation cases, emergency no-products, and ≤3 sentences. If `TEST_SUPABASE_JWT` is absent, it uses service-role credentials to create/update `regression-test@miracare.dev`, sign in, and keep the token out of logs; the optional CI job seeds the demo tenant and runs the suite when Supabase secrets exist. |

## Phase 3 - Orders And Payment

| Requirement | Status | Evidence | Gap / Next Step |
|---|---|---|---|
| `orders`, `order_events`, status state machine, PromptPay QR | Exists | `20260611030000_miracare_v2_phase3_orders.sql`, `_shared/orders.ts`, `_shared/promptpay.ts`, `_shared/__tests__/orders_test.ts`, `_shared/__tests__/promptpay_test.ts` | Shared Deno tests pass locally via `npx.cmd -y deno@2.8.2`. |
| Every order status write through transition RPC | Exists | `scripts/order-status-write-audit.mjs`, passing audit | Keep audit in CI. |
| Chat order actions: select product, collect fields, form fallback, refresh order, slip upload, payment done | Exists | `_shared/orchestrate.ts`, `components/chat/OrderPanel.tsx`, `lib/ai/miraChat.ts`, `npm run v2:client-audit`, `npm run v2:edge-security-audit` | Action responses that skip the model now persist the user turn and exactly one templated TypeScript `system_notice`; SQL no longer composes notices. The live chat append uses the same `system_notice` role. `refresh_order` returns only the rebuilt order panel with empty text and no persistence/model call. Slip upload uses a no-model `request_slip_upload` action and `payment_done` can attach `slip_path`. E2E purchase against real Supabase still needed. |
| Admin order queue with transcript, actions, signed slip thumbnails | Exists | `app/admin/orders.tsx`, `components/admin/OrdersQueue.tsx`, `supabase/functions/admin-order-action/index.ts` | Browser smoke reaches auth gate locally; admin slip thumbnails now request server-generated 60-minute signed read URLs through `admin-order-action`. Real stored-slip display still needs seeded/live proof. |
| Slip upload / attaching `slip_url` | Exists | `_shared/orchestrate.ts`, `_shared/orders.ts`, `_shared/storage.ts`, `components/chat/OrderPanel.tsx`, `lib/ai/miraChat.ts`, `components/admin/OrdersQueue.tsx`, `_shared/__tests__/orders_test.ts`, `npm run v2:client-audit`, `npm run v2:edge-security-audit` | The chat action validates tenant/session/customer ownership, returns a signed upload URL for `payment-slips/${tenant_id}/${order_id}/${uuid}.jpg|png`, the client uploads directly, and `payment_done` validates/stores the order-scoped `slip_path` before transitioning to `submitted`. |
| Chat purchase E2E reaches admin queue and books | Partial | Components/functions exist; audits pass | Needs seeded Supabase integration test or manual run. |

## Phase 4 - Refer Program

| Requirement | Status | Evidence | Gap / Next Step |
|---|---|---|---|
| `referrers`, `commission_entries`, attribution fields | Exists | `20260611040000_miracare_v2_phase4_referrals.sql`, `npm run v2:schema-audit` | Referral FK indexes are included for `customers.referred_by` and `orders.referrer_id`; schema audit now checks the spec-defined `doctor|nurse|creator|staff` referrer type enum. |
| `/r/[ref_code]` stores attribution and first chat transmits it | Partial | `app/r/[ref_code].tsx`, `lib/referrals/attribution.ts`, `lib/ai/miraChat.ts`, `scripts/v2-client-audit.mjs`, optional `ref_code` request field, `_shared/referrals.ts`, `_shared/__tests__/referrals_test.ts` | Client audit now asserts the referral landing route persists the normalized code and chat forwards `readStoredReferralCode()` as `ref_code`; unit coverage proves active, expired, exact-boundary, missing, and invalid attribution timestamps. Transport shape and exact 6-character base32 alphabet/normalization are logged for confirmation. |
| Referrer assisted purchase and QR | Exists | `supabase/functions/referrer-order`, `app/partner.tsx` | Endpoint split for payment confirmation is logged for confirmation. |
| Commission creation on confirmed order | Exists | Phase 4 `transition_order(...)` replacement, unique `commission_entries.order_id`, `_shared/commissions.ts`, `_shared/__tests__/commissions_test.ts` | Unit coverage now covers percent, flat, category override, rounding, and negative clamp behavior. Seeded E2E proof is still pending. |
| Admin referrer CRUD and commission status actions | Exists | `app/admin/referrers.tsx`, `components/admin/ReferrersAdmin.tsx`, `npm run v2:client-audit` | Referrer admin now supports schema-enum type selection, read-only existing `ref_code`, row actions, and selected-row bulk approve/paid actions. The client audit asserts the bulk handlers, tenant-scoped commission update, enum choices, and read-only edit behavior. Browser smoke reaches auth gate; real role testing pending. |
| Automated payouts | Not in v2 scope | Product plan section 12 | None. |

## Phase 5 - Health Dashboard

| Requirement | Status | Evidence | Gap / Next Step |
|---|---|---|---|
| `lab_reports`, `lab_results`, `wearable_metrics` schema/RLS | Exists | `20260611050000_miracare_v2_phase5_health_dashboard.sql`, `npm run v2:schema-audit` | The schema audit covers table shape, RLS policies, and health-dashboard indexes including `wearable_metrics(tenant_id, day desc)`. |
| Lab ingest: storage download, OpenAI extraction, confidence gate, summary once, facts for ready rows | Exists | `supabase/functions/lab-ingest`, `_shared/openai.ts`, `_shared/lab.ts`, `_shared/templates.ts`, `supabase/functions/_shared/__tests__/fixtures/lab_vision_results.json`, `npm run v2:health-safety-audit` | Real image-to-OpenAI sample lab run is not locally proven. `lab-ingest` is service-role internal, derives tenant from `customer_id -> customers.tenant_id`, and does not accept request tenant fields. Lab summary storage is deterministically sanitized to remove diagnosis wording and append the fixed disclaimer from the canonical edge template file; `lib/templates.ts` is an app-side mirror. The vision call embeds the spec's 15-code normalization table in system text; broader raw-name aliases need owner confirmation. |
| Low-confidence lab confirmation UI/write path | Partial | `components/HealthInsightScreens.tsx`, `docs/v2-open-questions.md` Phase 5 | The lab results screen now lists low-confidence/unconfirmed rows from `lab_results`. Spec still lacks the trusted write contract for user edits, confirmation, and fact insertion. |
| Wearable ingest from Apple Health export zip/XML | Partial | `supabase/functions/wearable-ingest`, `_shared/wearable.ts`, `_shared/__tests__/wearable_test.ts`, `npm run v2:health-safety-audit` | `wearable-ingest` is service-role internal, derives tenant from `customer_id -> customers.tenant_id`, streams storage objects, reads `export.xml` from Apple Health zip chunks with `fflate`, and still accepts extracted XML. Remaining gaps are wearable `source_ref`, bucket naming, export-upload UX acceptance, and live proof. |
| Dashboard screens read only live lab/wearable/fact tables | Partial | `components/HealthInsightScreens.tsx`, `lib/health/v2HealthDashboard.ts`, `npm run v2:client-audit`, `npm run v2:health-safety-audit` | Client and health audits now assert the production health routes render `HealthInsightScreen`, the loader reads `lab_reports`, nested `lab_results`, `wearable_metrics`, and `user_facts`, and dashboard view/loader/routes do not use mock data or model calls. Customer tenant-context resolution is still blocked because the client currently resolves `tenants.slug` while tenant RLS is member-only. This contract is logged in `docs/v2-open-questions.md`; real sample data visual proof is still pending. |
| Rule-based insights, no model calls at view time | Exists | `components/HealthInsightScreens.tsx`, `supabase/functions/_shared/__tests__/fixtures/apple_health_export.ts`, `npm run v2:health-safety-audit` | Shared Deno tests cover the lab and wearable normalizers with sample fixture files; health safety audit now asserts the wearable zip streaming parser, wearable trend recent/prior 7-day windows, and that dashboard view-time code contains no OpenAI/function-invoke paths. Visual proof with seeded live dashboard data is still pending. |

## Phase 6 - LINE Webhook

| Requirement | Status | Evidence | Gap / Next Step |
|---|---|---|---|
| LINE webhook signature verification and tenant routing | Exists | `supabase/functions/line-webhook`, `_shared/line.ts` | Sandbox credentials needed for live verification. |
| LINE text/follow/postback mapped to shared orchestrator | Exists | `line-webhook/index.ts`, `_shared/orchestrate.ts`, `_shared/__tests__/line_test.ts` | Deterministic tests cover `select_product`, `payment_done`, and bounded unknown postback mapping; sandbox regression pending. |
| Flex product carousel and QR image replies | Exists | `line-webhook/index.ts`, `_shared/line.ts`, `_shared/__tests__/line_test.ts`, `npm run v2:edge-security-audit` | Deterministic helper tests now cover carousel slicing, product postbacks, LINE `image` QR payloads, and `payment_done` postbacks; edge audit asserts QR PNG render/upload plus image-message reply wiring. QR bucket policy is logged for confirmation. |
| Admin confirmed/booked LINE push attempts | Exists | `admin-order-action/index.ts`, `_shared/line.ts` | Needs real LINE channel test. |
| Regression suite over LINE sandbox | Blocked | `docs/v2-open-questions.md` Phase 6 | Requires tenant LINE channel credentials and test harness. |

## Cross-Cutting Requirements

| Requirement | Status | Evidence | Gap / Next Step |
|---|---|---|---|
| TypeScript strict mode and no explicit `any` | Exists | `tsconfig.json`, `scripts/v2-type-safety-audit.mjs`, `npm run v2:type-safety-audit` | CI now verifies `strict: true`, rejects disabled strict sub-flags, and AST-scans app, component, library, service, and edge-function TypeScript source for explicit `any`. |
| Type mirrors and header comments | Exists | `lib/types/api.ts`, `supabase/functions/_shared/types.ts`, `scripts/type-mirror-audit.mjs`, `npm run types:mirror-audit` | Exported type definitions are compared by name in CI, and the audit now enforces the mirror header comments in both files. |
| Schema contract audit in CI | Exists | `scripts/v2-schema-audit.mjs`, `package.json`, `.github/workflows/miracare-v2.yml` | `npm run v2:schema-audit` checks 16 v2 tables, 32 policies, 30 indexes, 31 numbered migrations, chat message idempotency, catalog-key immutability, legacy catalog consolidation, storage bucket contract, referrer type enum, and referral FK constraints. |
| Open-question contract audit in CI | Exists | `scripts/v2-open-questions-audit.mjs`, `docs/v2-open-questions.md`, `.github/workflows/miracare-v2.yml` | The audit keeps 20 unresolved-contract topics present in the open-question doc and checks that `Blocked` gap-analysis rows cite the authoritative list. |
| Local readiness audit in CI | Exists | `scripts/v2-local-readiness-audit.mjs`, `docs/v2-local-readiness.md`, `.github/workflows/miracare-v2.yml` | The audit checks that no unblocked `Missing` rows remain, owner-decision blockers stay visible, and external setup gates are not confused with local deterministic proof. |
| Documentation evidence audit in CI | Exists | `scripts/v2-docs-audit.mjs`, `docs/changes/*`, `docs/v2-gap-analysis.md`, `.github/workflows/miracare-v2.yml` | The audit checks v2 docs for stale verification counts and requires the current verification command evidence to stay visible. |
| Deterministic local verification bundle | Exists | `npm run v2:verify`, `package.json`, `.github/workflows/miracare-v2.yml` | The bundle runs the local deterministic gates. Secret-backed live seeding, live RLS, chat regression, and LINE sandbox checks remain separate because they require owner-provided external state. |
| External gate readiness preflight | Exists | `npm run v2:external-preflight`, `scripts/v2-external-preflight.mjs` | The preflight reports four external gates waiting: live seeding, chat regression, live RLS, and LINE sandbox checks without exposing secret values. It does not replace those external verification runs. |
| Standard edge response envelope for v2 functions | Exists | `_shared/http.ts`, v2 functions use `json()`/`toErrorResponse()`, `npm run v2:edge-security-audit`, `npm run v2:deno-check` | The edge audit now checks all v2 edge entrypoints for shared CORS/envelope helpers, rejects raw `new Response(...)`, and guards the LINE QR image reply plus payment-slip signed upload/read paths; CI also Deno-checks all 7 v2 edge entrypoints. Legacy utility functions (`rag-embed`, `openai-transcribe`) still use older response helpers and are outside the v2 replacement path. |
| No direct service-role use in client | Exists | Client code uses Supabase anon client; service-role access is in edge shared DB REST helper; `npm run v2:client-audit` secret-scans client-facing files | The client audit now scans 64 `app`, `components`, and `lib` client files for service-role terms. |
| Service-role tenant filtering in v2 edge functions | Exists | `npm run v2:edge-security-audit`, `_shared/internalAuth.ts`, `supabase/functions/_shared/__tests__/internal_auth_test.ts` | Chat order actions validate tenant/session/customer ownership before order field writes and `payment_done`; admin order actions load orders through the authenticated user's tenant allow-list; `fact-extractor`, `lab-ingest`, and `wearable-ingest` require the shared constant-time service-role guard; lab/wearable derive tenant from customer/report rows instead of request tenant fields. |
| No production mock/prototype route leakage | Exists | `scripts/v2-client-audit.mjs`; only `/prototype` imports `PrototypeChatPanel`/`services/mockBackend` | Keep audit in CI. |
| Admin route consolidation | Exists | `app/admin/catalog.tsx`, `app/admin/orders.tsx`, `app/admin/referrers.tsx`; deleted legacy route files | Keep audit in CI. |
| Migrations additive and numbered | Exists | `supabase/migrations/*.sql`, `npm run v2:schema-audit` | Schema audit now rejects migration files that are not numbered as `2026MMDDHHMMSS_*.sql` or that reuse a timestamp. Do not edit migrations after applying to shared environments. |

## Open Questions That Block Completion

See `docs/v2-open-questions.md` for the authoritative list. Current blockers include canonical catalog data, legacy consent mapping, PDPA export/delete contract, prototype-screen release policy, action-side-effect idempotency sequencing, manual payment verification acceptance, referral-code format, referral-code transport shape, referrer payment endpoint split, production commission defaults, lab normalization aliases, lab confirmation write contract, legal-approved lab disclaimer wording, customer dashboard tenant-context resolution, wearable fact source refs, wearable bucket naming, Apple Health export-upload UX acceptance, LINE assets bucket policy, and LINE sandbox credentials.
