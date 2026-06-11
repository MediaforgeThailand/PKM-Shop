# MiraCare v2 Open Questions

## Triage Summary

- Local-only implementation status: no unblocked `Missing` rows remain in `docs/v2-gap-analysis.md`; new local work should be added as tests, audits, or docs unless an owner contract is required.
- Owner decision blockers: `OWNER-REVIEW` legal disclaimer sign-off before the first client launch.
- External setup blockers: LINE sandbox channel credentials and test account.

## Owner Review

- `OWNER-REVIEW`: The current `LAB_SUMMARY_DISCLAIMER_TH` wording in `supabase/functions/_shared/templates.ts` is the MiraCare v2 default and is mirrored in `lib/templates.ts`. Final tenant/legal sign-off is still required before the first client launch.

## LINE Credentials

- The Phase 6 sandbox regression still requires a tenant LINE sandbox channel, channel secret, channel token, and test account. Follow `docs/line-setup.md` once credentials exist.
