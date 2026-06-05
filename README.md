# Mira Health

Mobile-first health app scaffold built with Expo, React Native, TypeScript, Expo Router, and Supabase.

## Quick Start

```bash
npm install
copy .env.example .env
npm run start
```

Fill `.env` with the Supabase project URL and publishable key.

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

## Development

```bash
npm run android
npm run ios
npm run web
npm run typecheck
```

Use Expo Go for fast previews. Use EAS Build later when the app needs store-ready Android and iOS builds, custom native modules, push notifications, or team distribution.

## OpenAI Chatbot + RAG

The Chatbot tab is wired for GPT-5.5 and retrieval-augmented generation through the `gemini-chat` Supabase Edge Function. The function name is legacy, but the runtime now calls OpenAI. The OpenAI API key stays on the backend as a function secret.

1. Copy the env template.

```bash
copy .env.example .env
```

2. Add the public mobile config.

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
EXPO_PUBLIC_OPENAI_MODEL=gpt-5.5
```

3. Store the OpenAI key as a Supabase Edge Function secret.

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
supabase secrets set OPENAI_CHAT_MODEL=gpt-5.5
supabase secrets set OPENAI_MAX_OUTPUT_TOKENS=450
```

4. Deploy the Edge Function.

```bash
supabase functions deploy gemini-chat
```

On Windows, you can also run the helper script. It reads `SUPABASE_ACCESS_TOKEN` from your shell or `.env.local` and derives the project ref from `EXPO_PUBLIC_SUPABASE_URL`.

```powershell
.\scripts\deploy-gemini-chat.ps1
```

`SUPABASE_ACCESS_TOKEN` is the Supabase account access token used by the CLI to deploy functions. It is different from `OPENAI_API_KEY`, which is the Edge Function secret used at runtime.

The helper deploys `gemini-chat` with JWT verification enabled. Users must sign in through Supabase Auth before the mobile app can call OpenAI or save chat-derived health facts.

For local function testing:

```bash
supabase functions serve gemini-chat --env-file .env.local
```

5. Restart Expo.

```bash
npm run start
```

The app retrieves context from `lib/rag/healthKnowledge.ts` by default. If Supabase is configured and the RAG migrations have been applied, it loads approved active rows from `public.rag_chunks` first and falls back to the local corpus if the database is unavailable.

For source governance and recommended medical RAG sources, see `docs/rag-source-plan.md`.

For AI agents or developers connecting Supabase, Edge Functions, secrets, and RAG, see `docs/supabase-ai-connection.md`.

For chat-derived personal health data, consent, health facts, and audit tables, see `docs/patient-health-data-vault.md`.

For custom hosting, set `EXPO_PUBLIC_AI_PROXY_URL` to your backend endpoint. If it is empty, the app calls `supabase.functions.invoke('gemini-chat')`.

Do not ship an OpenAI API key directly inside a mobile app. Expo public env values are bundled into the app, so the OpenAI key must stay in the Edge Function secret or your own backend secret store.

Expected proxy request shape:

```json
{
  "model": "gpt-5.5",
  "question": "User question",
  "messages": [],
  "ragContext": "Retrieved context"
}
```

Expected proxy response shape:

```json
{
  "text": "Assistant answer"
}
```

## Stack Decision

- Expo + React Native keeps one TypeScript codebase for iOS and Android.
- Expo Router gives file-based navigation similar to web routing.
- Supabase covers Postgres, Auth, Storage, Edge Functions, Realtime, and RLS.
- `expo-secure-store` is used for persisted mobile auth sessions.

## Supabase

The first migration lives in `supabase/migrations/20260604000000_initial_health_schema.sql` and creates:

- `profiles`
- `health_logs`
- Row Level Security policies so authenticated users can only access their own records.

The chatbot RAG migration lives in `supabase/migrations/20260604010000_chatbot_rag_schema.sql` and creates:

- `rag_chunks`
- a first read policy for active public RAG chunks
- seed content for checkup preparation, booking, medical safety, privacy, and referral handling

The RAG governance migration lives in `supabase/migrations/20260604020000_rag_governance_taxonomy.sql` and adds:

- dotted categories such as `ops.booking`, `ops.referral`, `safety.escalation`, and `privacy.consent`
- `summary`, `topic`, `risk_level`, `review_status`, `source_url`, `token_budget`, and `priority`
- a stricter read policy that exposes only approved active chunks

The patient health data vault migration lives in `supabase/migrations/20260604030000_patient_health_data_vault.sql` and adds:

- `consents`
- `chat_sessions`
- `chat_messages`
- `health_facts`
- `health_fact_sources`
- `hospital_access_grants`
- `data_access_logs`

Chat-derived health facts are stored only after user review and consent. They must not be inserted into the RAG corpus.

The app includes an email/password Supabase Auth MVP on the index screen. Authenticated users can manage confirmed health facts, revoke health-memory consent, export a JSON snapshot, and sign out from `user-profile`.

Do not put Supabase secret keys in the app. Mobile apps can safely include publishable keys only when RLS is correctly enabled.

## Health Data Notes

Before storing real health information, decide:

- consent flow and privacy policy
- data retention and deletion rules
- audit logging needs
- backup and recovery policy
- whether the product handles PHI/ePHI and needs HIPAA controls, BAA, and high-compliance Supabase configuration

## Repository Status

This repository is initialized for a new team project. Create remote hosting on GitHub/GitLab/Bitbucket, then push:

```bash
git remote add origin <repo-url>
git push -u origin main
```
