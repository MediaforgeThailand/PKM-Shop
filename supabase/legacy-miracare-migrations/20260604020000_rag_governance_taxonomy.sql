alter table public.rag_chunks
  add column if not exists topic text not null default 'general',
  add column if not exists audience text not null default 'patient',
  add column if not exists language text not null default 'th',
  add column if not exists summary text,
  add column if not exists source_url text,
  add column if not exists source_type text not null default 'internal_policy',
  add column if not exists review_status text not null default 'draft',
  add column if not exists risk_level text not null default 'low',
  add column if not exists medical_reviewer text,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists token_budget integer not null default 320,
  add column if not exists priority integer not null default 50;

alter table public.rag_chunks
  drop constraint if exists rag_chunks_category_check,
  drop constraint if exists rag_chunks_category_taxonomy_check,
  drop constraint if exists rag_chunks_audience_check,
  drop constraint if exists rag_chunks_language_check,
  drop constraint if exists rag_chunks_review_status_check,
  drop constraint if exists rag_chunks_risk_level_check,
  drop constraint if exists rag_chunks_source_type_check,
  drop constraint if exists rag_chunks_token_budget_check,
  drop constraint if exists rag_chunks_priority_check;

update public.rag_chunks
set category = case category
  when 'checkup' then 'care.checkup_preparation'
  when 'booking' then 'ops.booking'
  when 'referral' then 'ops.referral'
  when 'privacy' then 'privacy.consent'
  when 'safety' then 'safety.escalation'
  else category
end;

alter table public.rag_chunks
  add constraint rag_chunks_category_taxonomy_check
    check (category in (
      'care.checkup_preparation',
      'care.patient_education',
      'ops.booking',
      'ops.call_center',
      'ops.payment',
      'ops.referral',
      'privacy.consent',
      'safety.escalation'
    )),
  add constraint rag_chunks_audience_check
    check (audience in ('patient', 'doctor', 'call_center', 'hospital_admin', 'internal')),
  add constraint rag_chunks_language_check
    check (language in ('th', 'en')),
  add constraint rag_chunks_review_status_check
    check (review_status in ('draft', 'approved', 'expired', 'archived')),
  add constraint rag_chunks_risk_level_check
    check (risk_level in ('low', 'medium', 'high')),
  add constraint rag_chunks_source_type_check
    check (source_type in (
      'hospital_operational',
      'internal_policy',
      'international_reference',
      'medical_reviewer_note',
      'thai_public_health'
    )),
  add constraint rag_chunks_token_budget_check
    check (token_budget between 80 and 2000),
  add constraint rag_chunks_priority_check
    check (priority between 1 and 100);

update public.rag_chunks
set
  summary = coalesce(summary, content),
  review_status = case when review_status = 'draft' then 'approved' else review_status end,
  last_reviewed_at = coalesce(last_reviewed_at, '2026-06-04'::timestamptz),
  expires_at = coalesce(expires_at, '2027-06-04'::timestamptz);

insert into public.rag_chunks (
  id,
  title,
  category,
  topic,
  audience,
  language,
  summary,
  content,
  keywords,
  source,
  source_url,
  source_type,
  review_status,
  risk_level,
  medical_reviewer,
  last_reviewed_at,
  expires_at,
  token_budget,
  priority,
  is_active
)
values
  (
    'checkup-prep-001',
    'Preparing for a basic health checkup',
    'care.checkup_preparation',
    'basic_checkup_preparation',
    'patient',
    'th',
    'ตอบเรื่องการเตรียมตัวตรวจสุขภาพแบบทั่วไป: ให้ยืนยันเงื่อนไขงดอาหารกับโรงพยาบาล ดื่มน้ำเปล่าได้ถ้าโรงพยาบาลไม่ห้าม เตรียมประวัติเดิม และไปถึงก่อนเวลานัด',
    'For general health checkups, users should confirm fasting requirements with the selected hospital because requirements vary by package. Common instructions include avoiding food for 8-12 hours before blood tests when required, drinking plain water unless instructed otherwise, bringing previous health records, and arriving early for registration.',
    array['ตรวจสุขภาพ', 'เตรียมตัว', 'งดอาหาร', 'เจาะเลือด', 'fasting', 'checkup'],
    'Mira operating policy v0',
    'internal://mira/rag/checkup-preparation',
    'internal_policy',
    'approved',
    'medium',
    null,
    '2026-06-04',
    '2027-06-04',
    220,
    20,
    true
  ),
  (
    'booking-after-payment-001',
    'Booking after app payment',
    'ops.booking',
    'post_payment_booking',
    'patient',
    'th',
    'หลังจ่ายเงินในแอป ให้แจ้งว่าระบบสร้าง order/booking ticket แล้ว จากนั้นให้ลูกค้าโทร call center โรงพยาบาลที่เลือกพร้อมแจ้ง order number เพื่อเลือกวันเวลา',
    'After a user pays in the app, the app creates an order and booking ticket. The chatbot should tell the user to call the listed hospital call center, provide the order number, and confirm their preferred appointment slot. The call center can verify payment and order status in the hospital backend.',
    array['จ่ายเงิน', 'ชำระเงิน', 'จองคิว', 'โทรหา', 'call center', 'booking', 'order'],
    'Mira marketplace journey v0',
    'internal://mira/rag/post-payment-booking',
    'internal_policy',
    'approved',
    'low',
    null,
    '2026-06-04',
    '2027-06-04',
    180,
    10,
    true
  ),
  (
    'call-center-handoff-001',
    'Call center handoff after payment',
    'ops.call_center',
    'payment_verification_handoff',
    'call_center',
    'th',
    'พนักงาน call center ใช้ order number เพื่อตรวจสอบสถานะจ่ายเงิน แพ็กเกจ โรงพยาบาล และ referral code ก่อนยืนยันคิวกับลูกค้า',
    'Hospital call center staff should verify the paid order by order number, customer identity, selected package, hospital branch, and attached referral code. After confirming payment, staff can reserve the appointment slot and mark the booking status in the hospital backend.',
    array['call center', 'พนักงาน', 'ยืนยันการจ่ายเงิน', 'order number', 'booking ticket', 'โรงพยาบาล'],
    'Mira hospital operations v0',
    'internal://mira/rag/call-center-handoff',
    'internal_policy',
    'approved',
    'low',
    null,
    '2026-06-04',
    '2027-06-04',
    160,
    30,
    true
  ),
  (
    'payment-receipt-001',
    'Payment and receipt support',
    'ops.payment',
    'payment_status_receipt',
    'patient',
    'th',
    'ถ้าลูกค้าถามเรื่องจ่ายเงินหรือใบเสร็จ ให้แนะนำให้ตรวจ order status ในแอป และใช้ order number ติดต่อ support/call center หากสถานะไม่ตรง',
    'For payment or receipt questions, ask the user to check order status in the app first. If the status is pending after payment or the receipt is missing, the user should contact support or the hospital call center with the order number so staff can verify the transaction.',
    array['payment', 'จ่ายเงิน', 'ใบเสร็จ', 'receipt', 'สถานะคำสั่งซื้อ', 'order status'],
    'Mira payment operations v0',
    'internal://mira/rag/payment-support',
    'internal_policy',
    'approved',
    'low',
    null,
    '2026-06-04',
    '2027-06-04',
    160,
    35,
    true
  ),
  (
    'medical-safety-001',
    'Medical safety boundary',
    'safety.escalation',
    'urgent_symptom_escalation',
    'patient',
    'th',
    'ห้าม chatbot วินิจฉัยโรค จ่ายยา เปลี่ยนยา หรือแทนแพทย์ ถ้ามีอาการฉุกเฉิน เช่น เจ็บหน้าอก หายใจลำบาก แขนขาอ่อนแรง หมดสติ แพ้รุนแรง เลือดออกมาก ให้รีบพบแพทย์ฉุกเฉินทันที',
    'The chatbot gives general health information and navigation help. It must not diagnose, prescribe, change medication, or replace a licensed medical professional. For severe symptoms such as chest pain, breathing difficulty, sudden weakness, severe allergic reaction, fainting, severe pain, or heavy bleeding, advise urgent medical care immediately.',
    array['ฉุกเฉิน', 'เจ็บหน้าอก', 'หายใจลำบาก', 'วินิจฉัย', 'ยา', 'urgent', 'emergency'],
    'Mira chatbot safety policy v0',
    'internal://mira/rag/medical-safety-boundary',
    'internal_policy',
    'approved',
    'high',
    null,
    '2026-06-04',
    '2027-06-04',
    240,
    1,
    true
  ),
  (
    'privacy-consent-001',
    'Consent for health data use',
    'privacy.consent',
    'chat_health_data_consent',
    'patient',
    'th',
    'ข้อมูลสุขภาพและข้อมูลจากแชทใช้ได้เฉพาะตามวัตถุประสงค์ที่แจ้งและหลังได้รับ consent ผู้ใช้ควรถอน consent และขอลบข้อมูลได้ตาม policy/กฎหมายที่เกี่ยวข้อง',
    'Health data and chat-derived personal context should only be used for the disclosed purpose after user consent. Users should be able to withdraw consent and request deletion according to the privacy policy and applicable law. Future health-stat features must not reuse chat-derived personal data without clear consent and access controls.',
    array['ข้อมูลสุขภาพ', 'consent', 'ยินยอม', 'ลบข้อมูล', 'privacy', 'pdpa'],
    'Mira privacy requirements v0',
    'internal://mira/rag/privacy-consent',
    'internal_policy',
    'approved',
    'medium',
    null,
    '2026-06-04',
    '2027-06-04',
    180,
    25,
    true
  ),
  (
    'referral-code-001',
    'Referral code handling',
    'ops.referral',
    'doctor_referral_attribution',
    'patient',
    'th',
    'ถ้าเข้าผ่านลิงก์/โค้ดของหมอ ให้ผูก referral code กับ order เพื่อ attribution โรงพยาบาลเห็น code หลังจ่ายเงิน ส่วนระบบคำนวณ commission และ payout ให้หมอภายหลัง',
    'When a user enters through a doctor referral link, the referral code should be attached to the order for attribution. The hospital call center can see the order status and referral code after payment, while settlement calculates hospital payable, platform commission, and doctor referral payout.',
    array['referral', 'code', 'โค้ด', 'หมอแนะนำ', 'affiliate', 'commission', 'ค่าคอม'],
    'Mira referral workflow v0',
    'internal://mira/rag/referral-code',
    'internal_policy',
    'approved',
    'low',
    null,
    '2026-06-04',
    '2027-06-04',
    200,
    15,
    true
  )
on conflict (id) do update
set
  title = excluded.title,
  category = excluded.category,
  topic = excluded.topic,
  audience = excluded.audience,
  language = excluded.language,
  summary = excluded.summary,
  content = excluded.content,
  keywords = excluded.keywords,
  source = excluded.source,
  source_url = excluded.source_url,
  source_type = excluded.source_type,
  review_status = excluded.review_status,
  risk_level = excluded.risk_level,
  medical_reviewer = excluded.medical_reviewer,
  last_reviewed_at = excluded.last_reviewed_at,
  expires_at = excluded.expires_at,
  token_budget = excluded.token_budget,
  priority = excluded.priority,
  is_active = true,
  updated_at = now();

drop policy if exists "Anyone can read active RAG chunks" on public.rag_chunks;

create policy "Anyone can read approved active RAG chunks"
  on public.rag_chunks
  for select
  to anon, authenticated
  using (is_active = true and review_status = 'approved');

create index if not exists rag_chunks_lookup_idx
  on public.rag_chunks (review_status, is_active, category, topic, priority);

create index if not exists rag_chunks_keywords_idx
  on public.rag_chunks using gin (keywords);
