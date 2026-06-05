# Medical RAG Source And Taxonomy Plan

Use this plan to build Mira's medical and operational RAG corpus without mixing unverified medical advice into the chatbot.

## Retrieval Goal

The chatbot should retrieve the smallest approved context that can answer the user's current intent.

Flow:

1. Classify the user query into one or more RAG categories.
2. Load only `is_active = true` and `review_status = approved` chunks.
3. Sort by category match, keyword match, and `priority`.
4. Send compact `summary` text first.
5. Include full `content` only for narrow admin/reviewer flows or when a future server-side retriever explicitly asks for it.
6. Log chunk IDs used for every AI answer.

## Token-Efficient Taxonomy

Use dotted categories so broad routing is cheap and specific topics remain searchable.

| Category | Use for | Default chunk budget |
| --- | --- | --- |
| `safety.escalation` | Emergency symptoms, "do not diagnose", urgent-care routing | 240 tokens |
| `care.checkup_preparation` | General checkup preparation and package-specific preparation | 220 tokens |
| `care.patient_education` | Reviewed patient education from approved medical sources | 260 tokens |
| `ops.booking` | Booking journey, appointment steps, order-to-booking flow | 180 tokens |
| `ops.call_center` | Hospital staff scripts, payment verification, handoff steps | 160 tokens |
| `ops.payment` | Payment status, receipt, refund/cancellation support | 160 tokens |
| `ops.referral` | Doctor referral code, attribution, affiliate flow, payout explanation | 200 tokens |
| `privacy.consent` | Health data consent, deletion, future stats usage boundaries | 180 tokens |

Guidance:

- Keep `summary` under 500 characters when possible.
- Keep one chunk to one intent; split mixed content.
- Set `priority = 1` for safety policy, `10-30` for common user journeys, and `40+` for less common support content.
- Use `topic` for fine-grained routing, for example `post_payment_booking`, `doctor_referral_attribution`, or `basic_checkup_preparation`.
- Do not duplicate the same safety instruction in every chunk. Keep core emergency policy in the Edge Function system instruction and one `safety.escalation` chunk.

## Required Metadata Per Chunk

- `id`
- `title`
- `category`
- `topic`
- `audience`
- `language`
- `summary`
- `content`
- `keywords`
- `source`
- `source_url`
- `source_type`
- `review_status`
- `risk_level`
- `medical_reviewer`
- `last_reviewed_at`
- `expires_at`
- `token_budget`
- `priority`

## Source Priority

1. Hospital-owned operational content
   - Checkup packages
   - Preparation instructions
   - Booking and call center scripts
   - Refund/cancellation policy
   - Doctor referral and settlement policy
   - Consent and privacy notices

2. Thai public health and system sources
   - Ministry of Public Health: https://moph.go.th/
   - Bureau of Digital Health, MOPH: https://bdh.moph.go.th/site/health-data/
   - Department of Disease Control open data: https://opendata.ddc.moph.go.th/
   - Department of Health public guides: https://hp.anamai.moph.go.th/th/public-guide
   - Thai Health Information Standards Development Center: https://this.or.th/en/
   - NHSO APIs or public benefit information when the answer concerns coverage/benefits, not diagnosis: https://nhsoapi.nhso.go.th/nhsoendpoint/swagger-ui.html

3. International medical reference sources
   - MedlinePlus Connect for patient education links by diagnosis, medication, lab, and procedure codes: https://medlineplus.gov/medlineplus-connect/
   - WHO ICD API for ICD-10/ICD-11 terminology and classification: https://icd.who.int/icdapi
   - CDC health topics and public health datasets: https://www.cdc.gov/health-topics.html and https://developer.cdc.gov/

## Do Not Ingest Blindly

- Random clinic blogs, SEO health articles, social posts, forum answers, or unreviewed translations
- Full copyrighted drug or patient education pages without checking the license
- Raw clinical guidelines unless a physician reviews how they are transformed into patient-facing language
- Personal health records unless consent, purpose, retention, and access control are already implemented

## Review Workflow

1. Ingest only from whitelisted source domains.
2. Normalize the content into patient-facing language.
3. Add citations and source URLs.
4. Mark new chunks as `review_status = draft`.
5. Have a qualified reviewer approve every medical chunk before activation.
6. Set `expires_at` for medical guidance so stale chunks stop being used.
7. Promote only reviewed chunks to `review_status = approved`.
8. Keep emergency and "see a doctor" guardrails outside the RAG corpus as system policy.
9. Log which RAG chunks were used in every chatbot answer.

## First Corpus To Build

- Checkup preparation instructions by package and hospital
- Payment-to-booking steps after app checkout
- Call center scripts and escalation rules
- Referral-code explanation
- Emergency symptoms that must be escalated
- Privacy and consent explanation
- Patient education links from MedlinePlus, WHO, CDC, Thai MOPH, or hospital-reviewed Thai content

## Production Notes

- Move retrieval fully server-side before launch so the client cannot influence RAG context.
- Add pgvector embeddings after the approved corpus grows beyond simple keyword routing.
- Store generated answer, chunk IDs, model, and consent state in an audit table.
- Treat `care.patient_education` as higher risk than marketplace operations; it needs stricter reviewer and expiry rules.
