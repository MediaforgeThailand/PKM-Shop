# A3 Edge Template Boundary

## Changed
- Made `supabase/functions/_shared/templates.ts` the canonical edge template file.
- Converted `lib/templates.ts` into an app-side mirror with a header pointing to the canonical file.
- Moved lab-summary disclaimer imports inside the edge function boundary.
- Added `scripts/templates-mirror-audit.mjs`, wired it into `npm run v2:verify`, and added it to the v2 GitHub workflow.
- Extended `v2-edge-security-audit` to fail if any edge TypeScript import resolves outside `supabase/functions`.

## Verification
- `npm run v2:verify` passed on 2026-06-11 after the A3 changes. The run included `templates:mirror-audit`, `v2:edge-security-audit`, and 74 Deno tests.
