# mira-chat Edge Function

Server-side OpenAI chat orchestrator for the Mira Health mobile chatbot. Chat answers are generated through the published MiraCare prompt in OpenAI Platform. The Edge Function supplies prompt variables, calls the Responses API with `store: false`, strips product markers, resolves product cards, and writes AI/API logs to Supabase.

Deploy with Supabase JWT verification enabled. The mobile app must call this function with an authenticated user's access token, not only the publishable key.

## Required Secrets

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
supabase secrets set OPENAI_RATE_LIMIT_PER_MINUTE=30
supabase secrets set MIRACARE_BRAND_NAME="MiraCare"
```

Optional:

```bash
supabase secrets set OPENAI_API_BASE_URL=https://api.openai.com/v1
supabase secrets set OPENAI_CHAT_MODEL=gpt-5.5
supabase secrets set OPENAI_CHAT_PROMPT_ID=pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021
supabase secrets set OPENAI_CHAT_PROMPT_VERSION=2
supabase secrets set DEFAULT_USER_NICKNAME=ลูกค้า
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
supabase secrets set GEMINI_EMBEDDING_MODEL=gemini-embedding-001
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
  "question": "How should I prepare for a checkup?",
  "messages": [],
  "userNickname": "ลูกค้า"
}
```

The function ignores client-supplied RAG context and runtime prompt overrides. It fetches confirmed personal context, recent chat, and up to 50 active hospital products, then calls OpenAI Responses API with the published prompt `pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021` version `2`.

If the assistant ends with `[[products: id1, id2]]`, the function strips that marker from `text`, resolves known IDs against the active hospital product catalog, and returns a `product_grid` card. Unknown IDs are logged and ignored.

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
    "id": "pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021",
    "versionKey": "platform-v2"
  }
}
```
