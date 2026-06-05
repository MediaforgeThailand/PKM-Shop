# Chatbot Production Hardening

This note documents the production-oriented chatbot controls added around OpenAI, RAG, prompt governance, logs, and health memory.

## Runtime Flow

```text
Expo app
-> Supabase Auth session
-> gemini-chat Edge Function
-> approved active rag_chunks
-> active prompt_versions row
-> OpenAI Responses API
-> persistent ai/rag/api logs
-> app chat UI
```

The app must not send full RAG context from mobile code. In Supabase mode it sends only the user question, short chat history, model hint, and an optional admin-only prompt override. The Edge Function owns retrieval and prompt assembly.

## Production Tables

- `app_user_roles`: app-level role gate for `admin`, `hospital_staff`, and `user`.
- `prompt_versions`: versioned system prompts. The Edge Function uses the newest active prompt.
- `ai_request_logs`: persistent model request lifecycle logs.
- `rag_retrieval_logs`: persistent retrieval logs with matched chunk ids and categories.
- `api_process_logs`: persistent Edge Function process logs.
- `health_memory_logs`: persistent personal health memory extraction/save/delete/export/revoke logs.
- `chat_eval_cases`: seeded evaluation cases for prompt/RAG regression tests.
- `ai_rate_limits`: per-user minute buckets used by `increment_ai_rate_limit`.

## Admin Prompt Editing

Only users with admin role in JWT metadata or `app_user_roles` should see the prompt editor. Saving from the app archives existing active prompt rows and inserts a new active `prompt_versions` row.

## Health Memory

Chat-derived personal health facts are stored in the patient health data vault, not in RAG. The current prototype auto-creates `chat_health_memory` consent during authenticated auto-save so the UX stays silent. Before store launch, replace silent consent with an explicit PDPA-ready consent screen and retention controls.

## Verification Checklist

- Run database migrations including `20260605000000_chatbot_production_hardening.sql`.
- Deploy `gemini-chat` with JWT verification enabled.
- Confirm publishable-key-only calls return `401`.
- Confirm an authenticated call returns `text`, `requestId`, and `ragMatches`.
- Confirm log rows are written to `ai_request_logs`, `rag_retrieval_logs`, and `api_process_logs`.
- Confirm health fact auto-save writes `health_facts`, `health_fact_sources`, `data_access_logs`, and `health_memory_logs`.
- Run `npm run typecheck`, `npm audit --audit-level=moderate`, and a browser smoke test at `/chatbot`.
