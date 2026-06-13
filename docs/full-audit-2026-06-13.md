# MiraCare Full Audit — 2026-06-13

ผู้ตรวจ: Claude (owner-side) · ฐาน: `main` @ `68ab0cd` · วิธี: Understand-Anything pipeline (deterministic scan 287 ไฟล์ + tree-sitter import map 267 เส้น + LLM semantic analysis) + อ่าน plan/audit docs ทั้งหมด
ผลพลอยได้: `.understand-anything/knowledge-graph.json` (470 nodes / 671 edges / 11 layers / tour 12 ตอน สรุปไทยทุกไฟล์) + interactive dashboard + `miracare-audit-whiteboard.html`

---

## 1. Verdict (TL;DR)

**แกนโปรดักส์สร้างเสร็จและผ่านการตรวจแล้ว — สิ่งที่ขวางการขายไม่ใช่ feature แต่เป็นงานปิดท้าย 4 เรื่อง:**

1. **P0 — หน้า Home ของแอปพังบน clean checkout:** `app/index.tsx` import `components/MiraLandingPage` ที่ไม่เคยถูก commit (ติดอยู่ใน stash `ef43b79`). กู้ด้วย `git show ef43b79:components/MiraLandingPage.tsx > components/MiraLandingPage.tsx` แล้ว commit (typecheck ปัจจุบันผ่านได้เฉพาะเครื่องที่มีไฟล์ untracked ค้างอยู่)
2. **P0 — Showcase (เครื่องมือปิดดีล) ยังไม่ทำ:** S0 ✅ แต่ S1 (Netflix home) / S2 (mockup 5 หน้า) / S3 (tour) ❌ ทั้งหมด ทั้งที่ decision DECIDED ครบ
3. **P1 — Prompt default ยัง v2:** V3-3 (flip → v3) เป็นงาน owner, staging pin v3 ผ่านแล้ว
4. **P1 — LINE ยังเปิดจริงไม่ได้:** ขาด credentials (external) + V3-4 (branch picker บน LINE + ดึงอายุ) — ถ้าเปิดตอนนี้ออเดอร์หลายสาขาบน LINE จะค้าง

ความพร้อมรวมโดยประมาณ: **Chat commerce 90% · Admin 85% · Referral 85% · Health 75% · LINE 60% (โค้ดเสร็จ/ยังไม่ live) · Showcase 25% · เว็บการตลาด 95%**

---

## 2. ระบบที่ "มีแล้ว" พร้อมหลักฐาน

| ระบบ | สิ่งที่มี | หลักฐาน |
|---|---|---|
| AI Chat | published prompt (ID-only, 5 ตัวแปร, store:false), marker → การ์ด, ประวัติ persist + การ์ด persist, fact memory แบบ consent-gated, rate limit, idempotent client_msg_id | v3 audit §A ผ่านหมด, live regression 10/10 |
| In-chat commerce | select_product → selecting_branch → collecting_info → awaiting_payment (PromptPay QR + CRC) → submitted → confirmed → booked → done; slip upload signed URL; card suppression ระหว่างจ่าย | `v2:e2e-commerce` ผ่าน live ทั้งซื้อตรง/referral/v3 branch flow |
| Order integrity | `transition_order` RPC เป็นทางเดียวเปลี่ยนสถานะ; ราคาจาก `products.price_baht`; commission จาก scheme snapshot | `orders:status-audit` คุมทั้ง repo; A1/A2 migrations |
| Admin | คิวออเดอร์ (transcript+สลิป+actions+booking เวลาไทย), catalog CRUD + รูป + categories + multi-branch, referrer/commission จัดการครบ | components/admin/* + admin-order-action |
| Referral | /r/<code> attribution 30 วัน (Crockford 6 ตัว, DB-generated, immutable), commission อัตโนมัติเมื่อ confirmed, assisted purchase (รับ buyer_age + branch แล้ว — R1) | Phase 4 + B8 + R1 (เหลือ live leg) |
| Health | lab-ingest (vision + normalize 15 รหัส + confidence gate), lab-confirm (ลูกค้ายืนยัน), สรุปไทย sanitize + disclaimer เสมอ, wearable Apple Health zip streaming, dashboard อ่าน DB เท่านั้น | Phase 5 + B7 + health-safety-audit |
| LINE (โค้ด) | webhook + HMAC ต่อ tenant, Flex carousel, QR image, postback → action, push แจ้ง confirmed/booked | Phase 6 + A4 + line_test.ts |
| Multi-tenant | tenants/customers/tenant_members + RLS ทุกตารางธุรกิจ, service-role เฉพาะใน edge, internal functions มี constant-time guard | live `rls-check` ผ่าน (รวม v3 tables) |
| คุณภาพ | `v2:verify` = 17 deterministic gates ทุก PR; Deno tests 83+; live gates (seed/RLS/regression/E2E) ใน CI เมื่อมี secrets | `.github/workflows/miracare-v2.yml` |
| เว็บการตลาด | mira.com landing (Astro+GSAP+motion, Thai-first, ฟอนต์ self-host, reduced-motion) | L0–L6 DoD ✅ เกือบหมด |

## 3. สิ่งที่ "ยังขาด" (สถานะจากเอกสาร + โค้ดจริง)

| # | รายการ | ที่มา | ขนาด |
|---|---|---|---|
| P0 | กู้ `components/MiraLandingPage.tsx` จาก stash `ef43b79` หรือแก้ route `/` | พบใน audit นี้ | 10 นาที |
| P0 | Showcase S1–S3 (Netflix home, mockup 5 หน้า, TourPill, demo sign-in) | showcase plan §4–§7 (kickoff prompt ใน Appendix A) | 1–2 สัปดาห์ |
| P1 | V3-3: flip prompt default → v3 + regression + ลบ env pin | v3 plan §2.4 (งาน owner) | ~1 ชม. owner |
| P1 | V3-4: LINE branch picker + `callOrderFieldExtractor` ดึง buyer_age | v3 audit F2+N1 | กลาง |
| P1 | LINE sandbox credentials + manual checklist | docs/line-setup.md (external) | external |
| P1 | R4: PDPA export + hard-delete (DECIDED defaults ครบ) | followups plan §R4 | กลาง |
| P1 | Legal sign-off `LAB_SUMMARY_DISCLAIMER_TH` | v2-open-questions (OWNER-REVIEW) | owner |
| P2 | R2: buyer_age → user_facts (consent-gated) | followups plan §R2 / audit F1 | เล็ก |
| P2 | R1 ข้อสุดท้าย: live e2e assisted-purchase leg | followups plan §R1 DoD ❌ | เล็ก (ต้อง secrets) |
| P2 | R5: wearable import entity + source_ref | followups plan §R5 | เล็ก |
| P2 | R6: known-user personalization case ใน live regression | followups plan §R6 | เล็ก |
| P2 | Lab live proof กับรูปจริง + dashboard visual proof | v2-gap-analysis Phase 5 Partial | เล็ก (ต้อง owner จัดรูป) |
| P2 | Phone OTP / LINE Login (วิชัน PRODUCT.md — ตอนนี้ email/password MVP) | PRODUCT.md vs lib/auth | กลาง |
| P3 | Admin KPI dashboard จริง, per-tenant theming runtime, commission payout จริง, legacy cleanup (v1 systems), เคลียร์ uncommitted website/ changes | — | อนาคต |

## 4. ความเสี่ยงเชิงโครงสร้าง (สำหรับ dev)

- **จุดแข็ง:** ทุกช่องทางใช้ orchestrator + state machine + DB เดียวกัน; protected core มีกฎ + audit คุมจริง; migrations additive + RLS มาพร้อมกันเสมอ; type/template mirrors มี CI บังคับ sync — onboarding dev ใหม่ให้เริ่มที่ `AGENTS.md` → `_shared/orchestrate.ts` → `_shared/orders.ts` (guided tour ใน dashboard เรียงให้แล้ว)
- **หนี้เทคนิคที่รู้ตัว:** ระบบ v1 ฝั่ง client ยังอยู่ทั้งชุด (prompt_versions/promptGovernance, healthDataVault เก่า, healthFactExtractor, mockBackend, RAG client, rag-embed/openai-transcribe นอกชุด v2 audit) — มี audit กันหลุด production แล้ว แต่เพิ่ม cognitive load; ควรมีรอบติดป้าย/ลบครั้งเดียว
- **ชื่อหลอก:** `PrototypeChatPanel` + `/prototype` คือ "หน้าแชทจริง" ที่ต่อ chat-orchestrator (route แชทเก่าถูกลบที่ `918a6b4`) — ควร rename ในรอบ showcase เพื่อไม่ให้ dev/ลูกค้าเข้าใจผิด
- **Windows deploy:** ต้อง UTF-8 console (chcp 65001) ไม่งั้นข้อความไทยใน bundle พัง (N3 — เคยเกิดจริง) — ควรเพิ่ม preflight ใน deploy script

## 5. Next Step Plan (เรียงเพื่อรีบเข้าตลาด)

**Now (สัปดาห์นี้):**
1. กู้ MiraLandingPage + commit (P0, 10 นาที)
2. Owner flip prompt v3 (V3-3) + รัน `chat:regression:v3` / `v2:e2e-commerce` ยืนยัน
3. เริ่ม Showcase S1–S3 ทันที (ใช้ kickoff prompt ใน showcase plan Appendix A) — เป้า: เดโม่ทัวร์ 4 ระบบที่เปิดต่อหน้าลูกค้าได้ภายใน 2 สัปดาห์
4. R2 (อายุ → user_facts) — งานเล็ก คุณค่าสูงต่อความแม่นของการแนะนำ

**Next (2–4 สัปดาห์ — ก่อนเซ็นลูกค้ารายแรก):**
5. R4 PDPA export/hard-delete + ขอ legal sign-off disclaimer ควบคู่
6. LINE: ขอ credentials + ทำ V3-4 + รัน sandbox checklist
7. ปิด live proofs: R1 leg, lab รูปจริง, R5, R6
8. Phone OTP login (Supabase + SMS provider ไทย)

**Later (หลังมีลูกค้าจริง — ทำให้ scale แบบ vendor):**
9. Tenant onboarding playbook ("ติดตั้งลูกค้าใหม่ใน 1 วัน": seed, แบรนด์, secrets, LINE OA, แคตตาล็อก) — นี่คือ margin ของธุรกิจ
10. Per-tenant theming (โลโก้/สีจากตาราง tenants → MiraDesign runtime)
11. Admin KPI dashboard จริง (ตัวเลขที่ รพ. ใช้ตัดสินใจต่อสัญญา)
12. Commission payout จริง + ภาษี
13. Legacy cleanup รอบเดียว + rename PrototypeChatPanel

## 6. Artifacts จาก audit นี้

- `.understand-anything/knowledge-graph.json` — commit ได้ ทีมเปิด dashboard โดยไม่ต้องรัน pipeline ใหม่ (แนะนำ gitignore: `intermediate/`, `tmp/`, `diff-overlay.json`)
- `.understand-anything/miracare-audit-whiteboard.html` — whiteboard สรุปสำหรับ PM/ทีม เปิดในเบราว์เซอร์ได้เลย
- Interactive dashboard: `http://127.0.0.1:5179/?token=miracare-audit-2026` (วิธีเปิดใหม่อยู่ท้าย whiteboard)
