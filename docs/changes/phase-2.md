# Phase 2 Chat Foundation

## What Changed

- Added the Phase 2 migration for canonical `chat_sessions` and `chat_messages`, including conflict handling for the older user-id chat tables and v2 RLS.
- Added shared edge modules for HTTP envelopes, zod request validation, service-role REST access, marker parsing, context building, OpenAI Responses calls, fact normalization/insertion, and chat orchestration.
- Added new `chat-orchestrator` and `fact-extractor` edge function entrypoints.
- Switched the app's Supabase chat path from `mira-chat` to `chat-orchestrator`.
- Added a typed function client in `lib/api/client.ts` and a shared React Query client/provider for cached reads and conservative retries.
- Added `components/chat/MessageBubble.tsx`, `ProductCarousel.tsx`, `OrderPanel.tsx`, and `ConsentSheet.tsx` for the v2 chat render surface.
- Wired the production chat screen to hydrate the latest Supabase `chat_messages` page, load older pages by cursor, pass the active `chat_sessions.id` back to `chat-orchestrator`, and keep optimistic appends while the backend responds.
- Wired `ConsentSheet` to the explicit `consent_granted` action and cached latest `health_data_collection` consent status.
- Styled `system_notice` messages distinctly from assistant bubbles.
- Tightened chat presentational components so `ProductCarousel` takes API-shaped `ChatProduct[]`, the chat screen adapts persisted product-grid cards at the container boundary, and the client audit rejects direct data access inside the chat render components.
- Added Deno unit tests for marker parsing, unknown marker key dropping/logging, fact normalization/rendering, recent-chat rendering, and personal-context rendering.
- Fixed the marker test assertion helper so object equality is structural instead of depending on property insertion order.
- Hardened fact extraction by making the `fact-extractor` endpoint service-role-only and adding tenant filters once the owning chat session is known.
- Tightened `scripts/chat-regression.mjs` to enforce the seven-case suite more mechanically: q2/q3 must ask exactly one question, recommendation cases must return seeded catalog IDs, emergency returns no products, and every reply must stay within three short sentences.
- Deleted the legacy `supabase/functions/mira-chat` module after routing the app to `chat-orchestrator`, per the spec replacement procedure.

## Verification

- `npm run typecheck` passed.
- `npm run chat:quality` passed and now asserts the customer chat screen does not read local `prompt_versions` or prompt editor paths.
- `npm run v2:client-audit` passed and now asserts API-typed `OrderPanel` / `ProductCarousel` props plus no direct fetch/Supabase/React Query reads inside presentational chat components.
- `npm run v2:edge-security-audit` passed and now asserts that `fact-extractor` remains service-role-only and that v2 edge entrypoints keep using the shared CORS/envelope helpers.
- `npm run chat:regression` reaches the expected missing-secrets failure locally because `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `TEST_SUPABASE_JWT` are not set. `scripts/seed-demo.mjs` can now attach the demo customer to an existing auth user via `DEMO_CUSTOMER_AUTH_USER_ID` so the provided `TEST_SUPABASE_JWT` can resolve to the seeded customer.
- `git diff --check` passed.
- `npx.cmd -y deno@2.8.2 test --allow-env --allow-net --import-map=supabase/functions/import_map.json supabase/functions/_shared/__tests__/` currently passes with 68 tests. Marker coverage includes the 8 spec cases, and fact normalizer coverage includes decimal kg parsing.

## Boundaries

- Reloaded history reconstructs text, system notices, and product carousels from persisted chat rows. Status-driven order-panel reload still needs seeded Phase 3 end-to-end proof with real orders.
- Live chat regression remains blocked until the seeded Supabase test project/JWT secrets are provided; this is logged in `docs/v2-open-questions.md`.
- The initial `fact-extractor` message lookup still needs an owner decision on tenant context because the spec-defined internal payload contains only `message_id`.
