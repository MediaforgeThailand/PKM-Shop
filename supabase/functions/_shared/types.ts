// Mirrored in lib/types/api.ts. Keep the two files in sync.

export type ApiEnvelope<TData> =
  | {
      data: TData;
      ok: true;
    }
  | {
      error: {
        code: string;
        message: string;
      };
      ok: false;
    };

export type CatalogCategory = 'checkup' | 'general' | 'vaccine';

export type ChatChannel = 'app' | 'line' | 'pwa';

export type ChatRole = 'assistant' | 'system_notice' | 'user';

export type ProductSummary = {
  active: boolean;
  branch_info: string | null;
  catalog_key: string;
  category: CatalogCategory;
  description: string;
  id: string;
  image_url: string | null;
  name: string;
  price_baht: number;
  requires_appointment: boolean;
  tenant_id: string;
};

export type ChatProduct = {
  catalog_key: string;
  description: string;
  image_url: string | null;
  name: string;
  price_baht: number;
};

export type OrderPanelState = {
  amount_baht: number;
  id: string;
  missing_fields: string[];
  product_name: string;
  qr_payload?: string;
  show_form?: boolean;
  status: OrderStatus;
} | null;

export type OrderStatus = 'awaiting_payment' | 'booked' | 'cancelled' | 'collecting_info' | 'confirmed' | 'done' | 'submitted';

export type ChatAction =
  | {
      type: 'consent_granted';
    }
  | {
      catalog_key: string;
      type: 'select_product';
    }
  | {
      buyer_name: string;
      buyer_phone: string;
      order_id: string;
      preferred_date?: string;
      type: 'order_form_submit';
    }
  | {
      order_id: string;
      type: 'payment_done';
    };

export type ChatOrchestratorRequest = {
  action: ChatAction | null;
  channel: ChatChannel;
  client_msg_id: string;
  message: string;
  ref_code?: string;
  session_id: string | null;
  tenant_slug: string;
};

export type ChatOrchestratorResponse = {
  order: OrderPanelState;
  products: ChatProduct[];
  session_id: string;
  text: string;
};

export type FactExtractorRequest = {
  message_id: string;
};

export type AdminOrderActionRequest = {
  action: 'book' | 'cancel' | 'confirm' | 'done';
  booking_at?: string;
  note?: string;
  order_id: string;
};

export type ReferrerOrderRequest =
  | {
      action: 'create_order';
      buyer_name: string;
      buyer_phone: string;
      catalog_key: string;
      preferred_date?: string;
      tenant_slug: string;
    }
  | {
      action: 'payment_done';
      order_id: string;
      tenant_slug: string;
    };

export type ReferrerOrderResponse = {
  order: OrderPanelState;
  referrer: Pick<ReferrerRow, 'id' | 'name' | 'ref_code'>;
};

export type LabIngestRequest = {
  collected_date?: string;
  customer_id: string;
  storage_path: string;
};

export type LabIngestResponse = {
  report: LabReportRow;
  results: LabResultRow[];
};

export type WearableIngestRequest = {
  customer_id: string;
  storage_path: string;
  tenant_slug: string;
};

export type WearableIngestResponse = {
  inserted: number;
  metrics: WearableMetricRow[];
};

export type TenantSummary = {
  display_name: string;
  id: string;
  logo_url: string | null;
  slug: string;
};

export type TenantRow = TenantSummary & {
  attribution_window_days: number;
  features: Record<string, unknown>;
  promptpay_id: string | null;
};

export type CustomerRow = {
  auth_user_id: string | null;
  created_at: string;
  id: string;
  line_user_id: string | null;
  nickname: string | null;
  phone: string | null;
  referred_at: string | null;
  referred_by: string | null;
  tenant_id: string;
};

export type ChatSessionRow = {
  channel: ChatChannel;
  created_at: string;
  customer_id: string;
  flagged: 'complaint' | 'emergency' | null;
  id: string;
  last_message_at: string | null;
  tenant_id: string;
};

export type ChatMessageRow = {
  client_msg_id: string | null;
  content: string;
  created_at: string;
  id: string;
  marker_product_ids: string[];
  openai_response_id: string | null;
  role: ChatRole;
  session_id: string;
};

export type FactKeyRow = {
  key: string;
  unit: string | null;
  value_kind: 'date_fuzzy' | 'number' | 'text' | 'text_list';
};

export type UserFactRow = {
  confidence: number;
  created_at: string;
  customer_id: string;
  id: string;
  key: string;
  source: 'chat_extraction' | 'lab_import' | 'referrer_form' | 'user_confirmation' | 'user_form' | 'wearable';
  source_ref: string | null;
  status: 'active' | 'candidate' | 'retracted' | 'superseded';
  superseded_by: string | null;
  tenant_id: string;
  value_num: number | null;
  value_text: string | null;
};

export type OrderRow = {
  admin_note: string | null;
  amount_baht: number;
  booking_at: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  channel: 'chat_app' | 'chat_line' | 'chat_pwa' | 'referrer';
  created_at: string;
  customer_id: string | null;
  id: string;
  preferred_branch: string | null;
  preferred_date: string | null;
  product_id: string;
  qty: number;
  referrer_id: string | null;
  session_id: string | null;
  slip_url: string | null;
  status: OrderStatus;
  tenant_id: string;
  updated_at: string;
};

export type ReferrerRow = {
  active: boolean;
  auth_user_id: string | null;
  commission_scheme: {
    by_category?: Record<string, number>;
    default: number;
    mode: 'flat_baht' | 'percent';
  };
  created_at: string;
  id: string;
  name: string;
  phone: string | null;
  ref_code: string;
  tenant_id: string;
  type: ReferrerType;
};

export type ReferrerType = 'creator' | 'doctor' | 'nurse' | 'staff';

export type CommissionEntryRow = {
  amount_baht: number;
  created_at: string;
  id: string;
  order_id: string;
  referrer_id: string;
  scheme_snapshot: ReferrerRow['commission_scheme'];
  status: 'approved' | 'paid' | 'pending' | 'void';
  tenant_id: string;
};

export type LabReportRow = {
  ai_summary_th: string | null;
  collected_date: string | null;
  created_at: string;
  customer_id: string;
  id: string;
  status: 'failed' | 'needs_confirmation' | 'processing' | 'ready';
  storage_path: string;
  tenant_id: string;
};

export type LabResultRow = {
  confidence: number;
  confirmed: boolean;
  id: string;
  ref_high: number | null;
  ref_low: number | null;
  report_id: string;
  test_code: string;
  test_name_raw: string;
  unit: string | null;
  value: number | null;
};

export type WearableMetricRow = {
  customer_id: string;
  day: string;
  id: string;
  metric: 'active_energy_kcal' | 'avg_hr' | 'resting_hr' | 'sleep_minutes' | 'steps';
  source: 'apple_export' | 'healthkit' | 'manual';
  tenant_id: string;
  value: number;
};

export type OrderWithProductRow = OrderRow & {
  products?: {
    catalog_key: string;
    category: string;
    name: string;
    price_baht: number;
  } | {
    catalog_key: string;
    category: string;
    name: string;
    price_baht: number;
  }[] | null;
};
