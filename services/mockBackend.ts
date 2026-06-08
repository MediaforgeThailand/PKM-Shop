import type { HealthMetric, HealthPackage, HospitalBranch, PackageCategory, PurchaseOrder, ReferralPartner, UserProfile } from '@/domain/health';

export const currentUser: UserProfile = {
  id: 'usr_demo_001',
  name: 'Mira Demo',
  phone: '+66 81 234 5678',
  lineId: '@mira.demo',
  ageRange: '32-38',
  goals: ['Preventive screening', 'Metabolic health', 'Cancer risk baseline'],
  latestHealthDataAt: '2026-05-21',
  agentStatus: 'Needs updated lipid panel in 45 days',
};

export const healthPackages: HealthPackage[] = [
  {
    id: 'pkg_heart_metabolic',
    title: 'Heart & Metabolic Advanced',
    hospital: 'Aster International Hospital',
    category: 'Advanced checkup',
    price: { amount: 12900, currency: 'THB' },
    gpRate: 0.05,
    referralRate: 0.05,
    duration: '3-4 hours',
    location: 'Bangkok',
    tags: ['Heart', 'Diabetes', 'Lipid'],
    includes: ['CBC and chemistry panel', 'HbA1c and insulin resistance', 'Lipid profile', 'ECG', 'Doctor summary'],
    bestFor: 'Users with family history, high stress, or early metabolic risk.',
    aiReason: 'Recommended because your last profile mentioned fatigue, late meals, and no recent lipid panel.',
  },
  {
    id: 'pkg_cancer_baseline',
    title: 'Cancer Risk Baseline',
    hospital: 'Sukhumvit Wellness Center',
    category: 'Preventive oncology',
    price: { amount: 18900, currency: 'THB' },
    gpRate: 0.05,
    referralRate: 0.05,
    duration: 'Half day',
    location: 'Bangkok',
    tags: ['Tumor markers', 'Imaging', 'Family risk'],
    includes: ['Doctor risk intake', 'Core tumor markers', 'Ultrasound abdomen', 'Lifestyle risk report'],
    bestFor: 'Users who want a structured annual cancer screening plan.',
    aiReason: 'Recommended as a baseline because your agent profile has no oncology screening record yet.',
  },
  {
    id: 'pkg_executive_full',
    title: 'Executive Longevity Check',
    hospital: 'Mira Partner Hospital',
    category: 'Longevity',
    price: { amount: 24900, currency: 'THB' },
    gpRate: 0.05,
    referralRate: 0.05,
    duration: 'Full day',
    location: 'Bangkok',
    tags: ['Longevity', 'Hormone', 'Inflammation'],
    includes: ['Advanced blood biomarkers', 'Inflammation markers', 'Hormone panel', 'Nutrition and sleep review'],
    bestFor: 'Users who want deep health optimization and trend tracking.',
    aiReason: 'Recommended if you want the richest dashboard after hospital results are uploaded.',
  },
];

export const featuredPackage = healthPackages[0];

export const packageCategories: PackageCategory[] = [
  {
    id: 'cat_basic_screening',
    code: 'A',
    title: 'Basic Health Check',
    description: 'ตรวจพื้นฐานประจำปี เลือด ไขมัน น้ำตาล ตับ ไต',
    packageId: 'pkg_heart_metabolic',
    popularity: 'Most booked',
  },
  {
    id: 'cat_heart_metabolic',
    code: 'B',
    title: 'Heart & Metabolic',
    description: 'เหมาะกับความเครียด น้ำหนัก ไขมัน และความเสี่ยงเบาหวาน',
    packageId: 'pkg_heart_metabolic',
    popularity: 'AI pick',
  },
  {
    id: 'cat_cancer_baseline',
    code: 'C',
    title: 'Cancer Baseline',
    description: 'คัดกรองมะเร็งพื้นฐาน พร้อม ultrasound และ tumor markers',
    packageId: 'pkg_cancer_baseline',
    popularity: 'Preventive',
  },
  {
    id: 'cat_longevity',
    code: 'D',
    title: 'Longevity Deep Check',
    description: 'ตรวจเชิงลึกสำหรับ hormone, inflammation และ optimization',
    packageId: 'pkg_executive_full',
    popularity: 'Premium',
  },
];

export const hospitalBranches: HospitalBranch[] = [
  {
    id: 'branch_aster_rama9',
    name: 'Aster Rama 9',
    hospital: 'Aster International Hospital',
    address: 'Rama 9 Medical Campus',
    district: 'Rama 9',
    distanceKm: 3.8,
    nextSlot: 'พรุ่งนี้ 10:30',
    supportedPackageIds: ['pkg_heart_metabolic', 'pkg_executive_full'],
  },
  {
    id: 'branch_aster_sathorn',
    name: 'Aster Sathorn',
    hospital: 'Aster International Hospital',
    address: 'Sathorn Wellness Tower',
    district: 'Sathorn',
    distanceKm: 6.1,
    nextSlot: 'เสาร์นี้ 09:00',
    supportedPackageIds: ['pkg_heart_metabolic'],
  },
  {
    id: 'branch_sukhumvit_wellness',
    name: 'Sukhumvit Wellness',
    hospital: 'Sukhumvit Wellness Center',
    address: 'Sukhumvit 49 Health Plaza',
    district: 'Sukhumvit',
    distanceKm: 4.6,
    nextSlot: 'ศุกร์นี้ 13:30',
    supportedPackageIds: ['pkg_cancer_baseline', 'pkg_executive_full'],
  },
  {
    id: 'branch_mira_life_center',
    name: 'Mira Life Center',
    hospital: 'Mira Partner Hospital',
    address: 'Wireless Road Life Science Center',
    district: 'Wireless',
    distanceKm: 5.4,
    nextSlot: 'จันทร์หน้า 08:30',
    supportedPackageIds: ['pkg_executive_full', 'pkg_cancer_baseline'],
  },
];

export const packageRecommendations = healthPackages.map((item, index) => ({
  packageId: item.id,
  rank: index + 1,
  title: item.title,
  reason: item.aiReason,
}));

export const purchaseOrders: PurchaseOrder[] = [
  {
    id: 'ORD-260604-1042',
    userName: 'Mira Demo',
    userPhone: '+66 81 234 5678',
    nationalIdLast4: '1234',
    packageTitle: 'Heart & Metabolic Advanced',
    hospital: 'Aster International Hospital',
    paidAt: '2026-06-04T10:42:00+07:00',
    amount: { amount: 12900, currency: 'THB' },
    commission: { amount: 1290, currency: 'THB' },
    referralCode: 'DRNOK-2026',
    bookingStatus: 'awaiting_call',
  },
];

export const healthMetrics: HealthMetric[] = [
  {
    label: 'Metabolic load',
    value: '72',
    status: 'watch',
    updatedAt: '2026-05-21',
    explanation: 'HbA1c and triglyceride signals suggest this should be refreshed in the next checkup.',
  },
  {
    label: 'Cardio baseline',
    value: 'Good',
    status: 'good',
    updatedAt: '2026-05-21',
    explanation: 'Blood pressure and ECG baseline are usable, but lipid data is aging.',
  },
  {
    label: 'Data freshness',
    value: '45d',
    status: 'watch',
    updatedAt: '2026-06-04',
    explanation: 'AI recommendations will be stronger after the next hospital report is uploaded.',
  },
];

export const referralPartners: ReferralPartner[] = [
  {
    id: 'ref_dr_nok',
    name: 'Dr. Nok Wellness',
    type: 'doctor',
    code: 'DRNOK-2026',
    attributedSales: 42,
    pendingPayout: { amount: 28450, currency: 'THB' },
    conversionRate: '8.4%',
  },
  {
    id: 'ref_creator_may',
    name: 'May Healthy Notes',
    type: 'creator',
    code: 'MAYFIT',
    attributedSales: 18,
    pendingPayout: { amount: 12700, currency: 'THB' },
    conversionRate: '5.9%',
  },
];

export const formatMoney = (money: { amount: number; currency: 'THB' }) =>
  `${money.amount.toLocaleString('th-TH')} ${money.currency}`;

export const mockBackendStatus = {
  mode: 'mock',
  readyForSupabase: true,
  nextIntegration: ['auth.users', 'profiles', 'health_packages', 'hospital_branches', 'orders', 'referrals', 'health_records', 'agent_memory'],
};
