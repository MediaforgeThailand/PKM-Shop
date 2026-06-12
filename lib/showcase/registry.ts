import type { HrefObject } from 'expo-router';
import type { ImageSourcePropType } from 'react-native';

export const showcaseModuleIds = ['referral', 'admin', 'ai-chat', 'health'] as const;

export type ShowcaseModuleId = (typeof showcaseModuleIds)[number];
export type ShowcaseStatus = 'live' | 'mockup' | 'concept' | 'planned';
export type ShowcaseAuth = 'none' | 'customer' | 'admin';
export type ShowcaseHref = string | HrefObject;

export type ShowcaseEntry = {
  id: string;
  module: ShowcaseModuleId;
  label_th: string;
  label_en: string;
  path: string;
  href: ShowcaseHref | null;
  description_th: string;
  status: ShowcaseStatus;
  auth: ShowcaseAuth;
  poster: ImageSourcePropType | null;
  demoOrder: number;
  sharedWithModule?: ShowcaseModuleId;
};

export type ShowcaseModuleMeta = {
  accent: string;
  eyebrow_en: string;
  id: ShowcaseModuleId;
  script_th: string[];
  story_th: string;
  title_en: string;
  title_th: string;
};

export const showcaseModuleMeta: Record<ShowcaseModuleId, ShowcaseModuleMeta> = {
  admin: {
    accent: '#3F8EFC',
    eyebrow_en: 'Operations console',
    id: 'admin',
    script_th: [
      'เปิดแค็ตตาล็อกเพื่อดูว่าโรงพยาบาลแก้แพ็กเกจ ราคา รูปภาพ และสถานะขายได้เอง',
      'เปิดคิวออเดอร์เพื่อดูงานหลังบ้านหลังลูกค้าชำระเงินหรือส่งข้อมูลจอง',
      'เปิดจัดการสาขาเพื่อดูว่าสาขาและข้อมูลติดต่อถูกใช้ร่วมกับหน้าขายจริง',
      'ชี้ให้เห็นหน้า dashboard ที่ยังรอสร้างเป็น mockup ในเฟสถัดไป',
    ],
    story_th: 'ระบบหลังบ้านสำหรับทีมโรงพยาบาลที่ต้องดูแลสินค้า ออเดอร์ สาขา และงาน referral ในที่เดียว',
    title_en: 'Admin Panel',
    title_th: 'ระบบหลังบ้าน',
  },
  'ai-chat': {
    accent: '#40C9A2',
    eyebrow_en: 'Customer commerce',
    id: 'ai-chat',
    script_th: [
      'เปิดคำสั่งซื้อของฉันเพื่อดูรายการออเดอร์และ timeline ที่ผูกกับบัญชีลูกค้า',
      'เปิดรายละเอียดแพ็กเกจเพื่อดูข้อมูลสินค้าจาก catalog จริง',
      'เปิด prototype หรือ LINE preview เฉพาะตอนต้องขายภาพอนาคตของประสบการณ์แชท',
    ],
    story_th: 'ระบบหน้าลูกค้าสำหรับดูคำสั่งซื้อ รายละเอียดแพ็กเกจ และต้นแบบประสบการณ์แชทในอนาคต',
    title_en: 'Orders And Packages',
    title_th: 'คำสั่งซื้อและแพ็กเกจ',
  },
  health: {
    accent: '#F26D6D',
    eyebrow_en: 'Health intelligence',
    id: 'health',
    script_th: [
      'เปิด dashboard สุขภาพเพื่อดูภาพรวมจากข้อมูลสุขภาพจริงของ user',
      'เปิดผลตรวจเพื่อโชว์ lab markers และแถวที่ให้ user ยืนยันข้อมูล',
      'เปิด wearable เพื่อดูสัญญาณสุขภาพรายวัน',
      'เปิด profile เพื่อโชว์ consent, memory และ export controls',
    ],
    story_th: 'แดชบอร์ดสุขภาพสำหรับลูกค้าที่รวมผลแลบ wearable และ health memory ที่ยืนยันแล้ว',
    title_en: 'Health Dashboard',
    title_th: 'แดชบอร์ดสุขภาพ',
  },
  referral: {
    accent: '#E9B44C',
    eyebrow_en: 'Growth engine',
    id: 'referral',
    script_th: [
      'เปิดลิงก์ referral เพื่อโชว์ว่าระบบบันทึก code ก่อนส่งลูกค้าเข้าหน้ารวม',
      'เปิด workspace ของ partner เพื่อสร้างออเดอร์ช่วยลูกค้าและดูยอด commission',
      'เปิดหน้า admin referrers เพื่อให้โรงพยาบาลเห็นการจัดการพาร์ทเนอร์และ commission',
    ],
    story_th: 'ระบบแนะนำลูกค้าสำหรับหมอ พาร์ทเนอร์ และทีมโรงพยาบาลที่ต้องการ track attribution ถึงยอดขาย',
    title_en: 'Referral Program',
    title_th: 'โปรแกรมแนะนำลูกค้า',
  },
};

export const showcaseEntries: readonly ShowcaseEntry[] = [
  {
    auth: 'none',
    demoOrder: 1,
    description_th: 'หน้านี้บันทึก referral code ลงเครื่องลูกค้า เพื่อผูก attribution กับการซื้อที่เข้าเงื่อนไข.',
    href: { pathname: '/r/[ref_code]', params: { ref_code: 'DRNOK2' } },
    id: 'referral-public-entry',
    label_en: 'Referral Link Entry',
    label_th: 'ลิงก์แนะนำลูกค้า',
    module: 'referral',
    path: '/r/DRNOK2',
    poster: null,
    status: 'live',
  },
  {
    auth: 'customer',
    demoOrder: 2,
    description_th: 'พื้นที่ partner เปิดดูตัวอย่างได้ทันที ใช้เลือกแพ็กเกจ กรอกข้อมูลผู้ซื้อ สร้างออเดอร์เดโม และดู commission.',
    href: '/partner',
    id: 'referral-partner-workspace',
    label_en: 'Partner Referral Workspace',
    label_th: 'พื้นที่พาร์ทเนอร์',
    module: 'referral',
    path: '/partner',
    poster: null,
    status: 'live',
  },
  {
    auth: 'admin',
    demoOrder: 3,
    description_th: 'หน้าแอดมินสำหรับจัดการ referrer, commission scheme และสถานะ payout ของออเดอร์ที่มี attribution.',
    href: '/admin/referrers',
    id: 'referral-admin-referrers',
    label_en: 'Referrers And Commissions',
    label_th: 'จัดการผู้แนะนำและค่าคอมมิชชัน',
    module: 'referral',
    path: '/admin/referrers',
    poster: null,
    status: 'live',
  },
  {
    auth: 'admin',
    demoOrder: 1,
    description_th: 'หน้าแอดมินที่อ่านและบันทึกสินค้าโรงพยาบาลจริง รวมราคา รูปภาพ หมวดหมู่ และสถานะเปิดขาย.',
    href: '/admin/catalog',
    id: 'admin-catalog',
    label_en: 'Product Catalog Admin',
    label_th: 'จัดการแค็ตตาล็อก',
    module: 'admin',
    path: '/admin/catalog',
    poster: null,
    status: 'live',
  },
  {
    auth: 'admin',
    demoOrder: 2,
    description_th: 'คิวออเดอร์แอดมินที่อ่านคำสั่งซื้อจริงและเรียก action หลังบ้านเพื่อจัดการสลิป การยืนยัน และการจอง.',
    href: '/admin/orders',
    id: 'admin-orders',
    label_en: 'Orders Queue',
    label_th: 'คิวคำสั่งซื้อ',
    module: 'admin',
    path: '/admin/orders',
    poster: null,
    status: 'live',
  },
  {
    auth: 'admin',
    demoOrder: 3,
    description_th: 'หน้าแอดมินสำหรับอ่านและบันทึกสาขาจริงของ tenant รวมที่อยู่ เบอร์โทร สถานะเปิดใช้งาน และลำดับแสดงผล.',
    href: '/admin/branches',
    id: 'admin-branches',
    label_en: 'Branch Management',
    label_th: 'จัดการสาขา',
    module: 'admin',
    path: '/admin/branches',
    poster: null,
    status: 'live',
  },
  {
    auth: 'admin',
    demoOrder: 4,
    description_th: 'หน้าเดียวกับระบบ Referral สำหรับจัดการ referrer และ commission เมื่อลูกค้าใช้ partner sales.',
    href: '/admin/referrers',
    id: 'admin-referrers-shared',
    label_en: 'Shared Referrer Admin',
    label_th: 'พาร์ทเนอร์และค่าคอมมิชชัน',
    module: 'admin',
    path: '/admin/referrers',
    poster: null,
    sharedWithModule: 'referral',
    status: 'live',
  },
  {
    auth: 'admin',
    demoOrder: 5,
    description_th: 'ยังไม่มี route ใน build นี้; เฟส mockup จะทำภาพรวม KPI ออเดอร์ ยอดขาย และแพ็กเกจขายดี.',
    href: null,
    id: 'admin-dashboard-planned',
    label_en: 'Admin KPI Dashboard',
    label_th: 'ภาพรวมร้าน',
    module: 'admin',
    path: '/admin/dashboard',
    poster: null,
    status: 'planned',
  },
  {
    auth: 'customer',
    demoOrder: 1,
    description_th: 'หน้าลูกค้าสำหรับอ่านคำสั่งซื้อจาก Supabase และกดขยายดู timeline ของแต่ละออเดอร์.',
    href: '/orders',
    id: 'ai-chat-orders',
    label_en: 'My Orders',
    label_th: 'คำสั่งซื้อของฉัน',
    module: 'ai-chat',
    path: '/orders',
    poster: null,
    status: 'live',
  },
  {
    auth: 'none',
    demoOrder: 2,
    description_th: 'หน้าอ่านรายละเอียดแพ็กเกจจาก catalog จริงตาม productId หรือ catalogKey.',
    href: '/package-detail',
    id: 'ai-chat-package-detail',
    label_en: 'Package Detail',
    label_th: 'รายละเอียดแพ็กเกจ',
    module: 'ai-chat',
    path: '/package-detail',
    poster: null,
    status: 'live',
  },
  {
    auth: 'none',
    demoOrder: 3,
    description_th: 'ต้นแบบภาพแชทที่รันในเครื่องเพื่อขาย direction ของ UI เท่านั้น ไม่ได้ต่อ backend production.',
    href: '/prototype',
    id: 'ai-chat-prototype',
    label_en: 'Chat Design Concept',
    label_th: 'ต้นแบบหน้าตาแชท',
    module: 'ai-chat',
    path: '/prototype',
    poster: null,
    status: 'concept',
  },
  {
    auth: 'none',
    demoOrder: 4,
    description_th: 'ยังไม่มี route ใน build นี้; เฟส mockup จะทำหน้าจอ concept ของ LINE OA ที่สะท้อน flow แชทเดียวกัน.',
    href: null,
    id: 'ai-chat-line-preview-planned',
    label_en: 'LINE OA Preview',
    label_th: 'ตัวอย่าง LINE OA',
    module: 'ai-chat',
    path: '/showcase/line-preview',
    poster: null,
    status: 'planned',
  },
  {
    auth: 'customer',
    demoOrder: 1,
    description_th: 'แดชบอร์ดสุขภาพใน tab shell ที่โหลดข้อมูลผลแลบ wearable และ health facts จาก Supabase.',
    href: '/health',
    id: 'health-overview-tab',
    label_en: 'Health Dashboard',
    label_th: 'แดชบอร์ดสุขภาพ',
    module: 'health',
    path: '/health',
    poster: null,
    status: 'live',
  },
  {
    auth: 'customer',
    demoOrder: 2,
    description_th: 'route เดี่ยวของ overview สุขภาพชุดเดียวกับ /health สำหรับเปิดนอก tab shell.',
    href: '/body-overview',
    id: 'health-body-overview',
    label_en: 'Health overview without tab shell',
    label_th: 'ภาพรวมสุขภาพแบบหน้าเดี่ยว',
    module: 'health',
    path: '/body-overview',
    poster: null,
    status: 'live',
  },
  {
    auth: 'customer',
    demoOrder: 3,
    description_th: 'หน้าผลตรวจที่ใช้ข้อมูล lab reports จริงและมีแถวตรวจทานค่าความมั่นใจต่ำผ่าน lab-confirm.',
    href: '/health-check-results',
    id: 'health-lab-results',
    label_en: 'Health Check Results',
    label_th: 'ผลตรวจสุขภาพ',
    module: 'health',
    path: '/health-check-results',
    poster: null,
    status: 'live',
  },
  {
    auth: 'customer',
    demoOrder: 4,
    description_th: 'หน้า wearable ที่อ่านสัญญาณ movement, sleep และข้อมูลล่าสุดจาก dashboard loader เดียวกัน.',
    href: '/wearable-health',
    id: 'health-wearable',
    label_en: 'Wearable Health',
    label_th: 'ข้อมูล wearable',
    module: 'health',
    path: '/wearable-health',
    poster: null,
    status: 'live',
  },
  {
    auth: 'customer',
    demoOrder: 5,
    description_th: 'ยังไม่มี route ใน build นี้; เฟส mockup จะทำ UI อัปโหลดผลแลบก่อนต่อ lab-ingest และ lab-confirm.',
    href: null,
    id: 'health-lab-upload-planned',
    label_en: 'Lab Upload',
    label_th: 'อัปโหลดผลแลบ',
    module: 'health',
    path: '/health/lab-upload',
    poster: null,
    status: 'planned',
  },
  {
    auth: 'customer',
    demoOrder: 6,
    description_th: 'หน้า profile ที่ให้ลูกค้าดูและจัดการ consent, health memory, confirmed facts, export และ sign out.',
    href: '/user-profile',
    id: 'health-user-profile',
    label_en: 'User Profile',
    label_th: 'โปรไฟล์สุขภาพ',
    module: 'health',
    path: '/user-profile',
    poster: null,
    status: 'live',
  },
];

const legacyModuleAliases: Partial<Record<string, ShowcaseModuleId>> = {
  'health-dashboard': 'health',
};

const statusBadgeLabels: Record<ShowcaseStatus, string> = {
  concept: 'CONCEPT',
  live: 'LIVE',
  mockup: 'MOCKUP',
  planned: 'PLANNED',
};

export type ShowcasePage = ShowcaseEntry & {
  badge: string;
  description: string;
  href: ShowcaseHref;
  label: string;
};

export type ShowcaseModule = ShowcaseModuleMeta & {
  body: string;
  eyebrow: string;
  pages: ShowcasePage[];
  title: string;
};

export function resolveShowcaseModuleId(id: string | string[] | undefined) {
  const rawId = Array.isArray(id) ? id[0] : id;

  if (!rawId) {
    return null;
  }

  if (showcaseModuleIds.includes(rawId as ShowcaseModuleId)) {
    return rawId as ShowcaseModuleId;
  }

  return legacyModuleAliases[rawId] ?? null;
}

export function getShowcaseEntriesForModule(moduleId: ShowcaseModuleId, includePlanned = true) {
  return showcaseEntries
    .filter((entry) => entry.module === moduleId && (includePlanned || entry.status !== 'planned'))
    .slice()
    .sort((left, right) => left.demoOrder - right.demoOrder || left.label_th.localeCompare(right.label_th, 'th'));
}

function toPage(entry: ShowcaseEntry): ShowcasePage | null {
  const href = entry.href;

  if (href === null) {
    return null;
  }

  return {
    auth: entry.auth,
    badge: statusBadgeLabels[entry.status],
    demoOrder: entry.demoOrder,
    description: entry.description_th,
    description_th: entry.description_th,
    href,
    id: entry.id,
    label: entry.label_th,
    label_en: entry.label_en,
    label_th: entry.label_th,
    module: entry.module,
    path: entry.path,
    poster: entry.poster,
    sharedWithModule: entry.sharedWithModule,
    status: entry.status,
  };
}

export const showcaseModules: ShowcaseModule[] = showcaseModuleIds.map((id) => {
  const meta = showcaseModuleMeta[id];
  const pages = getShowcaseEntriesForModule(id, false).map(toPage).filter((entry): entry is ShowcasePage => Boolean(entry));

  return {
    ...meta,
    body: meta.story_th,
    eyebrow: meta.eyebrow_en,
    pages,
    title: meta.title_th,
  };
});

export function findShowcaseModule(id: string | string[] | undefined) {
  const moduleId = resolveShowcaseModuleId(id);

  return moduleId ? showcaseModules.find((item) => item.id === moduleId) ?? null : null;
}
