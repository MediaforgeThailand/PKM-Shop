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
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
supabase secrets set GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

Optional:

```bash
supabase secrets set OPENAI_API_BASE_URL=https://api.openai.com/v1
supabase secrets set OPENAI_ALLOWED_MODELS=gpt-5.5
supabase secrets set GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
supabase secrets set RAG_VECTOR_MATCH_THRESHOLD=0.62
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

The function ignores client-supplied RAG context. It embeds the user question with Gemini embeddings, calls `match_rag_chunks` for vector search, falls back to keyword/taxonomy retrieval if vector search has no match or `GEMINI_API_KEY` is missing, loads the active `prompt_versions` row, adds the user nickname/addressing context, applies per-user rate limiting, and writes AI/RAG/API logs to Supabase.

Product RAG chunks are embedded by the sibling `rag-embed` Edge Function after `/hospital-portal` saves a product.

## Response

```json
{
  "text": "Assistant answer",
  "model": "gpt-5.5",
  "finishReason": "completed",
  "requestId": "client-or-generated-request-id",
  "contextAssessment": {
    "purpose": "health_package_recommendation",
    "score": 40,
    "level": "partial",
    "mode": "ask_context",
    "collectedSlots": ["อายุหรือช่วงอายุ"],
    "missingSlots": ["โรคประจำตัว ยา หรือประวัติแพ้"],
    "nextQuestion": "ขอเพิ่มอีกนิดค่ะ..."
  },
  "ragMatches": [],
  "promptVersion": {
    "id": "uuid",
    "versionKey": "mira-health-chatbot-v1"
  }
}
```
