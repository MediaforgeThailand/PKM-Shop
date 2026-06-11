# B6 Internal Tenant Context

## What Changed

- Added `_shared/internalAuth.ts` with a constant-time service-role bearer check shared by `fact-extractor`, `lab-ingest`, and `wearable-ingest`.
- Converted `lab-ingest` and `wearable-ingest` to service-role internal entrypoints. They derive tenant context from `customer_id -> customers.tenant_id` and do not read tenant identity from request payloads.
- Removed `tenant_slug` from the wearable ingest request mirror.
- Added negative Deno tests that call each internal handler with an anon bearer token and assert a 401 before internal work runs.

## Verification

- `npm run v2:verify` passed on 2026-06-11 after the B6 changes.
- The shared Deno suite passed with 83 tests, including the internal auth rejection tests.

## Boundaries

- Wearable fact `source_ref`, wearable bucket naming, and Apple Health export-upload UX remain owner/product questions until their decided sections land.
