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
