# gemini-chat Edge Function

Server-side OpenAI proxy for the Mira Health mobile chatbot. The function name is legacy so existing mobile clients can keep calling `gemini-chat`.

Deploy with Supabase JWT verification enabled. The mobile app must call this function with an authenticated user's access token, not only the publishable key.

## Required Secrets

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
supabase secrets set OPENAI_CHAT_MODEL=gpt-5.5
supabase secrets set OPENAI_MAX_OUTPUT_TOKENS=450
supabase secrets set OPENAI_RATE_LIMIT_PER_MINUTE=30
supabase secrets set DEFAULT_USER_NICKNAME=บอส
```

Optional:

```bash
supabase secrets set OPENAI_API_BASE_URL=https://api.openai.com/v1
supabase secrets set OPENAI_ALLOWED_MODELS=gpt-5.5
```

## Request

Headers:

```text
Authorization: Bearer <supabase-user-access-token>
apikey: <supabase-publishable-key>
```

```json
{
  "model": "gpt-5.5",
  "question": "How should I prepare for a checkup?",
  "messages": [],
  "userNickname": "บอส",
  "systemPromptOverride": "Optional admin-only prompt override"
}
```

The function ignores client-supplied RAG context. It retrieves approved active `rag_chunks` on the backend, loads the active `prompt_versions` row, adds the user nickname/addressing context, applies per-user rate limiting, and writes AI/RAG/API logs to Supabase.

## Response

```json
{
  "text": "Assistant answer",
  "model": "gpt-5.5",
  "finishReason": "completed",
  "requestId": "client-or-generated-request-id",
  "ragMatches": [],
  "promptVersion": {
    "id": "uuid",
    "versionKey": "mira-health-chatbot-v1"
  }
}
```
