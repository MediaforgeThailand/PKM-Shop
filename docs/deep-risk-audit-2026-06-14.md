# MiraCare Deep Risk Audit — 2026-06-14

ผู้ตรวจ: Claude (owner-side) · ฐาน: worktree `claude/hardcore-cori-8780f3` (จาก `main` @ `f09f4e7`) · วิธี: อ่านโค้ดจริงระดับบรรทัดทั้ง backend (edge functions + migrations/RPC/RLS) และ frontend (Expo client + auth + admin) เทียบกับ `AGENTS.md` §2 protected core และ plan docs

> ขอบเขตที่ผู้ใช้สั่ง: *"Full Audit ทั้ง back-end + Front-end แบบลงลึก หาจุดเสี่ยงและจุดที่ไม่เป็นไปตามแผนหรือย้อนแย้งกับระบบอื่นจนเป็นอันตราย"* — รายงานนี้เน้น **bug / ช่องโหว่ / ความขัดแย้งระหว่างระบบ** ไม่ใช่ readiness % (อันนั้นอยู่ใน `docs/full-audit-2026-06-13.md` แล้ว)

---

## 0. TL;DR — เรียงตามความอันตราย

| # | ระดับ | เรื่อง | ผลถ้าไม่แก้ |
|---|---|---|---|
| **C1** | 🔴 CRITICAL | `transition_order` RPC ไม่ถูก `revoke execute` จาก `public/anon/authenticated` | ลูกค้า/ใครก็ได้ที่ login เรียก RPC ตรงเพื่อ **self-confirm ออเดอร์ของตัวเอง** (ข้าม "เจ้าหน้าที่ยืนยันการจ่ายเงิน") และ **มินต์ commission_entries** ได้ → พังกฎ Money ของ AGENTS.md §2 |
| **H1** | 🟠 HIGH | `resolveOrCreateCustomer` ทับ `customers.nickname = null` ทุก turn ของ app/pwa | ลบ nickname ที่ fact-extractor เพิ่งบันทึก → personalization (prompt `user_nickname`) ใช้ไม่ได้บน app/pwa + ข้อมูลผู้ใช้หาย |
| **H2** | 🟠 HIGH | LINE postback ใช้ `client_msg_id` แบบสุ่มทุกครั้ง (ไม่ idempotent) | ถ้า LINE ส่ง webhook ซ้ำ (redelivery/timeout) → `select_product` สร้าง **ออเดอร์ซ้ำ**, action ซ้ำ; กันได้แค่ปิด redelivery เอง (เปราะ) |
| **M1** | 🟡 MED | LINE webhook เรียก OpenAI/RPC แบบ synchronous ก่อนตอบ reply | งานช้าทำให้เกิน reply window → LINE redelivery → ไปกระตุ้น H2 ให้ออเดอร์ซ้ำมากขึ้น |
| **M2** | 🟡 MED | เบอร์โทร validate ไม่เท่ากันระหว่าง form กับ conversational | บน LINE เบอร์มั่ว/ผิดรูปผ่านเข้า `submitted` ได้ (RPC เช็คแค่ "ไม่ว่าง") |
| **L1** | 🟢 LOW | v1/v2 client อยู่ปนกัน — `ensureProfile` เขียนตาราง `profiles` (v1) ที่ไม่ผูกกับ `customers` (v2) | data orphan + เพิ่ม cognitive load/ความเสี่ยงพังเงียบ ๆ เวลาแก้ schema |
| **L2** | 🟢 LOW | `promptpay_id` รูปแบบผิด → `buildPromptPayPayload` throw → 500 ทั้ง turn ตอน QR | ตั้งค่า tenant ผิดนิดเดียวทำหน้าจ่ายเงินล่ม โดยไม่มี error ที่อ่านรู้เรื่อง |
| **L3** | 🟢 LOW | edge ใช้ service-role (bypass RLS) — กันข้าม tenant ด้วย `tenant_id=eq.` ใน code ล้วน | ถ้าลืม filter ตัวเดียว = leak ข้าม tenant; ตอนนี้ยังไม่มี lint/guard |

ของที่ **แข็งแรงและถูกต้องแล้ว** อยู่ §3 — เพื่อไม่ให้เข้าใจผิดว่าทั้งระบบพัง

---

## 1. รายละเอียดจุดอันตราย

### 🔴 C1 — `transition_order` เปิดให้ลูกค้าเรียกตรงและ self-confirm ได้ (privilege escalation)

**ที่มา:**
- `supabase/migrations/20260612050000_miracare_v3_phase1_data_admin.sql:217` — `create or replace function public.transition_order(...) ... security definer`
- ทั่วทุก migration **ไม่มี** `revoke execute on function public.transition_order(...) from public/anon/authenticated` เลย (เทียบกับ `increment_ai_rate_limit` ที่ทำครบใน `20260605000000:341-342`, และ hospital_product functions ใน `20260611000500:738-745` ที่ revoke+grant ครบ)

**ทำไมอันตราย:**
1. ฟังก์ชันเป็น `security definer` → รันด้วยสิทธิ์เจ้าของ **ข้าม RLS ของตาราง `orders` ทั้งหมด**
2. PostgreSQL `CREATE FUNCTION` แจก `EXECUTE` ให้ `PUBLIC` เป็น default; Supabase เปิดให้ role `anon`/`authenticated` เรียก RPC ใน schema `public` ผ่าน PostgREST (`POST /rest/v1/rpc/transition_order`) เว้นแต่จะ revoke
3. ด่านเดียวในฟังก์ชันคือ `v_is_admin := p_actor like 'admin:%'` ซึ่ง **ผู้เรียกกำหนด `p_actor` เองทั้งหมด**

**สิ่งที่ผู้โจมตี (ลูกค้าที่ login อยู่) ทำได้:**
```
POST /rest/v1/rpc/transition_order
{ "p_order_id": "<order ของตัวเอง>", "p_to_status": "confirmed", "p_actor": "admin:x" }
```
- ออเดอร์ตัวเองที่อยู่สถานะ `submitted` (กดว่า "จ่ายแล้ว" โดยอัปสลิปปลอม/ไม่จ่ายจริง) → กลายเป็น `confirmed` โดย **ไม่ผ่านเจ้าหน้าที่** → พังกฎ AGENTS.md §2 Money: *"Customer payment = PromptPay QR + staff confirmation"*
- การ confirm ยัง `insert into commission_entries` อัตโนมัติ (migration `:283-310`, `order_id` มี `unique` ใน `20260611040000:18`) → **referrer มินต์คอมมิชชันให้ตัวเองได้** ด้วยการ confirm ออเดอร์ที่ตัวเองอ้างอิง

**ทำไมไม่ถูกจับ:** `scripts/rls-check.mjs` ทดสอบแค่ row isolation ผ่านตาราง (อ่าน/เขียนตรง) ด้วย anon key — **ไม่ได้ทดสอบสิทธิ์เรียก RPC เลย**; `scripts/order-status-write-audit.mjs` กันแค่ "เขียน orders.status ตรง ๆ นอก transition_order" ไม่ได้ดูว่า **ใคร** เรียก transition_order ได้

**วิธีแก้ (migration ใหม่ additive):**
```sql
revoke execute on function public.transition_order(uuid, text, text, jsonb) from public, anon, authenticated;
-- service_role ยัง execute ได้ (edge functions ใช้ service role อยู่แล้ว ผ่าน _shared/orders.ts:transition())
```
**ตรวจสภาพจริงบน production ก่อน (read-only):**
```sql
select p.proname, array_agg(r.rolname) filter (where has_function_privilege(r.rolname, p.oid, 'EXECUTE'))
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'),('authenticated')) r(rolname)
where n.nspname='public' and p.proname='transition_order'
group by p.proname;
```
ถ้า `anon`/`authenticated` โผล่ในผลลัพธ์ = ช่องโหว่จริง บน live แนะนำรัน Supabase **Security Advisor** (`get_advisors type=security`) ควบคู่ — แต่นี่เป็น live = owner territory ต้องให้ owner ทำ

**แนะนำเพิ่ม:** เขียน gate test ที่ยิง `transition_order` ด้วย anon/authenticated JWT แล้ว **คาดหวัง 403/permission denied** เพิ่มเข้า `v2:verify` เพื่อกัน regression; และทำ migration กวาด `revoke execute ... from public, anon, authenticated` ให้ทุก security-definer ที่ "เปลี่ยน state" (ดู §1.x ใต้ L3)

---

### 🟠 H1 — nickname ของ app/pwa ถูกทับเป็น null ทุก turn (ขัดแย้งกับ fact memory)

**ที่มา:**
- `supabase/functions/_shared/db.ts:193-206` — `resolveOrCreateCustomer()` upsert body `{ auth_user_id, nickname: nickname ?? null, tenant_id }` ด้วย `prefer: resolution=merge-duplicates`
- ถูกเรียกทุก turn ที่ต้นทาง `orchestrate.ts:1197` โดย **ไม่ส่ง nickname** → `nickname = null`
- PostgREST `merge-duplicates` ทำ `ON CONFLICT (tenant_id,auth_user_id) DO UPDATE` ของคอลัมน์ที่อยู่ใน body → **เซ็ต `nickname = null` ทับทุกครั้ง**

**ความขัดแย้ง:** `facts.ts:225-234` ตั้งใจเขียน `customers.nickname = row.value_text` เมื่อ fact `nickname` ถูกยืนยัน active แต่ turn ถัดไป `resolveOrCreateCustomer` (เรียกที่ต้น `orchestrateChat`) ลบทิ้งก่อน `completeChatTurn` จะอ่าน → `customer.nickname ?? 'ลูกค้า'` (`orchestrate.ts:1127`) แทบจะเป็น `'ลูกค้า'` เสมอบน app/pwa

**ผลกระทบ:** prompt variable `user_nickname` (มี migration เฉพาะ `..._user_nickname_chat_prompt`) ใช้ไม่ได้จริงบน app/pwa — เป็น personalization ที่ลงทุนทำแล้วถูก bug ปิดเงียบ ๆ + เป็น data loss (เขียนแล้วโดนลบ)
> หมายเหตุ: LINE ไม่โดน เพราะ `resolveOrCreateLineCustomer` (`orchestrate.ts:1032`) upsert เฉพาะ `line_user_id,tenant_id` ไม่แตะ nickname

**วิธีแก้:** อย่าใส่ `nickname` ลงใน upsert body ตอนที่ไม่ได้ตั้งใจอัปเดต — ใส่เฉพาะเมื่อ `nickname` ถูกส่งเข้ามาจริง:
```ts
const row = { auth_user_id: authUserId, tenant_id: tenantId,
  ...(nickname == null ? {} : { nickname }) };
```

---

### 🟠 H2 — LINE postback ไม่ idempotent → ออเดอร์/แอ็กชันซ้ำเมื่อ redelivery

**ที่มา:** `supabase/functions/line-webhook/index.ts:116,128` — text ใช้ `event.message.id` (เสถียรข้าม redelivery ✅) แต่ **postback ใช้ `crypto.randomUUID()`** ทุกครั้ง
- de-dup ของ chat อิงที่ `client_msg_id` (`orchestrate.ts:persistUserMessage` + `cachedAssistantReply`) — postback แบบสุ่มจึงไม่เคย hit cache
- `select_product` → `createOrderFromProduct` **insert ออเดอร์ใหม่เสมอ** (ไม่มี dedupe) → redelivery = ออเดอร์ซ้ำ

**ความขัดแย้ง:** บันทึก memory ระบุ "turn OFF LINE Webhook redelivery" — แปลว่าตอนนี้พึ่ง config ภายนอกกันไว้ ซึ่งเปราะ ถ้าใครเผลอเปิด หรือ LINE timeout (ดู M1) จะเกิดซ้ำทันที

**วิธีแก้ (ทางใดทางหนึ่ง/ทั้งคู่):**
1. ใช้ `event.webhookEventId` (LINE ส่งมาใน payload ระดับ event) เป็น `client_msg_id`/กุญแจ dedupe แทน random
2. ตาราง `line_events(webhook_event_id pk, processed_at)` insert-then-skip ก่อนประมวลผล (กันซ้ำระดับ webhook)
3. ทำให้ `select_product` idempotent: ถ้ามี active order ของ session+product เดิมในสถานะ pre-payment อยู่แล้ว ให้คืนตัวเดิมแทน insert

---

### 🟡 M1 — LINE webhook ทำงานหนัก synchronous ก่อนตอบ (เสี่ยง timeout → redelivery)

**ที่มา:** `line-webhook/index.ts:170-177` วนทุก event แล้วใน `handleEvent` เรียก `orchestrateLine` (ซึ่งเรียก OpenAI + หลาย DB round-trip + upload QR) **ก่อน** `replyLineMessages` แล้วค่อยตอบ 200 ตอนจบทั้งหมด
- ถ้า OpenAI ช้า/หลาย event ใน batch → เกิน reply token window (และ webhook timeout ของ LINE) → LINE ลองส่งใหม่ → ไปชน H2
- event เดียว throw = ทั้ง batch 500 → LINE redelivery ทั้งก้อน

**แนวทาง:** ack 200 เร็ว ๆ + ประมวลผลแบบ background (หรืออย่างน้อยจับ error ราย-event ไม่ให้ทั้ง batch ล้ม) และทำ dedupe ตาม H2 ก่อนเปิด LINE จริง

---

### 🟡 M2 — เบอร์โทร validate ไม่สม่ำเสมอระหว่าง 2 ทางเข้า

**ที่มา:**
- form action เข้ม: `orchestrate.ts:69` `buyer_phone: z.string().regex(/^0[689]\d{8}$/)`
- conversational (LINE) หลวม: `callOrderFieldExtractor` (`openai.ts:303`) คืน `buyer_phone` แค่ `.trim()` ไม่ validate → `updateOrderFields` เขียนลงตรง ๆ
- ด่าน DB (`transition_order` `:258`) เช็คแค่ `buyer_phone` ไม่ว่าง ไม่เช็ครูปแบบ

**ผล:** บน LINE ลูกค้าพิมพ์เบอร์ผิดรูป/ปนตัวอักษร → ผ่านเข้า `awaiting_payment`/`submitted` ได้ → เจ้าหน้าที่โทรนัดไม่ได้ **วิธีแก้:** validate เบอร์ใน `callOrderFieldExtractor`/`updateCollectingOrderFromMessage` ด้วย regex เดียวกับ form (ถ้าไม่ผ่านให้ถือว่ายังไม่ได้เบอร์ ค่อยถามต่อ)

---

### 🟢 L1 — v1/v2 client ปนกัน: `ensureProfile` เขียน `profiles` (v1) ไม่ผูก `customers` (v2)

**ที่มา:** `lib/auth/useAuthSession.ts:102-112` ทุก sign-in/sign-up `upsert` ลง `public.profiles` (สร้างใน v1 migration `20260604000000`, ไม่ถูก drop) แต่ทั้ง flow v2 ใช้ `public.customers` — สอง identity ไม่ผูกกัน
- ถ้าวันใด schema live ไม่มี `profiles` (เช่น setup tenant ใหม่ที่รันเฉพาะ v2) → `ensureProfile` throw → **sign-in ล้มทั้ง flow** (เพราะ throw ต่อใน `signInWithEmailPassword`)

**แนวทาง:** ตัด `ensureProfile`/`profiles` ออกจาก auth path ของ v2 หรือย้ายเป็น best-effort (ไม่ throw) และทำรอบ legacy cleanup ตามที่ `full-audit-2026-06-13.md §4` แนะนำ (รวม `mockBackend`, healthDataVault เก่า, RAG client เก่า)

---

### 🟢 L2 — `promptpay_id` ผิดรูป ทำให้ turn จ่ายเงิน 500

**ที่มา:** `_shared/promptpay.ts:37` `normalizePromptPayId` throw `Error` (ไม่ใช่ `HttpError`) เมื่อ id ไม่ใช่เบอร์ไทย/เลขบัตร 13 หลัก; ถูกเรียกใน `toOrderPanel` (`orders.ts:283`) ตอน step `qr` ถ้า `tenant.promptpay_id` มีค่าแต่รูปผิด → throw → ตอบ 500 ทั้ง response **แนวทาง:** validate `promptpay_id` ตอน admin บันทึก tenant + ใน `toOrderPanel` ถ้า build payload ไม่ได้ให้ degrade เป็น panel ไม่มี QR + log แทน 500

---

### 🟢 L3 — edge ทั้งหมดวิ่งด้วย service-role (bypass RLS) — กันข้าม tenant ด้วย code ล้วน

**ข้อเท็จจริง:** `_shared/db.ts:rest()` ใช้ `SUPABASE_SERVICE_ROLE_KEY` ทุก query → **RLS ไม่ทำงานในชั้น edge** ความปลอดภัยข้าม tenant ขึ้นกับ `tenant_id=eq.` ที่เขียนมือทุกจุด ตอนนี้เขียนครบดี แต่:
- `context.ts:77-99` อ่าน `user_facts`/`consents` ด้วย `customer_id` อย่างเดียว (ไม่มี `tenant_id`) — ปลอดภัยเพราะ `customer_id` เป็น PK ผูก tenant อยู่แล้ว แต่ไม่มี assertion กัน
- ความเสี่ยงเชิงระบบ: ลืม `tenant_id` filter จุดเดียว = cross-tenant leak โดยไม่มีตาข่าย RLS รอง

**แนวทาง:** คงวินัยเดิม + พิจารณา helper/lint ที่บังคับให้ query ตาราง business มี `tenant_id` เสมอ และทำ migration กวาด `revoke execute ... from public, anon, authenticated` ให้ security-definer ที่เปลี่ยน state ทุกตัว (รวม C1) เป็นนโยบายเดียว

---

## 2. จุดที่ตรวจแล้ว "ไม่ใช่ปัญหา" (กันเข้าใจผิด/รื้อซ้ำ)

- **State machine ขัดกันเอง?** ไม่ — `transition_order` ถูก `create or replace` 3 รอบ (phase3 → A2 → v3 phase1) ตัวล่าสุด `20260612050000` ถูกต้องครบ: มี `selecting_branch`, บังคับ `buyer_age is not null` ตรงกับ TS `hasBuyerInfo` (`orders.ts:32`), ตัด system_notice ออก (single source = edge), insert commission ตอน confirmed อันเก่าที่ขาด `selecting_branch` ถูกแทนไปแล้ว
- **system_notice ซ้ำสองที่?** ไม่ (อีกต่อไป) — A2 (`20260611061000`) เอา notice ออกจาก RPC แล้ว เหลือ edge เป็นแหล่งเดียว
- **`loadManagedHospitalProducts` ยิงตาราง `hospital_products` ที่ถูก drop?** ไม่ — `lib/marketplace/hospitalProducts.ts` ย้ายมาใช้ `invokeFunction` + types v2 แล้ว
- **secrets หลุด client?** ไม่ — `lib/supabase.ts` ใช้แค่ `EXPO_PUBLIC_*` (publishable/anon); `.env.example` ระบุชัดว่า OpenAI/Stripe/service-role เป็น server-only

---

## 3. สิ่งที่ทำถูกและแข็งแรง (ยืนยันจากการอ่านโค้ด)

- **Money path สะอาด:** ราคาจาก `products.price_baht` ตอนสร้างออเดอร์เท่านั้น (`orchestrate.ts:229`), commission จาก `commission_scheme_snapshot`/`miracare_commission_amount` (SQL) — **ไม่มีการคำนวณราคา/เงินจาก output ของโมเดล** ตรงตาม AGENTS.md §2
- **Stripe webhook รัดกุม:** verify signature → เช็ค currency = THB → เช็ค `amount_total/amount === stripeMinorUnitsForBaht(order.amount_baht)` ก่อน mark paid (`stripe-webhook/index.ts:88-94,219-225`); transition ด้วย actor `system` ที่ allow ใน RPC
- **PDPA authorization ดี:** self path ผูก auth user เอง, admin path ต้อง `tenant_admin/superadmin` ของ tenant นั้น (`pdpa.ts:25-83`); erasure anonymize ออเดอร์แต่ **ไม่แตะ status** (เคารพ transition_order-only), idempotent
- **ข้อมูลอ่อนไหวใช้ private bucket + signed URL:** slip/lab ใช้ `createSignedUploadUrl`/`createSignedReadUrl` (`storage.ts`); `uploadStorageObject` (คืน public URL) ใช้แค่ QR `line-assets` ที่ไม่ลับ
- **LINE signature + internal auth ถูกต้อง:** HMAC-SHA256 ผ่าน `crypto.subtle.verify` ต่อ tenant (`line.ts:98-122`); internal service-role guard ใช้ constant-time compare (`internalAuth.ts:15-27`)
- **Marker protocol คุมแน่น:** marker เดียว/บรรทัดท้าย/strip ออกจาก visible text + suppress การ์ดระหว่างซื้อ (`orchestrate.ts:1139-1153`) ตรง AGENTS.md §2
- **Conversation purity:** reply path ไม่มีสคริปต์ประโยคขายในโค้ด; ข้อความไทยจำกัดที่ system notice ใน `templates.ts` และ context lines

---

## 4. ลำดับงานแนะนำ

1. **C1 ทันที** (ก่อนเปิดรับเงินจริง/ก่อน LINE live): migration `revoke execute` + gate test + ให้ owner รัน Security Advisor บน live ยืนยัน
2. **H1** (งานเล็ก คุณค่าสูง): แก้ `resolveOrCreateCustomer` ไม่ให้ใส่ `nickname:null`; เพิ่ม regression เคส known-user nickname บน app/pwa (สอดคับ R6 ใน followups plan)
3. **H2 + M1 + M2** เป็นชุด "ทำให้ LINE พร้อม live แบบปลอดภัย": dedupe ตาม `webhookEventId` + ack เร็ว + validate เบอร์ — ทำก่อนเปิด LINE OA จริงนอกเดโม
4. **L1–L3** ใส่รอบ legacy cleanup + วาง policy revoke execute เป็นมาตรฐาน

---

## 4b. สถานะการแก้ (อัปเดต 2026-06-14, รอบเดียวกัน)

| # | สถานะ | สิ่งที่ทำ |
|---|---|---|
| **C1** | ✅ **APPLIED + VERIFIED บน prod (2026-06-15)** | migration `supabase/migrations/20260614000000_c1_revoke_transition_order_execute.sql` (`revoke execute ... from public/anon/authenticated` + `grant ... to service_role`) · gate ใหม่ `scripts/rpc-grant-audit.mjs` ต่อเข้า `v2:verify` (`orders:rpc-grant-audit`) · live assertion ใน `scripts/rls-check.mjs` (`expectTransitionOrderRpcDenied`) — **CI live-regression ยืนยันว่า authenticated เรียก transition_order ตรงไม่ได้แล้วบน prod** |
| **H1** | ✅ แก้แล้ว | `_shared/db.ts` `resolveOrCreateCustomer` ใส่ `nickname` ลง upsert เฉพาะเมื่อถูกส่งมาจริง (เลิกทับ null) |
| **L1** | ✅ แก้แล้ว | `lib/auth/useAuthSession.ts` `ensureProfile` เป็น best-effort (legacy `profiles` ล้มไม่ทำ sign-in พัง) |
| **H2** | ✅ **APPLIED + DEPLOYED บน prod (2026-06-15)** | migration `20260614010000_h2_line_webhook_event_dedup.sql` (ตาราง `line_webhook_events` event_id PK + RLS staff-read) · `line-webhook/index.ts` claim ทุก event ด้วย `webhookEventId` ก่อนทำงาน redelivery ที่ซ้ำจะถูก skip (release claim เมื่อ fail เพื่อให้ retry ได้) — เหลือ manual LINE dup-tap spot-check |
| **M1** | ✅ แก้แล้ว | `line-webhook/index.ts` หุ้มแต่ละ event ด้วย try/catch — event เดียว fail ไม่ทำให้ทั้ง batch 500/redeliver; ตอบ `{ processed, skipped }` |
| **M2** | ✅ แก้แล้ว | `_shared/openai.ts` `callOrderFieldExtractor` normalize (ตัด `space`/`-`) + validate `^0[689]\d{8}$` แบบเดียวกับ form; เบอร์ไม่ผ่านถูก drop (ถามต่อ) — ไม่แตะสัญญา `callMiraPrompt` |
| **L2** | ✅ แก้แล้ว | `_shared/orders.ts` `toOrderPanel` หุ้ม `buildPromptPayPayload` ด้วย try/catch → degrade เป็น panel ไม่มี QR + log แทน 500; ที่มาของจำนวนเงินไม่เปลี่ยน |

ยืนยันหลังแก้ (รอบรวม): `npm run v2:verify` ✅ **เขียวทั้งชุด** (typecheck · 17 deterministic gates รวม `orders:rpc-grant-audit` ใหม่ · `v2:deno-check` · `v2:deno-test` 113/113)

**Shipped to prod 2026-06-15:** PR #18 merged → main · C1 + H2 migrations applied to live `xwixdxmemwcuoamcloty` · ทั้ง 14 edge functions redeployed (bundle mojibake-verified) · **CI `live-regression` เขียวทั้งก่อนและหลัง deploy** (ยิงเข้า prod จริง รวม assertion `expectTransitionOrderRpcDenied`). เหลือเดียว: manual LINE dup-tap spot-check (CI จำลอง LINE ไม่ได้)

> หมายเหตุ LINE: หลัง dedup นี้ การ "ปิด LINE Webhook redelivery" ไม่จำเป็นต้องเป็นเงื่อนไขบังคับอีก (webhook idempotent ระดับ event แล้ว) — เป็น at-most-once: ถ้า event สำเร็จแล้ว LINE ส่งซ้ำจะถูก skip; ถ้า fail จะปล่อย claim ให้ retry ได้

## 5. ขอบเขต/ข้อจำกัดของรายงานนี้

- เป็น **static analysis** จากโค้ดใน worktree ไม่ได้แตะ live (ตาม AGENTS.md §5 live = owner territory) — C1/L1 ที่อิงสภาพ grant/schema จริง ต้องให้ owner รันคำสั่งตรวจใน §1 ยืนยัน
- ไม่ได้รัน `npm run v2:verify` ในรอบนี้ (เป็นการตรวจ ไม่ใช่แก้); gate ปัจจุบัน 17 ตัวยังไม่ครอบคลุม "ใครเรียก RPC ได้" — แนะนำเพิ่มตาม C1
