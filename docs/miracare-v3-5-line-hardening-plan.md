# MiraCare V3-5 Plan — LINE flow hardening (category cards + order de-dup)

Audience: Codex / product owner (audit). Status: **APPROVED by owner 2026-06-13** (owner directed implementation after live testing exposed the gaps). Implemented by **Claude** on branch `claude/v3-5-line-hardening`; independent review recommended before/at merge (touches the `orchestrate.ts` purchase path — see §3).

Companion: `AGENTS.md` (binding), `docs/miracare-v3-4-line-commerce-plan.md` (predecessor — LINE branch picker + age, merged in PR #14).

## 0. Why

Live sandbox testing of the LINE OA (after V3-4) exposed two real gaps that made the channel unusable in practice:

- **G2 — category cards never render on LINE.** `toLineMessages` only rendered `response.products` + order. When Mira routes a browse request to categories (emits `[[categories]]`), the orchestrator returns a `category_grid` in `response.cards`, which the LINE webhook dropped → the customer saw text ("กดดูหมวดด้านล่าง") with no buttons.
- **G3 — duplicate orders.** A slow webhook + LINE "Webhook redelivery" retried the same postback, each creating a new order (one real session accumulated **118** stuck `collecting_info` orders). Every active pre-payment order then suppresses browse cards (by design), locking the user out.

## 0.1 Out of scope
- `transition_order` / order statuses / marker protocol / `callMiraPrompt`: untouched.
- product_grid rendering on LINE: already covered — `response.products` is populated for both the `[[products]]` marker and the `browse_category` action, so the existing product carousel handles it; rendering the `product_grid` card too would duplicate it.
- A LINE "cancel/restart" affordance (G4): deferred (future).

## 0.2 Protected-core touch authorized by this plan
| File (AGENTS.md §2) | Change | 
|---|---|
| `_shared/orchestrate.ts` — `select_product` handler | Add a **LINE-only** de-dup guard: if an active pre-payment order for the same product already exists in the session, reuse it instead of inserting a duplicate. No `transition_order` call, no status write, no change to the card-suppression guard. |

## 1. Changes

### G2 — category rendering (`_shared/line.ts`, `line-webhook`)
- `categoryLineFlexMessage(categories)` — Flex carousel; each bubble = icon + `label_th` + `{product_count} แพ็กเกจ` + a `browse_category:<key>` postback button.
- `linePostbackToAction` parses `browse_category:<key>` → `{ type:'browse_category', category }` (existing action; no schema change).
- `toLineMessages` renders any `category_grid` card in `response.cards`.

### G3 — order de-dup / idempotency
- `line-webhook` skips redelivered events (`event.deliveryContext.isRedelivery`) — stops the retry storm at the source.
- `orchestrate.ts` `select_product` (LINE only) reuses an existing active same-product order instead of creating a duplicate (belt-and-suspenders for genuine double-taps).
- Operational: owner should also turn **OFF "Webhook redelivery"** in the LINE console.

## 2. Tests & gates
- `npm run v2:verify` green — **116 Deno tests** + all deterministic gates.
- New `line_test.ts` cases: `browse_category` postback parse, `categoryLineFlexMessage` carousel, null-when-empty.
- The webhook redelivery-skip and the orchestrate de-dup are not unit-covered (no existing handler/orchestrate harness); covered by `deno-check` typecheck + the manual sandbox walkthrough.

## 3. Audit notes
- **P0:** `orchestrate.ts` diff adds only the LINE-scoped reuse guard in `select_product`; no `transition_order` / status / suppression-guard change.
- **P1:** conversation purity — new postback messages are templated constants, not assistant sales lines.
- **P2:** category Flex matches the product Flex colors; Thai copy; ≤5 LINE messages/turn preserved.

## 4. DoD
- [x] ✅ 2026-06-13 — G2 category Flex + `browse_category` postback + `toLineMessages` card rendering.
- [x] ✅ 2026-06-13 — G3 redelivery skip + LINE `select_product` de-dup.
- [x] ✅ 2026-06-13 — `v2:verify` green (116 tests); deployed to staging `xwixdxmemwcuoamcloty`.
- [ ] ❌ Live sandbox re-test on the demo-hospital OA (owner phone) — browse via categories works, no duplicate orders, booking completes.
