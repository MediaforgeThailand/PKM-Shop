# A1 Commission Scheme Snapshot

## Changed
- Added `orders.commission_scheme_snapshot`.
- Captured the current referrer commission scheme when chat and referrer-assisted orders are created.
- Updated `transition_order` so confirmed orders compute commission from the order snapshot, falling back to the current referrer scheme only for legacy rows with a null snapshot.
- Updated shared/client order types, order selects, admin queue loading, and product-plan audit evidence.

## Verification
- `npm run v2:verify` passed on 2026-06-11 after the A1 changes. The Deno suite reported 70 passed tests, including the order snapshot/fallback cases.
