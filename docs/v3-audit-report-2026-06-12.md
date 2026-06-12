# MiraCare v3 Audit Report — 2026-06-12 (post V3-0/V3-1/V3-2 merge)

Auditor: Claude (owner-side). Scope: PRs #1–#3 merged to `main` (e99a713), checked against `docs/miracare-v3-chat-commerce-plan.md`, `docs/miracare-codex-handoff.md`, and `docs/codex-goals.md`. Verification base: local typecheck green, post-merge CI green, live `chat:regression:v3` 10/10, live commerce E2E PASS on staging pinned to prompt v3.

## Verdict

**V3-0, V3-1, V3-2: implemented correctly per spec — APPROVED**, with 1 process finding (scope), 2 functional follow-ups (F1, F2), and 3 minor notes. No P0 contract or security violations found.

## A. Contract compliance (P0) — all PASS

| Check | Result | Evidence |
|---|---|---|
| `store:false` on conversation calls | ✅ | `_shared/openai.ts` `callMiraPrompt` |
| Variables exactly 5, snake_case, no layering | ✅ | `callMiraPrompt` vars object; no extra system prompts in reply path |
| Prompt referenced by ID; version only via `MIRA_PROMPT_VERSION` env (absent → platform default) | ✅ | `openai.ts:132-144` |
| Prompt content untouched by Codex | ✅ | no prompt text in code; Platform default still Version 2 |
| Marker parser per §2.2 (3 types, 4-id cap, args-optional regex, legacy 2-id compat) | ✅ | `_shared/marker.ts`; `marker_test.ts` covers all types + extra-marker stripping |
| One-marker rule: extra markers stripped + logged | ✅ | `parseChatMarker.strippedExtraMarkerCount` + `marker_extra_stripped` warn in orchestrator |
| Marker stripped on all reply paths before customer sees text | ✅ | orchestrator parses before persist; live suite asserts no `[[` in text |

## B. Commerce & security (P0) — all PASS

| Check | Result | Evidence |
|---|---|---|
| `select_branch` validates order∈(customer,session) + status + branch∈product_branches (active, tenant-scoped) | ✅ | `orchestrate.ts:408-448`, `activeBranchForProduct` |
| `order_form_submit` validates ownership + status + `buyer_age` zod int 1–120 | ✅ | actionSchema + handler |
| Single-branch product skips branch step; multi-branch starts `selecting_branch` | ✅ | `createOrderFromProduct:266-280`; e2e covers both |
| `transition_order` RPC remains the only status write path; `selecting_branch` matrix enforced | ✅ | V3-1 migration; `orders_test.ts`; `orders:status-audit` in verify |
| Migrations additive (create if not exists / add column if not exists / widened check) | ✅ | `20260612040000`, `20260612050000` |
| RLS for branches/product_branches/product_categories | ✅ | live `rls-check` PASS incl. v3 checks |
| Purchase-flow card suppression (owner patch) preserved | ✅ | `orchestrate.ts` `marker_suppressed_active_order` |

## C. UX spec §5 (P2) — PASS

- `ProductGrid`: 2-col (48%), "AI แนะนำ" badge on first card only when `source==='recommendation'`, expand 4→12 local with remote `browse_category` offset fallback. ✅
- `CategoryGrid`, `BranchPicker` (list + ยืนยันสาขา; no map artifact), `BookingSheet` (two-step: form ชื่อ/นามสกุล/เบอร์/อายุ → PromptPay QR + slip), `OrderStatusCard` timeline, `/orders` account screen (RLS client query, `?focus=` deep link). ✅
- `/order-status` now redirects to `/orders?focus=<id>` (Stripe return URL preserved). ✅
- Stripe hidden in customer flow: `BookingSheet` `stripeEnabled` defaults false and chatbot does not pass it. ✅ (see note N2)
- Order context lines §4.4: active step line, LINE keeps missing-fields variant, 2 recent orders with Thai status text, 3-line cap — model answers queue status from DB-derived lines only. ✅ (live case 'order status marker' green)

## D. Findings

**F0 (process — scope of the "goal complete" claim).** `docs/codex-goals.md` ordered G1–G4 (showcase S0–S3) BEFORE G5–G6. The run delivered only the v3 goals; no `lib/showcase/registry.ts`, no `scripts/showcase-route-audit.mjs`, no showcase rebuild, and the showcase-only mockups (`/admin/dashboard`, `/health/lab-upload`, `/showcase/line-preview`) do not exist. "Goal marked complete" is accurate for V3-0..V3-2 only. → Launch a separate run for `docs/miracare-showcase-frontend-plan.md` (kickoff prompt in its Appendix A).

**F1 (functional follow-up — decided but unimplemented).** Decision §11.3 (buyer_age → `user_facts` key `age`, source `user_form`, consent-gated) is not implemented. Root cause: the DECIDED docs were not in the repo during the run (now committed). Small change in `order_form_submit` (+ idempotent supersede via existing facts helpers). 

**F2 (functional follow-up — LINE dead-end).** No LINE handling for `selecting_branch`: a multi-branch product selected via LINE postback creates a `selecting_branch` order the LINE user cannot advance (no `select_branch:` postback exists; that is V3-4 scope). Impact today: zero (LINE not live, credentials pending). Required before any LINE launch — either ship the V3-4 Flex branch picker, or interim: auto-assign the first active branch when `channel==='line'`.

**N1 (note).** `callOrderFieldExtractor` (LINE conversational collection) does not extract `buyer_age`, so LINE orders can stall at `collecting_info` missing age — fold into V3-4 with F2.

**N2 (note).** "Stripe behind tenant feature flag" is implemented as hardcoded-off (no `tenants.feature_flags` read). Acceptable for v3; implement the flag only when a tenant actually wants Stripe.

**N3 (note).** Windows deploys must use a UTF-8 console (`chcp 65001` + OutputEncoding) — a default-PowerShell deploy mojibakes non-ASCII in files containing emoji (hit chat-orchestrator on 2026-06-12; all 10 functions since redeployed clean and verified). Recorded in owner memory; consider adding a deploy preflight check to `scripts/deploy-v2-functions.ps1`.

## E. State at audit time

- Platform prompt default: **Version 2** (correct — V3-3 pending, owner action).
- Staging project `xwixdxmemwcuoamcloty`: schema current, all functions deployed from merged code, `MIRA_PROMPT_VERSION=3` pinned.
- Next steps: (1) owner runs V3-3 flip per plan §2.4; (2) F1 small PR; (3) showcase run (F0); (4) V3-4 LINE (F2+N1) when credentials exist.
