# Backend Handoff

This prototype currently uses `services/mockBackend.ts`. When Supabase is ready, implement the `BackendPort` in `backend/contracts.ts` with Supabase tables, RLS, Edge Functions, and payment webhooks.

## Core Tables

- `profiles`
- `health_packages`
- `orders`
- `hospital_bookings`
- `referral_partners`
- `referral_attributions`
- `payouts`
- `health_records`
- `health_metric_snapshots`
- `agent_memory`

## Critical Rules

- Mobile app receives publishable Supabase keys only.
- RLS must keep user health records isolated by `auth.uid()`.
- Agent memory needs `observed_at`, `valid_until`, `source`, and `confidence` so recommendations know freshness.
- Hospital admin lookup must be scoped to the partner hospital and auditable.
- Referral attribution should support link tags, promo codes, and post-purchase commission records.
