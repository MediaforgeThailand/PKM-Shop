// PKM-Shop — AI sales agent turn pipeline (Ready.md §7). Free-text turns go to the Anthropic
// Messages API (callSalesModel); postback actions are handled deterministically. The customer's
// active `pending` order is the cart. All money/totals come from products/settings. Handoff
// (Ready.md §7 DEFAULT): explicit customer request, a complaint, or the model's [[handoff]]
// marker flips the session to agent_mode='human' — the AI stays silent until an admin closes it.
import {
  assertTenant,
  insertRow,
  invokeInternalFunction,
  resolveAuthUserId,
  resolveOrCreateCustomer,
  selectMany,
  selectOne,
  updateRows,
  upsertRow,
} from './db.ts';
import { HttpError } from './http.ts';
import { fetchLineProfile } from './line.ts';
import { filterKnownProductMarkerKeys, parseChatMarker } from './marker.ts';
import { callSalesModel } from './ai.ts';
import { notifyEvent } from './notify.ts';
import { buildCatalogJson, buildPersonalContext, buildRecentChat } from './pkmContext.ts';
import {
  addItemByCatalogKey,
  getActivePendingOrder,
  getOrCreatePendingOrder,
  getOrderAwaitingPayment,
  loadOrderPanel,
  setDeliveryType,
  setOrderAddress,
} from './pkmOrders.ts';
import { availableDeliveryTypes, computeDeliveryFee, haversineKm } from './fare.ts';
import { DELIVERY_LABELS } from './pkmLine.ts';
import { deliverySettings, loadSettings, settingString, storeLatLng } from './settings.ts';
import { createSignedUploadUrl, uploadStorageObject } from './storage.ts';
import type {
  CustomerRow,
  DeliveryType,
  PkmChatAction,
  PkmChatCard,
  PkmChatRequest,
  PkmChatResponse,
  PkmOrderPanel,
  PkmProduct,
  PkmSlipUploadResponse,
  TenantRow,
} from './pkmTypes.ts';

const CUSTOMER_SELECT = 'id,tenant_id,auth_user_id,line_user_id,nickname,phone,zone_override,created_at';
const SESSION_SELECT = 'id,tenant_id,customer_id,channel,agent_mode,last_message_at,created_at';

type SessionRow = { id: string; tenant_id: string; customer_id: string; channel: string; agent_mode: string | null };

function nowIso() {
  return new Date().toISOString();
}

// ---- catalog cards -------------------------------------------------------
type ProductRow = { catalog_key: string; name: string; description: string; price_baht: number; category: string | null; image_url: string | null; category_id: string | null; stock_qty: number; reserved_qty: number };

function toProduct(row: ProductRow): PkmProduct {
  return { catalog_key: row.catalog_key, category: row.category, description: row.description, image_url: row.image_url, name: row.name, price_baht: row.price_baht };
}

const PRODUCT_SELECT = 'catalog_key,name,description,price_baht,category,image_url,category_id,stock_qty,reserved_qty';

async function availableProducts(tenantId: string, extra: Record<string, string | undefined> = {}): Promise<PkmProduct[]> {
  const rows = await selectMany<ProductRow>('products', { active: 'eq.true', limit: '48', select: PRODUCT_SELECT, tenant_id: `eq.${tenantId}`, ...extra });
  return rows.filter((r) => (r.stock_qty ?? 0) - (r.reserved_qty ?? 0) > 0).map(toProduct);
}

async function buildCategoryCard(tenantId: string): Promise<PkmChatCard> {
  const categories = await selectMany<{ id: string; name: string }>('categories', { active: 'eq.true', order: 'sort.asc', select: 'id,name', tenant_id: `eq.${tenantId}` });
  const products = await selectMany<{ category_id: string | null; stock_qty: number; reserved_qty: number }>('products', { active: 'eq.true', select: 'category_id,stock_qty,reserved_qty', tenant_id: `eq.${tenantId}` });
  const counts = new Map<string, number>();
  for (const p of products) {
    if (p.category_id && (p.stock_qty ?? 0) - (p.reserved_qty ?? 0) > 0) {
      counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
  }
  return { categories: categories.map((c) => ({ id: c.id, name: c.name, product_count: counts.get(c.id) ?? 0 })), type: 'category_grid' };
}

async function lookupProductsByKeys(tenantId: string, keys: string[]): Promise<PkmProduct[]> {
  if (keys.length === 0) {
    return [];
  }
  const rows = await selectMany<ProductRow>('products', { active: 'eq.true', catalog_key: `in.(${keys.join(',')})`, select: PRODUCT_SELECT, tenant_id: `eq.${tenantId}` });
  const byKey = new Map(rows.map((r) => [r.catalog_key, r]));
  const known = filterKnownProductMarkerKeys(keys, byKey.keys(), () => {});
  return known.map((k) => byKey.get(k)).filter((r): r is ProductRow => Boolean(r)).map(toProduct);
}

// ---- delivery options ----------------------------------------------------
async function deliveryOptionsFor(
  order: { id: string; lat: number | null; lng: number | null },
  tenantId: string,
  zoneOverride: 'in_zone' | 'out_zone' | null = null,
): Promise<{ delivery_type: DeliveryType; label: string; fee: number }[]> {
  const settingsMap = await loadSettings(tenantId);
  const settings = deliverySettings(settingsMap);
  const store = storeLatLng(settingsMap);
  let distanceKm: number | null = null;
  if (store && typeof order.lat === 'number' && typeof order.lng === 'number') {
    distanceKm = haversineKm(store, { lat: order.lat, lng: order.lng });
  }
  // Admin per-customer zone override wins over the distance check (Ready.md §3.3).
  let types: DeliveryType[];
  if (zoneOverride === 'in_zone') {
    types = ['rider', 'express_grab', 'parcel_kerry'];
  } else if (zoneOverride === 'out_zone') {
    types = distanceKm === null ? ['parcel_kerry'] : ['lalamove', 'parcel_kerry'];
  } else {
    types = distanceKm === null ? ['rider', 'express_grab', 'parcel_kerry'] : availableDeliveryTypes(distanceKm, settings);
  }
  return types
    .filter((t) => t !== 'lalamove' || distanceKm !== null)
    .map((t) => ({ delivery_type: t, fee: computeDeliveryFee(t, distanceKm ?? 0, settings), label: DELIVERY_LABELS[t] }));
}

// ---- sessions / customers ------------------------------------------------
async function resolveOrCreateLineCustomer(tenant: TenantRow, lineUserId: string): Promise<CustomerRow> {
  const customer = await upsertRow<CustomerRow>('customers', { line_user_id: lineUserId, tenant_id: tenant.id }, 'tenant_id,line_user_id', { select: CUSTOMER_SELECT });
  if (!customer.nickname || !customer.nickname.trim()) {
    const profile = await fetchLineProfile(tenant.slug, lineUserId);
    const displayName = profile?.displayName?.trim();
    if (displayName) {
      const updated = await updateRows<CustomerRow>('customers', { nickname: displayName }, { id: `eq.${customer.id}`, select: CUSTOMER_SELECT, tenant_id: `eq.${tenant.id}` });
      return updated[0] ?? { ...customer, nickname: displayName };
    }
  }
  return customer;
}

async function resolveLatestSession(tenantId: string, customerId: string, channel: string): Promise<SessionRow> {
  const existing = await selectOne<SessionRow>('chat_sessions', { channel: `eq.${channel}`, customer_id: `eq.${customerId}`, order: 'last_message_at.desc', select: SESSION_SELECT, tenant_id: `eq.${tenantId}` });
  if (existing) {
    return existing;
  }
  return insertRow<SessionRow>('chat_sessions', { channel, customer_id: customerId, last_message_at: nowIso(), tenant_id: tenantId }, { select: SESSION_SELECT });
}

async function resolveSessionById(sessionId: string | null, tenantId: string, customerId: string, channel: string): Promise<SessionRow> {
  if (sessionId) {
    const s = await selectOne<SessionRow>('chat_sessions', { customer_id: `eq.${customerId}`, id: `eq.${sessionId}`, select: SESSION_SELECT, tenant_id: `eq.${tenantId}` });
    if (!s) {
      throw new HttpError('VALIDATION', 'Session not found.', 404);
    }
    return s;
  }
  return insertRow<SessionRow>('chat_sessions', { channel, customer_id: customerId, last_message_at: nowIso(), tenant_id: tenantId }, { select: SESSION_SELECT });
}

async function persistUser(sessionId: string, clientMsgId: string, content: string): Promise<{ duplicate: boolean; id: string }> {
  const existing = await selectOne<{ id: string }>('chat_messages', { client_msg_id: `eq.${clientMsgId}`, select: 'id', session_id: `eq.${sessionId}` });
  if (existing) {
    return { duplicate: true, id: existing.id };
  }
  const row = await insertRow<{ id: string }>('chat_messages', { client_msg_id: clientMsgId, content, role: 'user', session_id: sessionId }, { select: 'id' });
  return { duplicate: false, id: row.id };
}

async function persistAssistant(sessionId: string, text: string, markerKeys: string[], responseId: string | null): Promise<void> {
  await insertRow('chat_messages', { content: text, marker_product_ids: markerKeys, model_response_id: responseId, role: 'assistant', session_id: sessionId }, { select: 'id' });
  await updateRows('chat_sessions', { last_message_at: nowIso() }, { id: `eq.${sessionId}`, select: 'id' });
}

async function enforceRateLimit(customerId: string, limit = 30): Promise<void> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const rows = await selectMany<{ id: string }>('chat_messages', { 'chat_sessions.customer_id': `eq.${customerId}`, created_at: `gte.${since}`, limit: String(limit + 1), role: 'eq.user', select: 'id,chat_sessions!inner(customer_id)' });
  if (rows.length >= limit) {
    throw new HttpError('RATE_LIMITED', 'Too many messages.', 429);
  }
}

// ---- handoff (Ready.md §7 DEFAULT) ----------------------------------------
const HANDOFF_PATTERNS = [
  'ขอคุยกับคน', 'คุยกับคนจริง', 'ขอคุยกับแอดมิน', 'คุยกับแอดมิน', 'ขอคุยกับพนักงาน',
  'ติดต่อพนักงาน', 'ติดต่อแอดมิน', 'ติดต่อเจ้าหน้าที่', 'ขอสายเจ้าหน้าที่', 'ขอเจ้าหน้าที่',
  'ร้องเรียน', 'ไม่อยากคุยกับบอท', 'ไม่คุยกับบอท', 'ขอคนตอบ',
];

function wantsHuman(message: string): boolean {
  const m = message.replace(/\s+/g, '');
  return HANDOFF_PATTERNS.some((p) => m.includes(p));
}

const HANDOFF_ACK = 'รับเรื่องแล้วค่ะ กำลังส่งต่อให้เจ้าหน้าที่มาดูแลต่อ รอสักครู่นะคะ 🙏';

async function startHandoff(tenant: TenantRow, session: SessionRow, reason: string): Promise<void> {
  await updateRows('chat_sessions', { agent_mode: 'human', flagged: reason === 'complaint' ? 'complaint' : undefined, last_message_at: nowIso() }, { id: `eq.${session.id}`, select: 'id', tenant_id: `eq.${tenant.id}` });
  await insertRow('chat_messages', { content: `ส่งต่อให้เจ้าหน้าที่ (${reason})`, role: 'system_notice', session_id: session.id }, { select: 'id' }).catch(() => {});
  await notifyEvent({ eventType: 'handoff', extra: { reason, session_key: session.id }, tenantId: tenant.id, tenantSlug: tenant.slug }).catch(() => {});
}

type TurnResult = { text: string; cards: PkmChatCard[]; products: PkmProduct[]; order: PkmOrderPanel };

// Deterministic postback handling. Returns null to fall through to a model turn.
async function handleAction(action: PkmChatAction, tenant: TenantRow, customer: CustomerRow, sessionId: string): Promise<TurnResult | PkmSlipUploadResponse | null> {
  const panel = async () => {
    const active = await getActivePendingOrder(tenant.id, customer.id);
    return active ? loadOrderPanel(active.id, tenant.id, tenant.promptpay_id) : null;
  };

  switch (action.type) {
    case 'browse_categories':
      return { cards: [await buildCategoryCard(tenant.id)], order: await panel(), products: [], text: 'เลือกหมวดที่สนใจได้เลยค่ะ' };
    case 'browse_category': {
      const products = await availableProducts(tenant.id, { category_id: `eq.${action.category_id}` });
      return { cards: products.length ? [{ products, type: 'product_grid' }] : [], order: await panel(), products, text: products.length ? 'เลือกสินค้าที่สนใจได้เลยค่ะ' : 'หมวดนี้สินค้าหมดชั่วคราวค่ะ' };
    }
    case 'select_product': {
      const order = await getOrCreatePendingOrder(tenant.id, customer.id, sessionId);
      await addItemByCatalogKey(order, action.catalog_key, action.qty ?? 1);
      return { cards: [], order: await loadOrderPanel(order.id, tenant.id, tenant.promptpay_id), products: [], text: 'เพิ่มลงตะกร้าแล้วค่ะ แจ้งที่อยู่จัดส่งได้เลย (พิมพ์ หรือกดแชร์ตำแหน่งใน LINE)' };
    }
    case 'set_address': {
      const order = await getActivePendingOrder(tenant.id, customer.id);
      if (!order) {
        return { cards: [], order: null, products: [], text: 'ยังไม่มีสินค้าในตะกร้าค่ะ เลือกสินค้าก่อนนะคะ' };
      }
      await setOrderAddress(order, { address_text: action.address_text, lat: action.lat, lng: action.lng });
      const refreshed = await getActivePendingOrder(tenant.id, customer.id);
      const options = refreshed ? await deliveryOptionsFor(refreshed, tenant.id, customer.zone_override) : [];
      return { cards: options.length ? [{ options, order_id: order.id, type: 'delivery_options' }] : [], order: await loadOrderPanel(order.id, tenant.id, tenant.promptpay_id), products: [], text: 'รับที่อยู่แล้วค่ะ เลือกวิธีจัดส่งได้เลย' };
    }
    case 'choose_delivery_type': {
      const order = await getActivePendingOrder(tenant.id, customer.id);
      if (!order) {
        return { cards: [], order: null, products: [], text: 'ยังไม่มีออเดอร์ค่ะ' };
      }
      const options = await deliveryOptionsFor(order, tenant.id, customer.zone_override);
      const chosen = options.find((o) => o.delivery_type === action.delivery_type);
      if (!chosen) {
        return { cards: [], order: await loadOrderPanel(order.id, tenant.id, tenant.promptpay_id), products: [], text: 'วิธีจัดส่งนี้ยังไม่พร้อมค่ะ' };
      }
      await setDeliveryType(order, chosen.delivery_type, chosen.fee);
      return { cards: [], order: await loadOrderPanel(order.id, tenant.id, tenant.promptpay_id), products: [], text: `เลือก ${chosen.label} ค่าส่ง ฿${chosen.fee.toLocaleString('th-TH')} — โอนแล้วส่งสลิปได้เลยค่ะ` };
    }
    case 'confirm_order':
    case 'refresh_order':
      return { cards: [], order: await panel(), products: [], text: '' };
    case 'get_order_status': {
      const orders = await selectMany<{ order_no: string; status: string; grand_total: number }>('orders', { customer_id: `eq.${customer.id}`, limit: '5', order: 'created_at.desc', select: 'order_no,status,grand_total', tenant_id: `eq.${tenant.id}` });
      return { cards: [{ orders, type: 'order_status' }], order: await panel(), products: [], text: 'สถานะออเดอร์ล่าสุดค่ะ' };
    }
    case 'request_slip_upload': {
      const target = await getOrderAwaitingPayment(tenant.id, customer.id);
      if (!target) {
        throw new HttpError('VALIDATION', 'No active order.', 400);
      }
      const ext = action.content_type === 'image/png' ? 'png' : 'jpg';
      const path = `${tenant.id}/${target.order.id}/${crypto.randomUUID()}.${ext}`;
      const uploadUrl = await createSignedUploadUrl('payment-slips', path, 600);
      return { storage_path: path, upload_url: uploadUrl } satisfies PkmSlipUploadResponse;
    }
    case 'payment_slip': {
      const target = await getOrderAwaitingPayment(tenant.id, customer.id);
      if (!target) {
        return { cards: [], order: null, products: [], text: 'ยังไม่มีออเดอร์ที่รอชำระค่ะ' };
      }
      // Slip paths are server-issued (request_slip_upload) — reject anything outside this
      // customer's own order folder so one order's slip can't settle another.
      if (!action.slip_path.startsWith(`${tenant.id}/${target.order.id}/`)) {
        throw new HttpError('VALIDATION', 'Invalid slip path.', 400);
      }
      const text = await verifySlipAndReply(tenant, target.order.id, action.slip_path);
      const pendingAfter = await getActivePendingOrder(tenant.id, customer.id);
      return { cards: [], order: pendingAfter ? await loadOrderPanel(pendingAfter.id, tenant.id, tenant.promptpay_id) : null, products: [], text };
    }
    default:
      return null;
  }
}

// Free-text model turn.
async function modelTurn(tenant: TenantRow, customer: CustomerRow, session: SessionRow, message: string): Promise<TurnResult> {
  const [personalContext, recentChat, productCatalog, settingsMap] = await Promise.all([
    buildPersonalContext(tenant.id, customer.id),
    buildRecentChat(session.id),
    buildCatalogJson(tenant.id),
    loadSettings(tenant.id),
  ]);

  let text: string;
  let responseId: string | null = null;
  let parsedType: ReturnType<typeof parseChatMarker>['type'] = null;
  let catalogKeys: string[] = [];
  try {
    const result = await callSalesModel(
      { brand_name: tenant.display_name, personal_context: personalContext, product_catalog: productCatalog, recent_chat: recentChat, user_nickname: customer.nickname ?? 'ลูกค้า' },
      message,
      { model: settingString(settingsMap, 'ai_model', '') || null },
    );
    const parsed = parseChatMarker(result.text);
    text = parsed.text;
    parsedType = parsed.type;
    catalogKeys = parsed.catalogKeys;
    responseId = result.responseId;
  } catch (error) {
    // Model outage must not strand the customer: reply with a safe fallback and keep the
    // deterministic buttons usable. (Payment authority is unaffected — it never runs here.)
    console.error('model_turn_failed', error instanceof Error ? error.message : error);
    text = 'ขออภัยค่ะ ระบบตอบอัตโนมัติขัดข้องชั่วคราว ลองพิมพ์อีกครั้ง หรือกดปุ่ม "ดูสินค้า" ได้เลยค่ะ';
    await persistAssistant(session.id, text, [], null);
    const activeOrder = await getActivePendingOrder(tenant.id, customer.id);
    return { cards: [], order: activeOrder ? await loadOrderPanel(activeOrder.id, tenant.id, tenant.promptpay_id) : null, products: [], text };
  }

  if (parsedType === 'handoff') {
    await startHandoff(tenant, session, 'ai_handoff');
    const ack = text || HANDOFF_ACK;
    await persistAssistant(session.id, ack, [], responseId);
    return { cards: [], order: null, products: [], text: ack };
  }

  let cards: PkmChatCard[] = [];
  let products: PkmProduct[] = [];
  if (parsedType === 'products') {
    products = await lookupProductsByKeys(tenant.id, catalogKeys);
    if (products.length) {
      cards = [{ products, type: 'product_grid' }];
    }
  } else if (parsedType === 'categories') {
    cards = [await buildCategoryCard(tenant.id)];
  } else if (parsedType === 'order_status') {
    const orders = await selectMany<{ order_no: string; status: string; grand_total: number }>('orders', { customer_id: `eq.${customer.id}`, limit: '5', order: 'created_at.desc', select: 'order_no,status,grand_total', tenant_id: `eq.${tenant.id}` });
    cards = [{ orders, type: 'order_status' }];
  }

  await persistAssistant(session.id, text, products.map((p) => p.catalog_key), responseId);
  const active = await getActivePendingOrder(tenant.id, customer.id);
  const order = active ? await loadOrderPanel(active.id, tenant.id, tenant.promptpay_id) : null;
  return { cards, order, products, text };
}

function isSlipUpload(value: TurnResult | PkmSlipUploadResponse): value is PkmSlipUploadResponse {
  return 'upload_url' in value;
}

async function runTurn(tenant: TenantRow, customer: CustomerRow, session: SessionRow, action: PkmChatAction | null, clientMsgId: string, message: string): Promise<PkmChatResponse | PkmSlipUploadResponse> {
  if (action) {
    // Deterministic actions skip the model but still hit the DB — cap postback floods too.
    await enforceRateLimit(customer.id, 60);
    const result = await handleAction(action, tenant, customer, session.id);
    if (result && isSlipUpload(result)) {
      return result;
    }
    if (result) {
      if (message.trim()) {
        await persistUser(session.id, clientMsgId, message);
      }
      if (result.text.trim()) {
        // Log the reply too — the transcript (and the model's recent-chat context) must
        // carry both sides of the conversation (Ready.md §7: log ทุกข้อความ).
        await persistAssistant(session.id, result.text, [], null).catch(() => {});
      }
      return { ...result, session_id: session.id };
    }
  }

  const persisted = await persistUser(session.id, clientMsgId, message);
  if (persisted.duplicate) {
    // idempotent replay: return the current panel without re-calling the model
    const active = await getActivePendingOrder(tenant.id, customer.id);
    return { cards: [], order: active ? await loadOrderPanel(active.id, tenant.id, tenant.promptpay_id) : null, products: [], session_id: session.id, text: '' };
  }
  await enforceRateLimit(customer.id);

  // Explicit "I want a human" / complaint beats the model turn (Ready.md §7 DEFAULT).
  if (wantsHuman(message)) {
    const isComplaint = message.replace(/\s+/g, '').includes('ร้องเรียน');
    await startHandoff(tenant, session, isComplaint ? 'complaint' : 'customer_request');
    await persistAssistant(session.id, HANDOFF_ACK, [], null).catch(() => {});
    return { cards: [], order: null, products: [], session_id: session.id, text: HANDOFF_ACK };
  }

  const turn = await modelTurn(tenant, customer, session, message);
  return { ...turn, session_id: session.id };
}

// ---- slip verification round-trip ------------------------------------------
type SlipVerifyOutcome = {
  status: string;
  kind?: 'goods' | 'redelivery';
  order_no?: string;
  expected_amount?: number;
  retry_minutes?: number;
  reason?: string;
};

function slipReplyText(outcome: SlipVerifyOutcome): string {
  const orderNo = outcome.order_no ? ` ${outcome.order_no}` : '';
  switch (outcome.status) {
    case 'paid':
      return outcome.kind === 'redelivery'
        ? `ได้รับค่าส่งแล้วค่ะ ✅ ระบบสร้างออเดอร์จัดส่งใหม่${orderNo} ให้เรียบร้อย เดี๋ยวแจ้งรอบจัดส่งอีกครั้งนะคะ`
        : `ชำระเงินสำเร็จค่ะ ✅ ออเดอร์${orderNo} กำลังเข้าคิวจัดส่ง เดี๋ยวระบบแจ้งรอบให้ทันทีนะคะ`;
    case 'already_paid':
      return `ออเดอร์${orderNo} ชำระเงินเรียบร้อยแล้วค่ะ ไม่ต้องส่งสลิปซ้ำนะคะ`;
    case 'bank_delay':
      return `ธนาคารต้นทางกำลังประมวลผลค่ะ รอประมาณ ${outcome.retry_minutes ?? 5} นาที แล้วส่งสลิปเดิมอีกครั้งได้เลยนะคะ`;
    case 'retry_later':
      return 'ระบบธนาคารขัดข้องชั่วคราวค่ะ อีกสักครู่รบกวนส่งสลิปเดิมอีกครั้งนะคะ';
    case 'duplicate':
      return 'สลิปนี้เคยถูกใช้ยืนยันแล้วค่ะ ถ้าโอนใหม่รบกวนส่งสลิปของรายการล่าสุดนะคะ';
    case 'amount_mismatch':
      return `ยอดในสลิปไม่ตรงกับยอดที่ต้องชำระ (${(outcome.expected_amount ?? 0).toLocaleString('th-TH')} บาท) ค่ะ รบกวนตรวจสอบแล้วส่งสลิปที่ยอดถูกต้องนะคะ`;
    case 'unreadable':
      return 'อ่านข้อมูลจากสลิปไม่ได้ค่ะ รบกวนส่งรูปสลิปที่เห็น QR ชัด ๆ อีกครั้งนะคะ';
    case 'pending_verify':
      return 'รับสลิปแล้วค่ะ ส่งให้เจ้าหน้าที่ตรวจสอบ จะยืนยันให้เร็วที่สุดนะคะ 🙏';
    default:
      return 'รับสลิปแล้วค่ะ กำลังตรวจสอบการชำระเงิน สักครู่นะคะ';
  }
}

// Run slip-verify synchronously and turn its typed outcome into the Thai reply the
// customer sees (audit: results used to be discarded — duplicate/wrong-amount feedback
// never reached the customer).
async function verifySlipAndReply(tenant: TenantRow, orderId: string, slipPath: string): Promise<string> {
  try {
    const response = await invokeInternalFunction('slip-verify', { order_id: orderId, slip_path: slipPath, tenant_slug: tenant.slug });
    const envelope = (await response.json()) as { ok?: boolean; data?: SlipVerifyOutcome; error?: { message?: string } };
    if (!envelope.ok || !envelope.data) {
      console.error('slip_verify_failed', envelope.error?.message);
      return 'รับสลิปแล้วค่ะ ระบบตรวจสอบอัตโนมัติขัดข้อง เดี๋ยวเจ้าหน้าที่ตรวจสอบให้เร็วที่สุดนะคะ';
    }
    return slipReplyText(envelope.data);
  } catch (error) {
    console.error('slip_verify_error', error instanceof Error ? error.message : error);
    return 'รับสลิปแล้วค่ะ ระบบตรวจสอบอัตโนมัติขัดข้อง เดี๋ยวเจ้าหน้าที่ตรวจสอบให้เร็วที่สุดนะคะ';
  }
}

export async function orchestrateLine(req: { action: PkmChatAction | null; client_msg_id: string; line_user_id: string; message: string; tenant_slug: string }): Promise<PkmChatResponse | null> {
  const tenant = await assertTenant(req.tenant_slug);
  const customer = await resolveOrCreateLineCustomer(tenant, req.line_user_id);
  const session = await resolveLatestSession(tenant.id, customer.id, 'line');
  if (session.agent_mode === 'human') {
    if (req.message.trim()) {
      await persistUser(session.id, req.client_msg_id, req.message);
    }
    return null;
  }
  const result = await runTurn(tenant, customer, session, req.action, req.client_msg_id, req.message);
  return 'upload_url' in result ? null : result;
}

export async function orchestrateChat(req: PkmChatRequest, authorization: string | null): Promise<PkmChatResponse | PkmSlipUploadResponse> {
  const tenant = await assertTenant(req.tenant_slug);
  const authUserId = await resolveAuthUserId(authorization);
  const customer = await resolveOrCreateCustomer(tenant.id, authUserId);
  const session = await resolveSessionById(req.session_id, tenant.id, customer.id, req.channel);
  return runTurn(tenant, customer, session, req.action, req.client_msg_id, req.message);
}

// Staff LINE binding (Ready.md §6): a staff member adds the OA and types their link code.
// If the text matches an unbound profile link_code for this tenant, bind their line_user_id
// and return a confirmation; otherwise return null (fall through to the customer chat).
export async function bindStaffLinkCode(tenantSlug: string, lineUserId: string, text: string): Promise<string | null> {
  const code = text.trim().toUpperCase();
  if (!/^[0-9A-Z]{6}$/.test(code)) {
    return null;
  }
  const tenant = await assertTenant(tenantSlug);
  const profile = await selectOne<{ id: string; name: string }>('profiles', {
    line_user_id: 'is.null',
    link_code: `eq.${code}`,
    select: 'id,name',
    tenant_id: `eq.${tenant.id}`,
  });
  if (!profile) {
    return null;
  }
  await updateRows('profiles', { line_user_id: lineUserId }, { id: `eq.${profile.id}`, select: 'id', tenant_id: `eq.${tenant.id}` });
  return `ผูกบัญชีพนักงานสำเร็จ ✅ คุณ${profile.name || ''} จะได้รับแจ้งเตือนงานทาง LINE นี้ค่ะ`;
}

// A customer sent an image in LINE. During a human handoff the bot must stay silent —
// the image is logged for the admin console and NOT treated as a slip. Otherwise: upload
// against the order they actually owe (payable cart, or a returned order awaiting its
// redelivery fee), verify synchronously, and return the outcome-specific Thai reply.
// Returns null when the bot should not reply at all.
export async function handleLineSlip(tenantSlug: string, lineUserId: string, bytes: Uint8Array, contentType: string): Promise<string | null> {
  const tenant = await assertTenant(tenantSlug);
  const customer = await resolveOrCreateLineCustomer(tenant, lineUserId);
  const session = await resolveLatestSession(tenant.id, customer.id, 'line');

  const ext = contentType.includes('png') ? 'png' : 'jpg';
  if (session.agent_mode === 'human') {
    // Store it so the admin can view it, say nothing (the admin owns this conversation).
    const path = `${tenant.id}/handoff/${customer.id}/${crypto.randomUUID()}.${ext}`;
    await uploadStorageObject('payment-slips', path, bytes, contentType).catch(() => {});
    await persistUser(session.id, crypto.randomUUID(), `[ลูกค้าส่งรูปภาพระหว่างคุยกับเจ้าหน้าที่: ${path}]`).catch(() => {});
    return null;
  }

  // Slip images trigger billed SlipOK calls — throttle tighter than free chat.
  try {
    await enforceRateLimit(customer.id, 10);
  } catch {
    return 'ส่งสลิปถี่เกินไปค่ะ รอสักครู่แล้วส่งอีกครั้งนะคะ 🙏';
  }

  const target = await getOrderAwaitingPayment(tenant.id, customer.id);
  if (!target) {
    return 'ยังไม่มีออเดอร์ที่รอชำระค่ะ เลือกสินค้าก่อนนะคะ';
  }
  const path = `${tenant.id}/${target.order.id}/${crypto.randomUUID()}.${ext}`;
  await uploadStorageObject('payment-slips', path, bytes, contentType);
  const reply = await verifySlipAndReply(tenant, target.order.id, path);
  // Keep the transcript complete for the admin console (slip receipt + our reply).
  try {
    await persistUser(session.id, crypto.randomUUID(), `[ส่งสลิปโอนเงิน — ออเดอร์ ${target.order.order_no}]`);
    await persistAssistant(session.id, reply, [], null);
  } catch (error) {
    console.warn('slip_transcript_persist_failed', error instanceof Error ? error.message : error);
  }
  return reply;
}
