# B2 Seeded Chat Regression Bootstrap

## What Changed

- Added `scripts/create-test-jwt.mjs` to create or update `regression-test@miracare.dev` with the Supabase admin API, sign in through the anon client, and print only the access token when run directly.
- Updated `scripts/chat-regression.mjs` to keep `TEST_SUPABASE_JWT` as an override but bootstrap the disposable regression token inline when `SUPABASE_SERVICE_ROLE_KEY` is available.
- Added an optional `live-regression` GitHub Actions job that skips cleanly when Supabase secrets are absent, then runs `scripts/seed-demo.mjs` and `npm run chat:regression` when they are present.
- Removed the human-managed regression JWT from the authoritative open-question audit and updated readiness docs to describe the programmatic identity.

## Verification

- `node --check scripts/create-test-jwt.mjs` and `node --check scripts/chat-regression.mjs` passed.
- `npm run v2:verify` passed with `v2-open-questions-audit` checking 26 topics, `v2-local-readiness-audit` checking 4 external gates, `v2-deploy-audit` scanning 50 files, and the shared Deno suite passing 75 tests.

## Boundaries

- The regression suite still requires live Supabase URL, anon key, and service-role key to execute against the linked project.
- No token or secret value is printed by the inline regression path or the CI workflow.
