# Supabase AI Connection Guide

This document is for AI agents and developers working on Mira Health. It explains how the app connects to Supabase, how the OpenAI chatbot proxy is configured, and which secrets must never be exposed in mobile code.

## Current Architecture

```text
Expo mobile app
-> Supabase client
-> Supabase Edge Function: gemini-chat
-> approved Supabase RAG corpus + active prompt version + persistent logs
-> OpenAI Responses API
```

The mobile app does not call OpenAI directly and no longer sends client-built RAG context to the model. OpenAI credentials, RAG retrieval, active system prompt selection, rate limiting, and AI/RAG/API process logs stay inside Supabase Edge Function and database infrastructure.

## Important Files

- Mobile Supabase client: `lib/supabase.ts`
- OpenAI proxy client: `lib/ai/gemini.ts`
- Chatbot screen: `app/(tabs)/chatbot.tsx`
- Local RAG corpus: `lib/rag/healthKnowledge.ts`
- Optional Supabase RAG loader: `lib/rag/supabaseRag.ts`
- RAG migration: `supabase/migrations/20260604010000_chatbot_rag_schema.sql`
- RAG governance migration: `supabase/migrations/20260604020000_rag_governance_taxonomy.sql`
- Patient health data vault migration: `supabase/migrations/20260604030000_patient_health_data_vault.sql`
- Chatbot production hardening migration: `supabase/migrations/20260605000000_chatbot_production_hardening.sql`
- Hospital product portal migrations:
  - `supabase/migrations/20260605010000_hospital_product_portal.sql`
  - `supabase/migrations/20260605011000_hospital_product_location_fields.sql`
  - `supabase/migrations/20260605012000_hospital_product_management_policies.sql`
- RAG vector embedding migration: `supabase/migrations/20260605013000_rag_vector_embeddings.sql`
- Edge Function: `supabase/functions/gemini-chat/index.ts`
- RAG embedding Edge Function: `supabase/functions/rag-embed/index.ts`
- Deploy helper: `scripts/deploy-gemini-chat.ps1`

## Required `.env.local`

Create `.env.local` in the project root. Do not commit it.

```env
EXPO_PUBLIC_SUPABASE_URL=https://xwixdxmemwcuoamcloty.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_BSadkmHjFnN1iJJbZKTRMA_39uRg_gn
EXPO_PUBLIC_OPENAI_MODEL=gpt-5.5
EXPO_PUBLIC_USER_NICKNAME=บอส
EXPO_PUBLIC_AI_PROXY_URL=
SUPABASE_ACCESS_TOKEN=your_supabase_cli_access_token
```

Notes:

- `EXPO_PUBLIC_*` values are bundled into the mobile app. Only put public values there.
- `SUPABASE_ACCESS_TOKEN` is for the Supabase CLI deploy workflow only.
- Do not add `EXPO_PUBLIC_OPENAI_API_KEY`.
- Do not put Supabase service-role keys in Expo/mobile env files.

## Supabase Secrets

Set OpenAI secrets in Supabase, not in the mobile app:

```bash
npx supabase secrets set OPENAI_API_KEY=your_openai_api_key_here --project-ref your-project-ref
npx supabase secrets set OPENAI_CHAT_MODEL=gpt-5.5 --project-ref your-project-ref
npx supabase secrets set OPENAI_MAX_OUTPUT_TOKENS=450 --project-ref your-project-ref
npx supabase secrets set OPENAI_RATE_LIMIT_PER_MINUTE=30 --project-ref your-project-ref
npx supabase secrets set DEFAULT_USER_NICKNAME=บอส --project-ref your-project-ref
```

Optional:

```bash
npx supabase secrets set OPENAI_API_BASE_URL=https://api.openai.com/v1 --project-ref your-project-ref
npx supabase secrets set OPENAI_ALLOWED_MODELS=gpt-5.5 --project-ref your-project-ref
```

## Deploy Edge Function

The helper script reads `SUPABASE_ACCESS_TOKEN` and `EXPO_PUBLIC_SUPABASE_URL` from `.env.local`, derives the project ref, and deploys `gemini-chat`.

```powershell
cd D:\Work\mira-health-app
.\scripts\deploy-gemini-chat.ps1
```

Current behavior:

- The function is deployed with JWT verification enabled.
- The app must have a Supabase Auth session before calling `gemini-chat`.
- Backend RAG retrieves only approved active `rag_chunks`.
- Active prompt text comes from `prompt_versions`; only admins can manage prompt versions.
- The app sends `userNickname` so the active prompt can address the user as `คุณบอส` by default.
- Per-user rate limiting is handled by `increment_ai_rate_limit`.
- AI, RAG, and API process events are written to persistent log tables.

## Apply Database Migrations

Apply these migrations to the Supabase project:

- `supabase/migrations/20260604000000_initial_health_schema.sql`
- `supabase/migrations/20260604010000_chatbot_rag_schema.sql`
- `supabase/migrations/20260604020000_rag_governance_taxonomy.sql`
- `supabase/migrations/20260604030000_patient_health_data_vault.sql`
- `supabase/migrations/20260604040000_health_fact_autosave_triggers.sql`
- `supabase/migrations/20260604050000_blood_test_and_health_risk_rag.sql`
- `supabase/migrations/20260605000000_chatbot_production_hardening.sql`
- `supabase/migrations/20260605010000_hospital_product_portal.sql`
- `supabase/migrations/20260605011000_hospital_product_location_fields.sql`
- `supabase/migrations/20260605012000_hospital_product_management_policies.sql`
- `supabase/migrations/20260605013000_rag_vector_embeddings.sql`
- `supabase/migrations/20260605070000_clean_mobile_chat_prompt.sql`
- `supabase/migrations/20260605080000_human_mobile_chat_prompt.sql`
- `supabase/migrations/20260605090000_clinical_advisor_chat_prompt.sql`
- `supabase/migrations/20260605100000_user_nickname_chat_prompt.sql`

Safe options:

1. Use Supabase Dashboard SQL Editor and paste the migration SQL.
2. Use Supabase CLI if the project is linked and database access is configured.

The first RAG migration creates `public.rag_chunks`. The governance migration adds taxonomy, review status, risk level, source metadata, token budgets, priorities, and a policy that exposes only `is_active = true` plus `review_status = approved` rows. Real medical content still needs source governance and medical review.

The patient health data vault migration creates consent, chat history, health fact, hospital grant, and audit tables. Chat-derived personal health data belongs there, not in `rag_chunks`.

The production hardening migration creates `app_user_roles`, `prompt_versions`, `ai_request_logs`, `rag_retrieval_logs`, `api_process_logs`, `health_memory_logs`, `chat_eval_cases`, `ai_rate_limits`, and the `increment_ai_rate_limit` RPC.

The user nickname prompt migration archives older active chatbot prompts and activates `mira-health-chatbot-v5-user-nickname`, which addresses the default user as `คุณบอส` and avoids self-references like AI, chatbot, Mira, or doctor in normal answers.

The hospital product portal migrations create `hospital_products`, add hospital address/map/image fields, allow `marketplace.product` RAG chunks, and add scoped RLS policies for authenticated staff to submit product RAG for review, approve/reject product RAG, retry embeddings, and read their managed product queue from `/hospital-products`.

The vector embedding migration enables `pgvector`, adds `rag_chunks.embedding`, and creates:

- `match_rag_chunks`: vector search RPC used by `gemini-chat`.
- `update_rag_chunk_embedding`: authenticated RPC used by `rag-embed` after product RAG approval.

`rag-embed` and vector retrieval use the Supabase Edge Function secret `GEMINI_API_KEY` plus optional `GEMINI_EMBEDDING_MODEL` defaulting to `gemini-embedding-001`. Chat answers still use OpenAI Responses API. Embeddings store 768-dimension vectors, so any model/dimension change requires a coordinated DB migration and re-embedding.

## Verify Function Endpoint

Use a short test request. Do not print secrets.

```powershell
$vars = @{}
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    $vars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}

$uri = $vars['EXPO_PUBLIC_SUPABASE_URL'].TrimEnd('/') + '/functions/v1/gemini-chat'
$anon = $vars['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
$userJwt = 'paste_authenticated_user_access_token_here'
$body = @{
  model = $vars['EXPO_PUBLIC_OPENAI_MODEL']
  userNickname = $vars['EXPO_PUBLIC_USER_NICKNAME']
  question = 'จ่ายเงินค่าตรวจสุขภาพแล้วต้องทำยังไงต่อ'
  messages = @()
} | ConvertTo-Json -Depth 5

$res = Invoke-WebRequest `
  -Method Post `
  -Uri $uri `
  -Headers @{ Authorization = "Bearer $userJwt"; apikey = $anon; 'Content-Type' = 'application/json' } `
  -Body $body `
  -TimeoutSec 90 `
  -SkipHttpErrorCheck

$res.StatusCode
$res.Content
```

Expected result:

- `200`
- JSON body with `text`, `model`, `requestId`, and `ragMatches`

Common errors:

- `404`: function is not deployed to that Supabase project.
- `401 UNAUTHORIZED_INVALID_JWT_FORMAT` or `Missing authenticated user JWT`: the caller is sending a publishable key or missing user JWT instead of an authenticated user's access token.
- `500 Missing OPENAI_API_KEY`: OpenAI secret is not set on the Edge Function.

## How The App Chooses AI Backend

`lib/ai/gemini.ts` follows this order:

1. If `EXPO_PUBLIC_AI_PROXY_URL` is set, call that external proxy.
2. Otherwise, if Supabase public config exists, call `supabase.functions.invoke('gemini-chat')`.
3. If neither exists, show local RAG preview only.

For the Supabase path, the mobile app sends the authenticated question and short chat history only. The Edge Function retrieves RAG context, loads the active prompt, calls OpenAI, and returns public source metadata.

## Security Rules For AI Agents

- Never print `.env.local` values.
- Never add `EXPO_PUBLIC_OPENAI_API_KEY`.
- Never place `OPENAI_API_KEY`, Supabase service-role key, or `SUPABASE_ACCESS_TOKEN` in committed files.
- Do not use service-role keys in Expo or React Native code.
- Keep Supabase Auth JWT required on `gemini-chat`.
- Keep rate limiting enabled before public launch.
- Log which RAG chunks were used, but do not log full personal health data.

## RAG Notes

The app still keeps local fallback RAG chunks for offline preview. In normal Supabase mode, the Edge Function loads approved active `rag_chunks`, routes by taxonomy, then sends compact `summary` context to OpenAI.

Before using real medical content:

- Use only whitelisted sources.
- Store `source_url`, `reviewer`, `last_reviewed_at`, `expires_at`, and `risk_level`.
- Have a qualified medical reviewer approve chunks before activation.
- Use the dotted taxonomy in `docs/rag-source-plan.md` so unrelated chunks are not sent to the model.
- Keep `summary` short and set `token_budget` per chunk.
- Keep emergency escalation rules in system policy, not only in RAG content.
- Product RAG from `/hospital-portal` is for marketplace/package awareness. Product RAG now starts in a review queue; reviewer approval is required before the chunk becomes active or embedded.

See `docs/rag-source-plan.md` for recommended source strategy.
See `docs/patient-health-data-vault.md` for user-specific health memory, consent, and audit rules.
See `docs/hospital-product-portal.md` for the portal product-to-RAG prototype flow.
