# Claude Code Prompt — LINE AI Commerce & Operations Platform (FINAL)

> **วิธีใช้:** วางไฟล์นี้ไว้ที่ root ของ repo แล้วสั่ง Claude Code:
> *"อ่านไฟล์นี้ทั้งหมด แล้วเสนอแผนงาน Week 1 ตาม Section 8 ก่อนเริ่มเขียนโค้ด"*
>
> ทุกค่าธุรกิจ confirm กับลูกค้าแล้ว · ค่าที่ mark **[DEFAULT]** คือค่าที่ทีมตัดสินใจแทนไปก่อน — ให้ build ตามนี้เลย แต่ต้องออกแบบให้แก้ได้ผ่าน `app_settings` โดยไม่แก้โค้ด · **ห้ามเดากติกาใหม่เอง** ถ้าเจอกรณีที่เอกสารนี้ไม่ครอบ ให้หยุดถามผู้ใช้

---

## 1. Project Context

ระบบขายอัตโนมัติบน LINE OA: ลูกค้าซื้อของผ่านการคุยกับ **AI ใน LINE OA ตัวเดียว** ตั้งแต่เลือกสินค้า → แจ้งที่อยู่ → คำนวณค่าส่ง → ชำระเงิน → ติดตามสถานะจนของถึงมือ ฝั่งหลังบ้านมี Stock, Packing, Rider (รอบรายชั่วโมง 24 ชม.), Payroll/Commission, Team Chat, HR Check-in และ Admin Panel

**หัวใจของระบบ: การแจ้งเตือนทุกเหตุการณ์ — ทั้งฝั่งลูกค้าและฝั่งพนักงานหลังบ้าน — วิ่งผ่าน LINE OA ตัวเดียวกันทั้งหมด** (Section 6)

ผู้ใช้ 5 บทบาท: Owner/Admin, Stock, Packer, Rider, Staff — ใช้ Web App เดียว (mobile-first สำหรับ Rider/Packer) · ลูกค้าใช้ผ่าน LINE เท่านั้น

## 2. Tech Stack & Setup

- **Frontend:** Vite + React 18 + TypeScript (strict) + Tailwind + React Router + TanStack Query + `vite-plugin-pwa` แบบเบา (manifest + icons + installable — **ไม่ทำ offline caching**)
- **Backend:** Supabase — Postgres, Auth (email/password พนักงาน), RLS ทุกตาราง, Realtime (team chat + order board), Storage, Edge Functions (Deno), pg_cron/Scheduled Functions
- **External:** LINE Messaging API (webhook + push + Flex Message), Anthropic API สำหรับ AI Agent (เริ่มที่ `claude-sonnet-4-6`, ตั้ง model ผ่าน env)
- **Timezone: Asia/Bangkok ทุกการคำนวณรอบและ cron** — ระบบทำงาน 24 ชม. ทุกวัน

```
/src                     # React app — routes: /admin /stock /packer /rider /staff
/supabase/migrations     # SQL migrations เท่านั้น
/supabase/functions/     # line-webhook, ai-sales-agent, notify, round-lock,
                         # payroll-cutoff, fare-calc, slip-verify
/supabase/seed.sql
.env.example             # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
                         # SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_SECRET,
                         # LINE_CHANNEL_ACCESS_TOKEN, ANTHROPIC_API_KEY, AI_MODEL,
                         # SLIPOK_API_KEY, SLIPOK_BRANCH_ID
```

## 3. กติกาธุรกิจ (Confirmed — บังคับใช้ตามนี้)

### 3.1 รอบจัดส่ง Rider — รายชั่วโมง ตลอด 24 ชม.

- รอบออกทุกต้นชั่วโมง (…, 13:00, 14:00, 15:00, …) ทุกวัน ไม่มีวันหยุด
- **Cutoff = นาทีที่ :30 ก่อนรอบ** — ให้ `T` = เวลาที่ออเดอร์สมบูรณ์ (ชำระเงินยืนยันแล้ว, ดู 3.6):
  - `minute(T) < 30` → เข้ารอบต้นชั่วโมงถัดไป (12:29 → รอบ 13:00)
  - `minute(T) >= 30` → เข้ารอบต้นชั่วโมง +2 (12:31 หรือ 12:30 เป๊ะ → รอบ 14:00)
- AI แจ้งลูกค้าทันทีที่ออเดอร์สมบูรณ์ว่าได้รอบไหน
- ทุกนาทีที่ :30 (cron `round-lock`): lock รอบถัดไป → แจ้ง Packer รายการที่ต้องแพ็ค (**Packer มีเวลา ~30 นาที**) → แจ้ง Rider ว่ามีรอบพร้อมให้กดรับ
- Rider **กดยืนยันรับรอบ** → ลูกค้าทุกคนในรอบได้แจ้งเตือน "ออเดอร์อยู่ในรอบ __:00 เตรียมรับของ"

### 3.2 Multi-stop สไตล์ Grab (สำคัญ — จุดขายของระบบ)

รอบหนึ่งมีหลายจุดส่ง เรียงเป็น stop 1, 2, 3, …

1. Rider กด **"เริ่มส่งจุดที่ 1"** → ลูกค้าจุด 1 ได้แจ้งเตือน "Rider กำลังจัดส่งไปหาคุณ"
2. ถึงจุด → ปิดจุดด้วย **POD (บังคับรูป)** หรือ **ตีกลับ** (ดู 3.4)
3. Rider กด **"เริ่มส่งจุดถัดไป"** เอง → ลูกค้าจุดถัดไปได้แจ้งเตือน — ทำซ้ำจนครบ
4. ครบทุกจุด → จบรอบ → นับค่าวิ่ง 25 บาทเข้า payroll ของ Rider

ประสบการณ์ลูกค้าต้องเหมือนแอป Grab แต่ผู้แจ้งคือ LINE OA

### 3.3 ประเภทการส่งและค่าส่ง (อ่านเรทจาก `app_settings` เท่านั้น)

| ประเภท | เงื่อนไข | ค่าส่งที่เก็บลูกค้า | การทำงาน |
|---|---|---|---|
| ปกติ (Rider) | ในเขตบริการ | `normal_fee` (ตั้งใน settings) | เข้ารอบรายชั่วโมงตาม 3.1 |
| ด่วน (Grab) | ไม่รอรอบ | `normal_fee + 55` | แจ้ง Packer แพ็คทันที → ทีมเรียก Grab ผ่านแอป Grab เอง + กรอกเลขอ้างอิง **[DEFAULT: ไม่เชื่อม Grab API]** |
| นอกเขต (Lalamove) | นอกเขตบริการ | ≤5 กม. 50 · ≤10 กม. 80 · ≤14 กม. 100 · **เกิน 14 กม. +10 บาท/กม.** | เรียกผ่านแอป Lalamove (deep link) + กรอกเลขอ้างอิง |
| พัสดุ (Kerry) | ต่างจังหวัด/ไกล | 100 บาท | เข้า "รอบ Kerry" วันละครั้ง — แอดมินกดสร้างรอบของวัน, Kerry มารับช่วง 11:00–14:00 แล้วแต่วัน → mark ส่งมอบแล้ว (+เลขพัสดุ) |

**เขตบริการ [DEFAULT]:** รัศมี km จากพิกัดร้าน (ค่าใน settings) + แอดมิน override โซนรายลูกค้าได้

### 3.4 ตีกลับและส่งซ้ำ

- เงื่อนไขตีกลับ: ถึงแล้วลูกค้าไม่มารับ + โทรไม่รับ + **รอ 5 นาที** → Rider กด "ตีกลับ" + **บังคับกรอกเหตุผล**
- ระบบแจ้งลูกค้า: เหตุผล + ต้อง**ชำระค่าส่งใหม่**เพื่อส่งอีกครั้ง (ช่องทางเดียวกับ 3.6)
- ชำระแล้ว → ระบบสร้างออเดอร์ใหม่ (ผูก `parent_order_id`) → เข้ารอบถัดไปตามกติกา 3.1 ตามปกติ — ไม่มีกติกาพิเศษเรื่องต้องเป็น Rider คนเดิม
- ของตีกลับถึงคลัง → คืนสต็อก

### 3.5 สินค้าและสต็อก

- **หมวดสินค้า: ทีมเพิ่ม/แก้/ปิดหมวดเองได้** (ตาราง `categories` + CRUD ใน UI) — สินค้าผูก category_id
- ปรับสต็อกได้เฉพาะ role stock/admin · **ของเข้า (qty บวก) บังคับแนบรูป**
- เพิ่มสินค้าต้องกรอก: ชื่อ, หมวด, ราคา, สต็อกตั้งต้น, **เรท commission ของ Packer ต่อชิ้น**
- **[DEFAULT] วงจรสต็อก:** จองเมื่อออเดอร์ชำระแล้ว (paid) → ตัดจริงเมื่อ packed → คืนเมื่อ cancelled/returned-ถึงคลัง · ยกเลิกออเดอร์ได้ก่อนสถานะ packing

### 3.6 การชำระเงิน — ตรวจสลิปอัตโนมัติด้วย SlipOK

- โอนธนาคาร/PromptPay · AI ส่งข้อมูลบัญชี → ลูกค้าส่ง**รูปสลิปในแชท LINE**
- ระบบเรียก **SlipOK API ตรวจสลิปอัตโนมัติ** (edge function `slip-verify`, สเปคใน Section 7.1) — ตรวจครบใน request เดียว: สลิปจริง/ปลอม, ยอดตรงกับออเดอร์, บัญชีผู้รับตรงกับร้าน, และกันสลิปซ้ำ
- **ผ่านทุกเงื่อนไข** → ออเดอร์เป็น `paid` อัตโนมัติทันที (เริ่มนับรอบจากจุดนี้ตาม 3.1) → AI แจ้งลูกค้าว่าชำระสำเร็จ + ได้รอบไหน — **ไม่ต้องรอแอดมิน**
- **ไม่ผ่าน** (ยอดไม่ตรง/บัญชีผิด/สลิปซ้ำ/อ่าน QR ไม่ได้) → ออเดอร์เป็น `pending_verify` เข้า**คิวตรวจมือ**ใน Admin Panel + แจ้ง admin → แอดมินตัดสินใจ (ยืนยัน/ปฏิเสธ) พร้อมเห็นเหตุผลจาก SlipOK
- กรณีธนาคารต้น delay (เช่น ต้องรอ X นาทีหลังโอน) → ระบบแจ้งลูกค้าให้รอแล้วส่งใหม่ ไม่ตัดโควตา
- ไม่มี COD ใน v1 · ค่าส่งรอบ 2 (กรณีตีกลับ) ใช้ flow ตรวจสลิปเดียวกัน
- เก็บทุกรายการใน `payments` + เก็บ transRef ที่ SlipOK คืนมาไว้กันสลิปซ้ำในฝั่งเราเองด้วย (ดู 7.1)

### 3.7 Payroll & Commission

- **Rider: 25 บาท/รอบที่วิ่งจบ** (ไม่ใช่ต่อออเดอร์ — ค่าตั้งได้ใน settings) · **Packer: commission ต่อชิ้นตามเรทสินค้า** บันทึกตอนสถานะ packed
- Cron `payroll-cutoff`: **คืนวันอาทิตย์ 00:00 น. ของวันจันทร์ (เที่ยงคืนอาทิตย์ TZ ไทย)** ปิดรอบสัปดาห์
- ระบบ**ไม่โอนเงินเอง** — หน้าที่ระบบ: สรุปยอดต่อพนักงานให้ผู้บริหารเห็นทันทีที่ตัดรอบ → ผู้บริหารโอนก่อนเที่ยงวันจันทร์ → กด**ปุ่ม "ยืนยันโอนแล้ว" + แนบสลิป** ต่อคนต่อรอบ (ตาราง `payroll_payouts`)
- Rider เห็น Stats เงินสะสม real-time + Payroll Full Details ย้อนหลัง

### 3.8 HR Check-in & กะ

- 3 กะครอบ 24 ชม. — **นิยามกะเป็นข้อมูลที่แอดมินตั้งเองใน UI** (ตาราง `shifts` CRUD) ไม่ hardcode
- Check-in: ถ่ายรูป + GPS ต้องอยู่ในรัศมีจาก settings → บันทึก pass/fail (ระบบ "บันทึก" ไม่บล็อกการทำงาน)

### 3.9 Analytics — "สถิติคร่าวๆ" ห้าม over-engineer

- ยอดขาย · **จำนวนบ้าน = จำนวนออเดอร์** · วันไหนขายดี · ช่วง default วันที่ 1–สิ้นเดือน (เลือกช่วงเองได้) · ค้นประวัติด้วยเลขออเดอร์

## 4. Roles & Access (RLS)

| Role | สิทธิ์ |
|---|---|
| admin | ทุกอย่าง + settings + คิวตรวจสลิป + payroll/payout + จัดการ user + ตอบแชทลูกค้าแทน AI |
| stock | categories/products CRUD, stock_movements (+รูปของเข้า) |
| packer | คิวแพ็คของรอบ, claim งาน, รูปแพ็ค |
| rider | รับรอบ, multi-stop, POD, ตีกลับ, stats ของตัวเอง |
| staff | team chat + check-in |

หนึ่ง user หลาย role ได้ · client ใช้ anon key + RLS เท่านั้น · การเปลี่ยนสถานะออเดอร์/รอบทำผ่าน RPC หรือ edge function (service role) และ**ต้อง insert `order_events` ในทรานแซกชันเดียวกันเสมอ**

## 5. Database Schema (migration แรก)

**Enums:** `order_status`: pending → paid → confirmed(เข้ารอบ) → packing → packed → out_for_delivery → delivering(จุดของฉันเริ่มแล้ว) → delivered | returned → awaiting_redelivery_fee | cancelled · `delivery_type`: rider | express_grab | lalamove | parcel_kerry · `drop_option`: leave | wait · `payment_status`: unpaid | pending_verify | paid | rejected · `round_status`: open → locked → confirmed → in_progress → done · `user_role`: admin | stock | packer | rider | staff

| Table | คอลัมน์หลัก (ทุกตารางมี created_at/updated_at) |
|---|---|
| `profiles` | user_id, name, phone, roles user_role[], **line_user_id (nullable), link_code** (สำหรับผูก LINE), active |
| `categories` | name, active — ทีม CRUD เอง |
| `products` | name, category_id, price, stock_qty, reserved_qty, packer_commission_rate, active |
| `stock_movements` | product_id, qty, photo_url (บังคับเมื่อ qty > 0), actor_id, reason |
| `customers` | line_user_id unique, name, phone, address_text, lat, lng, zone_override |
| `orders` | order_no `ORD-YYMMDD-###`, customer_id, status, delivery_type, delivery_fee, drop_option, round_id, **stop_sequence**, packer_id, payment_status, parent_order_id, external_ref (Grab/Lalamove/Kerry), cancelled_reason |
| `order_items` | order_id, product_id, qty, unit_price snapshot, commission_snapshot |
| `payments` | order_id, amount, kind (goods/delivery/redelivery), method, slip_photo_url, status, verified_by, **slipok_trans_ref (unique, กันสลิปซ้ำ), slipok_raw jsonb (response เต็มจาก SlipOK), auto_verified boolean** |
| `delivery_rounds` | round_at (timestamptz ต้นชั่วโมง), type (rider/kerry), status round_status, rider_id |
| `order_events` | order_id, from_status, to_status, actor_id, photo_url, note — **single source of truth** |
| `returns` | order_id, reason, redelivery_fee_status, new_order_id |
| `chat_channels` / `chat_messages` | ห้อง, sender_id, text, image_url (Realtime) |
| `shifts` / `attendance` | นิยามกะ (CRUD), user_id, photo_url, lat/lng, geofence_pass, shift_id |
| `payroll_periods` / `payroll_items` | period, user_id, kind (rider_round/packer_commission), ref, amount |
| `payroll_payouts` | period_id, user_id, total, slip_photo_url, confirmed_by, paid_at |
| `line_conversations` | line_user_id, role (user/ai/admin), message, handoff boolean |
| `notifications` | recipient_line_user_id, audience (customer/staff), template, payload jsonb, status — log ทุก push เพื่อ debug |
| `app_settings` | key-value: normal_fee, express_surcharge (55), ตาราง lalamove + per_km_over_14 (10), kerry_fee (100), rider_fee_per_round (25), service_radius_km + store lat/lng, checkin_radius_m, ai_model ฯลฯ |

**Storage buckets (private + signed URL):** `stock-in`, `packing`, `pod`, `checkin`, `team-chat`, `payment-slips`, `payout-slips`

## 6. Notification Matrix — ทุกอย่างผ่าน LINE OA (edge function `notify` ตัวเดียว, log ลง `notifications`)

**พนักงานผูก LINE:** พนักงาน add LINE OA → พิมพ์ link code จากหน้าโปรไฟล์ตัวเอง → webhook จับคู่ `line_user_id` เข้า `profiles` — พนักงานที่ยังไม่ผูกต้องเห็น banner เตือนใน web app

| เหตุการณ์ | ลูกค้าได้รับ | พนักงานได้รับ |
|---|---|---|
| ออเดอร์สร้าง (pending) | สรุปออเดอร์ + ข้อมูลชำระเงิน | — |
| ลูกค้าส่งสลิป | "รับสลิปแล้ว กำลังตรวจ" | — (auto) หรือ **admin:** เข้าคิวตรวจมือ (เฉพาะเคสที่ SlipOK ไม่ผ่าน) |
| สลิปผ่าน (auto) | "ชำระสำเร็จ ได้รอบ __:00" | — |
| รอบ lock (นาที :30) | — | **packer:** รายการต้องแพ็คของรอบ · **rider:** รอบพร้อมกดรับ |
| แพ็คเสร็จ | **รูปแพ็ค + เลขออเดอร์** | — |
| Rider กดรับรอบ | "รอบ __:00 กำลังออก เตรียมรับของ" (ทุกคนในรอบ) | — |
| Rider เริ่มจุดของฉัน | "Rider กำลังจัดส่งไปหาคุณ" | — |
| ส่งสำเร็จ | รูป POD + ขอบคุณ | — |
| ตีกลับ | เหตุผล + วิธีชำระค่าส่งใหม่ | **admin:** มีตีกลับ |
| ออเดอร์ด่วน (Grab) จ่ายแล้ว | สถานะตามจริง | **packer + admin:** แพ็คด่วน/เรียก Grab |
| ตัดรอบ payroll | — | **admin/owner:** ยอดสัปดาห์พร้อมโอน · **rider/packer:** ยอดของฉันรอบนี้ |
| ยืนยันโอนเงิน | — | **พนักงานคนนั้น:** โอนแล้ว + สลิป |

## 7. AI Sales Agent (`ai-sales-agent`)

- **AI ปิดการขายเองครบวงจรจนชำระเงินเสร็จ:** ทักทาย → เสนอสินค้า (จากหมวด + สต็อกจริง real-time เท่านั้น ห้ามเสนอของหมด) → เก็บที่อยู่ **[DEFAULT: ขอที่อยู่เป็นข้อความ + ชวนกด LINE share location]** → ตัดสินโซน + เสนอทางเลือกส่ง/ราคา (ปกติ/ด่วน+55/Lalamove/Kerry) → สรุปออเดอร์ให้ลูกค้ายืนยัน → สร้างออเดอร์ pending → ส่งข้อมูลชำระเงิน → รับสลิป → หลังยืนยันแจ้งรอบ
- หลังปิดการขาย ทุกการแจ้งเตือนวิ่งตาม matrix (Section 6) — AI ตอบคำถามสถานะได้จาก `order_events`
- **Handoff [DEFAULT]:** ลูกค้าขอคุยกับคน / ร้องเรียน / AI ไม่มั่นใจติดกัน 2 ครั้ง → แจ้ง admin + set handoff=true (AI หยุดตอบห้องนั้นจนแอดมินปิดเคส)
- Log ทุกข้อความลง `line_conversations` · webhook ต้อง verify LINE signature

### 7.1 SlipOK Integration (edge function `slip-verify`)

ลูกค้าใช้บริการ **SlipOK** — เชื่อมผ่าน API โดยตรง (ไม่ใช้ WordPress plugin/LINE chatbot ของ SlipOK) ต้นทุนคิดตามแพ็กเกจ SlipOK ของลูกค้า ไม่ใช่ต่อ call กับเรา

**Endpoint:** `POST https://api.slipok.com/api/line/apikey/{SLIPOK_BRANCH_ID}`
**Header:** `x-authorization: {SLIPOK_API_KEY}` (เก็บใน env ฝั่ง edge function เท่านั้น ห้ามหลุดไป client)

**Request body — ส่งได้อย่างใดอย่างหนึ่งใน 3 แบบ:**
- `{ data: string }` — ค่าที่อ่านได้จาก QR มุมขวาล่างของสลิป (เร็วสุด แม่นสุด — พยายามใช้ตัวนี้ก่อน)
- `{ files: File }` — ไฟล์รูปสลิป (.jpg/.jpeg/.png/.jfif/.webp)
- `{ url: string }` — URL รูปสลิป **⚠️ signed S3 / Google Drive อาจใช้ไม่ได้** ดังนั้น**อย่าส่ง signed URL ของ Supabase Storage** — ให้ดึงไฟล์จาก bucket มาแล้วส่งแบบ `files` แทน
- แนบเสมอ: `{ log: true }` (ให้ SlipOK เก็บยอด + เช็คสลิปซ้ำ + เช็คบัญชีผู้รับที่ผูกไว้) และ `{ amount: <ยอดออเดอร์> }` (ให้ SlipOK เทียบยอดให้ ถ้าไม่ตรงจะได้ error 1013)

**Flow ใน `slip-verify` (ทำงานด้วย service role):**
1. รับ order_id + สลิป (พยายามอ่าน QR เป็น `data` ก่อน, ไม่ได้ค่อย fallback เป็น `files`)
2. เรียก SlipOK พร้อม `amount` = ยอดออเดอร์ + `log: true`
3. **ก่อนเชื่อว่าจ่ายจริง เช็คซ้ำฝั่งเราเองทุกครั้ง** (อย่าเชื่อ HTTP 200 ลอยๆ): `success === true` **และ** `data.amount` == ยอดออเดอร์ **และ** `data.receivingBank` + บัญชีผู้รับ == บัญชีร้านใน settings **และ** `data.transRef` ยังไม่เคยมีใน `payments.slipok_trans_ref`
4. ผ่านหมด → insert `payments` (auto_verified=true, เก็บ transRef + raw) → เปลี่ยนออเดอร์เป็น `paid` (+order_events ในทรานแซกชันเดียว) → trigger คำนวณรอบ + notify ลูกค้า
5. ไม่ผ่าน → ออเดอร์ `pending_verify` + เก็บ error ไว้ให้แอดมินเห็นในคิวตรวจมือ

**Error codes ที่ต้อง handle เฉพาะ (อย่าโยน error รวมๆ):**
- `1012` สลิปซ้ำ (เคยส่งเมื่อ timestamp) → บอกลูกค้าว่าสลิปนี้ใช้แล้ว
- `1013` ยอดไม่ตรงกับสลิป → ขอสลิปที่ยอดถูกต้อง
- `1014` บัญชีผู้รับไม่ตรงกับบัญชีร้าน → flag เข้าคิวตรวจมือ (อาจโอนผิดบัญชี/สลิปปลอม)
- `1010` ธนาคารต้น delay → บอกลูกค้ารอ N นาทีแล้วส่งใหม่ (ยังไม่ตัดโควตา)
- `1009` ธนาคารขัดข้องชั่วคราว → retry อัตโนมัติภายหลัง (ไม่ตัดโควตา)
- `1007`/`1008`/`1011` QR อ่านไม่ได้/ไม่ใช่ QR ชำระเงิน/QR หมดอายุ → ขอลูกค้าส่งสลิปใหม่
- `1003`/`1004` แพ็กเกจ SlipOK หมดอายุ/เกินโควตา → **แจ้ง admin ด่วน** (ระบบตรวจอัตโนมัติหยุดทำงาน ต้อง fallback ตรวจมือทั้งหมด)
- มี route `GET .../quota` เช็คโควตาคงเหลือ — ทำหน้าเล็กๆ ใน Admin ให้เห็นโควตา SlipOK + เตือนเมื่อใกล้หมด

**หมายเหตุ:** ค่าชื่อ/บัญชีใน response ถูก mask บางส่วน (เช่น `xxx-x-x0209-x`) → เทียบบัญชีร้านแบบ partial match ตามหลักที่ SlipOK แนะนำ ไม่ใช่ exact string

 — 4 สัปดาห์ (timeline ลูกค้า = 1 เดือน) หยุดรอ review ท้ายทุกสัปดาห์

**Week 1 — Foundation & Catalog:** repo + migrations ทั้งหมด + RLS · auth + role routing + PWA เบา · categories/products/stock (+รูปของเข้า) · Settings UI · `line-webhook` skeleton + `notify` + ระบบผูก LINE พนักงาน (link code)

**Week 2 — Orders, Rounds & Packing:** rounds engine (รายชั่วโมง 24/7, cutoff :30, TZ Bangkok, cron `round-lock`) · orders + fare engine ครบ 4 ประเภท · payments + `slip-verify` (SlipOK auto-verify ตาม 7.1) + คิวตรวจมือสำหรับเคสไม่ผ่าน · Packing Station (~30 นาที/รอบ) + รูป → notify ลูกค้า · admin order board รายรอบ
**DoD:** สร้างออเดอร์ (แอดมิน manual) → ลูกค้าส่งสลิป → SlipOK ตรวจผ่าน → ออเดอร์ `paid` อัตโนมัติ → เข้ารอบถูกชั่วโมง → แพ็ค → ลูกค้าได้ Flex รูป+เลขออเดอร์จริงใน LINE (+ทดสอบเคสสลิปซ้ำ/ยอดไม่ตรง เด้งเข้าคิวตรวจมือ)

**Week 3 — Rider & Delivery:** Rider mobile UI: กดรับรอบ (→ ลูกค้าทั้งรอบโดนแจ้ง) → multi-stop → POD/ตีกลับ+เหตุผล → ส่งซ้ำ (จ่ายใหม่ → ออเดอร์ใหม่อัตโนมัติ) · flow ด่วน Grab + Lalamove + รอบ Kerry รายวัน
**DoD:** loop ขาย→แพ็ค→ส่ง ครบทั้ง 4 ประเภทการส่ง พร้อมแจ้งเตือนครบ matrix

**Week 4 — AI + Ops + ปิดงาน:** `ai-sales-agent` เต็มรูป + handoff · payroll (25/รอบ + commission, cron อาทิตย์เที่ยงคืน, หน้า payout + ปุ่มยืนยันโอน + สลิป, Stats Rider) · check-in + geofence + shifts CRUD · team chat · analytics คร่าวๆ · seed จริง + hardening + UAT
**ลำดับการตัดถ้าเวลาไม่พอ (ตัดจากท้าย):** analytics → team chat → check-in — **ห้ามตัด AI และ payroll**

## 9. Working Style สำหรับ Claude Code

1. อ่านไฟล์นี้ทั้งหมด → เสนอแผน Week 1 (รายการไฟล์ + migrations + ลำดับ) ให้ approve ก่อนเขียนโค้ด
2. **ห้าม hardcode เรท/เวลา/รัศมีใดๆ** — อ่านจาก `app_settings` เสมอ · ทุก state change ผ่าน RPC/edge function + `order_events`
3. Migration ใหม่ = ไฟล์ใหม่ ห้ามแก้ไฟล์ที่ apply แล้ว · commit เป็นงานย่อย message ชัดเจน
4. TypeScript strict ไม่ใช้ `any` · UI ภาษาไทยทั้งหมด · โค้ด/ตัวแปรอังกฤษ · Rider/Packer หน้าจอ mobile-first ปุ่มใหญ่กดง่าย
5. เวลาและ cron ทั้งหมด = Asia/Bangkok — เขียน test เคสขอบ cutoff (12:29 / 12:30 / 12:31) และเคสข้ามเที่ยงคืน/ข้ามวัน
6. **การยืนยันการชำระเงินทำฝั่ง server (edge function + service role) เท่านั้น** — client ห้ามเป็นคนบอกว่า "จ่ายแล้ว" · SlipOK key อยู่ใน env ฝั่ง server · ต้อง re-validate ยอด+บัญชี+สลิปซ้ำเองทุกครั้งก่อนเปลี่ยนออเดอร์เป็น paid (ตาม 7.1)
7. ถามก่อนติดตั้ง dependency นอกรายการ Section 2 · จบแต่ละ Week: สรุปสิ่งที่ทำ, วิธีทดสอบ, จุดที่ตัดสินใจเอง แล้วรอคำสั่ง
