# A4 LINE Signature Verification Hardening

## Changed
- Replaced LINE HMAC sign-and-string-compare verification with `crypto.subtle.verify`.
- Decode the `x-line-signature` header from base64 before verification; malformed base64 is rejected as a 401 validation error.
- Added mocked tests for valid signatures, well-formed wrong signatures, and malformed base64 signatures.
- Extended the edge security audit to reject regressions to string comparison.

## Verification
- `npm run v2:verify` passed on 2026-06-11 after the A4 changes. The Deno suite reported 75 passed tests, including malformed-base64 LINE signature rejection.
