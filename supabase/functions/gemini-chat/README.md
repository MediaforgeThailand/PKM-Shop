# gemini-chat Edge Function

Server-side Gemini proxy for the Mira Health mobile chatbot.

Deploy with Supabase JWT verification enabled. The mobile app must call this function with an authenticated user's access token, not only the publishable key.

## Required Secrets

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
supabase secrets set GEMINI_MODEL=gemini-3.5-flash
supabase secrets set GEMINI_MAX_OUTPUT_TOKENS=1800
supabase secrets set GEMINI_RATE_LIMIT_PER_MINUTE=30
```

Optional:

```bash
supabase secrets set GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
supabase secrets set GEMINI_ALLOWED_MODELS=gemini-3.5-flash
```

## Request

Headers:

```text
Authorization: Bearer <supabase-user-access-token>
apikey: <supabase-publishable-key>
```

```json
{
  "model": "gemini-3.5-flash",
  "question": "How should I prepare for a checkup?",
  "messages": [],
  "systemPromptOverride": "Optional admin-only prompt override"
}
```

The function ignores client-supplied RAG context. It retrieves approved active `rag_chunks` on the backend, loads the active `prompt_versions` row, applies per-user rate limiting, and writes AI/RAG/API logs to Supabase.

## Response

```json
{
  "text": "Assistant answer",
  "model": "gemini-3.5-flash",
  "finishReason": "STOP",
  "requestId": "client-or-generated-request-id",
  "ragMatches": [],
  "promptVersion": {
    "id": "uuid",
    "versionKey": "mira-health-chatbot-v1"
  }
}
```
