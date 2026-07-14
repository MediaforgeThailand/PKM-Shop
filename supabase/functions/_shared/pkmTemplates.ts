// PKM-Shop — Thai notification copy (Ready.md §6). All customer/staff notification text
// lives here as templated system notices (AGENTS.md conversation-purity: the reply path
// never composes free sales text; the AI's own replies come from the published prompt).

function baht(n: number): string {
  return n.toLocaleString('th-TH');
}

export type NotifyEvent =
  | 'order_created'
  | 'slip_received'
  | 'paid'
  | 'round_locked'
  | 'packed'
  | 'rider_accepted'
  | 'rider_dispatched'
  | 'delivered'
  | 'returned'
  | 'express_paid'
  | 'payroll_cutoff'
  | 'payroll_self'
  | 'payout_confirmed'
  | 'kerry_handover'
  | 'handoff'
  | 'slip_manual_queue'
  | 'slipok_quota'
  | 'payment_rejected';

export type TemplateCtx = {
  order_no?: string;
  amount?: number;
  fee?: number;
  round_label?: string;
  count?: number;
  reason?: string;
  tracking?: string;
  total?: number;
};

// Customer-facing copy
export const customerText: Partial<Record<NotifyEvent, (c: TemplateCtx) => string>> = {
  order_created: (c) =>
    `รับคำสั่งซื้อ ${c.order_no ?? ''} เรียบร้อยค่ะ ยอดรวม ${baht(c.amount ?? 0)} บาท\nโอนแล้วส่งรูปสลิปในแชทนี้ได้เลยค่ะ`,
  slip_received: () => `รับสลิปแล้วค่ะ กำลังตรวจสอบการชำระเงิน สักครู่นะคะ`,
  paid: (c) =>
    c.round_label
      ? `ชำระเงินสำเร็จ ✅ ออเดอร์ ${c.order_no ?? ''} เข้ารอบจัดส่ง ${c.round_label} น. เตรียมรับของได้เลยค่ะ`
      : `ชำระเงินสำเร็จ ✅ ออเดอร์ ${c.order_no ?? ''} กำลังเตรียมจัดส่งค่ะ`,
  packed: (c) => `แพ็คสินค้าเรียบร้อย 📦 ออเดอร์ ${c.order_no ?? ''} กำลังเข้าสู่ขั้นตอนจัดส่งค่ะ`,
  rider_accepted: (c) =>
    `ออเดอร์ ${c.order_no ?? ''} อยู่ในรอบ ${c.round_label ?? ''} น. ไรเดอร์กำลังจะออกไปส่ง เตรียมรับของค่ะ 🛵`,
  rider_dispatched: (c) => `ไรเดอร์กำลังจัดส่งไปหาคุณแล้ว 🛵 ออเดอร์ ${c.order_no ?? ''}`,
  delivered: (c) => `จัดส่งสำเร็จ 🎉 ขอบคุณที่อุดหนุนค่ะ ออเดอร์ ${c.order_no ?? ''}`,
  returned: (c) =>
    `ออเดอร์ ${c.order_no ?? ''} ตีกลับ เนื่องจาก: ${c.reason ?? '-'}\nกรุณาชำระค่าส่งใหม่ ${baht(c.fee ?? 0)} บาท เพื่อจัดส่งอีกครั้งค่ะ`,
  kerry_handover: (c) => `ส่งมอบพัสดุให้ Kerry แล้วค่ะ เลขพัสดุ ${c.tracking ?? '-'} (ออเดอร์ ${c.order_no ?? ''})`,
  payment_rejected: (c) =>
    `สลิปของออเดอร์ ${c.order_no ?? ''} ไม่ผ่านการตรวจสอบค่ะ${c.reason ? ` (${c.reason})` : ''}\nรบกวนตรวจสอบยอดโอนแล้วส่งสลิปใหม่ หรือพิมพ์คุยกับแอดมินได้เลยค่ะ`,
};

// Staff-facing copy (per role, keyed by a role tag the notifier passes in)
export const staffText: Partial<Record<string, (c: TemplateCtx) => string>> = {
  'round_locked:packer': (c) =>
    `📦 มีรอบต้องแพ็ค! รอบ ${c.round_label ?? ''} น. — ${c.count ?? 0} ออเดอร์ (เหลือเวลา ~30 นาที)`,
  'round_locked:rider': (c) =>
    `🛵 รอบ ${c.round_label ?? ''} น. พร้อมให้กดรับแล้ว — ${c.count ?? 0} จุดส่ง`,
  'express_paid': (c) => `⚡ ออเดอร์ด่วน ${c.order_no ?? ''} ชำระแล้ว แพ็คด่วน + เรียก Grab`,
  'payroll_admin': (c) =>
    `💰 ตัดรอบ payroll แล้ว รวม ${baht(c.total ?? 0)} บาท (${c.count ?? 0} คน) พร้อมโอนก่อนเที่ยงวันจันทร์`,
  'payroll_self': (c) => `ยอดรอบนี้ของคุณ ${baht(c.amount ?? 0)} บาทค่ะ ดูรายละเอียดในแอป`,
  'payout_confirmed': (c) => `โอนเงินให้คุณแล้ว ${baht(c.amount ?? 0)} บาท (แนบสลิปในแอป)`,
  'returned_admin': (c) => `↩️ ออเดอร์ ${c.order_no ?? ''} ถูกตีกลับ: ${c.reason ?? '-'}`,
  'slip_manual_queue': (c) => `🧾 มีสลิปรอตรวจมือ ออเดอร์ ${c.order_no ?? ''}${c.reason ? ` (${c.reason})` : ''} — เปิด "คิวตรวจสลิป" ในแอปเพื่อยืนยัน/ปฏิเสธ`,
  'slipok_quota': () => `🚨 ด่วน: SlipOK ตรวจสลิปอัตโนมัติใช้งานไม่ได้ (แพ็กเกจหมด/เกินโควตา) ทุกสลิปจะเข้าคิวตรวจมือจนกว่าจะต่ออายุ`,
  'handoff': (c) => `💬 ลูกค้าขอคุยกับแอดมิน${c.reason ? ` (${c.reason})` : ''} — เปิดหน้า "แชทลูกค้า" เพื่อรับเรื่อง AI หยุดตอบห้องนี้แล้ว`,
};
