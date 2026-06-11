# A2 System Notice Single Source

## Changed
- Redefined `transition_order` so SQL no longer inserts `system_notice` chat messages.
- Added shared TypeScript notice templates for submitted, confirmed, and booked statuses.
- Updated `chat-orchestrator` action responses to always persist exactly one TypeScript `system_notice`.
- Updated `admin-order-action` to persist the notice after transition and push that same persisted text to LINE.
- Added static edge-audit coverage and Deno template tests for notice selection/formatting.

## Verification
- `npm run v2:verify` passed on 2026-06-11 after the A2 changes. The Deno suite reported 74 passed tests, including shared notice-template coverage.
