export type RagChunk = {
  id: string;
  title: string;
  category: 'checkup' | 'booking' | 'safety' | 'privacy' | 'referral';
  content: string;
  keywords: string[];
  source: string;
};

export const localHealthKnowledge: RagChunk[] = [
  {
    id: 'checkup-prep-001',
    title: 'Preparing for a basic health checkup',
    category: 'checkup',
    source: 'Mira clinical operations draft',
    keywords: ['ตรวจสุขภาพ', 'เตรียมตัว', 'งดอาหาร', 'เจาะเลือด', 'fasting', 'checkup'],
    content:
      'For general health checkups, users should confirm fasting requirements with the hospital. Common instructions include avoiding food for 8-12 hours before blood tests, drinking plain water, bringing previous health records, and arriving early for registration.',
  },
  {
    id: 'booking-after-payment-001',
    title: 'Booking after app payment',
    category: 'booking',
    source: 'Mira marketplace journey',
    keywords: ['จ่ายเงิน', 'ชำระเงิน', 'จองคิว', 'โทรหา', 'call center', 'booking', 'order'],
    content:
      'After a user pays in the app, the app creates an order and booking ticket. The chatbot should tell the user to call the listed hospital call center, provide the order number, and confirm their preferred appointment slot.',
  },
  {
    id: 'medical-safety-001',
    title: 'Medical safety boundary',
    category: 'safety',
    source: 'Mira chatbot safety policy draft',
    keywords: ['ฉุกเฉิน', 'เจ็บหน้าอก', 'หายใจลำบาก', 'วินิจฉัย', 'ยา', 'urgent', 'emergency'],
    content:
      'The chatbot gives general health information and navigation help. It must not diagnose, prescribe, change medication, or replace a licensed medical professional. For severe symptoms such as chest pain, breathing difficulty, sudden weakness, severe allergic reaction, fainting, or heavy bleeding, advise urgent medical care immediately.',
  },
  {
    id: 'privacy-consent-001',
    title: 'Consent for health data use',
    category: 'privacy',
    source: 'Mira privacy requirements draft',
    keywords: ['ข้อมูลสุขภาพ', 'consent', 'ยินยอม', 'ลบข้อมูล', 'privacy', 'pdpa'],
    content:
      'Health data and chat-derived personal context should only be used for the disclosed purpose after user consent. Users should be able to withdraw consent and request deletion according to the privacy policy and applicable law.',
  },
  {
    id: 'referral-code-001',
    title: 'Referral code handling',
    category: 'referral',
    source: 'Mira referral workflow',
    keywords: ['referral', 'code', 'โค้ด', 'หมอแนะนำ', 'affiliate', 'commission', 'ค่าคอม'],
    content:
      'When a user enters through a doctor referral link, the referral code should be attached to the order for attribution. The hospital call center can see the order status and referral code after payment, while settlement calculates hospital payable, platform commission, and doctor referral payout.',
  },
];
