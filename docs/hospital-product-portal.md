# Hospital Product Portal

This flow separates the patient mobile app from a hospital-facing product and RAG review portal at `/hospital-portal`.

Related screens:

- `/hospital-portal`: add a hospital product, analyze its description, upload the product image, and submit the generated product RAG draft for review.
- `/hospital-products`: manage the product inventory, approve/reject product RAG, retry embeddings, archive or restore product visibility, and keep the linked RAG chunk in sync.
- `rag-embed` Edge Function: creates a Gemini vector embedding for the generated product RAG chunk without exposing the Gemini key to the app.

## Test Flow

```text
Hospital nurse/staff logs in
-> opens /hospital-portal
-> selects/searches hospital from the hospital directory
-> verifies hospital address and Google Map preview
-> adds product name, price, description, and optional product image
-> description analyzer extracts product category, keywords, included items, preparation notes, booking guidance, and RAG sections
-> product image uploads to Supabase Storage bucket `hospital-product-images`
-> `create_hospital_product_with_rag` saves `hospital_products` and creates/links a `marketplace.product` RAG draft in one database operation
-> product starts as `status = pending_review`, `review_status = pending_review`, `rag_status = pending_review`, and `rag_embedding_status = not_published`
-> reviewer opens /hospital-products
-> reviewer approves or rejects the product RAG
-> approval changes product to `active`, RAG chunk to `approved` + `is_active = true`, and product embedding status to `pending`
-> rag-embed generates a 768-dimension Gemini embedding for the approved RAG chunk
-> mobile package catalog can read only approved active products
-> chatbot can retrieve only approved active product RAG chunks by vector search, with keyword fallback
```

## Tables

- `hospital_products`: hospital-provided products/packages for the marketplace.
- `rag_chunks`: receives an auto-generated `marketplace.product` chunk for chatbot retrieval.
- `hospital_product_audit_logs`: records submission, approval, rejection, archive/restore, embedding retry, embedding success, and embedding failure.
- Supabase Storage bucket `hospital-product-images`: stores product images. Public read is allowed; upload/update/delete require authenticated hospital staff.

Migrations:

- `supabase/migrations/20260605010000_hospital_product_portal.sql`
- `supabase/migrations/20260605011000_hospital_product_location_fields.sql`
- `supabase/migrations/20260605012000_hospital_product_management_policies.sql`
- `supabase/migrations/20260605013000_rag_vector_embeddings.sql`
- `supabase/migrations/20260611000000_hospital_product_rag_integrity.sql`
- `supabase/migrations/20260612000000_hospital_product_rag_production_readiness.sql`

The current portal stores hospital name, address, map query, and optional coordinates separately from product details. Product duration, includes, tags, preparation notes, and booking guidance are not entered as separate fields in the portal. They are inferred from `description` for the prototype so nurses can enter the main product content in one place.

The management page uses `loadManagedHospitalProducts` to read active public products plus scoped hospital/admin-managed products. `Archive` updates `hospital_products.status` to `archived` and pauses the linked RAG chunk with `is_active = false` and `review_status = archived`. `Restore` can only reopen products that were already approved.

Product creation, approval, rejection, archive/restore, and embedding retry use database RPCs so product status and linked RAG visibility do not drift across separate client requests. New products start with `rag_embedding_status = not_published`; approval changes that to `pending`; `rag-embed` marks them `embedded` after `update_rag_chunk_embedding` succeeds, or `error` when embedding fails.

Vector search uses `pgvector` on `rag_chunks.embedding`. Product chunks call the `rag-embed` Edge Function only after reviewer approval. The chatbot Edge Function embeds each user question with the same Gemini embedding model and calls `match_rag_chunks`; if no vector match is available, it falls back to the previous keyword/taxonomy retriever. Vector and keyword retrieval ignore expired chunks.

Hospital product writes require an authenticated admin or `hospital_staff` account scoped to the hospital name through `app_user_roles.metadata.hospital_name`, `app_user_roles.metadata.hospital_names`, or equivalent JWT metadata. Regular authenticated users can read active products but cannot create product RAG.

## Production Controls

- Product writes require authenticated admin or scoped `hospital_staff`.
- Public marketplace reads require `status = active` and `review_status = approved`.
- Product RAG is not active while waiting for review.
- `rag-embed` refuses to embed chunks unless they are `marketplace.product`, `is_active = true`, and `review_status = approved`.
- Product images are uploaded to Supabase Storage, not stored as data URLs in product metadata.
- Audit logs record every review and embedding state transition.
- Failed embeddings remain visible on `/hospital-products` and can be retried.

## Remaining Production Gate

The Supabase project currently has remote migration versions that are not present in this local repository. Do not run `supabase db push` for production until the missing migration files are recovered from source control/team history or the team explicitly accepts a repair strategy. The current local production-readiness migration is additive and should be applied only after migration history is reproducible.
