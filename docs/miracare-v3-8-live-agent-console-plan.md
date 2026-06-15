# MiraCare V3-8 Plan — Live agent console (monitor + human takeover)

Audience: Codex / product owner. Status: **APPROVED by owner 2026-06-13** (owner chose a custom in-admin console over LINE's built-in chat tool). Implemented by Claude; independent review recommended.

## 0. Goal
A back-office console inside the existing admin where sales can:
- **Monitor** LINE conversations live (the AI's replies + the customer's messages).
- **Take over** a conversation manually (one click → AI goes silent → staff replies by hand).
- **Return** the conversation to the AI.
- See each conversation with its **order context**.

The data already exists: every turn (customer + AI) is persisted to `chat_messages`, and conversations are `chat_sessions`. We add a handover switch, a staff send path, read access for staff, and the UI.

## 1. Architecture
- **Handover state** — new `chat_sessions.agent_mode` (`'ai' | 'human'`, default `'ai'`). When `'human'`, the LINE webhook records the inbound message but does NOT call the model — the human owns the reply.
- **Staff send** — new edge function `admin-line-reply`: tenant-staff-authenticated; pushes a message to the LINE customer (`pushLineMessages`), persists it to `chat_messages` (role `assistant`, a `sent_by` marker), and can flip `agent_mode`.
- **Read access** — RLS so tenant staff can read their tenant's `chat_sessions` + `chat_messages` (admin UI queries directly via the authed client, like the other admin screens).
- **UI** — `app/admin/conversations.tsx`: inbox (sessions, last message, mode) → transcript (messages) → reply box + "เข้าดูแลเอง / คืนให้ AI" toggle. Live via Supabase Realtime (fallback: poll).

## 2. Phases
- **Phase 1 (backend, this PR):** migration (`agent_mode` + staff-read RLS), webhook/orchestrate handover gate, `admin-line-reply` edge function, types + mirror, tests, audit-script wiring. `npm run v2:verify` green.
- **Phase 2 (admin UI):** the `conversations` screen (inbox + transcript + reply + toggle).
- **Phase 3 (realtime + polish):** Supabase Realtime subscriptions, unread badges, assignment, order-context panel.

## 3. Protected-core touches authorized here
| File / area | Change |
|---|---|
| Migrations | Additive migration: `chat_sessions.agent_mode` + RLS policies for tenant-staff read of `chat_sessions`/`chat_messages` (RLS shipped in the same migration). |
| `orchestrate.ts` / `line-webhook` reply path | Handover gate: when `agent_mode='human'`, persist the inbound message and skip the model/reply. No `transition_order`/marker change. |
| `admin-line-reply` (new) | Staff-authenticated manual send + handover toggle; reuses `assertTenantAdmin`/membership + `pushLineMessages`; standard `json`/`toErrorResponse` envelope. |

## 4. Security
- Staff read/write scoped to their tenant (RLS + the edge function's tenant-membership check, same pattern as `admin-order-action`).
- Manual sends go only to customers of the staff member's tenant.
- Handover gate must not break order/PromptPay flows — when back in `'ai'` mode the existing pipeline is unchanged.

## 5. DoD
- [ ] ❌ Phase 1: migration + handover gate + `admin-line-reply` + RLS + types/mirror + tests; `v2:verify` green; owner applies the migration to staging + deploys.
- [ ] ❌ Phase 2: conversations admin screen (inbox/transcript/reply/toggle).
- [ ] ❌ Phase 3: realtime + order-context panel.
