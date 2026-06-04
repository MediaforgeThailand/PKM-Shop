# Supabase AI Connection Guide

This document is for AI agents and developers working on Mira Health. It explains how the app connects to Supabase, how the Gemini chatbot proxy is configured, and which secrets must never be exposed in mobile code.

## Current Architecture

```text
Expo mobile app
-> Supabase client
-> Supabase Edge Function: gemini-chat
-> Gemini API
```

The mobile app does not call Gemini directly. Gemini credentials stay in Supabase Edge Function secrets.

## Important Files

- Mobile Supabase client: `lib/supabase.ts`
- Gemini proxy client: `lib/ai/gemini.ts`
- Chatbot screen: `app/(tabs)/chatbot.tsx`
- Local RAG corpus: `lib/rag/healthKnowledge.ts`
- Optional Supabase RAG loader: `lib/rag/supabaseRag.ts`
- RAG migration: `supabase/migrations/20260604010000_chatbot_rag_schema.sql`
- Edge Function: `supabase/functions/gemini-chat/index.ts`
- Deploy helper: `scripts/deploy-gemini-chat.ps1`

## Required `.env.local`

Create `.env.local` in the project root. Do not commit it.

```env
EXPO_PUBLIC_SUPABASE_URL=https://xwixdxmemwcuoamcloty.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_BSadkmHjFnN1iJJbZKTRMA_39uRg_gn
EXPO_PUBLIC_GEMINI_MODEL=gemini-3.5-flash
EXPO_PUBLIC_AI_PROXY_URL=
SUPABASE_ACCESS_TOKEN=your_supabase_cli_access_token
```

Notes:

- `EXPO_PUBLIC_*` values are bundled into the mobile app. Only put public values there.
- `SUPABASE_ACCESS_TOKEN` is for the Supabase CLI deploy workflow only.
- Do not add `EXPO_PUBLIC_GEMINI_API_KEY`.
- Do not put Supabase service-role keys in Expo/mobile env files.

## Supabase Secrets

Set Gemini secrets in Supabase, not in the mobile app:

```bash
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here --project-ref your-project-ref
npx supabase secrets set GEMINI_MODEL=gemini-3.5-flash --project-ref your-project-ref
```

Optional:

```bash
npx supabase secrets set GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta --project-ref your-project-ref
```

## Deploy Edge Function

The helper script reads `SUPABASE_ACCESS_TOKEN` and `EXPO_PUBLIC_SUPABASE_URL` from `.env.local`, derives the project ref, and deploys `gemini-chat`.

```powershell
cd D:\Work\mira-health-app
.\scripts\deploy-gemini-chat.ps1
```

Current prototype behavior:

- The function is deployed with `--no-verify-jwt`.
- This is acceptable for prototype testing because the app does not have Supabase Auth yet.
- Before production, add Supabase Auth, remove `--no-verify-jwt`, require user JWTs, and add rate limiting.

## Apply Database Migrations

Apply these migrations to the Supabase project:

- `supabase/migrations/20260604000000_initial_health_schema.sql`
- `supabase/migrations/20260604010000_chatbot_rag_schema.sql`

Safe options:

1. Use Supabase Dashboard SQL Editor and paste the migration SQL.
2. Use Supabase CLI if the project is linked and database access is configured.

The RAG migration creates `public.rag_chunks` and seeds initial approved-style placeholder chunks. Real medical content still needs source governance and medical review.

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
$body = @{
  model = $vars['EXPO_PUBLIC_GEMINI_MODEL']
  question = 'จ่ายเงินค่าตรวจสุขภาพแล้วต้องทำยังไงต่อ'
  messages = @()
  ragContext = '[1] Booking after app payment: call hospital call center with order number.'
} | ConvertTo-Json -Depth 5

$res = Invoke-WebRequest `
  -Method Post `
  -Uri $uri `
  -Headers @{ Authorization = "Bearer $anon"; apikey = $anon; 'Content-Type' = 'application/json' } `
  -Body $body `
  -TimeoutSec 90 `
  -SkipHttpErrorCheck

$res.StatusCode
$res.Content
```

Expected result:

- `200`
- JSON body with `text` and `model`

Common errors:

- `404`: function is not deployed to that Supabase project.
- `401 UNAUTHORIZED_INVALID_JWT_FORMAT`: function was deployed with JWT verification enabled, but the app is sending a publishable key instead of a user JWT.
- `500 Missing GEMINI_API_KEY`: Gemini secret is not set on the Edge Function.

## How The App Chooses AI Backend

`lib/ai/gemini.ts` follows this order:

1. If `EXPO_PUBLIC_AI_PROXY_URL` is set, call that external proxy.
2. Otherwise, if Supabase public config exists, call `supabase.functions.invoke('gemini-chat')`.
3. If neither exists, show local RAG preview only.

## Security Rules For AI Agents

- Never print `.env.local` values.
- Never add `EXPO_PUBLIC_GEMINI_API_KEY`.
- Never place `GEMINI_API_KEY`, Supabase service-role key, or `SUPABASE_ACCESS_TOKEN` in committed files.
- Do not use service-role keys in Expo or React Native code.
- For production, require Supabase Auth JWT on `gemini-chat`.
- Add rate limiting before public launch.
- Log which RAG chunks were used, but do not log full personal health data.

## RAG Notes

The app currently uses local fallback RAG chunks and optionally loads active `rag_chunks` from Supabase.

Before using real medical content:

- Use only whitelisted sources.
- Store `source_url`, `reviewer`, `last_reviewed_at`, `expires_at`, and `risk_level`.
- Have a qualified medical reviewer approve chunks before activation.
- Keep emergency escalation rules in system policy, not only in RAG content.

See `docs/rag-source-plan.md` for recommended source strategy.
