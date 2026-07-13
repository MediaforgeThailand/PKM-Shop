create table if not exists public.rag_chunks (
  id text primary key,
  title text not null,
  category text not null check (category in ('checkup', 'booking', 'safety', 'privacy', 'referral')),
  content text not null,
  keywords text[] not null default '{}',
  source text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rag_chunks enable row level security;

create policy "Anyone can read active RAG chunks"
  on public.rag_chunks
  for select
  to anon, authenticated
  using (is_active = true);

insert into public.rag_chunks (id, title, category, content, keywords, source)
values
  (
    'checkup-prep-001',
    'Preparing for a basic health checkup',
    'checkup',
    'For general health checkups, users should confirm fasting requirements with the hospital. Common instructions include avoiding food for 8-12 hours before blood tests, drinking plain water, bringing previous health records, and arriving early for registration.',
    array['ตรวจสุขภาพ', 'เตรียมตัว', 'งดอาหาร', 'เจาะเลือด', 'fasting', 'checkup'],
    'Mira clinical operations draft'
  ),
  (
    'booking-after-payment-001',
    'Booking after app payment',
    'booking',
    'After a user pays in the app, the app creates an order and booking ticket. The chatbot should tell the user to call the listed hospital call center, provide the order number, and confirm their preferred appointment slot.',
    array['จ่ายเงิน', 'ชำระเงิน', 'จองคิว', 'โทรหา', 'call center', 'booking', 'order'],
    'Mira marketplace journey'
  ),
  (
    'medical-safety-001',
    'Medical safety boundary',
    'safety',
    'The chatbot gives general health information and navigation help. It must not diagnose, prescribe, change medication, or replace a licensed medical professional. For severe symptoms such as chest pain, breathing difficulty, sudden weakness, severe allergic reaction, fainting, or heavy bleeding, advise urgent medical care immediately.',
    array['ฉุกเฉิน', 'เจ็บหน้าอก', 'หายใจลำบาก', 'วินิจฉัย', 'ยา', 'urgent', 'emergency'],
    'Mira chatbot safety policy draft'
  ),
  (
    'privacy-consent-001',
    'Consent for health data use',
    'privacy',
    'Health data and chat-derived personal context should only be used for the disclosed purpose after user consent. Users should be able to withdraw consent and request deletion according to the privacy policy and applicable law.',
    array['ข้อมูลสุขภาพ', 'consent', 'ยินยอม', 'ลบข้อมูล', 'privacy', 'pdpa'],
    'Mira privacy requirements draft'
  ),
  (
    'referral-code-001',
    'Referral code handling',
    'referral',
    'When a user enters through a doctor referral link, the referral code should be attached to the order for attribution. The hospital call center can see the order status and referral code after payment, while settlement calculates hospital payable, platform commission, and doctor referral payout.',
    array['referral', 'code', 'โค้ด', 'หมอแนะนำ', 'affiliate', 'commission', 'ค่าคอม'],
    'Mira referral workflow'
  )
on conflict (id) do update
set
  title = excluded.title,
  category = excluded.category,
  content = excluded.content,
  keywords = excluded.keywords,
  source = excluded.source,
  is_active = true,
  updated_at = now();
