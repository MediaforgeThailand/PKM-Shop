# B4 Slip Upload Contract

## What Changed

- Added `request_slip_upload` to `chat-orchestrator`; it accepts an order id and JPG/PNG content type, validates the same tenant/session/customer ownership as `payment_done`, and returns an order-scoped signed upload URL plus storage path.
- Extended `payment_done` with optional `slip_path`; when present, the edge function validates the path prefix `${tenant_id}/${order_id}/`, stores it in `orders.slip_url`, and then transitions the order to `submitted`.
- Wired the chat UI so the order panel exposes a slip picker, uploads the selected file directly to the signed URL, and then sends `payment_done` with the returned storage path. Tapping `จ่ายแล้ว` without a slip still works.
- Moved admin slip thumbnails behind `admin-order-action { action: 'slip_url' }`, which generates a 60-minute service-role signed read URL after the existing staff tenant allow-list check.
- Added shared order/storage helpers and Deno tests for slip content types, path generation, prefix validation, and ownership rejection.

## Verification

- `npm run v2:verify` passed on 2026-06-11 after the B4 changes.
- The shared Deno suite passed with 79 tests, including the B4 slip-path guard tests.

## Boundaries

- Persisted order-panel QR reload remains blocked by the unresolved `chat_messages`/order-payload contract in `docs/v2-open-questions.md`.
- Seeded/live purchase E2E with a real stored slip still needs the external Supabase regression gate.
