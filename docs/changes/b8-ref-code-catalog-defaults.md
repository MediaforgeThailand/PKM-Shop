# B8 Ref Code, Catalog, Commission Defaults, And Disclaimer

## What Changed

- Added additive migration `20260611062000_b8_referrer_contract.sql` for six-character Crockford base32 ref codes, tenant-scoped uniqueness, server-side generation, immutability, and the v2 default commission scheme `{"mode":"percent","default":10,"by_category":{}}`.
- Updated referrer admin creation so normal admin inserts do not submit `ref_code`; the database trigger generates it and existing codes remain read-only.
- Tightened referral storage and `chat-orchestrator` request validation to accept only 6-character Crockford uppercase codes.
- Updated demo seeding to use valid `DMR001` and the tenant/ref-code conflict target.
- Removed stale product-doc wording that implied the old catalog table remains the canonical catalog source.
- Reduced `docs/v2-open-questions.md` to the two allowed remaining items: `OWNER-REVIEW` legal disclaimer sign-off and LINE sandbox credentials.

## Verification

- `npm run v2:schema-audit` now checks 16 tables, 32 policies, 31 indexes, and 32 migrations, including the B8 ref-code/default-commission contract.
- `npm run v2:open-questions-audit` now checks 2 topics and 1 blocked row.
- `npm run v2:local-readiness-audit` now checks 0 Missing rows, 1 decision blocker, and 4 external gates.
- `npm run v2:client-audit` now asserts referrer create omits `ref_code` and shows generated codes read-only.

## Boundaries

- `LAB_SUMMARY_DISCLAIMER_TH` remains the v2 default disclaimer, but tenant/legal sign-off is still marked `OWNER-REVIEW` before the first client launch.
- LINE sandbox credentials remain owner-provided and are handled in B9.
