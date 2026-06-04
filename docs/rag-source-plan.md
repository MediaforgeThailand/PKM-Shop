# Medical RAG Source Plan

Use this plan to build Mira's medical and operational RAG corpus without mixing unverified medical advice into the chatbot.

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
   - MedlinePlus Connect Web Service docs: https://medlineplus.gov/medlineplus-connect/web-service/
   - WHO ICD API for ICD-10/ICD-11 terminology and classification: https://icd.who.int/icdapi
   - WHO ICD API docs: https://icd.who.int/docs/icd-api/APIDoc-Version2/
   - CDC health topics and public health datasets: https://www.cdc.gov/health-topics.html and https://developer.cdc.gov/

## Do Not Ingest Blindly

- Random clinic blogs, SEO health articles, social posts, forum answers, or unreviewed translations
- Full copyrighted drug or patient education pages without checking the license
- Raw clinical guidelines unless a physician reviews how they are transformed into patient-facing language
- Personal health records unless consent, purpose, retention, and access control are already implemented

## Required Metadata Per Chunk

- `id`
- `title`
- `category`
- `content`
- `keywords`
- `source`
- `source_url`
- `source_type`
- `language`
- `last_reviewed_at`
- `medical_reviewer`
- `expires_at`
- `risk_level`

## Review Workflow

1. Ingest only from whitelisted source domains.
2. Normalize the content into patient-facing language.
3. Add citations and source URLs.
4. Have a medical reviewer approve every medical chunk before activation.
5. Add an expiry date for medical guidance.
6. Keep emergency and "see a doctor" guardrails outside the RAG corpus as system policy.
7. Log which RAG chunks were used in every chatbot answer.

## First Corpus To Build

- Checkup preparation instructions by package and hospital
- Payment-to-booking steps after app checkout
- Call center scripts and escalation rules
- Referral-code explanation
- Emergency symptoms that must be escalated
- Privacy and consent explanation
- General patient education links from MedlinePlus/WHO/Thai MOPH sources
