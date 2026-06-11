# B5 Persisted Order Refresh

## What Changed

- Added `refresh_order` to `chat-orchestrator`; it resolves the current authenticated customer/session, loads the active order for that tenant/session, and returns `toOrderPanel(...)` with `text: ''`.
- The refresh path does not persist a user message, does not persist a system notice, and does not call the model.
- Added `refreshActiveOrderPanel` to the typed chat client and the shared API mirrors.
- The chat screen calls `refresh_order` after latest-history hydration and renders the restored order panel outside `MessageBubble`, so the empty refresh response never appears as a chat bubble.

## Verification

- `npm run v2:verify` passed on 2026-06-11 after the B5 changes.

## Boundaries

- Seeded/live purchase E2E is still pending the external Supabase regression gate.
