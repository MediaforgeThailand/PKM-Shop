# B10 Commerce E2E Runner

## What Changed

- Added `scripts/e2e-commerce.mjs` for the credentialed live purchase/referral proof.
- The runner provisions disposable `e2e-*@miracare.dev` auth users, seeds a tenant admin membership, runs a direct `chk-basic` chat purchase, validates the PromptPay CRC, submits payment, confirms through `admin-order-action`, and asserts exactly one new `system_notice` for payment and confirm.
- The referral leg creates a service-role referrer, sends the generated `ref_code` through `chat-orchestrator`, confirms one purchase, and asserts the commission amount matches `orders.commission_scheme_snapshot`.
- Cleanup cancels created orders, removes commerce E2E rows, and deletes the disposable auth users.
- Added `npm run v2:e2e-commerce`, wired it into the optional live regression CI job behind `MIRA_DEMO_PROMPTPAY_ID`, and added a fifth external preflight gate for live commerce E2E setup.
- Documented the manual `lab-ingest` sample-image checklist in `docs/v2-local-readiness.md`; full automated lab-image E2E remains out of scope until owner-approved imagery exists.

## Verification

- `npm run v2:verify` passed after the B10 changes, including `v2:local-readiness-audit` checking 5 external gates and the shared Deno suite passing 83 tests.
- `npm run v2:external-preflight` ran without printing secrets and reported 5 waiting gates in this local shell because Supabase, PromptPay, and LINE credentials are not exported here.
- `npm run v2:e2e-commerce` requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, a seeded demo tenant, active `chk-basic`, deployed edge functions, and tenant `promptpay_id`; CI seeds that field from `MIRA_DEMO_PROMPTPAY_ID`.

## Boundary

- This section does not add LINE sandbox credentials or change the legal disclaimer wording. Those remain the only open-question topics.
