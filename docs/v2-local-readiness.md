# MiraCare v2 Local Readiness

Updated: 2026-06-11

This file separates work that can be hardened locally from work that needs an owner decision or external setup. This file should not list secret values.

## Local Work Completed Without External Setup

- `npm run v2:local-readiness-audit` now checks that `docs/v2-gap-analysis.md` has no unblocked `Missing` rows, that this file keeps owner/external blockers visible, and that external preflight is not confused with seeded/live proof.
- `npm run v2:verify` now includes `v2:local-readiness-audit` so local readiness hygiene runs with the deterministic verification bundle.
- GitHub Actions now runs the same local readiness audit on v2 pull requests.
- Additional shared Deno tests cover local-only helper behavior for LINE tenant env fallback, LINE empty-product handling, referral attribution boundaries, and Apple Health XML streaming/body-unit normalization.
- `npm run v2:external-preflight` remains the safe way to check external prerequisites without printing secrets; it does not prove seeded/live regressions passed.
- OpenAI Platform prompt verification is owner-owned: the published prompt `pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021` v2 default was authored and behavior-tested in the Platform playground by the owner's agent on 2026-06-10/11, and the owner reports the live 7-case regression passes against it. Codex must not fetch or verify prompt content from code.

## No Unblocked Missing Rows

The current gap analysis has no `Missing` rows. Remaining unfinished items are either `Partial` pending live proof or `Blocked` because the spec does not define a safe contract. The authoritative blocker list remains `docs/v2-open-questions.md`.

Local work that is still safe without external setup should be added as a concrete audit/test/doc task here before implementation. Product behavior changes must stay in `docs/v2-open-questions.md` until the owner answers the contract.

## Still Blocked By Owner Decision

- Phase 1: canonical catalog, legacy consent mapping, PDPA export/delete scope, prototype/mockup release policy.
- Phase 2: `client_msg_id` action idempotency sequencing.
- Phase 3: manual staff verification acceptance.
- Phase 4: 6-character base32 referral code alphabet/normalization, `ref_code` transport, referrer payment endpoint split, and default commission scheme.
- Phase 5: lab fact keys, synonym/alias matrix, low-confidence lab rows confirmation write path, medical liability wording, `defaultTenantSlug` dashboard tenant resolution, wearable `source_ref`, `wearable-imports` bucket naming, and Apple Health export upload UX acceptance.
- Phase 6: `line-assets` bucket/public URL policy.

## Still Blocked By External Setup

These are the four external preflight gates that can be checked locally but cannot be completed without outside credentials/state:

- seed-demo service role setup
- seeded chat regression setup (uses programmatic `regression-test@miracare.dev` JWT bootstrap; no human-managed `TEST_SUPABASE_JWT`)
- live RLS project setup
- LINE sandbox setup
