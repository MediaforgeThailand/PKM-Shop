export const ragCategories = [
  'care.checkup_preparation',
  'care.patient_education',
  'ops.booking',
  'ops.call_center',
  'ops.payment',
  'ops.referral',
  'privacy.consent',
  'safety.escalation',
] as const;

export type RagCategory = (typeof ragCategories)[number];
export type RagRiskLevel = 'low' | 'medium' | 'high';
export type RagReviewStatus = 'draft' | 'approved' | 'expired' | 'archived';
export type RagSourceType =
  | 'hospital_operational'
  | 'internal_policy'
  | 'international_reference'
  | 'medical_reviewer_note'
  | 'thai_public_health';

export type RagChunk = {
  id: string;
  title: string;
  category: RagCategory;
  topic: string;
  audience: 'patient' | 'doctor' | 'call_center' | 'hospital_admin' | 'internal';
  language: 'th' | 'en';
  summary: string;
  content: string;
  keywords: string[];
  source: string;
  sourceUrl?: string;
  sourceType: RagSourceType;
  reviewStatus: RagReviewStatus;
  riskLevel: RagRiskLevel;
  medicalReviewer?: string | null;
  lastReviewedAt?: string | null;
  expiresAt?: string | null;
  tokenBudget: number;
  priority: number;
};

export const legacyCategoryMap: Record<string, RagCategory> = {
  booking: 'ops.booking',
  checkup: 'care.checkup_preparation',
  privacy: 'privacy.consent',
  referral: 'ops.referral',
  safety: 'safety.escalation',
};

export function isRagCategory(value: string): value is RagCategory {
  return ragCategories.includes(value as RagCategory);
}

export function normalizeRagCategory(value: string): RagCategory {
  if (isRagCategory(value)) {
    return value;
  }

  return legacyCategoryMap[value] ?? 'care.patient_education';
}

export const localHealthKnowledge: RagChunk[] = [
  {
    id: 'checkup-prep-001',
    title: 'Preparing for a basic health checkup',
    category: 'care.checkup_preparation',
    topic: 'basic_checkup_preparation',
    audience: 'patient',
    language: 'th',
    source: 'Mira operating policy v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/checkup-preparation',
    reviewStatus: 'approved',
    riskLevel: 'medium',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 220,
    priority: 20,
    keywords: ['ตรวจสุขภาพ', 'ตรวจเลือด', 'เตรียมตัว', 'งดอาหาร', 'เจาะเลือด', 'blood test', 'lab test', 'fasting', 'checkup'],
    summary:
      'ตอบเรื่องการเตรียมตัวตรวจสุขภาพแบบทั่วไป: ให้ยืนยันเงื่อนไขงดอาหารกับโรงพยาบาล ดื่มน้ำเปล่าได้ถ้าโรงพยาบาลไม่ห้าม เตรียมประวัติเดิม และไปถึงก่อนเวลานัด',
    content:
      'For general health checkups, users should confirm fasting requirements with the selected hospital because requirements vary by package. Common instructions include avoiding food for 8-12 hours before blood tests when required, drinking plain water unless instructed otherwise, bringing previous health records, and arriving early for registration.',
  },
  {
    id: 'blood-test-prep-001',
    title: 'Preparing for routine blood tests',
    category: 'care.checkup_preparation',
    topic: 'blood_test_preparation',
    audience: 'patient',
    language: 'th',
    source: 'Mira operating policy v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/blood-test-preparation',
    reviewStatus: 'approved',
    riskLevel: 'medium',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 260,
    priority: 18,
    keywords: [
      'ตรวจเลือด',
      'เจาะเลือด',
      'งดอาหาร',
      'ดื่มน้ำ',
      'ยา',
      'lab test',
      'blood test',
      'fasting',
      'ตรวจน้ำตาล',
      'ตรวจไขมัน',
    ],
    summary:
      'ตอบเรื่องเตรียมตัวตรวจเลือดทั่วไป: เช็กว่ารายการตรวจต้องงดอาหารไหม โดยเฉพาะน้ำตาล/ไขมัน ดื่มน้ำเปล่าได้ถ้าไม่ถูกห้าม แจ้งยา/อาหารเสริม/โรคประจำตัว และยืนยันรายละเอียดกับโรงพยาบาล',
    content:
      'For routine blood tests, preparation depends on the ordered tests. Fasting is commonly required for some glucose and lipid tests, often around 8-12 hours, but the hospital/package instruction should be treated as the source of truth. Users may usually drink plain water unless told otherwise. They should not stop prescribed medication unless instructed by a licensed clinician. They should tell the hospital about regular medicines, supplements, pregnancy, chronic conditions, and previous reactions to blood draws. Arrive early and bring ID, order number, and prior results if available.',
  },
  {
    id: 'booking-after-payment-001',
    title: 'Booking after app payment',
    category: 'ops.booking',
    topic: 'post_payment_booking',
    audience: 'patient',
    language: 'th',
    source: 'Mira marketplace journey v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/post-payment-booking',
    reviewStatus: 'approved',
    riskLevel: 'low',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 180,
    priority: 10,
    keywords: ['จ่ายเงิน', 'ชำระเงิน', 'จองคิว', 'โทรหา', 'call center', 'booking', 'order'],
    summary:
      'หลังจ่ายเงินในแอป ให้แจ้งว่าระบบสร้าง order/booking ticket แล้ว จากนั้นให้ลูกค้าโทร call center โรงพยาบาลที่เลือกพร้อมแจ้ง order number เพื่อเลือกวันเวลา',
    content:
      'After a user pays in the app, the app creates an order and booking ticket. The chatbot should tell the user to call the listed hospital call center, provide the order number, and confirm their preferred appointment slot. The call center can verify payment and order status in the hospital backend.',
  },
  {
    id: 'call-center-handoff-001',
    title: 'Call center handoff after payment',
    category: 'ops.call_center',
    topic: 'payment_verification_handoff',
    audience: 'call_center',
    language: 'th',
    source: 'Mira hospital operations v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/call-center-handoff',
    reviewStatus: 'approved',
    riskLevel: 'low',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 160,
    priority: 30,
    keywords: ['call center', 'พนักงาน', 'ยืนยันการจ่ายเงิน', 'order number', 'booking ticket', 'โรงพยาบาล'],
    summary:
      'พนักงาน call center ใช้ order number เพื่อตรวจสอบสถานะจ่ายเงิน แพ็กเกจ โรงพยาบาล และ referral code ก่อนยืนยันคิวกับลูกค้า',
    content:
      'Hospital call center staff should verify the paid order by order number, customer identity, selected package, hospital branch, and attached referral code. After confirming payment, staff can reserve the appointment slot and mark the booking status in the hospital backend.',
  },
  {
    id: 'payment-receipt-001',
    title: 'Payment and receipt support',
    category: 'ops.payment',
    topic: 'payment_status_receipt',
    audience: 'patient',
    language: 'th',
    source: 'Mira payment operations v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/payment-support',
    reviewStatus: 'approved',
    riskLevel: 'low',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 160,
    priority: 35,
    keywords: ['payment', 'จ่ายเงิน', 'ใบเสร็จ', 'receipt', 'สถานะคำสั่งซื้อ', 'order status'],
    summary:
      'ถ้าลูกค้าถามเรื่องจ่ายเงินหรือใบเสร็จ ให้แนะนำให้ตรวจ order status ในแอป และใช้ order number ติดต่อ support/call center หากสถานะไม่ตรง',
    content:
      'For payment or receipt questions, ask the user to check order status in the app first. If the status is pending after payment or the receipt is missing, the user should contact support or the hospital call center with the order number so staff can verify the transaction.',
  },
  {
    id: 'medical-safety-001',
    title: 'Medical safety boundary',
    category: 'safety.escalation',
    topic: 'urgent_symptom_escalation',
    audience: 'patient',
    language: 'th',
    source: 'Mira chatbot safety policy v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/medical-safety-boundary',
    reviewStatus: 'approved',
    riskLevel: 'high',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 240,
    priority: 1,
    keywords: ['ฉุกเฉิน', 'เจ็บหน้าอก', 'หายใจลำบาก', 'วินิจฉัย', 'ยา', 'urgent', 'emergency'],
    summary:
      'ห้าม chatbot วินิจฉัยโรค จ่ายยา เปลี่ยนยา หรือแทนแพทย์ ถ้ามีอาการฉุกเฉิน เช่น เจ็บหน้าอก หายใจลำบาก แขนขาอ่อนแรง หมดสติ แพ้รุนแรง เลือดออกมาก ให้รีบพบแพทย์ฉุกเฉินทันที',
    content:
      'The chatbot gives general health information and navigation help. It must not diagnose, prescribe, change medication, or replace a licensed medical professional. For severe symptoms such as chest pain, breathing difficulty, sudden weakness, severe allergic reaction, fainting, severe pain, or heavy bleeding, advise urgent medical care immediately.',
  },
  {
    id: 'health-risk-triage-001',
    title: 'General health risk triage boundaries',
    category: 'care.patient_education',
    topic: 'general_health_risk_triage',
    audience: 'patient',
    language: 'th',
    source: 'Mira chatbot safety policy v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/general-health-risk-triage',
    reviewStatus: 'approved',
    riskLevel: 'medium',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 260,
    priority: 22,
    keywords: ['ความเสี่ยง', 'เสี่ยง', 'อายุ', 'น้ำหนัก', 'ส่วนสูง', 'เพศชาย', 'เพศหญิง', 'bmi', 'risk', 'สุขภาพ'],
    summary:
      'ถ้าผู้ใช้ถามประเมินความเสี่ยงจากอายุ น้ำหนัก เพศ หรือข้อมูลบางส่วน ให้ตอบว่าเป็นข้อมูลไม่พอสำหรับวินิจฉัย/ประเมินแทนแพทย์ ควรถามส่วนสูง อาการ โรคประจำตัว ประวัติครอบครัว พฤติกรรม และผลตรวจ',
    content:
      'A chatbot may give general education about health risk factors, but must not diagnose or estimate a personalized disease risk from limited details such as age, weight, or sex alone. Useful missing context includes height/BMI, waist circumference, blood pressure, symptoms, personal medical history, family history, smoking, alcohol, exercise, sleep, medications, and recent lab results. The safest response is to explain what information is missing, suggest relevant checkup items, and advise consultation with a clinician for personalized interpretation.',
  },
  {
    id: 'privacy-consent-001',
    title: 'Consent for health data use',
    category: 'privacy.consent',
    topic: 'chat_health_data_consent',
    audience: 'patient',
    language: 'th',
    source: 'Mira privacy requirements v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/privacy-consent',
    reviewStatus: 'approved',
    riskLevel: 'medium',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 180,
    priority: 25,
    keywords: ['ข้อมูลสุขภาพ', 'consent', 'ยินยอม', 'ลบข้อมูล', 'privacy', 'pdpa'],
    summary:
      'ข้อมูลสุขภาพและข้อมูลจากแชทใช้ได้เฉพาะตามวัตถุประสงค์ที่แจ้งและหลังได้รับ consent ผู้ใช้ควรถอน consent และขอลบข้อมูลได้ตาม policy/กฎหมายที่เกี่ยวข้อง',
    content:
      'Health data and chat-derived personal context should only be used for the disclosed purpose after user consent. Users should be able to withdraw consent and request deletion according to the privacy policy and applicable law. Future health-stat features must not reuse chat-derived personal data without clear consent and access controls.',
  },
  {
    id: 'referral-code-001',
    title: 'Referral code handling',
    category: 'ops.referral',
    topic: 'doctor_referral_attribution',
    audience: 'patient',
    language: 'th',
    source: 'Mira referral workflow v0',
    sourceType: 'internal_policy',
    sourceUrl: 'internal://mira/rag/referral-code',
    reviewStatus: 'approved',
    riskLevel: 'low',
    medicalReviewer: null,
    lastReviewedAt: '2026-06-04',
    expiresAt: '2027-06-04',
    tokenBudget: 200,
    priority: 15,
    keywords: ['referral', 'code', 'โค้ด', 'หมอแนะนำ', 'affiliate', 'commission', 'ค่าคอม'],
    summary:
      'ถ้าเข้าผ่านลิงก์/โค้ดของหมอ ให้ผูก referral code กับ order เพื่อ attribution โรงพยาบาลเห็น code หลังจ่ายเงิน ส่วนระบบคำนวณ commission และ payout ให้หมอภายหลัง',
    content:
      'When a user enters through a doctor referral link, the referral code should be attached to the order for attribution. The hospital call center can see the order status and referral code after payment, while settlement calculates hospital payable, platform commission, and doctor referral payout.',
  },
];
