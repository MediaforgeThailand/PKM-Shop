# Phase 4 Refer Program

## What Changed

- Added `referrers` and `commission_entries` with tenant-scoped RLS, referrer self-read policies, admin-only write policies, customer/order foreign keys, the spec-defined referrer type enum, and phone/referrer/referral-FK indexes.
- Updated `transition_order(...)` so moving an attributed order to `confirmed` inserts one idempotent `commission_entries` row using the referrer scheme snapshot and product category.
- Added `_shared/commissions.ts` plus Deno tests covering default percent, category override, flat-baht schemes, rounding, and negative clamp behavior aligned with the SQL commission function.
- Added `referrer-order` for authenticated referrer assisted purchase: product selection, buyer phone/name validation, buyer customer match/create, order creation, `awaiting_payment` transition, PromptPay QR response, and referrer payment confirmation.
- Added `/r/[ref_code]` and local referral storage, plus optional `ref_code` transport to `chat-orchestrator` so chat orders can credit valid stored referrals inside the tenant attribution window.
- Added `_shared/referrals.ts` plus Deno tests for active, expired, exact-boundary, missing, and invalid referral attribution timestamps.
- Rebuilt `partner.tsx` into the referrer workspace: catalog, buyer form, QR order panel, payment-done action, and earnings list.
- Added `components/admin/ReferrersAdmin.tsx` and `app/admin/referrers.tsx` for referrer CRUD, commission scheme editing, schema-enum type selection, read-only existing `ref_code`, row-level commission approve/paid/void actions, and selected-row bulk approve/paid actions.
- Kept referrer admin inside the consolidated `app/admin/` route group with orders and catalog.
- Added referrer display to the live admin orders queue.

## Verification

- `npm run typecheck` passed after Phase 4 implementation.
- `npm run chat:quality` passed after Phase 4 implementation.
- `npm run v2:schema-audit` passed after adding referral FK indexes and the spec-defined referrer type enum constraint.
- `npm run v2:client-audit` passed and now asserts `/r/[ref_code]` persists the normalized referral code before chat, the chat orchestrator request forwards a stored referral code when present, and referrer admin keeps bulk commission updates tenant-scoped while constraining type choices and keeping existing `ref_code` read-only.
- `npm run v2:edge-security-audit` passed and now asserts referrer assisted orders credit `referrer.id` directly and scope payment confirmation to the authenticated referrer.
- `git diff --check` passed after Phase 4 implementation.
- Direct status-write audit found only the `transition_order(...)` definitions in Phase 3 and Phase 4 migrations writing `public.orders.status`; prompt-status migrations are unrelated to orders.
- SQL/helper sanity checks found the existing `is_tenant_member` and `is_tenant_admin` helpers used by the new policies.
- `npx.cmd -y deno@2.8.2 test --allow-env --allow-net --import-map=supabase/functions/import_map.json supabase/functions/_shared/__tests__/` currently passes with 83 tests, including the Phase 4 commission calculation and referral attribution units.

## Boundaries

- `docs/v2-open-questions.md` records two API-shape confirmations: referral-code transport into `chat-orchestrator`, and reusing `referrer-order` for payment confirmation.
- Demo referrer auth linking is optional through `DEMO_REFERRER_AUTH_USER_ID`; without it, seeded referrers are visible to admins but cannot be used as an authenticated referrer workspace.
- Automated payouts remain out of scope per the v2 product plan; Phase 4 only tracks commission entry status.
