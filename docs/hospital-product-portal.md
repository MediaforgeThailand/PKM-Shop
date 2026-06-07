# Hospital Product Portal

This prototype separates the patient mobile app from a hospital-facing portal at `/hospital-portal`.

Related screens:

- `/hospital-portal`: add a hospital product, analyze its description, and publish a product RAG chunk.
- `/hospital-products`: manage the product inventory, search/filter products, archive or restore product visibility, and keep the linked RAG chunk in sync.
- `rag-embed` Edge Function: creates a Gemini vector embedding for the generated product RAG chunk without exposing the Gemini key to the app.

## Test Flow

```text
Hospital nurse/staff logs in
-> opens /hospital-portal
-> selects/searches hospital from the hospital directory
-> verifies hospital address and Google Map preview
-> adds product name, price, description, and optional product image
-> description analyzer extracts product category, keywords, included items, preparation notes, booking guidance, and RAG sections
-> hospital_products row is saved
-> marketplace.product RAG chunk is created in rag_chunks
-> rag-embed generates a 768-dimension Gemini embedding for the RAG chunk
-> opens /hospital-products to verify product status and RAG status
-> archives/restores products when they should be hidden or re-enabled
-> mobile package catalog can read the product
-> chatbot can retrieve the product RAG chunk by vector search, with keyword fallback
```

## Tables

- `hospital_products`: hospital-provided products/packages for the marketplace.
- `rag_chunks`: receives an auto-generated `marketplace.product` chunk for chatbot retrieval.

Migrations:

- `supabase/migrations/20260605010000_hospital_product_portal.sql`
- `supabase/migrations/20260605011000_hospital_product_location_fields.sql`
- `supabase/migrations/20260605012000_hospital_product_management_policies.sql`
- `supabase/migrations/20260605013000_rag_vector_embeddings.sql`

The current portal stores hospital name, address, map query, and optional coordinates separately from product details. Product duration, includes, tags, preparation notes, and booking guidance are not entered as separate fields in the portal. They are inferred from `description` for the prototype so nurses can enter the main product content in one place.

The management page uses `loadManagedHospitalProducts` to read active public products plus creator/admin-owned managed products. `Archive` updates `hospital_products.status` to `archived` and pauses the linked RAG chunk with `is_active = false` and `review_status = archived`. `Restore` sets the product back to `active` and republishes the linked RAG chunk as `approved`.

Vector search uses `pgvector` on `rag_chunks.embedding`. New product chunks call the `rag-embed` Edge Function after publish. The chatbot Edge Function embeds each user question with the same Gemini embedding model and calls `match_rag_chunks`; if no vector match is available, it falls back to the previous keyword/taxonomy retriever.

## Prototype Safety

The current prototype publishes product RAG as `approved` and `active` so the chatbot can recognize new products immediately during testing.

Before production, change this to a review workflow:

- operational fields such as price, duration, booking note can publish faster
- medical preparation notes should require hospital/medical reviewer approval
- expired products should archive or expire their RAG chunks
- hospital staff permissions should be scoped to their own hospital, not any authenticated user
