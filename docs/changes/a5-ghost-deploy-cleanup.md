# A5 Ghost Deploy Cleanup

## Investigation
- Removed `scripts/deploy-mira-chat.ps1`, the stale legacy-named deploy helper left behind after the production chat path moved to `chat-orchestrator`.
- Added `scripts/deploy-v2-functions.ps1` with an explicit allow-list for exactly these v2 functions: `chat-orchestrator`, `fact-extractor`, `admin-order-action`, `referrer-order`, `line-webhook`, `lab-ingest`, and `wearable-ingest`.
- `line-webhook` deploys with `--no-verify-jwt` so LINE callbacks can reach the webhook before tenant signature verification.
- Searched repo scripts, workflows, README, and docs for legacy or wildcard Supabase function deploy invocations; the new deploy audit blocks `gemini-chat`, `mira-chat`, wildcard, and stale helper deploy references outside this historical note and the work order.

## Verification
- `npm run v2:verify` passed on 2026-06-11 after the A5 changes. The run included `v2:deploy-audit`, which confirmed the seven-function allow-list and scanned scripts, workflows, README, and docs.
