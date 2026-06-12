# MiraCare — Rules for ALL AI agents working in this repository

This file is LAW for every AI agent (Codex, Claude, Cursor, Copilot, or any other tool) and every human contributor using one. Read it BEFORE writing any code. If a task conflicts with this file, the task is wrong — stop and ask the owner.

Only the **owner** (taksin / MediaForge) may change this file, `docs/miracare-codex-handoff.md`, or any section marked DECIDED in the plan documents.

## 0. The one-paragraph context you must have

MiraCare is a white-label hospital health platform (Thai market): an AI sales/consult chat, in-chat commerce (PromptPay QR), an admin panel, a referral program, and a health dashboard, all on one multi-tenant Supabase backend. The AI conversation behavior is governed by a published OpenAI prompt that has been behavior-tested turn-by-turn. Most of the "core" below exists to protect two things: **the tested conversation contract** and **the integrity of money/health data**.

## 1. Where the truth lives (read in this order)

1. `AGENTS.md` (this file) — hard rules.
2. `docs/miracare-codex-handoff.md` — the AI model contract (PRIME DIRECTIVE).
3. The plan for your task: `docs/miracare-v3-chat-commerce-plan.md`, `docs/miracare-showcase-frontend-plan.md`, `docs/miracare-v2-product-plan.md`, `docs/codex-goals.md`.
4. `docs/v3-audit-report-2026-06-12.md` and other audit reports — known follow-ups; do not silently re-fix or contradict them.

If your task is not described by any plan document, treat it as out-of-scope for the core: build it WITHOUT touching anything in §2, or stop and ask.

## 2. PROTECTED CORE — never change without an owner-approved plan section

| Area | Files | Rule |
|---|---|---|
| Model contract | `supabase/functions/_shared/openai.ts` (`callMiraPrompt`) | Prompt referenced by ID only; variables exactly `brand_name`, `user_nickname`, `personal_context`, `recent_chat`, `product_catalog`; `store:false` always; version override ONLY via `MIRA_PROMPT_VERSION` env. Never inline prompt text, never add system prompts on top, never change the model/tools. |
| Prompt content | OpenAI Platform `pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021` | Owner-only. Agents NEVER edit prompt content or flip the default version. If the prompt seems wrong, report — do not work around it by post-processing model text. |
| Marker protocol | `supabase/functions/_shared/marker.ts` | `[[products: ≤4 ids]]`, `[[categories]]`, `[[order_status]]`, one marker max, final line, always stripped from visible text. Changing syntax/semantics = new prompt version + owner approval + regression suite. |
| Card suppression | `orchestrate.ts` purchase-flow guard | Product/category cards are suppressed while an order is in `selecting_branch`/`collecting_info`/`awaiting_payment`. Keep it; it is deliberate UX enforcement, not a bug. |
| Order state machine | `supabase/functions/_shared/orders.ts`, `transition_order` RPC | `transition_order` is the ONLY way to change `orders.status`. Never `update orders set status` directly anywhere (code, scripts, admin). Statuses are fixed: `selecting_branch → collecting_info → awaiting_payment → submitted → confirmed → booked → done / cancelled`. New statuses/transitions = plan change + migration + tests. |
| Money | `promptpay.ts`, `commissions.ts`, order amount fields | Customer payment = PromptPay QR + staff confirmation. Stripe stays behind a default-off flag. Amounts come only from `products.price_baht` at order creation; commissions only from `commission_scheme_snapshot`. No price math from model output, ever. |
| Tenancy & RLS | all migrations, `_shared/db.ts` | Every business table carries `tenant_id` + RLS. New tables must ship RLS in the same migration. Service-role keys exist only inside edge functions. |
| Migrations | `supabase/migrations/*` | Additive only. NEVER edit or delete an existing migration file. New file, new timestamp, idempotent (`if not exists` / `drop policy if exists` + recreate). |
| Conversation purity | `chat-orchestrator` reply path | The backend NEVER scripts conversational replies, intake questions, or sales lines. Thai text in the reply path is allowed only as templated **system notices** in `templates.ts` and DB-derived context lines built in `orders.ts`/`context.ts`. If you find yourself writing a Thai sentence the "assistant says", you are breaking the architecture. |
| Facts & PDPA | `facts.ts`, `fact-extractor`, `consents` | `user_facts` is append-only with supersede; facts are extracted from USER messages only, never from assistant text; writes are consent-gated. Health images/slips live in private buckets with signed URLs. |
| Medical safety | `lab.ts`, `templates.ts` disclaimer | No diagnosis language anywhere; lab summaries pass `sanitizeLabSummary`; emergency behavior (1669/ER, no products) is prompt-governed — never intercept it in code. |

## 3. Standing engineering rules

1. **Scope discipline.** One PR per plan phase. Do not "improve" protected-core files opportunistically while doing unrelated work (no drive-by refactors of `_shared/*`).
2. **Gates stay green.** `npm run typecheck` and `npm run v2:verify` must pass on every PR. Never weaken, skip, or delete an audit script/assertion to make a build pass — fix the cause or stop and report. Test heuristics may only be adjusted with evidence the model output is correct (see `docs/v3-audit-report-2026-06-12.md` for precedent).
3. **Truthful bookkeeping.** Update DoD checkboxes (✅/❌ + date) in the plan you executed, in the same PR. Never mark items done that need external/live verification you could not run.
4. **DECIDED is final.** Sections titled "DECIDED by owner" answer their questions permanently. Do not re-ask, do not implement a different option.
5. **Live environment is owner territory.** Agents do not deploy edge functions, apply migrations to the linked project, change Supabase secrets, or touch CI repo secrets unless the task explicitly grants it. (Owner note: Windows deploys require a UTF-8 console — `chcp 65001` + `[Console]::OutputEncoding=UTF8` — or Thai/emoji literals ship corrupted.)
6. **Thai-first UX.** Customer- and presenter-facing strings are Thai. Use `MiraDesign` tokens (`constants/Design.ts`); add tokens instead of inlining hex values.
7. **Compatibility.** `chat_messages`, `ChatOrchestratorResponse`, and the action schema are consumed by app + PWA + LINE + scripts. Shape changes must be additive (deprecate, don't repurpose), mirrored in `lib/types/api.ts` (CI enforces the mirror), and covered by tests.
8. **When blocked, stop.** If a rule here blocks your task, or two documents contradict each other, stop and report options to the owner. A wrong guess in the core costs more than a paused task.

## 4. Quick self-check before you open a PR

- [ ] Did I touch any file in §2? → Is that change explicitly described in a plan section? If not, revert it.
- [ ] Any new Thai sentence in the reply path that the model should have said instead? → Remove it.
- [ ] Any direct `orders.status` write? → Use `transition_order`.
- [ ] New table/column without RLS or outside a new migration file? → Fix it.
- [ ] `npm run v2:verify` green? DoD checkboxes updated truthfully?
