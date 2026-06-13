# MiraCare V3-7 Plan — LINE conversational booking with a confirm step

Audience: Codex / product owner. Status: **APPROVED by owner 2026-06-13** (chosen over LIFF after live testing; owner wants a human-salesperson feel). Implemented by **Claude** on `claude/v3-7-line-confirm-flow` (stacked on V3-5 / PR #15). **Replaces V3-6 (LIFF) — PR #16 closed.**

## 0. Goal
Make LINE booking feel like chatting with a human salesperson: Mira asks for the recipient's details, the customer types them, Mira **reads them back and asks to confirm**, and only after the customer confirms is the **PromptPay QR** released. No forms, no buttons for this step — pure chat. Buyer info is entered **fresh every time** (the buyer may be someone else).

## 0.1 Split of responsibility (read this)
- **Prompt (OWNER, OpenAI Platform — protected `callMiraPrompt`):** the *wording* — how Mira asks, reads back, and asks to confirm. The "human sales feel" lives here. Draft wording is in §3 below; the owner pastes/adapts it into the prompt.
- **Backend (this PR):** the *mechanism* — capture typed details into the order, **hold the QR** until confirmed, detect the confirmation, then release the QR. Backend never scripts the sales lines (conversation purity).

## 0.2 Protected-core touches authorized here
| File | Change |
|---|---|
| `_shared/openai.ts` `callOrderFieldExtractor` (NOT `callMiraPrompt`) | add a `confirmed: boolean` output (true only on a plain affirmation with no new details). |
| `_shared/orchestrate.ts` `updateCollectingOrderFromMessage` | hold-then-confirm gate: filling fields no longer auto-advances; an affirmation once all fields are present advances to `awaiting_payment`. |
| `_shared/orchestrate.ts` `createOrderFromProduct` | LINE-only: always `selecting_branch` (even single-branch) + don't auto-fill `buyer_phone`. App/PWA unchanged. |

No `transition_order` / status / marker / `callMiraPrompt` change.

## 1. Backend flow (implemented)
1. Tap จอง → (LINE) `selecting_branch`, `branch_id=null` → branch picker shows even for one branch.
2. Pick branch → `collecting_info` (buyer fields empty; phone NOT pre-filled).
3. Customer types details → `callOrderFieldExtractor` fills them; **order stays `collecting_info`** (no auto-QR).
4. Prompt reads the details back and asks to confirm.
5. Customer affirms ("ใช่"/"ถูกต้อง") → extractor returns `confirmed=true` with no new fields → backend advances to `awaiting_payment` → the existing LINE QR + payment button are pushed in that turn.
6. Customer corrects a field → fields update, stays `collecting_info`, prompt re-reads-back.

## 2. Tests & gates
- `npm run v2:verify` green — **118 Deno tests** + all gates (2 new `confirmed` cases in `openai_test.ts`).
- The orchestrate gate logic is covered by the extractor unit tests + the manual sandbox run (no orchestrate harness exists).

## 3. PROMPT DRAFT for the owner (paste/adapt into the Mira prompt on the OpenAI Platform)
When an active order is in `collecting_info` (the order-context line shows `ข้อมูลที่ยังขาด: …`):

> เมื่อมีคำสั่งซื้อกำลังเก็บข้อมูลและยังขาดข้อมูลผู้รับบริการ ให้พูดอย่างเป็นกันเองแบบพนักงานขาย ขอข้อมูล **ผู้ที่จะเข้ารับบริการ** (เผื่อซื้อให้คนอื่น): ชื่อ-นามสกุล, เบอร์โทร, และอายุ — ถามรวบในประโยคเดียวหรือทีละอย่างก็ได้ให้เป็นธรรมชาติ
>
> เมื่อได้ครบทั้งสามอย่างแล้ว ให้ **ทวนข้อมูลกลับไปให้ตรวจ** แล้วถามยืนยัน เช่น: "ขอทวนนะคะ — ชื่อ {ชื่อ}, เบอร์ {เบอร์}, อายุ {อายุ} ปี ข้อมูลถูกต้องไหมคะ? ถ้าถูกต้องพิมพ์ \"ยืนยัน\" หรือ \"ใช่\" ได้เลยค่ะ ถ้าต้องการแก้ไขบอกได้นะคะ"
>
> เมื่อลูกค้ายืนยัน ระบบจะส่ง QR PromptPay ให้อัตโนมัติ — ตอบรับสั้นๆ เช่น "ขอบคุณค่ะ สแกน QR ด้านล่างเพื่อชำระเงินได้เลยนะคะ" โดยไม่ต้องออก marker ใดๆ ในขั้นเก็บข้อมูล/ยืนยัน

(The backend gates on these; even if the wording differs, the mechanism still works — but matching this makes the read-back/confirm feel natural.)

## 4. DoD
- [x] ✅ 2026-06-13 — extractor `confirmed`; hold-then-confirm gate; LINE always-branch + no auto phone; app/PWA unchanged.
- [x] ✅ 2026-06-13 — `v2:verify` green (118 tests); deployed to staging; PR #16 (LIFF) closed.
- [ ] ❌ Owner pastes the §3 prompt guidance into the Mira prompt (OpenAI Platform).
- [ ] ❌ Live sandbox: จอง → branch → type details → Mira reads back → "ยืนยัน" → QR → pay.
