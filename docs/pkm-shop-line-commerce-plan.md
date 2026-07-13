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
| D4 | AI provider | **Keep the existing OpenAI Responses-API chat engine** (not Anthropic). Swap the published prompt id via env; the owner publishes the goods-selling prompt. |
| D5 | SlipOK + LINE OA | **Access not yet obtained.** Build the structure (columns, `system` actor, edge-function skeletons, env keys) **stubbed**; wire live when keys arrive. Payment stays **staff-confirmed** until SlipOK auto-verify is switched on. |

## 1. Strategy — reuse the engine, replace the domain

**Reuse as-is / light-adapt (the crown jewels):**
- AI chat engine: `_shared/openai.ts::callMiraPrompt` (OpenAI Responses API, prompt-by-id,
  5 vars, `store:false`, retry), `_shared/marker.ts` (marker → cards), `_shared/orchestrate.ts`
  turn pipeline (dedup, rate-limit, context assembly, human-handover), `_shared/context.ts`
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

> **Status 2026-07-13:** BACKEND + WEB APP COMPLETE & VERIFIED.
> - Backend: 9 migrations + 12 edge functions (`deno check` clean), 31 deno tests pass,
>   delivery-math + PromptPay tested. Full schema, RPCs, ops layer, staff API, AI sales
>   agent + LINE loop, staff LINE binding. MiraCare removed.
> - Web app (`web/`): Vite + React 18 + Tailwind + Router + PWA — `tsc` clean, prod build OK.
>   Login + 5-role routing; admin order board / slip queue / catalog+stock / settings /
>   payroll; packer; rider multi-stop; staff check-in + team chat.
>
> **Known remaining (trackable, non-blocking):** analytics dashboard (Ready.md: first to
> cut) · shifts-CRUD admin UI (table + check-in exist) · Grab/Lalamove customer deeplinks &
> Kerry-round admin UI polish · multi-item cart recipient name/phone capture · PWA icon PNGs.
>
> **To go live (owner):** apply migrations + deploy the 12 functions to the PKM Supabase
> project (clone runbook) · set secrets (OPENAI_API_KEY, PKM_PROMPT_ID, SUPABASE_*, and —
> when obtained — LINE_CHANNEL_*, SLIPOK_*) · publish the goods-selling OpenAI prompt · run
> `supabase/seed.sql` + set store lat/lng + create the first admin profile · schedule
> `round-lock` (hourly :30) and `payroll-cutoff` (Mon 00:00) in Asia/Bangkok · point the LINE
> webhook at `line-webhook?tenant=pkm-shop` · `cd web && npm i && npm run build` + host.

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

### Week 1 — Foundation & Catalog
- ✅ Plan doc + rules updated for PKM (this doc, AGENTS.md, CLAUDE.md) — 2026-07-13
- ✅ Foundation + catalog + stock schema (phase0–1) — 2026-07-13
- ☐ Shared libs: `_shared/settings.ts`, adapt `context.ts`/`types.ts`; `notify` edge function + `_shared/notify.ts`; staff LINE link-code binding in `line-webhook`
- ☐ Vite app scaffold: auth + 5 role routing + PWA + Settings UI + catalog/stock CRUD (+stock-in photo)
- ☐ Delete MiraCare edge functions + `_shared` libs (code cleanup) + rebuild green gates

### Week 2 — Orders, Rounds & Packing
- ✅ Rounds + orders + payments **schema/RPCs** (phase2–4) — 2026-07-13
- ☐ `fare-calc` + `_shared/fare.ts` (4 types, from `app_settings`) + cutoff/fare tests
- ☐ `round-lock` cron edge function (`pkm_lock_due_rounds` → notify packer/rider)
- ☐ `slip-verify` edge function (SlipOK **stubbed** → `pkm_confirm_payment`) + admin manual-verify queue
- ☐ Packing station UI (~30 min/round) + photo → notify customer · admin order board

### Week 3 — Rider & Delivery
- ✅ Rider/return/multi-stop **schema/RPCs** (phase2–3) — 2026-07-13
- ☐ Rider mobile UI: claim round → multi-stop → POD/return+reason → redelivery (new order)
- ☐ Express Grab + Lalamove deeplink + daily Kerry round

### Week 4 — AI + Ops + close
- ✅ Payroll/HR **schema/RPCs** (phase6) — 2026-07-13
- ☐ `ai-sales-agent` (rewrite `orchestrate.ts`: goods prompt via env, address capture, fare quote, order create) + handoff
- ☐ `payroll-cutoff` cron + payout UI (confirm + slip) + rider stats
- ☐ Check-in + geofence + shifts CRUD · team chat · analytics · seed + hardening + UAT

Cut order if short on time (from the tail): analytics → team chat → check-in.
**Never cut AI or payroll.**

## 6. Gates

Replace the health-tuned `v2:verify` chain with PKM-appropriate checks: keep `typecheck`,
`orders:status-audit` (no direct status writes — retarget to the new RPC), `rls-check`,
`deno-check`/`deno-test`, `types:mirror-audit`. Add: round cutoff edge tests
(12:29/12:30/12:31, cross-midnight), fare-engine tests, RLS-per-role tests. Remove health
audits (`v2:health-safety-audit`, `v2:pdpa-coverage-audit`) and rewrite `chat:regression`
for the goods vertical. Never weaken an assertion to make a build pass.

## 7. Deferred / needs owner (do not guess)

- **SlipOK API key + branch id** → `slip-verify` live auto-verify (§7.1). Until then: staff-confirm.
- **LINE OA channel secret + access token** → live push/webhook. Until then: `notify` logs to
  `notifications` and no-ops the send (or uses a global test channel if provided).
- **Goods-selling OpenAI prompt id** → owner publishes; set `PKM_PROMPT_ID` env.
- Service radius / zone rules, exact fare rates, commission rates → seed into `app_settings`
  from owner-confirmed values (Ready.md §3.3 defaults used as placeholders, editable in UI).

## 8. Env (added to `.env.example`)

`SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`,
`ANTHROPIC_API_KEY` (unused unless D4 changes), `AI_MODEL`/`PKM_PROMPT_ID`, plus existing
`OPENAI_API_KEY`, Supabase URL/keys. Client web env via `VITE_*`.
