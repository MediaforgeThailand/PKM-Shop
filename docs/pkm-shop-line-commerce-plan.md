# PKM-Shop — LINE AI Commerce & Operations Platform (build plan)

> Source spec: `Ready.md` (root). This document is the **task truth** for the PKM-Shop
> build and supersedes the MiraCare plan docs for anything under this vertical.
> Business rules are owned by `Ready.md`; when this doc and `Ready.md` disagree on a
> business rule, `Ready.md` wins and this doc is corrected. Do **not** invent new
> business rules — if `Ready.md` does not cover a case, stop and ask the owner.

## 0. Owner decisions (locked 2026-07-13)

The repo/Supabase here is a **clone**; the original MiraCare lives in a separate
account/project and is untouched. The owner authorized a **full pivot** of this clone:

| # | Decision | Choice |
|---|---|---|
| D1 | Frontend | **New Vite + React 18 + TS + Tailwind + React Router + light PWA** web app for the 5 staff roles. Customers use **LINE only**. |
| D2 | Backend / data | This cloned Supabase project **is** PKM-Shop. Build fresh; **delete MiraCare-specific parts** that don't serve PKM. No shared data with MiraCare. |
| D3 | Order lifecycle / domain | **Full pivot**: replace the health appointment state machine with the fulfilment lifecycle. Remove health tables/functions/audits that don't apply. |
| D4 | AI provider | ~~Keep OpenAI~~ → **Anthropic Messages API** per Ready.md §2 (owner directive 2026-07-14: follow Ready.md; details delegated). `_shared/ai.ts::callSalesModel`, default `claude-sonnet-4-6`, model editable via `app_settings.ai_model` / env `AI_MODEL`. The interim Gemini switch (2026-07-14 morning) is reverted. |
| D5 | SlipOK + LINE OA | **Access not yet obtained.** Build the structure (columns, `system` actor, edge-function skeletons, env keys) **stubbed**; wire live when keys arrive. Payment stays **staff-confirmed** until SlipOK auto-verify is switched on. |

## 1. Strategy — reuse the engine, replace the domain

**Reuse as-is / light-adapt (the crown jewels):**
- AI chat engine: `_shared/ai.ts::callSalesModel` (Anthropic Messages API — see D4; fixed
  store-rules system prompt, customer data isolated in user content, retry),
  `_shared/marker.ts` (marker → cards, incl. `[[handoff]]`), `_shared/pkmOrchestrate.ts`
  turn pipeline (dedup, rate-limit, context assembly, human handoff), `_shared/pkmContext.ts`
  (`buildRecentChat`, `buildCatalogJson`).
- LINE transport: `_shared/line.ts` (verify signature, push/reply, Flex builders, per-tenant
  token/secret, postback encode/decode), `line-webhook` shell + `line_webhook_events` dedup.
- Money rail: `_shared/promptpay.ts` (EMVCo QR), slip upload + private bucket + signed URLs
  (`_shared/storage.ts`).
- Platform: `tenants` / `customers` (has `line_user_id`) / `tenant_members`, RLS helpers
  (`tenant_role`, `is_tenant_member`, `is_tenant_admin`, `is_tenant_admin_slug`),
  additive+idempotent migration conventions, transactional **RPC + append-only event log**
  pattern (`transition_order` mechanism), `_shared/db.ts` service-role helpers,
  `lib/api/client.ts` + `lib/types/api.ts`.
- Clone toolkit (`scripts/clone-supabase-project.sh`, `docs/pkm-shop-clone-runbook.md`).

**Extend (keep the table, add columns/roles):**
- `products`: + `stock_qty`, `reserved_qty`, `weight_g`, `packer_commission_rate`, `sku`, drop
  health-only fields from PKM use (`requires_appointment`, `branch_info`).
- `tenant_members.role`: add PKM roles → `admin | stock | packer | rider | staff`
  (a user may hold several; see D-schema). Keep `superadmin` for platform ops.
- `product` categories → new `categories` table (team CRUD).

**Delete (MiraCare health-specific, not used by PKM) — reviewable dedicated commit:**
- Edge functions: `lab-ingest`, `lab-confirm`, `wearable-ingest`, `rag-embed`,
  `openai-transcribe`, `pdpa-export`, `pdpa-delete`, `stripe-checkout`, `stripe-webhook`,
  `stripe-promptpay-qr`, `admin-stripe-product-sync`, `referral-bind`,
  `referral-self-provision`, `referrer-order`.
- `_shared`: `lab.ts`, `labFacts.ts`, `wearable.ts`, `facts.ts`, `pdpa.ts`, `stripe.ts`,
  `commissions.ts`, `referrals.ts`, `referralBind.ts`, `referralSelfProvision.ts`,
  `referrerOrder.ts`, `branches.ts`.
- Tables/migrations (health): `lab_reports`, `lab_results`, `wearable_metrics`, `user_facts`,
  `fact_keys`, `consents`, `branches`, `product_branches`, `referrers`, `commission_entries`,
  `rag_*`, `hospital_product*`, `prompt_versions` (health), and Stripe columns on orders.
- App (RN) UI is discarded wholesale (replaced by the Vite app); `website/` marketing landing
  is **kept** (it is already PKM-Shop's landing).
- Gates: remove/replace health audits (`v2:health-safety-audit`, `pdpa-coverage-audit`,
  `chat:regression` health cases) — see §6.

**Build new (Ready.md systems — greenfield):**
Shipping address capture · fare engine (4 delivery types) · multi-item cart (`order_items`) ·
stock reservation ledger · fulfilment state machine (`pending→paid→confirmed→packing→packed→
out_for_delivery→delivering→delivered/returned`) · `delivery_rounds` (hourly 24/7, cutoff :30,
Asia/Bangkok) · rider multi-stop + POD/return · packing station · SlipOK verify (stub) ·
central `notify` function + `notifications` table + staff LINE addressing · payroll
(rider/round + packer/piece) + payout confirm · HR check-in + shifts + geofence · team chat ·
analytics · `app_settings` (all rates/radii/times — **never hardcode**).

## 2. Data model (new + extended tables)

All tables: `tenant_id` + RLS in the **same** migration; `created_at`/`updated_at`; money as
integer THB; timestamps `timestamptz`; all rounds/cron in **Asia/Bangkok**.

Enums: `order_status` (pending→paid→confirmed→packing→packed→out_for_delivery→delivering→
delivered | returned | awaiting_redelivery_fee | cancelled) · `delivery_type`
(rider | express_grab | lalamove | parcel_kerry) · `payment_status`
(unpaid | pending_verify | paid | rejected) · `round_status`
(open→locked→confirmed→in_progress→done) · `pkm_role` (admin | stock | packer | rider | staff).

Tables (see `Ready.md` §5 for the authoritative column list): `app_settings`, `categories`,
`products` (extended), `stock_movements`, `orders` (new fulfilment shape), `order_items`,
`payments` (+ `slipok_trans_ref` unique, `slipok_raw`, `auto_verified`), `delivery_rounds`,
`order_events` (single source of truth), `returns`, `shifts`, `attendance`,
`payroll_periods`/`payroll_items`/`payroll_payouts`, `notifications`,
`chat_channels`/`chat_messages` (team chat), `line_conversations`. Reuse `tenants`,
`customers`, `chat_sessions`, `chat_messages` (customer AI chat), `line_webhook_events`.

Storage buckets (private + signed URL): `stock-in`, `packing`, `pod`, `checkin`, `team-chat`,
`payment-slips` (exists), `payout-slips`. Public: `product-images` (exists).

State changes go **only** through RPCs (service role) that write `order_events` /
`round_events` in the same transaction. Never `update orders set status` directly.

## 3. Edge functions

`line-webhook` (adapt) · `ai-sales-agent` (= adapted `chat-orchestrator`/`orchestrate.ts`) ·
`notify` (new, single fan-out) · `round-lock` (cron :30) · `fare-calc` · `slip-verify` (stub
per Ready.md §7.1) · `payroll-cutoff` (cron Sun 24:00 TZ) · plus admin action RPCs.

## 4. Web app (Vite)

`/src` routes `/admin /stock /packer /rider /staff` (mobile-first for rider/packer),
Tailwind, React Router, TanStack Query, `vite-plugin-pwa` (manifest+icons, **no** offline
cache). Auth = Supabase email/password (staff). Reuse `lib/api/client.ts` + `lib/types/api.ts`
(ported to `import.meta.env`). All state changes via RPC/edge function.

## 5. Week-by-week (DoD tracker)

Legend: ☐ todo · ⏳ in progress · ✅ done (with date).

> **Status 2026-07-14 (v1.1):** backend + web rebuilt/hardened and DEPLOYED to the dev
> project `mrygwthvyzrkxghgjimh`; all gates green (`npm run verify`: web tsc + build, deno
> check on 14 functions, 31 unit tests) and an end-to-end DB smoke passed on the live dev DB
> (goods → round → pack → deliver → return → **redelivery child order** → payroll item;
> manual-queue confirm/reject; wrong-amount + duplicate-slip rejection).
> - AI seller = Anthropic Messages API (D4). Handoff (keyword + `[[handoff]]`) → admin chat
>   console → close case, end-to-end.
> - 18 migrations incl. v1.1 hardening, pg_cron schedules, MiraCare residue cleanup.
> - Web: professional UX pass on every page — stock-in stepper+photo flow, slip queue
>   confirm/reject + reasons + zoom, rider stats, kerry board + external refs, admin
>   customer-chat console, analytics, shifts CRUD, realtime team chat.
>
> **Known remaining (trackable, non-blocking):** PWA icon PNGs · Grab/Lalamove customer
> deeplink buttons in LINE (refs are recordable by admin already) · delete 2 empty legacy
> buckets from the dashboard (SQL deletion is blocked by Supabase).
>
> **To go live (owner):** set secrets (ANTHROPIC_API_KEY + AI_MODEL, and — when obtained —
> LINE_CHANNEL_*, SLIPOK_*) · create the 2 Vault secrets so cron ticks also notify (see
> README) · seed real catalog + store lat/lng + `store_receiver_account` · create the first
> admin profile · point the LINE webhook at `line-webhook?tenant=pkm-shop` ·
> `cd web && npm i && npm run build` + host.

### Backend edge functions — done (2026-07-13, `deno check` + tests green)
- ✅ `chat-orchestrator` (AI sales agent, app entry) + `line-webhook` (LINE: text/postback/location/image→slip, QR)
- ✅ `notify` (LINE fan-out) · `fare-calc` · `slip-verify` (SlipOK stub) · `round-lock` cron · `payroll-cutoff` cron
- ✅ `stock-action` · `packer-action` · `rider-action` · `admin-action` · `checkin`
- ✅ Shared: openai(callMiraPrompt/PKM_PROMPT_ID) · settings · slipok · notify+templates · fare · rounds · pkmAuth · pkmContext · pkmOrders · pkmLine · pkmOrchestrate

### DB schema — 8 migrations written (2026-07-13) *(files only; not yet applied to a live project)*
- ✅ `20260712990000_pkm_phase0_cleanup` — drop all MiraCare health objects (cleanup-first, so PKM tables create with no collisions)
- ✅ `20260713000000_pkm_phase1_foundations` — enums · `profiles` (5 roles + `link_code`) · PKM RLS helpers · `app_settings` (+defaults) · `categories` · `products` +stock/weight/commission · `stock_movements` + `pkm_apply_stock_movement` · `stock-in` bucket
- ✅ `20260713010000_pkm_phase2_orders` — `orders` (fulfilment) · `order_items` · `order_events` · `pkm_transition_order` (allow-matrix + reserve/consume/release stock) · `order_no` generator
- ✅ `20260713020000_pkm_phase3_rounds` — `delivery_rounds` · `round_events` · `returns` · cutoff math (`pkm_compute_round_at`, :30 TZ Bangkok) · `pkm_assign_order_to_round` · `pkm_transition_round` · `pkm_lock_due_rounds`
- ✅ `20260713030000_pkm_phase4_payments` — `payments` (+SlipOK cols, dup-slip guard) · `pkm_record_pending_payment` · `pkm_confirm_payment` (single server-side paid→เข้ารอบ path)
- ✅ `20260713040000_pkm_phase5_notify_teamchat` — `notifications` outbox · `team_channels`/`team_messages` · realtime
- ✅ `20260713050000_pkm_phase6_payroll_hr` — payroll periods/items/payouts (rider-round + packer-piece, idempotent) · `pkm_close_payroll_period` · `shifts`/`attendance`

### Week 1 — Foundation & Catalog — ✅ done 2026-07-13/14
- ✅ Plan doc + rules updated for PKM (this doc, AGENTS.md, CLAUDE.md) — 2026-07-13
- ✅ Foundation + catalog + stock schema (phase0–1) — 2026-07-13
- ✅ Shared libs (settings/notify/templates) + staff LINE link-code binding — 2026-07-13
- ✅ Vite app: auth + 5-role routing + PWA + Settings UI + catalog/stock CRUD (+stock-in photo, stepper UX) — 2026-07-14
- ✅ MiraCare code removed; gates rebuilt (`npm run verify` at root) — 2026-07-14

### Week 2 — Orders, Rounds & Packing — ✅ done 2026-07-14
- ✅ `fare-calc` + `_shared/fare.ts` (4 types, from `app_settings`) + cutoff/fare tests
- ✅ `round-lock` cron (pg_cron :30 + catch-up + notify sweep)
- ✅ `slip-verify` (SlipOK live-shaped, stubbed w/o keys) + manual queue w/ confirm+REJECT + reasons
- ✅ Packing station UI (items checklist + photo) → notify customer · admin order board

### Week 3 — Rider & Delivery — ✅ done 2026-07-14
- ✅ Rider mobile UI: claim round → pre-planned multi-stop → POD/return+reason → **redelivery child order** (paid fee → parent_order_id → next round) — E2E verified on the dev DB
- ✅ Express Grab / Lalamove external refs (admin records the ref no.) + daily Kerry round board

### Week 4 — AI + Ops + close — ✅ done 2026-07-14
- ✅ AI sales agent on Anthropic (D4) + handoff → admin chat console (send as admin, close case)
- ✅ `payroll-cutoff` cron (pg_cron Mon 00:00 BKK) + payout UI (confirm + slip) + rider stats + per-staff LINE totals
- ✅ Check-in (photo+GPS required) + geofence + shifts CRUD · realtime team chat · analytics (สถิติคร่าวๆ §3.9)
- ⏳ UAT with real LINE OA + SlipOK keys — blocked on owner obtaining API access (D5)

## 6. Gates (real, run them)

Root `package.json`: `npm run verify` = `web:typecheck` (tsc strict) + `functions:check`
(deno check on all 14 edge functions) + `functions:test` (31 Deno unit tests incl. cutoff
edges 12:29/12:30/12:31 + cross-midnight and PromptPay payloads). `npm run e2e:smoke`
(scripts/e2e-smoke.mjs, needs a dev project's service key) exercises the money/fulfilment
spine end-to-end. Never weaken an assertion to make a build pass.

## 7. Deferred / needs owner (do not guess)

- **SlipOK API key + branch id** → `slip-verify` live auto-verify (§7.1). Until then: manual queue.
- **LINE OA channel secret + access token** → live push/webhook. Until then: `notify` logs to
  `notifications` as `skipped`.
- **ANTHROPIC_API_KEY** → the AI seller answers free-text turns; deterministic buttons work without it.
- Vault secrets `pkm_service_role_key` + `pkm_functions_base_url` → cron ticks also send LINE
  notifications (state changes work without them).
- Real fare/commission/zone values → edit in Settings UI (`app_settings`), seeded with §3.3 defaults.

## 8. Env (see `.env.example`)

`ANTHROPIC_API_KEY`, `AI_MODEL` (default claude-sonnet-4-6), `SLIPOK_API_KEY`,
`SLIPOK_BRANCH_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`,
`PKM_DEFAULT_TENANT_SLUG`, Supabase URL/keys. Client web env via `VITE_*`.
