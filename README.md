# PKM-Shop — LINE AI Commerce & Operations Platform

ระบบขายอัตโนมัติบน LINE OA: ลูกค้าซื้อของผ่านการคุยกับ AI ใน LINE ตัวเดียว ตั้งแต่เลือกสินค้า →
แจ้งที่อยู่ → คำนวณค่าส่ง → ชำระเงิน (สลิป + SlipOK) → ติดตามจนของถึงมือ · หลังบ้านมี Stock,
Packing, Rider (รอบรายชั่วโมง 24 ชม.), Payroll/Commission, Team Chat, HR Check-in และ Admin Panel

Business rules: [`Ready.md`](Ready.md) · Build plan + DoD: [`docs/pkm-shop-line-commerce-plan.md`](docs/pkm-shop-line-commerce-plan.md) ·
Rules for AI agents: [`AGENTS.md`](AGENTS.md)

## Structure

```
web/                     # Staff web app — Vite + React 18 + Tailwind + Router + TanStack Query
                         #   roles: admin / stock / packer / rider / staff (mobile-first)
supabase/migrations/     # PKM schema (substrate + phase0..7 + v1.1 hardening + cron + cleanup)
supabase/functions/      # 14 edge functions:
                         #   chat-orchestrator, line-webhook  (AI sales agent — Anthropic API)
                         #   notify, fare-calc, slip-verify (SlipOK), round-lock, payroll-cutoff
                         #   stock-action, packer-action, rider-action, admin-action,
                         #   catalog-action, staff-admin, checkin
supabase/seed.sql        # tenant + sample catalog
scripts/e2e-smoke.mjs    # end-to-end smoke harness (service-role, run against a dev project)
docs/                    # plan + DoD tracker
```

## Verify (gates)

```bash
npm run verify           # = web typecheck + deno check (all 14 functions) + deno unit tests
# individually:
npm run web:typecheck
npm run functions:check
npm run functions:test
```

## Backend (Supabase)

```bash
# apply schema (from repo root, linked to the PKM project)
supabase link --project-ref <ref>
supabase db push

# deploy functions (line-webhook receives external callbacks -> no JWT)
supabase functions deploy line-webhook --no-verify-jwt --project-ref <ref>
supabase functions deploy chat-orchestrator notify fare-calc slip-verify round-lock \
  payroll-cutoff stock-action packer-action rider-action admin-action catalog-action \
  staff-admin checkin --project-ref <ref>

# secrets (server-only; Ready.md §2)
supabase secrets set --project-ref <ref> \
  ANTHROPIC_API_KEY=sk-ant-... AI_MODEL=claude-sonnet-4-6
# add LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN and SLIPOK_API_KEY / SLIPOK_BRANCH_ID when obtained
```

### Cron (already wired by migration `pkm_cron_schedules`)

pg_cron runs `round-lock` at :30 every hour and `payroll-cutoff` Mon 00:00 Asia/Bangkok.
The SQL fallback locks rounds / closes payroll even with no further setup. To ALSO get the
LINE notifications on each tick, create two Vault secrets once (SQL editor):

```sql
select vault.create_secret('<service_role_key>', 'pkm_service_role_key');
select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'pkm_functions_base_url');
```

Then run `supabase/seed.sql`, set store `lat`/`lng` + `store_receiver_account` in Settings, and
create the first admin `profiles` row (service role) — everyone else is added in-app.

## Web app

```bash
cd web
npm install
# .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TENANT_SLUG=pkm-shop
npm run dev      # or: npm run build  (deploy dist/ or point the Vercel root dir to web/)
```

## Status (2026-07-14, v1.1)

- AI seller runs on the **Anthropic Messages API** (`claude-sonnet-4-6` by default, editable in
  Settings → ai_model). Handoff to a human admin works end-to-end (keyword / `[[handoff]]`
  marker → admin chat console → close case).
- Redelivery (Ready.md §3.4) is implemented end-to-end: fee slip → child order
  (`parent_order_id`) → next round.
- LINE OA / SlipOK are structured but **stubbed until API access**: without secrets, payment
  falls to the admin manual-verify queue and LINE pushes are logged as `skipped`.
- Known manual step: Supabase blocks SQL bucket deletion — the two empty legacy buckets
  (`lab-reports`, `wearable-imports`) are deleted from the dashboard (Storage → bucket → Delete).
