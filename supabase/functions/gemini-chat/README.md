# gemini-chat Edge Function

Server-side Gemini proxy for the Mira Health mobile chatbot.

## Required Secrets

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
supabase secrets set GEMINI_MODEL=gemini-3.5-flash
```

Optional:

```bash
supabase secrets set GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

## Request

```json
{
  "model": "gemini-3.5-flash",
  "question": "How should I prepare for a checkup?",
  "messages": [],
  "ragContext": "Retrieved context"
}
```

## Response

```json
{
  "text": "Assistant answer",
  "model": "gemini-3.5-flash"
}
```
