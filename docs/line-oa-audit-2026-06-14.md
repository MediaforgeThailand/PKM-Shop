# LINE OA — Full audit (2026-06-14, V3-5 → V3-8 + agent console)

Scope: the whole LINE path after landing V3-5..V3-8 on current main — `line-webhook`,
`_shared/line.ts`, the LINE branches of `_shared/orchestrate.ts`, `_shared/context.ts`,
`_shared/openai.ts` (`callOrderFieldExtractor`), the new `admin-line-reply` edge
function, the `conversations` admin console, and the `agent_mode` migration.

## Verdict
Functionally correct and secure end-to-end. No money-, tenancy-, auth-, or
status-integrity violations. `npm run v2:verify` green (typecheck + all deterministic
gates + 118 Deno tests). Items below are notes, not blockers.

## Verified OK
- **Webhook auth + idempotency** — HMAC-SHA256 signature verify; per-tenant secrets;
  `?tenant=` routing. Redelivery is handled twice now (belt + suspenders): main's
  `webhookEventId` claim via `line_webhook_events` AND the V3-5 `deliveryContext.isRedelivery`
  skip. Per-event isolation so one failure doesn't abort the batch.
- **Order ownership** — `select_branch`, `order_form_submit`, `payment_done` all call
  `assertOrderBelongsToSession` and scope writes by tenant/customer/session. A crafted
  postback with someone else's `order_id` is rejected.
- **Money / status** — amounts from `products.price_baht`; QR from `tenant.promptpay_id`;
  `transition_order` is the only status path; no model-derived prices.
- **Conversational confirm gate** — info is held until the customer affirms; advance only
  when fields were already complete AND `confirmed`, with `maybeAdvanceCollectingOrder`
  re-checking `missingOrderFields`. Phone is validated/normalised to `^0[689]\d{8}$` (M2);
  buyer phone is never auto-filled from the account.
- **Agent console (new)** — `admin-line-reply` is staff-authenticated: `resolveAuthUserId`
  → `tenant_members` role gate (superadmin/tenant_admin/tenant_staff); the session is
  loaded with `tenant_id in (caller's tenants)`, so staff cannot touch another tenant's
  conversation. `reply` pushes only to that session's own LINE recipient and persists the
  message; `set_mode` only flips `agent_mode`. No status/money writes.
- **Handover** — when `agent_mode='human'`, `orchestrateLine` records the inbound message
  and returns null so the webhook stays silent (AI cannot talk over the human).
- **RLS** — staff read of `chat_sessions`/`chat_messages` is gated by `is_tenant_member`;
  `agent_mode` toggles + manual sends go only through the service-role edge function (no
  broad client write policy was added).
- **Consent/PDPA** — consent prompt suppressed on LINE (operator-managed) without
  weakening the fact-write consent gate; `store:false` on model calls.

## Notes / follow-ups (non-blocking)
1. **Redundant redelivery guards** — main's `webhookEventId` claim already covers redelivery;
   the V3-5 `isRedelivery` skip is now redundant (harmless). Could be removed for clarity.
2. **Console polling** — the inbox/transcript refresh on a 4–6s `refetchInterval`. Fine for a
   small team; swap to Supabase Realtime (Phase 3) if many concurrent agents.
3. **Manual replies render as role `assistant`** — they appear like AI bubbles in the
   transcript. A dedicated `agent` marker would let the UI distinguish human vs AI turns.
4. **Deploy order** — the migration (`20260613020000`) adds `agent_mode`, which the session
   select now reads, so it MUST be applied before deploying `line-webhook`/`chat-orchestrator`.

## Recommendation
Given the size of this landing (V3-5..V3-8 + console, protected-core-adjacent), a second
human review of `orchestrate.ts`, `admin-line-reply`, and the migration RLS is recommended
even though the gates are green.
