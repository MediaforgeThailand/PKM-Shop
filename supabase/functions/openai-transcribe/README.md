# openai-transcribe Edge Function

Server-side OpenAI speech-to-text proxy for the Mira prototype voice button.

The mobile/web client records microphone audio, sends a base64 WebM clip to this function, and receives the transcript text. Keep the OpenAI key only in Supabase secrets.

## Required Secrets

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
supabase secrets set OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

For higher transcription quality, use:

```bash
supabase secrets set OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
```

## Deploy

For the public sales prototype, deploy without JWT verification so the unauthenticated prototype can use voice input:

```bash
supabase functions deploy openai-transcribe --no-verify-jwt
```

For production, prefer JWT verification and call the function only after the user is authenticated.

## Request

```json
{
  "audioBase64": "base64-webm-audio",
  "fileName": "mira-voice.webm",
  "mimeType": "audio/webm",
  "language": "th"
}
```

## Response

```json
{
  "text": "ข้อความที่ถอดจากเสียง",
  "model": "gpt-4o-mini-transcribe",
  "durationMs": 742
}
```
