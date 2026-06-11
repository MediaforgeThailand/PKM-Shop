# B3 Live RLS Check

## What Changed

- Replaced the shadow-database `scripts/rls-check.sql` with `scripts/rls-check.mjs`.
- The live checker creates disposable auth users for customer A and customer B, seeds customer-owned rows in the demo tenant, verifies customer A cannot read customer B `customers`, `user_facts`, `orders`, `chat_messages`, or `lab_reports` rows through PostgREST, and verifies a cross-tenant `products` insert is denied.
- The checker cleans up seeded rows and disposable auth users after each run.
- Added `npm run v2:rls-check` and wired it into the optional `live-regression` CI job after `scripts/seed-demo.mjs` and before `npm run chat:regression`.
- Removed the old shadow database secret/hard-fail question from `docs/v2-open-questions.md`.

## Verification

- `node --check scripts/create-test-jwt.mjs`, `node --check scripts/chat-regression.mjs`, and `node --check scripts/rls-check.mjs` passed.
- `npm run v2:external-preflight` ran without printing secrets and reported four waiting live gates in this local shell.
- `npm run v2:verify` passed with `v2-open-questions-audit` checking 25 topics, `v2-local-readiness-audit` checking 4 external gates, `v2-deploy-audit` scanning 51 files, and the shared Deno suite passing 75 tests.

## Boundaries

- `npm run v2:rls-check` is secret-backed and requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- The deterministic local `npm run v2:verify` bundle still excludes live Supabase calls.
