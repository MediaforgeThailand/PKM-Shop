# B9 LINE Sandbox Setup

## What Changed

- Added `docs/line-setup.md` with required LINE env names, webhook URL shape, setup steps, and a five-step manual sandbox checklist.
- Linked the remaining LINE credential blocker in `docs/v2-open-questions.md` and local readiness docs to the setup guide.
- Extended `v2:docs-audit` to include the LINE setup guide and require the env names, webhook path, and checklist heading.
- Updated Phase 6 docs to reflect that the `line-assets` bucket decision is implemented while real sandbox credentials remain owner-provided.

## Verification

- `npm run v2:docs-audit` checks 12 docs and requires the LINE setup guide.
- Existing mocked LINE coverage remains in `_shared/__tests__/line_test.ts`, `v2:edge-security-audit`, and `v2:deno-check`.

## Boundary

- The LINE sandbox regression remains blocked until the owner provides a tenant LINE sandbox channel, channel secret, channel token, and test account.
