# MiraCare V3-4 Plan — LINE purchase flow parity (closes F2 + N1)

Audience: Codex (implementation agent) + product owner (audit).
Status: **APPROVED by owner 2026-06-13** (owner directed "do it all" with the §5 recommendations accepted). This document is the `AGENTS.md` §2 owner-approved authorization for the *specific* protected-core touch listed in §0.2 (the `callOrderFieldExtractor` extractor only — NOT `callMiraPrompt`).
**Implementation note / workflow deviation:** L1 + L2 were implemented by **Claude** in branch `claude/hopeful-saha-ca9b65` at the owner's explicit direction, instead of by Codex. An independent review (owner audit or `/code-review`) before merge to `main` is recommended, given the protected-core (`openai.ts`) touch.

Companion documents:
- `AGENTS.md` — hard rules. Applies in full.
- `docs/miracare-codex-handoff.md` — model contract (PRIME DIRECTIVE). **Nothing in this plan changes the Mira conversation contract** (`callMiraPrompt`, prompt id, variables, `store:false`, model/tools all untouched).
- `docs/v3-audit-report-2026-06-12.md` — findings **F2** (LINE `selecting_branch` dead-end) and **N1** (`callOrderFieldExtractor` no age) are the items this plan closes.
- `docs/miracare-v3-followups-plan.md` — the prior run that parked LINE ("NO LINE … until credentials exist"). R1 there solved the *same two problems* (branch resolution + `buyer_age`) for the **referrer-order** path; V3-4 is the LINE twin and reuses its decisions.
- `docs/line-setup.md` — the sandbox setup + 5-step manual checklist (now satisfied: webhook live on `xwixdxmemwcuoamcloty`, tenant `demo-hospital`, Verify = Success).

Workflow: same as v2/v3 — Codex implements phase by phase (one PR per phase, branch `codex/<phase-id>-<slug>`), keeps the DoD checkboxes in THIS file updated (✅/❌ + date) in the same PR, owner audits against §6.

---

## 0. What the owner wants (read first)

LINE credentials now exist, so the parked LINE epic (V3-4 / F2 + N1) is unblocked. Today on LINE: greeting + product Flex carousel work end-to-end through the **same** `orchestrate` brain as the app. The gap is the **middle of the purchase funnel**: after a customer taps "จอง", the order enters `selecting_branch` and the LINE user has no way forward (no branch buttons), and even past that, conversational info collection cannot complete because age is never captured. This plan gives LINE native equivalents for the two app-only steps, so a customer can complete a booking entirely inside LINE.

Guiding principle: **reuse, don't fork.** Branch selection uses the EXISTING `select_branch` action; age uses the EXISTING `collecting_info` conversational path. No new order statuses, no `transition_order` change, no marker change, no prompt change.

### 0.1 Explicitly OUT of scope

- **Order state machine / `transition_order`**: untouched. Statuses unchanged.
- **`callMiraPrompt` / prompt content / platform default**: untouched, owner-only.
- **Marker protocol, card-suppression guard, promptpay/commissions math**: untouched.
- **Slip-image upload on LINE**: NOT built. LINE payment confirmation stays the existing `payment_done:` postback ("ลูกค้าจ่ายแล้ว") + staff confirmation. (Slip upload is an app/PWA affordance; LINE uses the postback. Document, don't build.)
- **Admin-confirm LINE push**: already wired (`admin-order-action/index.ts:151` → `pushLineMessages`). Verify in the sandbox checklist; do not rebuild.
- **Rich menu / LIFF / multi-tenant LINE onboarding UI**: future, not this run.

### 0.2 Protected-core touch authorized by this plan (and ONLY this)

| File / area (AGENTS.md §2 row) | Authorized change | Phase |
|---|---|---|
| `_shared/openai.ts` — **`callOrderFieldExtractor` ONLY** (this is the structured order-field extractor, a *separate* function from the protected `callMiraPrompt`) | Add `buyer_age` to the extractor's structured-output schema + system instruction + the returned/merged mapping. `callMiraPrompt`, the prompt id, its variables, `store:false`, and the model/tools are **not** touched and must not appear in the diff. | L2 |

Everything else in §2 of `AGENTS.md` is NOT touched. In particular the `select_branch` action and the `selecting_branch → collecting_info → awaiting_payment` transitions **already exist** — L1/L2 add only the LINE *rendering* and *parsing* around them.

---

## 1. Current state (verified in repo 2026-06-13 — do not re-derive)

### 1.1 Working on LINE today
| Capability | Where |
|---|---|
| Webhook, signature verify, per-tenant secrets, tenant routing | `line-webhook/index.ts`, `_shared/line.ts`; live on `xwixdxmemwcuoamcloty` / `demo-hospital` |
| Greeting (`follow` + text) via `orchestrateLine` | `_shared/orchestrate.ts:1204` |
| Product Flex carousel + `select_product:` postback | `_shared/line.ts:199`, `:173` |
| PromptPay QR image + payment Flex + `payment_done:` postback | `line-webhook/index.ts:60`, `_shared/line.ts:270`,`:183` |
| Conversational info collection for `collecting_info` (name/phone/date) | `_shared/orchestrate.ts:1128` → `updateCollectingOrderFromMessage:972` |
| LINE push on admin confirm/book | `admin-order-action/index.ts:151` |

### 1.2 The two gaps (F2 + N1)

**F2 — branch dead-end.** `linePostbackToAction` (`_shared/line.ts:165`) maps only `select_product:` and `payment_done:`; there is no `select_branch:` and no branch Flex renderer. `toLineMessages` (`line-webhook/index.ts:79`) renders text + products + (QR only when `order.qr_payload` exists). So an order in `selecting_branch` reaches LINE as **text only** — the customer is told "เลือกสาขา" with nothing to tap, and re-tapping "จอง" spawns duplicate orders. `orderPanelFor` (`orchestrate.ts:258`) already populates `order.branches` for `selecting_branch`, so the data the renderer needs is already in the response.

**N1 — age never captured on LINE.** `callOrderFieldExtractor` (`_shared/openai.ts:245`) extracts `buyer_name`/`buyer_phone`/`preferred_date` only. `transition_order` requires `buyer_age` to leave `collecting_info` (the same DB constraint R1 hit). So even after branch selection, a LINE order stalls in `collecting_info` forever. `updateOrderFields` already accepts `buyer_age` (used by the app's `order_form_submit`, `orchestrate.ts:427`), so only the extractor + the early-return guard need to change.

---

## 2. Phase L1 — LINE branch picker (closes F2)  **[DO FIRST]**

### 2.1 Backend — `_shared/line.ts`
1. New `branchSelectionLineFlexMessage(order)`: a Flex **carousel** of branch bubbles, mirroring `productLineFlexMessage` styling/colors. Each bubble shows branch name (bold) + address/district (`#4E5F59`) and a primary button "เลือกสาขานี้" with `type:'postback'`, `data: 'select_branch:' + order.id + ':' + branch.id`. Use the fields available on `OrderPanelBranch` (id, name, address/district) — same data the customer `BranchPicker` shows. Cap at 10 bubbles.
2. Extend `linePostbackToAction` to parse `select_branch:<order_id>:<branch_id>` → `{ type:'select_branch', order_id, branch_id }` (split on `:`, take element [1] and [2]; ignore extra). Message label: a templated notice such as `เลือกสาขานี้` (system notice, not a sales line — keep it in the existing constant style, conversation-purity rule).

### 2.2 Backend — `line-webhook/index.ts`
3. In `toLineMessages`, branch on `response.order?.step`:
   - `step === 'branch'` and `order.branches?.length` → push `branchSelectionLineFlexMessage(order)`.
   - `step === 'qr'` → existing QR image + payment Flex (`orderLineMessages`).
   Keep the existing text message first, keep the `.slice(0, 5)` cap. (Single-branch products skip `selecting_branch` already — no picker needed there; the order goes straight to `collecting_info`.)

### 2.3 No schema / state change
The `select_branch` action already exists in the orchestrator and already validates branch ownership + advances `selecting_branch → collecting_info` (`orchestrate.ts:367`). L1 adds rendering + postback parsing ONLY. No `ChatAction` schema change, no `transition_order` touch, no `lib/types/api.ts` change.

### 2.4 Tests & gates — `_shared/__tests__/line_test.ts`
- `linePostbackToAction('select_branch:<oid>:<bid>')` → `select_branch` action with the right ids; malformed (`select_branch:` only) → safe fallback (no crash).
- `branchSelectionLineFlexMessage` payload: carousel; each button `data` equals `select_branch:<oid>:<bid>`; address rendered; ≤10 bubbles.
- `toLineMessages` pushes the branch Flex for a `step:'branch'` order with branches and does NOT for `step:'qr'`/`'form'`/`'tracking'`; ≤5 messages preserved.
- `npm run typecheck`, `npm run v2:verify`, `npm run v2:deno-check`, `npm run v2:edge-security-audit` green.

### 2.5 DoD — L1
- [x] ✅ 2026-06-13 — `select_branch:<order_id>:<branch_id>` parsed in `linePostbackToAction`; `branchSelectionLineFlexMessage` renders an `order.branches` carousel; `toLineMessages` pushes it for `step==='branch'` only. Uses the existing `select_branch` action — no `ChatAction`/`transition_order`/marker change in the diff.
- [x] ✅ 2026-06-13 — 3 new `line_test.ts` cases green (branch postback parse, branch Flex carousel, null-when-empty); `npm run v2:verify` green (111 Deno tests + all deterministic gates incl. deno-check + edge-security-audit).

---

## 3. Phase L2 — buyer_age on LINE (closes N1)

### 3.1 Backend — `_shared/openai.ts` `callOrderFieldExtractor` (authorized by §0.2)
1. Add `buyer_age` to the structured-output schema: integer, **nullable**, bounds 1–120 (identical bounds to the `order_form_submit` zod `buyer_age` and the DB check constraint — do not invent new bounds).
2. System instruction: extract age ONLY when explicitly stated (e.g. `อายุ 35`, `35 ปี`); never infer; `null` otherwise. (Same "do not infer" discipline already in the instruction.)
3. In the returned mapping, surface `buyer_age` only when it parses to an int within bounds; else `undefined`.
4. `callMiraPrompt` and prompt-contract lines must NOT appear in the diff (audit P0).

### 3.2 Backend — `_shared/orchestrate.ts` `updateCollectingOrderFromMessage` (line 972–990)
5. Include `buyer_age` in the early-return guard so an **age-only** message still updates: change the `if (!extracted.buyer_name && !extracted.buyer_phone && !extracted.preferred_date)` to also consider `extracted.buyer_age`.
6. Pass `buyer_age` through to `updateOrderFields` (it already accepts it). `maybeAdvanceCollectingOrder` then auto-advances to `awaiting_payment` once all of name/phone/age (+ any other required field) are present — unchanged.
7. **F1 consistency (consent-gated age fact):** when `buyer_age` is captured here, call `recordFormAgeFact` (from R2, `_shared/facts.ts`) wrapped in `try/catch` (`console.warn('form_age_fact_failed', …)`, never fail the turn). The helper already silently skips when there is no granted `health_data_collection` consent, so LINE customers without consent simply no-op. This mirrors the `order_form_submit` call site R2 already added.

### 3.3 Tests & gates
- `_shared/__tests__` (extractor unit, using the existing stubbing pattern): age extracted from `อายุ 40`; absent/out-of-range → `undefined`; name/phone/date behavior unchanged.
- Orchestrate/LINE flow test: a `collecting_info` order + a typed `"ชื่อ … เบอร์ 08… อายุ 35 พรุ่งนี้"` style message → fields filled, order advances to `awaiting_payment`; consent-present path writes a `user_facts` `key='age', source='user_form'` row, consent-absent path writes none.
- `npm run typecheck`, `npm run v2:verify` green.

### 3.4 DoD — L2
- [x] ✅ 2026-06-13 — `callOrderFieldExtractor` (`_shared/openai.ts`) extracts `buyer_age` (JSON-schema `integer|null`, mapped only when an int within 1–120); `callMiraPrompt` and the prompt contract are untouched in the diff. 3 new `openai_test.ts` cases green (in-bounds, out-of-range dropped, null→undefined).
- [x] ✅ 2026-06-13 — `updateCollectingOrderFromMessage` updates on an age-only message and calls `recordFormAgeFact` (consent-gated, non-fatal try/catch, `console.warn('form_age_fact_failed', …)`) before `maybeAdvanceCollectingOrder`. `v2:verify` green.
- [~] ⏳ 2026-06-13 — "LINE order reaches `awaiting_payment` after a conversational age" is covered by unit + flow logic; live proof folds into L3's sandbox run.

---

## 4. Phase L3 — End-to-end + manual sandbox proof (live, owner-credentialed)

1. **Scripted (optional, deterministic where possible):** a node/Deno script driving the `orchestrateLine` logic end-to-end against staging: `select_product` (multi-branch) → assert `selecting_branch` + branches present → `select_branch` → assert `collecting_info` → typed `name+phone+age+date` → assert `awaiting_payment` + QR payload → `payment_done` → `submitted` → admin confirm via `admin-order-action` → assert one commission entry + a LINE push attempt. Reuse the seeding/cleanup of `scripts/e2e-commerce.mjs`. Live legs need owner secrets — mark blocked-without-credentials, same convention as R2/R4/R5 DoD.
2. **Manual sandbox checklist** (`docs/line-setup.md` §"Manual Sandbox Checklist", all 5 steps) on the real `demo-hospital` LINE OA. Record evidence (screenshots / run notes) in the PR. This is the acceptance proof that the funnel completes inside LINE.

### 4.1 DoD — L3
- [~] ⏳ 2026-06-13 — Deterministic coverage green (branch picker + extractor unit tests); the scripted live LINE commerce leg is not yet added — owner-credentialed, same convention as the R2/R4/R5 pending legs.
- [ ] ❌ All 5 manual sandbox steps on the live `demo-hospital` OA — **owner action** (requires the LINE app on a phone). Code deployed to staging `xwixdxmemwcuoamcloty`; awaiting the owner's live walkthrough + evidence.

---

## 5. Open questions for the OWNER — RESOLVED 2026-06-13

**DECIDED by owner 2026-06-13** (via the "do it all" direction): (1) **Build the Flex branch picker** (not auto-assign) — done in L1. (2) **Defer the duplicate-order guard** — NOT built this run; it would touch the orchestrate purchase path beyond §0.2's authorization. Revisit as an opt-in L4 only if duplicates prove noisy in the sandbox. (3) **Consent on LINE is out of scope** for V3-4 — the L2 age fact write stays consent-gated and silently no-ops for consent-less LINE buyers. Do not re-ask.

Original discussion (for context):

1. **Branch picker vs. auto-assign.** Primary plan = Flex branch picker (L1). The v3 audit offered an interim "auto-assign the first active branch when `channel==='line'`". Recommendation: **build the picker** (customers should choose location, consistent with the app + R1's "collect, don't shortcut" stance). Confirm, or pick the interim.
2. **Double-tap on "จอง" creates duplicate `selecting_branch` orders.** `createOrderFromProduct` always inserts. On LINE this is more visible (no order panel). Options: (a) before creating, reuse/replace an existing pre-payment active order for the session; (b) leave as-is and rely on the customer cancelling extras. Option (a) touches the orchestrate purchase path → owner approval + a plan addendum required. Recommendation: address as a small **L4** only if the owner wants it; not a launch blocker. **Flagged, not decided.**
3. **Consent on LINE.** L2 step 7 writes the age fact only when consent exists. Is LINE expected to gather `health_data_collection` consent at some point (e.g. a consent Flex), or do LINE buyers stay consent-less (age fact silently skipped)? Affects whether R2's fact write ever fires on LINE. Recommendation: out of scope for V3-4; revisit with a LINE consent-Flex epic.

---

## 6. Audit additions (owner's audit loop for this plan)
- **P0 (L2):** `_shared/openai.ts` diff touches `callOrderFieldExtractor` ONLY; `callMiraPrompt`, prompt id, variables, `store:false`, model/tools do not appear.
- **P0 (L1):** no `ChatAction`/`transition_order`/marker change; branch postback validates branch ownership through the existing `select_branch` handler (cross-tenant / non-product branch id still rejected at `orchestrate.ts:379`).
- **P1:** an order-turn still succeeds when `recordFormAgeFact` is forced to fail (non-fatal try/catch); no consent → zero fact rows.
- **P1:** conversation purity — the new branch postback label + any text are templated system notices, not assistant sales lines.
- **P2:** branch Flex uses the same MiraDesign-equivalent colors as the product Flex; Thai copy; ≤5 LINE messages/turn preserved.

## 7. Phase → PR map & universal gates

| PR | Phase | Depends on |
|---|---|---|
| 1 | L1 LINE branch picker | — (do first) |
| 2 | L2 buyer_age extraction | — (parallel-safe with L1; both needed before L3) |
| 3 | L3 e2e + sandbox proof | L1 + L2 |
| (4) | L4 duplicate-order guard | OWNER opt-in (§5.2) |

Every PR: `npm run typecheck` + `npm run v2:verify` green, migrations additive only (none expected in V3-4), DoD boxes in THIS file updated truthfully in the same PR. When blocked or when two documents contradict: stop and report (AGENTS.md §3.8).

---

## Appendix A — kickoff prompt for the Codex run

> Read `AGENTS.md` first — it is binding. Then read `docs/miracare-v3-4-line-commerce-plan.md` end-to-end; it is the plan for this run and the ONLY authorization for the protected-core touch it lists in §0.2 (`callOrderFieldExtractor` age extraction — NOT `callMiraPrompt`). Work phases in the §7 PR order, one PR per phase, branch `codex/<phase-id>-<slug>`. Reuse the existing `select_branch` action and `collecting_info` path — do NOT add order statuses, do NOT touch `transition_order`, the marker protocol, the card-suppression guard, or prompt content. Do NOT build slip upload on LINE or rebuild the admin-confirm push (already wired). All §5 questions are OWNER decisions — if any is unanswered when you reach it, stop and report. Update the DoD checkboxes in this file truthfully in each PR. Stop and report per AGENTS.md §3.8 if any gate cannot be made green without violating a rule.
