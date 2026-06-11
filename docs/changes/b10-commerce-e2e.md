# B10 Commerce E2E Runner

## What Changed

- Added `scripts/e2e-commerce.mjs` for the credentialed live purchase/referral proof.
- The runner provisions disposable `e2e-*@miracare.dev` auth users, seeds a tenant admin membership, runs a direct `chk-basic` chat purchase, validates the PromptPay CRC, submits payment, confirms through `admin-order-action`, and asserts exactly one new `system_notice` for payment and confirm.
- The referral leg creates a service-role referrer, sends the generated `ref_code` through `chat-orchestrator`, confirms one purchase, and asserts the commission amount matches `orders.commission_scheme_snapshot`.
- Cleanup cancels created orders, removes commerce E2E rows, and deletes the disposable auth users.
- Added `npm run v2:e2e-commerce`, wired it into the optional live regression CI job behind `MIRA_DEMO_PROMPTPAY_ID`, and added a fifth external preflight gate for live commerce E2E setup.
- Documented the manual `lab-ingest` sample-image checklist in `docs/v2-local-readiness.md`; full automated lab-image E2E remains out of scope until owner-approved imagery exists.
- Added `20260611000000_remote_applied_via_dashboard_4.sql` so local migration history matches the already-applied remote dashboard migration and `db push` can apply the pending A1/A2/B8 fix migrations cleanly.
- Updated the `FACT_MODEL` default/setup docs from the invalid `gpt-5.5-mini` slug to `gpt-5-mini`, matching the model slug accepted by the live OpenAI API for extraction/order-field calls.

## Verification

- `npm run v2:verify` passed after the B10 changes, including `v2:schema-audit` checking 33 migrations, `v2:local-readiness-audit` checking 5 external gates, and the shared Deno suite passing 83 tests.
- `npm run v2:external-preflight` ran without printing secrets and reported 5 waiting gates in the normal local shell because Supabase, PromptPay, and LINE credentials are not exported there.
- Credentialed live setup used Supabase CLI project keys in-process without echoing secrets, set `MIRA_DEMO_PROMPTPAY_ID=0812345678`, and ran `node scripts/seed-demo.mjs`: `Seeded 7 products for Demo Hospital (demo-hospital).`
- `npm run v2:rls-check`: `rls-check: PASS (customer isolation and cross-tenant product write denial checked)`.
- `npm run chat:regression`: passed all 7 handoff cases (`short greeting`, `broad checkup asks age`, `age concern asks next`, `recommend package`, `price objection`, `direct vaccine price`, `emergency escalation`).
- `npm run v2:e2e-commerce`: `e2e-commerce: PASS (direct purchase, admin confirm, referral attribution, and commission snapshot checked)`.
- Live deploy/schema evidence: all 8 v2 functions deployed to `xwixdxmemwcuoamcloty`; `line-webhook` has `verify_jwt=false`; `lab-confirm` is active; `supabase migration list --linked` shows local and remote aligned through `20260611062000`.

## Boundary

- This section does not add LINE sandbox credentials or change the legal disclaimer wording. Those remain the only open-question topics.
