# PKM-Shop — LINE AI Commerce & Operations Platform

ระบบขายอัตโนมัติบน LINE OA: ลูกค้าซื้อของผ่านการคุยกับ AI ใน LINE ตัวเดียว ตั้งแต่เลือกสินค้า →
แจ้งที่อยู่ → คำนวณค่าส่ง → ชำระเงิน → ติดตามจนของถึงมือ · หลังบ้านมี Stock, Packing, Rider
(รอบรายชั่วโมง 24 ชม.), Payroll/Commission, Team Chat, HR Check-in และ Admin Panel

Business rules: [`Ready.md`](Ready.md) · Build plan + DoD: [`docs/pkm-shop-line-commerce-plan.md`](docs/pkm-shop-line-commerce-plan.md) ·
Rules for AI agents: [`AGENTS.md`](AGENTS.md)

## Structure

```
web/                     # Staff web app — Vite + React 18 + Tailwind + Router + PWA
                         #   roles: admin / stock / packer / rider / staff (mobile-first)
supabase/migrations/     # PKM schema (substrate + phase0..7)
supabase/functions/      # 12 edge functions:
                         #   chat-orchestrator, line-webhook (AI sales agent, OpenAI Responses),
                         #   notify, fare-calc, slip-verify (SlipOK), round-lock, payroll-cutoff,
                         #   stock-action, packer-action, rider-action, admin-action, checkin
supabase/seed.sql        # tenant + sample catalog
supabase/pkm-full-schema.sql  # all migrations concatenated (one-shot SQL Editor apply)
docs/                    # plan + clone runbook
scripts/                 # Supabase clone toolkit
```

## Backend (Supabase)

```bash
# apply schema (from repo root, linked to the PKM project)
supabase link --project-ref <ref>
supabase db push

# deploy functions
supabase functions deploy line-webhook --no-verify-jwt --project-ref <ref>
supabase functions deploy chat-orchestrator notify fare-calc slip-verify round-lock \
  payroll-cutoff stock-action packer-action rider-action admin-action checkin --project-ref <ref>

# secrets (server-only)
supabase secrets set --project-ref <ref> OPENAI_API_KEY=... PKM_PROMPT_ID=... AI_MODEL=gpt-5.5
# add LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN and SLIPOK_API_KEY / SLIPOK_BRANCH_ID when obtained
```

Then run `supabase/seed.sql`, set store `lat`/`lng` + first admin `profiles` row, and schedule the
crons (`round-lock` hourly at :30, `payroll-cutoff` Mon 00:00) in **Asia/Bangkok**.

## Web app

```bash
cd web
npm install
# .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TENANT_SLUG=pkm-shop
npm run dev      # or: npm run build  (deploy dist/ or point the Vercel root dir to web/)
```

## Status

Backend + web app complete & verified (`deno check` + tests green; web `tsc` + build green).
LINE OA / SlipOK are structured but **stubbed** until API access — payment falls to a manual
verify queue and LINE pushes are logged/no-op until secrets are set. Reuses the OpenAI Responses
chat engine (`callMiraPrompt`); the owner publishes the goods-selling prompt (`PKM_PROMPT_ID`).
