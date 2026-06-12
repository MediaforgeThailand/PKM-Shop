# Codex Long-Run Goals — Showcase + v3 Commerce (approved 2026-06-12)

This file is the driver for ONE long autonomous run. Work the goals strictly in order.
The two plan documents remain the source of truth for HOW; this file defines WHAT, in WHAT ORDER, and WHEN you may proceed without asking:

- `docs/miracare-showcase-frontend-plan.md` (front-end showcase, phases S0–S3)
- `docs/miracare-v3-chat-commerce-plan.md` (in-chat commerce, phases V3-1–V3-2; V3-0 already merged in PR #1)
- `docs/miracare-codex-handoff.md` (model contract — PRIME DIRECTIVE applies throughout)

## Autonomy rules for this run

- **All previously open questions are DECIDED** (§10 of the showcase plan, §11 of the v3 plan — both marked "DECIDED 2026-06-12"). Do not stop to re-ask them.
- You may proceed goal → goal WITHOUT asking as long as every gate below is green.
- You MUST STOP and report (do not improvise) only when:
  1. A gate cannot be made green without violating a hard rule.
  2. You believe a migration needs to be non-additive, or a status-machine change beyond the v3 spec.
  3. Anything touches the OpenAI prompt content, the prompt default version, or `docs/miracare-codex-handoff.md` — those are owner actions (V3-3 is intentionally OUTSIDE this run).
  4. Secrets/credentials are required that are not already configured.
- One PR per goal, branch naming `codex/<goal-id>-<slug>`. Update the DoD checkboxes (✅/❌ + date) in the relevant plan file in the same PR.
- After each goal: post a short summary (what changed, gate evidence) in the PR description, merge ONLY if CI is green, then continue to the next goal.
- `live-regression` CI is known to be occasionally flaky on the sentence-count style assertion (live LLM variance). If it fails there, re-run the job once before investigating. While touching `scripts/chat-regression.mjs` for Goal G6, add a single retry for style-only assertions (sentence count) — contract assertions (markers, prices, emergency, products) must still fail immediately.

## Universal gates (every goal)

- `npm run typecheck` green
- `npm run v2:verify` green
- No new ESLint/console errors on touched screens
- Migrations (if any) additive only

## Goals in order

### G1 — Showcase S0: registry, route-audit gate, dead-route cleanup
Per showcase plan §3 + §9 S0 (registry.ts, `scripts/showcase-route-audit.mjs` + `npm run showcase:route-audit` wired into `v2:verify`, delete `(tabs)/home|packages|agent`, `/modal`, `/ai-body-overview`→redirect, `/checkout` excluded-but-kept).
Gate: route audit passes; PR description proves it fails on (a) registry entry → missing route, (b) unregistered real route.

### G2 — Showcase S1: Netflix home + module tour pages
Per showcase plan §4 + §5. Branded-gradient fallback posters (decision §10.2); Thai-first copy; demo scripts per module; status + auth badges; `?tour=` param on opens.
Gate: 2×2 ≥760px / 1-col mobile; badges driven by registry only; no hand-written page lists anywhere.

### G3 — Showcase S2: five mockup pages
Per showcase plan §6: `/orders`, `/admin/branches`, `/admin/dashboard`, `/health/lab-upload`, `/showcase/line-preview`. `[V3-COORD]`: `/orders` and `/admin/branches` layouts must match the v3 plan specs exactly (they get wired in G5/G6).
Gate: all five render logged-out, zero network errors; typed fixtures; MockupRibbon; `/order-status` → redirect to `/orders`; route audit green.

### G4 — Showcase S3: tour ergonomics
Per showcase plan §7: TourPill, registry-driven `/more`, copy-URL, env-gated demo sign-in (decision §10.3: approved).
Gate: pill renders only with `?tour=`; demo sign-in absent when `EXPO_PUBLIC_DEMO_LOGIN` unset.

### G5 — v3 V3-1: data & admin (branches, categories, order columns, selecting_branch)
Per v3 plan §3 + §8 V3-1. Wire `/admin/branches` mockup from G3 into real CRUD. Seed categories per decision §11.1 (`checkup`/`vaccine`).
Gate: RLS checks extended and green; `orders_test.ts` rejects illegal `selecting_branch` transitions; admin CRUD works; booking modal writes valid `booking_at`.

### G6 — v3 V3-2: chat commerce UX (app/PWA)
Per v3 plan §4 + §5 + §8 V3-2. Wire `/orders` mockup from G3 into the real account screen. Age→user_facts per decision §11.3 (consent-gated). QR-only payment (Stripe behind tenant flag). Buyer-info collection via BookingSheet.
Gate: extended `scripts/e2e-commerce.mjs` passes the full branch→form→QR→paid→confirm→book→tracking flow; single-branch skip works; regression suite v3 green against prompt version 3 via `MIRA_PROMPT_VERSION` env pin (do NOT touch the platform default).

### End of run
Stop after G6. Post a final report: per-goal status, gate evidence, and the exact checklist the owner needs for V3-3 (flip prompt default → re-run suite → update handoff doc → remove env pin). Do not start V3-3 or V3-4.
