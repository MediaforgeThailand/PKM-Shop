export type PkmRole = 'admin' | 'stock' | 'packer' | 'rider' | 'staff';

export type Profile = {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  phone: string | null;
  roles: PkmRole[];
  line_user_id: string | null;
  link_code: string | null;
  active: boolean;
};

export type OrderStatus =
  | 'pending' | 'paid' | 'confirmed' | 'packing' | 'packed'
  | 'out_for_delivery' | 'delivering' | 'delivered' | 'returned'
  | 'awaiting_redelivery_fee' | 'cancelled';

export type DeliveryType = 'rider' | 'express_grab' | 'lalamove' | 'parcel_kerry';
export type PaymentStatus = 'unpaid' | 'pending_verify' | 'paid' | 'rejected';

export type Order = {
  id: string;
  order_no: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  delivery_type: DeliveryType;
  goods_total: number;
  delivery_fee: number;
  grand_total: number;
  recipient_name: string | null;
  recipient_phone: string | null;
  address_text: string | null;
  round_id: string | null;
  stop_sequence: number | null;
  external_ref: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  catalog_key: string;
  name: string;
  description: string;
  price_baht: number;
  category_id: string | null;
  category?: string;
  image_url: string | null;
  stock_qty: number;
  reserved_qty: number;
  active: boolean;
};

export type Category = { id: string; name: string; sort: number; active: boolean };

export type DeliveryRound = {
  id: string;
  round_at: string;
  type: 'rider' | 'kerry';
  status: 'open' | 'locked' | 'confirmed' | 'in_progress' | 'done';
  rider_id: string | null;
};

export type Payment = {
  id: string;
  order_id: string;
  amount: number;
  kind: 'goods' | 'delivery' | 'redelivery';
  method: string;
  slip_photo_url: string | null;
  status: PaymentStatus;
  auto_verified: boolean;
  note: string | null;
  created_at: string;
};

export type ChatSession = {
  id: string;
  tenant_id: string;
  customer_id: string;
  channel: string;
  agent_mode: 'ai' | 'human';
  flagged: 'emergency' | 'complaint' | null;
  last_message_at: string | null;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'admin' | 'system_notice';
  content: string;
  created_at: string;
};

export type Customer = {
  id: string;
  nickname: string | null;
  phone: string | null;
  line_user_id: string | null;
  zone_override: 'in_zone' | 'out_zone' | null;
};

export type Shift = { id: string; name: string; start_time: string; end_time: string; active: boolean };

export type PayrollItem = { id: string; period_id: string; profile_id: string; kind: string; amount: number; created_at: string };
export type PayrollPayout = { id: string; period_id: string; profile_id: string; total: number; slip_photo_url: string | null; confirmed_by: string | null; paid_at: string | null };

export const DELIVERY_TYPE_TH: Record<DeliveryType, string> = {
  rider: 'ส่งปกติ (ไรเดอร์)',
  express_grab: 'ด่วน (Grab)',
  lalamove: 'นอกเขต (Lalamove)',
  parcel_kerry: 'พัสดุ (Kerry)',
};

export const ORDER_STATUS_TH: Record<OrderStatus, string> = {
  pending: 'รอชำระ',
  paid: 'ชำระแล้ว',
  confirmed: 'เข้ารอบ',
  packing: 'กำลังแพ็ค',
  packed: 'แพ็คแล้ว',
  out_for_delivery: 'ออกส่ง',
  delivering: 'กำลังส่ง',
  delivered: 'ส่งสำเร็จ',
  returned: 'ตีกลับ',
  awaiting_redelivery_fee: 'รอค่าส่งใหม่',
  cancelled: 'ยกเลิก',
};
