# Patient Health Data Vault

This document explains how Mira stores personal health data that appears in chatbot conversations.

## Core Rule

Do not put personal health data into the RAG corpus.

- RAG stores approved general knowledge.
- The Patient Health Data Vault stores user-specific data.
- Chat-derived health data must stay user-specific and auditable before it becomes a health profile fact.

## Current MVP Flow

```text
User message
-> local health fact detector
-> chatbot answer
-> if authenticated, auto-create chat_health_memory consent for this prototype
-> auto-save confirmed facts silently
-> consent record
-> chat session/message source
-> confirmed health_facts rows
-> data_access_logs rows
-> health_memory_logs rows
```

If the user is not authenticated, the app does not save health facts. It only writes an in-session UI log that auto-save was skipped.

The index screen includes an email/password Supabase Auth MVP. `mira-chat` is deployed with JWT verification enabled, so unauthenticated users can use only local RAG preview.

Current auto-save is a prototype shortcut requested for internal testing. Before store launch, replace this with explicit PDPA-ready consent, purpose text, retention settings, and user controls. Do not silently collect personal health data in production without a disclosed purpose and lawful consent basis.

## Tables

| Table | Purpose |
| --- | --- |
| `consents` | Append-only consent records by purpose, such as `chat_health_memory` |
| `chat_sessions` | Chat session container for messages saved with consent |
| `chat_messages` | User/assistant messages used as evidence for confirmed facts |
| `health_facts` | Structured user health profile facts |
| `health_fact_sources` | Links facts back to the source message/evidence quote |
| `hospital_access_grants` | Future user-controlled sharing scope for a hospital |
| `data_access_logs` | Audit trail for create/read/update/share/revoke actions |
| `health_memory_logs` | Operational log for health extraction, auto-save, delete, export, and revoke events |

All tables use RLS so authenticated users can access only rows where `user_id = auth.uid()`.

## Consent Purposes

- `chat_history`: save chat history.
- `chat_health_memory`: store user-reviewed health facts extracted from chat.
- `health_analytics`: use confirmed health facts for health stats/analytics.
- `hospital_data_sharing`: share user-approved data with a hospital.
- `ai_processing`: use selected personal context in AI prompts.

The current chatbot saves under `chat_health_memory` automatically for authenticated prototype users.

## Fact Status

`health_facts.status` can be:

- `pending`: extracted but not confirmed.
- `confirmed`: user approved the fact.
- `rejected`: user rejected it.
- `deleted`: soft-deleted/tombstoned.

The current app writes confirmed facts directly because the prototype has no review panel in the chat screen. Users can view, soft-delete, revoke consent, and export a JSON snapshot from `user-profile`.

## Detector

The first detector is local and rule-based in `lib/health/healthFactExtractor.ts`.

It looks for examples such as:

- age, birth year, sex at birth, and blood type
- allergies
- medications
- conditions
- vitals like blood pressure, weight, and height
- heart rate and body temperature
- lab values such as HbA1c, LDL, HDL, glucose, creatinine, eGFR, ALT, AST, and hemoglobin
- surgeries, hospitalizations, immunizations, and screenings
- lifestyle signals such as smoking, alcohol, exercise, and sleep duration
- family history
- symptoms
- pregnancy status

This is intentionally conservative and should be replaced or expanded with a reviewed extraction pipeline later.

## Production Hardening Needed

- Move health fact extraction to a server-side Edge Function if the logic becomes sensitive or model-based.
- Replace silent prototype consent with explicit PDPA consent and withdrawal UX before production launch.
- Add edit-in-place for stored health facts.
- Add hospital staff roles and scoped access policies before enabling hospital sharing.
- Add retention rules and deletion jobs.
- Add encryption strategy for high-risk fields, for example with Supabase Vault or application-level encryption.
- Add model/provider policy review before sending personal health facts into an AI prompt.
- Keep public abuse protection and rate limiting enabled for `mira-chat`.

## Files

- Schema: `supabase/migrations/20260604030000_patient_health_data_vault.sql`
- Detector: `lib/health/healthFactExtractor.ts`
- Client persistence: `lib/health/healthDataVault.ts`
- Chatbot auto-save UI/logs: `app/(tabs)/chatbot.tsx`
