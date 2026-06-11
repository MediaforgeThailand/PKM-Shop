# MiraCare LINE Sandbox Setup

This checklist is for the tenant owner/operator who has access to the LINE Developers console and the Supabase project. Do not paste channel secrets or tokens into docs, tickets, screenshots, or CI logs.

## Required Values

- Tenant slug, matching the `tenants.slug` row used by the pilot, for example `demo-hospital`.
- LINE channel secret stored as `LINE_CHANNEL_SECRET__<tenant_slug>`.
- LINE channel token stored as `LINE_CHANNEL_TOKEN__<tenant_slug>`.
- Optional fallback tenant slug stored as `MIRA_DEFAULT_TENANT_SLUG`.

## Supabase Function URL

Use this webhook URL shape in LINE Developers:

```text
https://<project-ref>.supabase.co/functions/v1/line-webhook?tenant=<slug>
```

The path requirement is `/functions/v1/line-webhook?tenant=<slug>`. The `line-webhook` function must be deployed with JWT verification disabled so LINE can reach the webhook before MiraCare verifies the `x-line-signature` header.

## Setup Steps

1. In Supabase, add `LINE_CHANNEL_SECRET__<tenant_slug>` and `LINE_CHANNEL_TOKEN__<tenant_slug>` as function secrets for the pilot tenant.
2. Redeploy `line-webhook` with the v2 deploy helper or `npx supabase functions deploy line-webhook --no-verify-jwt --project-ref <project-ref>`.
3. In LINE Developers, set the webhook URL to `/functions/v1/line-webhook?tenant=<slug>` on the project host and enable webhooks.
4. Add the sandbox/test LINE account as a friend of the channel.
5. Run the manual sandbox checklist below and record the result in the release evidence.

## Manual Sandbox Checklist

1. Send a normal Thai greeting and confirm LINE receives a reply generated through `chat-orchestrator`.
2. Send a health-check purchase intent and confirm a Flex product carousel appears.
3. Tap a product postback and confirm the order flow advances without a signature or tenant-routing error.
4. Complete buyer info, confirm the PromptPay QR image message appears with the payment postback Flex.
5. Tap payment done, then confirm/book the order from admin and verify the customer receives the LINE push notice.

## Mocked Coverage Already In Repo

- `_shared/__tests__/line_test.ts` covers signature verification, tenant-token lookup, text truncation, Flex product payloads, postback mapping, QR image messages, and payment postbacks.
- `npm run v2:edge-security-audit` asserts QR PNG render/upload and LINE image-message reply wiring.
- `npm run v2:deno-check` checks `line-webhook` with the shared import map.
