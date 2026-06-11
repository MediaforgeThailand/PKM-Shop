# B7 Lab Confirmation Write Path

## What Changed

- Added authenticated `lab-confirm` edge function for customer JWT requests shaped as `{ report_id, confirmations: [{ test_code, value, unit }] }`.
- Enforced customer ownership by resolving the auth user, loading the report, requiring `status = needs_confirmation`, and matching `customers.auth_user_id`, `customers.id`, and `customers.tenant_id`.
- Validated that every submitted `test_code` already belongs to the target report before updating `lab_results`.
- Updated confirmed rows with customer-reviewed `value`, `unit`, and `confirmed = true`; when no low-confidence row remains unconfirmed, the report moves to `ready`.
- Factored lab fact insertion into `_shared/labFacts.ts` so `lab-ingest` and `lab-confirm` insert supported lab facts through the same helper.
- Wired the health results screen to render editable low-confidence rows and submit them through `lib/health/labConfirm.ts`.
- Added `lab-confirm` to the deploy helper, Deno check bundle, edge security audit, client audit, and shared client/edge API mirrors.

## Verification

- `npm run v2:type-safety-audit` passed with 109 TypeScript files scanned.
- `npm run v2:client-audit` passed with 30 production files scanned and 65 client files secret-scanned.
- `npm run v2:edge-security-audit` passed with 17 files scanned.
- `npm run types:mirror-audit` passed with 38 exported types checked.

## Boundaries

- Legal-approved lab disclaimer wording remains owner/legal-owned in `docs/v2-open-questions.md`.
- Lab alias expansion beyond the spec's 15 supported codes remains owner-owned in `docs/v2-open-questions.md`.
- Real image-to-OpenAI sample proof still requires external project credentials/state.
