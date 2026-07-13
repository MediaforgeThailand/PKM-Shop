// PKM-Shop — AI sales agent turn pipeline (Ready.md §7). Reuses the OpenAI Responses contract
// (callMiraPrompt) for free-text turns; postback actions are handled deterministically. The
// customer's active `pending` order is the cart. All money/totals come from products/settings.
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
import { callMiraPrompt } from './openai.ts';
import { buildCatalogJson, buildPersonalContext, buildRecentChat } from './pkmContext.ts';
import {
  addItemByCatalogKey,
  getActivePendingOrder,
  getOrCreatePendingOrder,
  loadOrderPanel,
  setDeliveryType,
  setOrderAddress,
} from './pkmOrders.ts';
import { availableDeliveryTypes, computeDeliveryFee, haversineKm } from './fare.ts';
import { DELIVERY_LABELS } from './pkmLine.ts';
import { deliverySettings, loadSettings, storeLatLng } from './settings.ts';
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

const CUSTOMER_SELECT = 'id,tenant_id,auth_user_id,line_user_id,nickname,phone,referred_by,referred_at,created_at';
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
async function deliveryOptionsFor(order: { id: string; lat: number | null; lng: number | null }, tenantId: string): Promise<{ delivery_type: DeliveryType; label: string; fee: number }[]> {
  const settingsMap = await loadSettings(tenantId);
  const settings = deliverySettings(settingsMap);
  const store = storeLatLng(settingsMap);
  let distanceKm: number | null = null;
  if (store && typeof order.lat === 'number' && typeof order.lng === 'number') {
    distanceKm = haversineKm(store, { lat: order.lat, lng: order.lng });
  }
  const types: DeliveryType[] = distanceKm === null ? ['rider', 'express_grab', 'parcel_kerry'] : availableDeliveryTypes(distanceKm, settings);
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
  await insertRow('chat_messages', { content: text, marker_product_ids: markerKeys, openai_response_id: responseId, role: 'assistant', session_id: sessionId }, { select: 'id' });
  await updateRows('chat_sessions', { last_message_at: nowIso() }, { id: `eq.${sessionId}`, select: 'id' });
}

async function enforceRateLimit(customerId: string): Promise<void> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const rows = await selectMany<{ id: string }>('chat_messages', { 'chat_sessions.customer_id': `eq.${customerId}`, created_at: `gte.${since}`, limit: '31', role: 'eq.user', select: 'id,chat_sessions!inner(customer_id)' });
  if (rows.length >= 30) {
    throw new HttpError('RATE_LIMITED', 'Too many messages.', 429);
  }
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
      const options = refreshed ? await deliveryOptionsFor(refreshed, tenant.id) : [];
      return { cards: options.length ? [{ options, order_id: order.id, type: 'delivery_options' }] : [], order: await loadOrderPanel(order.id, tenant.id, tenant.promptpay_id), products: [], text: 'รับที่อยู่แล้วค่ะ เลือกวิธีจัดส่งได้เลย' };
    }
    case 'choose_delivery_type': {
      const order = await getActivePendingOrder(tenant.id, customer.id);
      if (!order) {
        return { cards: [], order: null, products: [], text: 'ยังไม่มีออเดอร์ค่ะ' };
      }
      const options = await deliveryOptionsFor(order, tenant.id);
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
      const order = await getActivePendingOrder(tenant.id, customer.id);
      if (!order) {
        throw new HttpError('VALIDATION', 'No active order.', 400);
      }
      const ext = action.content_type === 'image/png' ? 'png' : 'jpg';
      const path = `${tenant.id}/${order.id}/${crypto.randomUUID()}.${ext}`;
      const uploadUrl = await createSignedUploadUrl('payment-slips', path, 600);
      return { storage_path: path, upload_url: uploadUrl } satisfies PkmSlipUploadResponse;
    }
    case 'payment_slip': {
      const order = await getActivePendingOrder(tenant.id, customer.id);
      if (order) {
        await invokeInternalFunction('slip-verify', { order_id: order.id, slip_path: action.slip_path, tenant_slug: tenant.slug }).catch(() => {});
      }
      return { cards: [], order: order ? await loadOrderPanel(order.id, tenant.id, tenant.promptpay_id) : null, products: [], text: 'รับสลิปแล้วค่ะ กำลังตรวจสอบ' };
    }
    default:
      return null;
  }
}

// Free-text model turn.
async function modelTurn(tenant: TenantRow, customer: CustomerRow, session: SessionRow, message: string): Promise<TurnResult> {
  const [personalContext, recentChat, productCatalog] = await Promise.all([
    buildPersonalContext(tenant.id, customer.id),
    buildRecentChat(session.id),
    buildCatalogJson(tenant.id),
  ]);
  const result = await callMiraPrompt({ brand_name: tenant.display_name, personal_context: personalContext, product_catalog: productCatalog, recent_chat: recentChat, user_nickname: customer.nickname ?? 'ลูกค้า' }, message);
  const parsed = parseChatMarker(result.text);

  let cards: PkmChatCard[] = [];
  let products: PkmProduct[] = [];
  if (parsed.type === 'products') {
    products = await lookupProductsByKeys(tenant.id, parsed.catalogKeys);
    if (products.length) {
      cards = [{ products, type: 'product_grid' }];
    }
  } else if (parsed.type === 'categories') {
    cards = [await buildCategoryCard(tenant.id)];
  } else if (parsed.type === 'order_status') {
    const orders = await selectMany<{ order_no: string; status: string; grand_total: number }>('orders', { customer_id: `eq.${customer.id}`, limit: '5', order: 'created_at.desc', select: 'order_no,status,grand_total', tenant_id: `eq.${tenant.id}` });
    cards = [{ orders, type: 'order_status' }];
  }

  await persistAssistant(session.id, parsed.text, products.map((p) => p.catalog_key), result.responseId);
  const active = await getActivePendingOrder(tenant.id, customer.id);
  const order = active ? await loadOrderPanel(active.id, tenant.id, tenant.promptpay_id) : null;
  return { cards, order, products, text: parsed.text };
}

function isSlipUpload(value: TurnResult | PkmSlipUploadResponse): value is PkmSlipUploadResponse {
  return 'upload_url' in value;
}

async function runTurn(tenant: TenantRow, customer: CustomerRow, session: SessionRow, action: PkmChatAction | null, clientMsgId: string, message: string): Promise<PkmChatResponse | PkmSlipUploadResponse> {
  if (action) {
    const result = await handleAction(action, tenant, customer, session.id);
    if (result && isSlipUpload(result)) {
      return result;
    }
    if (result) {
      if (message.trim()) {
        await persistUser(session.id, clientMsgId, message);
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
  const turn = await modelTurn(tenant, customer, session, message);
  return { ...turn, session_id: session.id };
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

// A customer sent a slip image in LINE: upload it to the private bucket against their active
// order and kick off SlipOK verification. Returns the Thai acknowledgement to reply with.
export async function handleLineSlip(tenantSlug: string, lineUserId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const tenant = await assertTenant(tenantSlug);
  const customer = await resolveOrCreateLineCustomer(tenant, lineUserId);
  const order = await getActivePendingOrder(tenant.id, customer.id);
  if (!order) {
    return 'ยังไม่มีออเดอร์ที่รอชำระค่ะ เลือกสินค้าก่อนนะคะ';
  }
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${tenant.id}/${order.id}/${crypto.randomUUID()}.${ext}`;
  await uploadStorageObject('payment-slips', path, bytes, contentType);
  await invokeInternalFunction('slip-verify', { order_id: order.id, slip_path: path, tenant_slug: tenant.slug }).catch(() => {});
  return 'รับสลิปแล้วค่ะ กำลังตรวจสอบการชำระเงิน สักครู่นะคะ';
}
