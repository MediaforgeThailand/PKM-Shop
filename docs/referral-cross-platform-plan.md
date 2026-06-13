# MiraCare — Referral Code Cross-Platform Completion Plan

Status: DRAFT for owner review — 2026-06-13
Owner: taksin / MediaForge
Scope owner doc precedence: extends `docs/miracare-v2-product-plan.md` §5 (Refer Program). Does **not** re-open any DECIDED item there.

> Read `AGENTS.md` first. This plan touches client code on three platforms plus one
> protected-core reply path (`orchestrate.ts` / LINE webhook). All backend changes here
> are **additive** (new columns/functions/migration files only) and keep the
> `ChatOrchestratorRequest` / order schema backward-compatible per AGENTS.md §7.

---

## 0. One-paragraph problem statement

The referral **backend is built and correct** (referrers, commission_entries, attribution
window, `ref_code`, `transition_order` commission creation, `referrer-order` function). The
gap is that **referral attribution only works end-to-end on PWA/Web**. On the **mobile app**
the attribution store is a silent no-op, and on **LINE OA** there is no referral capture at
all — even though the v2 plan §5 explicitly decided attribution must cover "PWA chat / LINE
OA". This plan closes the three-platform gap and removes the mock sales-portal that emits
non-conformant codes.

---

## 1. Current state (verified in code, do NOT rebuild)

| Layer | Artifact | Evidence |
|---|---|---|
| DB schema | `referrers`, `commission_entries`, `customers.referred_by/referred_at`, `orders.referrer_id`, `orders.commission_scheme_snapshot`, `tenants.attribution_window_days` + RLS | `supabase/migrations/20260611040000_miracare_v2_phase4_referrals.sql`, `20260611010000_...foundations.sql`, `20260611060000_a1_commission_scheme_snapshot.sql` |
| `ref_code` | 6-char Crockford base32, server-generated, immutable, unique per tenant | `20260611062000_b8_referrer_contract.sql` (`miracare_generate_ref_code`, ref_code guard trigger) |
| Commission compute | computed on `submitted → confirmed`, snapshot-based, status `pending` | `transition_order` in `20260612050000_...phase1_data_admin.sql`; `_shared/commissions.ts` (JS mirror) |
| Chat attribution | `maybeApplyReferralCode` + `resolveAttributedReferrerId`; request schema accepts `ref_code` on `app`/`pwa`/`line` | `supabase/functions/_shared/orchestrate.ts`, `_shared/referrals.ts` |
| Assisted purchase | `create_order` / `list_branches` / `payment_done` | `supabase/functions/referrer-order/index.ts`, `_shared/referrerOrder.ts` |
| PWA capture | `/r/[ref_code]` → localStorage + cookie; carried in every chat call | `app/r/[ref_code].tsx`, `lib/referrals/attribution.ts`, `lib/ai/miraChat.ts` |
| Referrer workspace (real) | reads referrer/commissions from DB, calls `referrer-order` | `app/partner.tsx` |

---

## 2. Owner decisions for this plan (2026-06-13)

- **D1 — LINE binding mechanism: LIFF page + LINE login.** Referral links targeting LINE go
  through a LIFF page that performs LINE login, reads the `ref_code`, and binds it to the
  `line_user_id` server-side. (LINE `follow` events do not carry custom params, so a
  message- or follow-only approach is rejected.)
- **D2 — sales-portal: wire to the real backend.** `app/sales-portal.tsx` must use a real
  referrer loaded from the DB and call `referrer-order` like `app/partner.tsx`. The
  metadata-derived mock in `lib/marketplace/referralMock.ts` (10-char codes, hardcoded
  rates) is retired to stop code-format drift.
- **D3 — sequencing:** write this plan first (this document), then execute Phase A → E.

---

## 3. Gap matrix (what is missing, per platform)

| Capability | PWA / Web | Mobile (native) | LINE OA |
|---|---|---|---|
| Capture `ref_code` from link | ✅ `/r/[code]` | ⚠️ route exists, store no-ops | ❌ none |
| Persist `ref_code` | ✅ localStorage+cookie | ❌ `globalThis.localStorage`/`document` undefined on RN (`lib/referrals/attribution.ts:10-16`) | ❌ none |
| Send `ref_code` to chat | ✅ `miraChat.ts` | ✅ sends, but value always null | ❌ `orchestrateLine` never passed `ref_code` (`line-webhook/index.ts:103,117,130`) |
| Deep-link scheme | n/a | ❌ `app.json` scheme `mirahealth://` vs `referralMock` `mira://` | n/a |
| Assisted purchase real | ⚠️ `partner.tsx` real / `sales-portal.tsx` mock | same as web | n/a |

---

## 4. Architecture per phase

### Phase A — Cross-platform attribution store (foundation)

Make `lib/referrals/attribution.ts` platform-aware behind the **same exported interface**
(`storeReferralCode`, `readStoredReferralCode`, `normalizeRefCode`) so no caller changes.

- Web: keep `localStorage` + cookie (cookie still needed for any non-Expo PWA entry).
- Native: persist via `expo-secure-store` (already in `app.json` plugins) or AsyncStorage,
  keyed `mira_ref`, with the same 30-day `expires_at` envelope.
- Keep all reads/writes async-safe; `readStoredReferralCode` may need to become async on
  native — if so, update the two callers (`app/r/[ref_code].tsx`, `lib/ai/miraChat.ts`)
  additively. Confirm `miraChat.ts` awaits the code before building the request.

DoD: on a native build, opening a `/r/<valid>` deep link then starting chat results in the
order carrying `referrer_id` for that referrer (assert via `customers.referred_by`).

### Phase B — Mobile app deep links

- Unify the scheme on `mirahealth://` everywhere; delete `mira://` usage. Configure
  Universal Links (iOS `associatedDomains`) / Android App Links so
  `https://mira.health/r/<code>` opens the app when installed.
- Ensure `app/r/[ref_code].tsx` runs on cold-start deep link (Expo Linking initial URL),
  not just warm navigation.
- After capture, route the user to chat/checkout (not back to `/`) so attribution converts.
- Out of scope unless owner asks: deferred deep link for "app not installed" (note it as a
  follow-up, do not silently skip — AGENTS.md §3).

DoD: tapping the share link/QR with the app installed opens the app, stores the code, and a
subsequent purchase is attributed.

### Phase C — LINE OA referral via LIFF (D1)

Flow: `https://mira.health/r/<code>?to=line` (or a dedicated LIFF URL) →
LIFF page → `liff.login()` → read `ref_code` + LINE `userId` → POST to a new edge endpoint
that binds the code to the customer keyed by `line_user_id`.

Backend additions (all additive):
1. New edge function `line-referral-bind` (verify LIFF ID token, resolve tenant, upsert
   `customers` by `(tenant_id, line_user_id)`, set `referred_by`/`referred_at` if not already
   referred — reuse the same guard logic as `maybeApplyReferralCode`).
2. Extend `orchestrateLine` signature to accept optional `ref_code` and thread it from the
   webhook (covers the case where the code arrives in-session). Additive param, schema
   already allows `channel: 'line'` + `ref_code` pattern.
3. LIFF config: document `LINE_LIFF_ID__<tenant_slug>` alongside existing
   `LINE_CHANNEL_SECRET__/TOKEN__<tenant_slug>` (see `docs/line-setup.md`).

Guardrails: `line-referral-bind` must verify the LIFF ID token (do not trust client-sent
`userId`). Reuse attribution window + "already referred" rules; never write `orders.status`
directly (use `transition_order` only inside existing order flow).

DoD: scanning a referral link that targets LINE, adding the OA, and purchasing in LINE chat
credits the referrer; `commission_entries` row appears on admin confirm.

### Phase D — sales-portal real wiring + mock retirement (D2)

- Refactor `app/sales-portal.tsx` to load the signed-in referrer from `referrers` (by
  `tenant_id` + `auth_user_id`) and call `referrer-order` (`create_order` → `payment_done`)
  exactly like `app/partner.tsx`. Reuse `partner.tsx` data-loading helpers where possible
  rather than duplicating.
- Replace the fixture commission dashboard with real `commission_entries` reads (or clearly
  gate fixtures behind a not-signed-in/demo fallback, matching `partner.tsx`).
- Retire `lib/marketplace/referralMock.ts` (or reduce it to pure formatting helpers that do
  not invent codes). The displayed `ref_code` must be the real 6-char DB value.
- Decide `app/staff-referral.tsx` (currently a redirect to `/sales-portal`): keep redirect
  or remove — confirm with owner in §6.

DoD: a code copied from sales-portal validates against `REF_CODE_PATTERN` and resolves to a
real referrer; submitting an assisted order creates a real DB order in the admin queue.

### Phase E — Verification & bookkeeping

- `npm run typecheck` and `npm run v2:verify` green.
- Add/extend tests: native attribution store unit test; `line-referral-bind` (token verify +
  attribution guard) in `_shared/__tests__`; orchestrateLine `ref_code` threading.
- Update the LINE manual sandbox checklist in `docs/line-setup.md` with a referral step.
- Update DoD checkboxes in `docs/miracare-v2-product-plan.md` §10 truthfully (note any item
  needing live LINE/native verification the agent could not run).

---

## 5. Protected-core guardrails for this work (AGENTS.md §2)

- Do **not** edit the published prompt, marker protocol, card-suppression guard, or order
  state machine. No new order statuses are needed.
- All schema changes ship as **new** migration files with RLS in the same file; never edit
  existing migrations.
- `ChatOrchestratorRequest`, order shape, and action schema changes must be additive and
  mirrored in `lib/types/api.ts` (CI enforces the mirror).
- No Thai sales/conversation lines added to the reply path; LINE referral copy (if any) is a
  templated system notice only, per §2 Conversation purity.
- Agent does not deploy functions, set Supabase secrets, or configure the LINE/LIFF console —
  those are owner steps; this plan documents them.

---

## 6. Open questions for owner (blockers before coding the relevant phase)

1. **LIFF URL shape (Phase C):** dedicated LIFF endpoint URL vs reusing `/r/[code]` with a
   `?to=line` branch? Need the LIFF app registered + `LINE_LIFF_ID__<slug>` provisioned.
2. **`readStoredReferralCode` async (Phase A):** OK to make it async (SecureStore is async)
   and update the two callers, or must it stay sync (use a cached in-memory value hydrated at
   app start)?
3. **`app/staff-referral.tsx` (Phase D):** keep the redirect, or remove the route entirely?
4. **Demo fallback:** should sales-portal keep a not-signed-in demo mode like `partner.tsx`,
   or require real auth always?

---

## 7. DoD checklist (fill ✅/❌ + date in the executing PR)

- [ ] A. Native attribution store persists + reads `ref_code`; web unchanged.
- [ ] B. `mirahealth://` unified; Universal/App Links open `/r/<code>`; cold-start handled.
- [ ] C. LIFF bind endpoint verifies token and credits referrer; LINE purchase attributed.
- [ ] D. sales-portal uses real referrer + `referrer-order`; mock code generator retired.
- [ ] E. typecheck + v2:verify green; tests added; v2 plan §10 + line-setup.md updated.
