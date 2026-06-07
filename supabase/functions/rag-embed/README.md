# rag-embed Edge Function

Embeds a generated `marketplace.product` RAG chunk after the hospital portal saves a product.

Deploy with Supabase JWT verification enabled. The caller must be an authenticated Supabase user because the function updates `rag_chunks` through RLS-protected RPC.

## Required Secrets

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
```

Optional:

```bash
supabase secrets set GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
supabase secrets set GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

The function stores 768-dimension vectors in `rag_chunks.embedding`. Changing model or dimensions requires a database migration and re-embedding existing rows.

## Request

```json
{
  "chunkId": "hospital-product-..."
}
```

## Response

```json
{
  "status": "embedded",
  "chunkId": "hospital-product-...",
  "model": "gemini-embedding-001",
  "dimensions": 768
}
```
