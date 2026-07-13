# PKM-Shop — Rules for ALL AI agents working in this repository

This file is LAW for every AI agent (Claude, Codex, Cursor, Copilot, any other tool) and every
human using one. Read it BEFORE writing any code. If a task conflicts with this file, the task
is wrong — stop and ask the owner.

Only the **owner** (taksin / MediaForge) may change this file, `Ready.md`, or any section marked
DECIDED in the plan documents.

> **Heritage.** This repo was cloned from the MiraCare health platform and **pivoted** (owner-
> authorized, 2026-07-13) to PKM-Shop, a LINE goods-delivery commerce + operations platform.
> The original MiraCare project is separate and untouched. MiraCare-specific health code
> (lab/wearable/PDPA-health/branches/referrals/RAG/Stripe) is being removed — do not build on it.

## 0. The one-paragraph context you must have

PKM-Shop is a Thai LINE Official Account commerce+operations platform. Customers buy through
**one AI in LINE OA** end-to-end: pick products → give address → fare is computed → pay by
PromptPay slip (verified by SlipOK) → track delivery until it arrives. Back office: stock,
packing, riders (hourly rounds, 24/7), payroll/commission, team chat, HR check-in, admin panel —
a single web app (mobile-first for rider/packer). **Every notification, customer- and staff-
side, goes through the one LINE OA.** The AI chat *engine* is reused from MiraCare; its selling
*behavior* is governed by an owner-published OpenAI prompt referenced by id. Most of the "core"
below protects two things: **the reused conversation contract** and **the integrity of money,
stock, and payroll data**.

## 1. Where the truth lives (read in this order)

1. `AGENTS.md` (this file) — hard rules.
2. `Ready.md` — the business rule set (delivery rounds, fares, payment, payroll, SlipOK §7.1).
   Business rules come from here; **never invent new ones** — if uncovered, stop and ask.
3. `docs/pkm-shop-line-commerce-plan.md` — the build plan, DoD tracker, keep/delete inventory.
4. `docs/pkm-shop-clone-runbook.md` — how PKM-Shop is stood up as its own Supabase project + repo.

If a task is not described by `Ready.md` or the plan, treat it as out-of-scope for the core:
build it WITHOUT touching §2, or stop and ask.

## 2. PROTECTED CORE — never change without an owner-approved plan section

| Area | Files | Rule |
|---|---|---|
| AI chat contract (reused) | `supabase/functions/_shared/openai.ts` (`callMiraPrompt`) | Prompt referenced by **id only** (env `PKM_PROMPT_ID` / `MIRACARE_PROMPT_ID`); variables exactly `brand_name`, `user_nickname`, `personal_context`, `recent_chat`, `product_catalog`; `store:false` always. Never inline prompt text, never add a system prompt on top, never change the model/tools in code. The selling prompt is owner-published; if it seems wrong, report — do not post-process model text. |
| Marker protocol | `supabase/functions/_shared/marker.ts` | `[[products: ≤4 ids]]`, `[[categories]]`, `[[order_status]]`, one marker max, final line, always stripped from visible text. New card type = new prompt version + owner approval + regression suite. |
| Order/round state machines | new fulfilment RPCs + `order_events` | A single sanctioned RPC per entity is the ONLY way to change `orders.status` / `delivery_rounds.status`. Never `update … set status` directly (code, scripts, admin). Every transition inserts an `order_events` (or round event) row in the **same transaction**. Status sets & transitions are fixed by `Ready.md` §5; changes = plan change + migration + tests. |
| Money & stock authority | `promptpay.ts`, `fare-calc`, `slip-verify`, `payments`, `stock_movements`, payroll tables | Payment is verified **server-side only** (edge function + service role); the client never declares "paid". SlipOK re-validates amount + receiver account + duplicate slip before an order becomes `paid` (`Ready.md` §7.1). Product prices and fares come only from `products`/`app_settings`, never from model output. Stock reserve/decrement/return only through the sanctioned movement path. Payroll amounts are frozen from `app_settings`/product rates at the event, never recomputed loosely. |
| Settings, not constants | `app_settings` | No hardcoded rates/fees/radii/round-times/commission anywhere. Read them from `app_settings`; expose them in the admin Settings UI. |
| Tenancy & RLS | all migrations, `_shared/db.ts` | Every business table carries `tenant_id` + RLS shipped in the **same** migration. Service-role keys live only inside edge functions. |
| Migrations | `supabase/migrations/*` | Additive only. NEVER edit or delete an already-applied migration file. New file, new timestamp, idempotent (`if not exists` / `drop policy if exists` + recreate). The one exception — removing MiraCare health migrations during the pivot — is an explicit, owner-authorized cleanup step, done in its own reviewable commit. |
| Conversation purity | `ai-sales-agent` reply path | The backend NEVER scripts conversational replies, intake questions, address prompts, or sales lines. Thai text in the reply path is allowed only as templated **system notices** in `templates.ts` and DB-derived context lines. Collecting the address is the (owner-owned) prompt's job. |
| Time & rounds | `round-lock`, `payroll-cutoff`, fare/round logic | All round math and cron run in **Asia/Bangkok**, 24/7. Cutoff is minute `:30`; payroll cutoff is Sunday 24:00 (Mon 00:00) TZ Bangkok. Edge cases (12:29/12:30/12:31, cross-midnight) must have tests. |

## 3. Standing engineering rules

1. **Scope discipline.** One PR per plan phase. No drive-by refactors of protected-core files.
2. **Gates stay green.** `npm run typecheck` and the PKM verify chain must pass on every PR.
   Never weaken/skip/delete an audit assertion to make a build pass — fix the cause or stop.
3. **Truthful bookkeeping.** Update DoD checkboxes (✅/❌ + date) in `docs/pkm-shop-line-commerce-plan.md`
   in the same PR. Never mark items done that need live verification you could not run.
4. **DECIDED is final.** Owner-decided sections answer their questions permanently.
5. **Live environment is owner territory.** Agents do not deploy edge functions, apply migrations
   to the linked project, change Supabase secrets, or touch CI secrets unless the task grants it.
   (Windows deploys need a UTF-8 console — `chcp 65001` + `[Console]::OutputEncoding=UTF8` — or Thai/emoji ship corrupted.)
6. **Thai-first UX.** Customer- and staff-facing strings are Thai; code/identifiers English.
   Rider/Packer screens are mobile-first, big tap targets.
7. **Compatibility.** `chat_messages`, the orchestrator response, and the action schema are
   consumed by the LINE webhook, the web app, and scripts. Shape changes must be additive
   (deprecate, don't repurpose), mirrored in `lib/types/api.ts` (CI enforces the mirror), tested.
8. **When blocked, stop.** If a rule here blocks your task, or two documents contradict, stop and
   report options to the owner. A wrong guess in the core costs more than a paused task.

## 4. Quick self-check before you open a PR

- [ ] Touched a §2 file? → Is the change described in a plan section? If not, revert it.
- [ ] Any Thai sentence in the reply path the model should have said? → Remove it.
- [ ] Any direct `orders.status` / `delivery_rounds.status` write? → Use the sanctioned RPC.
- [ ] Any hardcoded rate/fee/radius/time? → Move it to `app_settings`.
- [ ] New table/column without RLS or outside a new migration file? → Fix it.
- [ ] Round/payroll time logic without Asia/Bangkok + edge-case tests? → Add them.
- [ ] Verify chain green? DoD checkboxes updated truthfully?
