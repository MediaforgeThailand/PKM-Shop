# MiraCare v2 Audit Report - 2026-06-11

Scope: current worktree against `docs/miracare-codex-handoff.md`, `docs/miracare-v2-technical-spec.md`, and `docs/miracare-v2-product-plan.md` in the documented precedence order.

## Verification Run

- PASS: `npm run typecheck`
- PASS: `npm run v2:verify` (deterministic local verification bundle)
- PASS: `npm run v2:external-preflight` (script ran; five external gates report WAIT in this environment)
- PASS: `npm run v2:type-safety-audit` (102 TypeScript files scanned)
- PASS: `npm run chat:quality`
- PASS: `npm run orders:status-audit`
- PASS: `npm run v2:schema-audit` (16 tables, 32 policies, 30 indexes, 29 migrations checked)
- PASS: `npm run v2:open-questions-audit` (28 unresolved-contract topics, 4 blocked rows checked)
- PASS: `npm run v2:local-readiness-audit` (0 Missing rows, 21 decision blockers, 5 external gates checked)
- PASS: `npm run v2:docs-audit` (11 docs checked)
- PASS: `npm run v2:client-audit` (28 production files, 3 removed routes, 64 client files secret-scanned)
- PASS: `npm run v2:edge-security-audit` (13 edge/shared/template files scanned)
- PASS: `npm run v2:health-safety-audit` (14 files scanned)
- PASS: `npm run types:mirror-audit` (34 exported types checked)
- PASS: `npm run v2:deno-check` (7 v2 edge entrypoints)
- PASS: `npx.cmd -y deno@2.8.2 test --allow-env --allow-net --import-map=supabase/functions/import_map.json supabase/functions/_shared/__tests__/` (68 passed)
- PASS: `git diff --check` (Windows line-ending warnings only)

## Findings

| Area | Result | Severity | Evidence | Suggested fix |
|---|---|---:|---|---|
| Model integration contract | PASS | P0 | `chat:quality` verifies prompt ID variables, `store:false`, no local prompt layering, no legacy `mira-chat` call | Keep `chat:quality` required in CI. |
| Published OpenAI prompt content | FAIL | P0 | Local code points at the prompt ID, but current OpenAI Platform prompt content was not verified in this run | Verify prompt content/version with owner credentials before release. |
| Type safety and shared API mirrors | PASS | P0 | `typecheck`, `v2:type-safety-audit`, `types:mirror-audit` | Keep audits required in CI. |
| Deterministic local verification bundle | PASS | P0 | `v2:verify` runs typecheck, static audits, Deno edge check, and shared Deno tests | Keep external-secret checks separate and documented. |
| External gate readiness preflight | PASS | P0 | `v2:external-preflight` reports missing prerequisites for live Supabase seeding, chat regression, shadow RLS, OpenAI prompt review, and LINE sandbox without printing secrets | Use before attempting external verification runs; it does not prove those runs passed. |
| Open-question contract hygiene | PASS | P0 | `v2:open-questions-audit` checks required unresolved-contract topics and blocked gap rows | Keep this gate in CI so implementation does not silently drift from the "log questions, do not guess" rule. |
| Local readiness hygiene | PASS | P0 | `v2:local-readiness-audit` checks there are no unblocked `Missing` rows and keeps owner/external blockers visible | Keep this gate in CI so local-doable work stays separate from contract/credential blockers. |
| Documentation evidence hygiene | PASS | P2 | `v2:docs-audit` checks v2 docs for stale verification counts and required command evidence | Keep this gate in CI so audit output stays tied to current verification. |
| Schema contract and migration numbering | PASS | P0 | `v2:schema-audit` | Keep schema audit required in CI. |
| Live RLS tenant isolation | FAIL | P0 | `scripts/rls-check.sql` exists, but no `SUPABASE_SHADOW_DB_URL` was available for live execution | Run live shadow DB RLS test; owner must decide whether missing secret hard-fails PRs. |
| Service-role tenant filtering | FAIL | P0 | `v2:edge-security-audit` passes known invariants, but `fact-extractor`, `lab-ingest`, and wearable request-context contracts remain open | Do not tighten initial lookups until tenant-context contracts are approved in `docs/v2-open-questions.md`. |
| Customer chat code path | PASS | P1 | React Query history, persisted messages, consent action, `chat-orchestrator`, marker parsing; `chat:quality` and client audit pass | Keep code-path audits in CI. |
| Seeded chat regression and known-user personalization | FAIL | P1 | Regression runner exists, but seeded Supabase/JWT credentials were not available | Seed Supabase/JWT and run the 7-case suite plus known-user fact personalization proof. |
| Order state machine and admin queue | PASS | P1 | `transition_order`, PromptPay tests, action-response `system_notice` persistence/rendering, admin queue, status-write audit | Keep deterministic tests/audits required in CI. |
| Slip upload and persisted order-panel reload | FAIL | P1 | Current implementation intentionally stops before guessing private `payment-slips` write contract and QR reload contract | Resolve contracts in `docs/v2-open-questions.md`; then run seeded purchase E2E through admin booking. |
| Referral and commissions code path | PASS | P1 | attribution route, assisted purchase, commission unit tests, referrer admin audit | Keep deterministic tests/audits required in CI. |
| Referral production contracts and live E2E | FAIL | P1 | `ref_code` format/transport, default commission schemes, endpoint split, and live E2E proof remain open | Confirm contracts and run live attributed/assisted E2E. |
| Lab/wearable deterministic pipeline | PASS | P1 | lab/wearable schema, lab safety audit, fixture-backed normalizer tests, Apple Health XML/zip streaming tests | Keep health safety audit and shared Deno tests required in CI. |
| Lab confirmation, legal wording, and live sample evidence | FAIL | P1 | Confirmation write path, legal disclaimer approval, alias table, tenant resolution, and real image-to-OpenAI sample proof remain open | Resolve contracts and capture live sample evidence. |
| Wearable production contracts | FAIL | P1 | Request context, bucket naming, wearable `source_ref`, and export-upload UX acceptance remain open | Resolve owner questions before production rollout. |
| LINE deterministic surface | PASS | P1 | signature/postback/Flex/QR helper tests, edge audit, `line-webhook` check | Keep deterministic LINE tests in CI. |
| LINE sandbox regression | FAIL | P1 | No tenant LINE sandbox channel credentials/test account were available | Provide LINE sandbox channel credentials and confirm `line-assets` bucket policy; then run sandbox regression. |
| Client production surface | PASS | P2 | `v2:client-audit` blocks mock/prototype leakage; production health routes read live data | Confirm whether `/prototype` and mockup-only demo screens stay available for v2 release. |

## Blockers

The authoritative blocker list is `docs/v2-open-questions.md`. The goal is not complete until external secrets/sandbox evidence exists and each contract question is resolved or explicitly accepted by the owner.
