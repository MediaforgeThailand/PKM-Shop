# MiraCare v2 — Audit Fixes & Blocker Resolutions (Work Order)

Implementation agent: Codex.
Authority: this document RESOLVES the open questions previously blocking work. Where it says DECIDED, treat it as the owner's decision — do not re-open it. The PRIME DIRECTIVE in `docs/miracare-codex-handoff.md` and the precedence order in `docs/miracare-v2-technical-spec.md` still apply.

Standing rules for this work order:
- Work top-down by section. One section = one commit (or more if large). Run `npm run v2:verify` before every commit. Push to main after each green commit — never leave work uncommitted at the end of a session.
- The deployed stack currently matches `main` (functions v2, regression 7/7 live). After changing any edge function, redeploy it and re-run `scripts/chat-regression.mjs` live (§B2 gives you the credential bootstrap so this is no longer blocked).
- If something here truly cannot work, STOP and write the conflict to `docs/v2-open-questions.md` — do not improvise a different contract.

---

## PART A — Fixes from the 2026-06-11 external audit

### A1. Commission scheme snapshot timing (spec deviation — fix)
DECIDED: the commission scheme is snapshotted **when the order is created**, not when the admin confirms. Rationale: the deal terms a referrer was promised must not change because an admin edited the scheme while the order sat in the queue.

Implementation:
1. New migration: `alter table orders add column commission_scheme_snapshot jsonb;`
2. Everywhere an order is created with a non-null `referrer_id` (orchestrate `createOrderFromProduct`, `referrer-order` function), read the referrer's current `commission_scheme` and store it in `orders.commission_scheme_snapshot`.
3. Redefine `transition_order` (new migration, full `create or replace`): on `confirmed`, compute the commission from `v_order.commission_scheme_snapshot`; fall back to the referrer's current scheme only when the snapshot is null (legacy rows). Keep `on conflict (order_id) do nothing`.
4. Tests: unit test for the fallback rule; extend `orders_test.ts` fixtures.
5. Update audit checklist D in `docs/miracare-v2-product-plan.md` to reference the snapshot column.

### A2. System-notice text has two sources of truth (fix)
Today the same Thai notice strings live in BOTH the `transition_order` SQL function and `lib/templates.ts`. They will drift.

DECIDED: TypeScript templates are the single source of truth; SQL stops composing notices.
1. New migration: redefine `transition_order` WITHOUT the `insert into chat_messages ... system_notice` block (keep state machine, order_events, commission logic).
2. `admin-order-action`: after a successful transition to `submitted|confirmed|booked`, persist the system notice itself (template from `_shared/templates.ts`, see A3) and then do the LINE push using that same string (no more "read latest system_notice row" lookup — push exactly what was persisted).
3. `orchestrate.ts` `payment_done`: persist the notice via `persistSystemNotice` with the template; delete the `systemNoticePersisted` flag entirely (it exists only to avoid the SQL duplicate).
4. Add a test: transitioning to `confirmed` produces exactly ONE system_notice row.

### A3. Move notice/disclaimer templates inside the functions boundary (fix)
`orchestrate.ts` imports `../../../lib/templates.ts` — it works (bundler follows it) but couples edge deploys to the app source tree; any React-Native import added to that file later boot-breaks every function.

1. Create `supabase/functions/_shared/templates.ts` as the canonical file (move all constants).
2. `lib/templates.ts` stays for the app side but becomes a mirror copy with a header comment pointing to the canonical file.
3. Extend `scripts/type-mirror-audit.mjs` (or add `scripts/templates-mirror-audit.mjs` wired into `v2:verify` + CI) to FAIL when the exported constants of the two files differ.
4. No edge file may import from outside `supabase/functions/` afterwards — add this as a check in `v2-edge-security-audit.mjs`.

### A4. Timing-safe LINE signature comparison (hardening)
Replace the `expected !== signature` string compare in `_shared/line.ts` with `crypto.subtle.verify('HMAC', key, signatureBytes, bodyBytes)` (import key with usage `['verify']`, base64-decode the header first; invalid base64 → 401). Update `line_test.ts` accordingly.

### A5. Ghost deployment investigation (process fix)
On 2026-06-11 ~06:46 UTC a `gemini-chat` v3 function was deployed to the project even though the source was deleted from the repo (the external audit deleted the live function). Find and remove whatever did this:
1. Inspect `scripts/deploy-mira-chat.ps1` (it was modified that day). Delete it — it deploys a function that no longer exists.
2. Replace with `scripts/deploy-v2-functions.ps1` that deploys exactly: chat-orchestrator, fact-extractor, admin-order-action, referrer-order, line-webhook, lab-ingest, wearable-ingest — and nothing else.
3. Grep the repo and CI workflows for any other `functions deploy` invocation referencing `gemini-chat`, `mira-chat`, or wildcard deploys; remove them.
4. Document in `docs/changes/` what the source of the ghost deploy was.

---

## PART B — Blocked items, now unblocked with decisions

### B1. OpenAI Platform prompt content verification
RESOLVED — owner-side. The published prompt (id `pmpt_6a29c7e3...`, v2 default) was authored and behavior-tested in the Platform playground by the owner's agent on 2026-06-10/11, and the live 7-case regression passes against it. Codex action: none, except record in `docs/v2-local-readiness.md` that prompt verification is owner-owned and evidenced by the live regression run. Never attempt to fetch or "verify" prompt content from code.

### B2. Seeded chat regression credentials
DECIDED: provision the test identity programmatically — no human-managed JWT.
1. New script `scripts/create-test-jwt.mjs`: given `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_ANON_KEY`, idempotently create/update auth user `regression-test@miracare.dev` with a random password (admin API), sign in, print the access token (and nothing else) to stdout.
2. `scripts/chat-regression.mjs`: if `TEST_SUPABASE_JWT` is unset but service-role env is present, call the bootstrap inline.
3. CI: add an OPTIONAL job `live-regression` gated on repo secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) being present; runs seed + regression. Skips cleanly when secrets are absent.
4. Never echo tokens/keys in CI logs.

### B3. Live RLS check
DECIDED: run RLS assertions against the linked project itself using two disposable auth users (customer A / customer B), not a shadow DB.
1. Rework `scripts/rls-check.sql` into `scripts/rls-check.mjs`: create users A and B (admin API), create customer rows in the demo tenant for both, as A attempt to read B's `customers`, `user_facts`, `orders`, `chat_messages`, `lab_reports` rows via PostgREST with A's JWT — assert 0 rows; attempt cross-tenant `products` write as A — assert failure. Clean up created rows.
2. Wire into the optional CI `live-regression` job (after seed, before chat regression).

### B4. Slip upload contract
DECIDED contract:
1. Storage: private bucket `payment-slips`, object path `${tenant_id}/${order_id}/${uuid}.jpg|png`.
2. New action on chat-orchestrator: `{type:'request_slip_upload', order_id, content_type}` → validates order ownership (same rules as payment_done) and `content_type in (image/jpeg, image/png)` → returns `{upload_url, storage_path}` using a signed upload URL created with the service role (`createSignedUploadUrl`, 10 min expiry). No model call, no message persisted.
3. Client uploads directly to `upload_url`, then sends `{type:'payment_done', order_id, slip_path}`. `payment_done` validates `slip_path` prefix equals `${tenant_id}/${order_id}/`, stores it in `orders.slip_url`, then transitions to `submitted` as today. `slip_path` is optional — "จ่ายแล้ว" without slip still works.
4. Admin orders queue renders the slip thumbnail via a signed READ url (60 min) generated server-side in a small `admin-order-action` extension (`action:'slip_url'`) — the service key never reaches the client.
5. Tests: path-prefix validation unit test; ownership rejection test.

### B5. Persisted QR / order-panel reload contract
DECIDED: never persist QR payloads. `buildPromptPayPayload(promptpay_id, amount)` is deterministic — rebuild on demand.
1. New action `{type:'refresh_order'}` (no order_id needed): returns the current `toOrderPanel(loadActiveOrder(session, tenant))` for the session WITHOUT calling the model and WITHOUT persisting any message. Response `text` is `''` and the client must not render a bubble for it.
2. Client: on chat screen mount/reload, after loading history, call `refresh_order` to restore the order panel (form state or QR) for any active order.
3. Document in `lib/types/api.ts` + mirror.

### B6. Tenant-context contract for internal functions (fact-extractor, lab-ingest, wearable-ingest)
DECIDED contract — codify and enforce:
1. Internal functions accept only service-role calls: verify the `Authorization` bearer equals the service-role key (compare via constant-time check), else 401. (fact-extractor already checks; make it shared: `_shared/internalAuth.ts` used by all three.)
2. Tenant identity is always DERIVED server-side from the row chain (`message → session → tenant`, `report → customer → tenant`), never read from the request payload. Remove/ignore any tenant fields in internal payloads.
3. Add one negative test per function (anon key call → 401) to `__tests__` (mock fetch) and an assertion in `v2-edge-security-audit.mjs` that the three functions import `internalAuth`.

### B7. Lab confirmation write path
DECIDED contract:
1. New authenticated edge function `lab-confirm` (customer JWT): `{report_id, confirmations:[{test_code, value, unit}]}`.
2. Validations: report belongs to the caller's customer row (tenant-scoped); report status is `needs_confirmation`; every `test_code` exists on that report.
3. Writes: update each `lab_results` row (`value`, `unit`, `confirmed=true`); when no unconfirmed low-confidence rows remain → report status `ready`; then insert `user_facts` (source `lab_import`, source_ref report id) for supported codes exactly as the auto path does — factor that insertion into a shared helper so both paths stay identical.
4. RLS stays read-only for customers on `lab_results`; the write goes through the function with service role after ownership checks (consistent with the rest of the architecture).
5. Client: wire the existing confirmation UI to this endpoint.

### B8. Canonical product catalog / ref code / commission defaults / disclaimer
DECIDED:
- Canonical catalog = the `products` table (already migrated). `hospital_products` is gone; remove any residual references in docs/comments.
- `ref_code` format = 6 chars, Crockford base32 uppercase (alphabet `0-9 A-Z` excluding `I L O U`), generated server-side, immutable, unique per tenant. Update the zod regex (`^[A-Z0-9]{6}$` plus alphabet check) and the generator.
- Commission default scheme = `{"mode":"percent","default":10,"by_category":{}}` applied when an admin creates a referrer without specifying one. Per-tenant overrides via the admin UI.
- Legal disclaimer = keep the current `LAB_SUMMARY_DISCLAIMER_TH` wording as the v2 default. Mark `OWNER-REVIEW` in `docs/v2-open-questions.md`: final wording requires tenant/legal sign-off before the first client launch — this is the ONE item that stays open.

### B9. LINE sandbox regression
Still blocked on real credentials — this is owner-provided, do not fake it. Codex actions limited to:
1. Ensure all LINE behavior is covered by mocked tests (signature, Flex payload shape, postback mapping, QR image message).
2. Add `docs/line-setup.md`: exact steps + env names (`LINE_CHANNEL_SECRET__<tenant_slug>`, `LINE_CHANNEL_TOKEN__<tenant_slug>`), webhook URL format `/functions/v1/line-webhook?tenant=<slug>`, and a 5-step manual sandbox test checklist the owner runs once credentials exist.

### B10. Live E2E purchase/referral proof
DECIDED: script it, same credential bootstrap as B2.
1. `scripts/e2e-commerce.mjs`: (a) seed admin membership — create auth user `e2e-admin@miracare.dev`, insert `tenant_members` row as `tenant_admin` via service role; (b) customer flow: `select_product` chk-basic → conversational/form fill buyer info → assert panel `awaiting_payment` with a valid PromptPay payload (CRC check) → `payment_done` → assert `submitted` + system notice persisted; (c) admin flow: `admin-order-action confirm` with the admin JWT → assert order `confirmed`, ONE system notice, and commission entry created iff a referrer was attributed; (d) referral leg: create referrer via service role, new customer with `ref_code`, one purchase, assert `commission_entries` amount matches the snapshot scheme (A1).
2. Idempotent and self-cleaning (cancel created orders at the end). Wire into optional CI job after B2/B3.
3. Lab leg (manual for now): document running `lab-ingest` against `__tests__/fixtures` imagery as a checklist item in `docs/v2-local-readiness.md` — full automated lab E2E is out of scope until a real sample image set is approved.

---

## Definition of done for this work order
- [ ] A1–A5 landed, each with migration/tests where specified
- [ ] B2/B3/B10 scripts run green locally against the linked project (paste outputs into `docs/changes/`)
- [ ] B4/B5/B7 contracts implemented end-to-end (client + edge + tests)
- [ ] B6 internal-auth shared module enforced by audit script
- [ ] `npm run v2:verify` green; live `chat-regression.mjs` 7/7 after final redeploy
- [ ] All functions redeployed; `supabase functions list` shows only the 7 v2 functions + rag-embed
- [ ] Everything committed AND pushed; `docs/v2-open-questions.md` contains only B8's disclaimer review and B9's LINE credentials
