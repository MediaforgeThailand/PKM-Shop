// PKM-Shop — shared types for the AI sales agent + LINE. Reuses the generic tenant/customer
// rows; the domain shapes are PKM commerce (goods, address, delivery, cart-as-pending-order).
export type { ApiEnvelope, CustomerRow, TenantRow } from './types.ts';

export type DeliveryType = 'rider' | 'express_grab' | 'lalamove' | 'parcel_kerry';

export type PkmProduct = {
  catalog_key: string;
  name: string;
  description: string;
  price_baht: number;
  category: string | null;
  image_url: string | null;
};

export type PkmCategory = {
  id: string;
  name: string;
  product_count: number;
};

export type PkmChatCard =
  | { type: 'product_grid'; products: PkmProduct[] }
  | { type: 'category_grid'; categories: PkmCategory[] }
  | { type: 'delivery_options'; options: { delivery_type: DeliveryType; label: string; fee: number }[]; order_id: string }
  | { type: 'order_status'; orders: { order_no: string; status: string; grand_total: number }[] };

export type PkmOrderItem = { name: string; qty: number; unit_price: number };

export type PkmOrderPanel = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  delivery_type: DeliveryType;
  goods_total: number;
  delivery_fee: number;
  grand_total: number;
  items: PkmOrderItem[];
  has_address: boolean;
  qr_payload: string | null;      // PromptPay EMV string (rendered to an image on LINE)
  round_label: string | null;
} | null;

export type PkmChatAction =
  | { type: 'browse_categories' }
  | { type: 'browse_category'; category_id: string }
  | { type: 'select_product'; catalog_key: string; qty?: number }
  | { type: 'set_address'; lat?: number; lng?: number; address_text?: string }
  | { type: 'choose_delivery_type'; delivery_type: DeliveryType }
  | { type: 'confirm_order' }
  | { type: 'request_slip_upload'; content_type: 'image/jpeg' | 'image/png' }
  | { type: 'payment_slip'; slip_path: string }
  | { type: 'get_order_status' }
  | { type: 'refresh_order' };

export type PkmChatRequest = {
  action: PkmChatAction | null;
  channel: 'line' | 'app';
  client_msg_id: string;
  message: string;
  session_id: string | null;
  tenant_slug: string;
};

export type PkmChatResponse = {
  text: string;
  cards: PkmChatCard[];
  products: PkmProduct[];
  order: PkmOrderPanel;
  session_id: string;
};

export type PkmSlipUploadResponse = {
  upload_url: string;
  storage_path: string;
};
