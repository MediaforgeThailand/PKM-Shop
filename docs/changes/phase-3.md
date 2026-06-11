# Phase 3 Orders And Payment

## What Changed

- Added the Phase 3 migration for `orders`, `order_events`, v2 RLS, indexes, and the `transition_order(...)` RPC that is the only order-status writer.
- Added shared order modules for the state machine, PromptPay EMVCo payload generation, active-order context, order panels, and order field updates.
- Added `admin-order-action` so admin confirm/book/done/cancel actions go through `transition()`.
- Wired `chat-orchestrator` order actions: `select_product`, `order_form_submit`, order-field extraction while collecting info, PromptPay QR payload return, and `payment_done`.
- Added `components/chat/OrderPanel.tsx` and wired chat product cards to create orders through `chat-orchestrator` instead of leaving the v2 flow for `/checkout`.
- Replaced the mock `admin-booking` page with the v2 route `app/admin/orders.tsx` and removed the scattered legacy route; the live orders queue supports realtime refresh, booking actions, read-only transcript display, and signed `payment-slips` thumbnail URLs when `orders.slip_url` stores a private storage path.
- `transition_order(...)` inserts `system_notice` chat messages for submitted, confirmed, and booked states; `admin-order-action` attempts LINE push delivery for confirmed/booked LINE orders.
- The chat action-response path now persists the user action message and, when the transition RPC did not already insert one, a templated `system_notice` before returning without a model call.
- The order form-complete and payment-submitted action responses now both come from `lib/templates.ts` so non-model system notices stay centralized.
- The typed chat client now marks `order_form_submit` and `payment_done` responses as `system_notice`, so the live chat append and persisted reload render those action notices consistently.
- Added Deno unit tests for PromptPay fixtures and the order state machine, including every legal transition plus representative illegal transitions.
- Hardened order writes so chat order-form/payment actions validate the current tenant, session, and customer before writing, and admin actions load orders through the authenticated staff member's tenant allow-list.

## Verification

- `npm run typecheck` passed.
- `npm run chat:quality` passed.
- `npm run orders:status-audit` passed.
- `npm run v2:client-audit` passed and now asserts live action-response notices use the persisted `system_notice` role.
- `npm run v2:edge-security-audit` passed and now covers chat/admin order tenant-scope invariants plus action-response persistence and template guards.
- `git diff --check` passed.
- Direct status-write audit allows status writes only inside `public.transition_order(...)`; app/admin direct reads do not update status.
- `npx.cmd -y deno@2.8.2 test --allow-env --allow-net --import-map=supabase/functions/import_map.json supabase/functions/_shared/__tests__` passed with the Phase 3 order and PromptPay tests included.

## Boundaries

- Referrer display and commission side effects are implemented in Phase 4.
- Slip upload is not implemented yet because the spec does not define how the app attaches `slip_url` or how customers write to the private `payment-slips` bucket; this is logged in `docs/v2-open-questions.md`. The admin queue can display signed thumbnails for existing `payment-slips` storage paths or direct HTTP URLs.
- Persisted chat reload reconstructs text, system notices, and product cards, but persisted order-panel reload is intentionally not guessed because `chat_messages` has no order reference/payload and `qr_payload` is not persisted on `orders`; this contract question is logged in `docs/v2-open-questions.md`.
