# Phase 1 Foundations

## What Changed

- Added the MiraCare v2 Phase 1 migration for `tenants`, `customers`, `tenant_members`, canonical `products`, `fact_keys`, `user_facts`, customer-scoped `consents`, storage buckets, catalog-key generation, and v2 RLS policies.
- Migrated legacy `hospital_products` rows into canonical `products` and removed the legacy table in the new migration.
- Replaced the prototype product+RAG client helper with a v2 catalog helper backed by `products`.
- Replaced the separate hospital product routes with the shared `/admin/catalog` catalog CRUD screen that checks `tenant_members`, creates, edits, archives, and restores v2 products while keeping `catalog_key` read-only.
- Added admin product image upload to the public `product-images` bucket; uploaded public URLs are saved to `products.image_url`, and manual image URLs remain supported.
- Replaced the main marketplace, package detail, home featured product, agent matches, checkout handoff, and order-status handoff routes so production paths no longer read the prototype `services/mockBackend` catalog.
- Added shared client/edge type mirrors in `lib/types/api.ts` and `supabase/functions/_shared/types.ts`.
- Added `scripts/type-mirror-audit.mjs` so exported client/edge type definitions stay synchronized in local checks and CI.
- Added `scripts/v2-type-safety-audit.mjs` so TypeScript strict mode stays enabled and explicit `any` stays out of app, library, service, and edge-function source files.
- Added `scripts/v2-schema-audit.mjs` so migration table contracts, RLS policies, FK/query indexes, chat message idempotency, catalog-key immutability, storage buckets, referral constraints, and migration filename uniqueness/numbering are checked locally and in CI.
- Added `scripts/v2-open-questions-audit.mjs` so unresolved contract decisions stay recorded in `docs/v2-open-questions.md` and `Blocked` gap rows keep pointing to that authoritative list.
- Added `scripts/v2-docs-audit.mjs` so verification evidence in the v2 docs does not drift back to stale file/test counts.
- Added `scripts/seed-demo.mjs` and `scripts/rls-check.sql`; `seed-demo` can attach existing auth users to the demo customer/admin/referrer through `DEMO_CUSTOMER_AUTH_USER_ID`, `DEMO_ADMIN_AUTH_USER_ID`, and `DEMO_REFERRER_AUTH_USER_ID`, while the RLS check seeds test auth users and covers customer/catalog isolation, fact key read visibility, `user_facts`, append-only `consents`, tenant-member/staff/admin boundaries, and customer/staff/admin isolation for chat, orders/events, referrals/commissions, labs, and wearable metrics.
- Added `.github/workflows/miracare-v2.yml` to run typecheck, chat quality checks, schema/client/edge/health/type audits, Deno edge entrypoint checks and shared tests with the Supabase function import map, optional chat regression, and optional shadow-db RLS checks on relevant pull requests.
- Added `npm run v2:verify` as the deterministic local verification bundle and `npm run v2:deno-test` so local and CI shared Deno tests use the same package script.
- Added `npm run v2:external-preflight` to report readiness for live Supabase seeding, chat regression, shadow RLS, OpenAI prompt-content review, and LINE sandbox checks without printing secret values.

## Verification

- `npm run typecheck` passed.
- `npm run v2:type-safety-audit` passed.
- `npm run v2:schema-audit` passed and now checks 29 numbered migrations.
- `npm run v2:open-questions-audit` passed.
- `npm run v2:docs-audit` passed.
- `npm run v2:client-audit` passed and now asserts catalog admin role gating, tenant_staff read-only behavior, product-image uploads through `product-images`, public URL resolution, and that catalog save payloads do not write `catalog_key`.
- `npm run v2:deno-check` passed for the 7 v2 edge entrypoints.
- `npm run types:mirror-audit` passed.
- `npm run v2:verify` passed.
- `npm run v2:external-preflight` ran successfully and reported five external gates waiting on local prerequisites in this environment.
- `rg` found no active app/library code querying `hospital_products`; remaining hits are old migrations/docs and the Phase 2 legacy chat function boundary.
- Production app routes no longer import `services/mockBackend`; the remaining mock import is isolated to the explicit `/prototype` route.
- Scattered legacy admin route files `/admin-booking`, `/hospital-portal`, and `/hospital-products` were removed; admin links now target `/admin/catalog`, `/admin/orders`, and `/admin/referrers`.
- `/admin/catalog` now fails closed for non-members and leaves tenant_staff users read-only; product writes and image uploads require tenant_admin or superadmin.
- CI uses `SUPABASE_SHADOW_DB_URL` for `scripts/rls-check.sql`; when that secret is absent, deterministic local schema checks still run and the live RLS step is skipped. The missing secret/hard-fail policy is logged in `docs/v2-open-questions.md`.
