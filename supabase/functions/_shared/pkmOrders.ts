// PKM-Shop — cart-as-pending-order helpers for the AI sales agent. The "cart" is simply the
// customer's active `pending` order; items are appended as order_items with a price + packer
// commission snapshot. Totals are recomputed server-side from products only (AGENTS.md money).
import { insertRow, selectMany, selectOne, updateRows } from './db.ts';
import { buildPromptPayPayload } from './promptpay.ts';
import { roundLabelBangkok } from './rounds.ts';
import type { DeliveryType, PkmOrderPanel } from './pkmTypes.ts';

const ORDER_SELECT =
  'id,tenant_id,order_no,customer_id,session_id,status,payment_status,delivery_type,goods_total,delivery_fee,grand_total,address_text,lat,lng,recipient_name,recipient_phone,round_id';

export type PendingOrderRow = {
  id: string;
  tenant_id: string;
  order_no: string;
  customer_id: string;
  session_id: string | null;
  status: string;
  payment_status: string;
  delivery_type: DeliveryType;
  goods_total: number;
  delivery_fee: number;
  grand_total: number;
  address_text: string | null;
  lat: number | null;
  lng: number | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  round_id: string | null;
};

export async function getActivePendingOrder(tenantId: string, customerId: string): Promise<PendingOrderRow | null> {
  return selectOne<PendingOrderRow>('orders', {
    customer_id: `eq.${customerId}`,
    limit: '1',
    order: 'created_at.desc',
    select: ORDER_SELECT,
    status: 'eq.pending',
    tenant_id: `eq.${tenantId}`,
  });
}

export async function getOrCreatePendingOrder(tenantId: string, customerId: string, sessionId: string): Promise<PendingOrderRow> {
  const existing = await getActivePendingOrder(tenantId, customerId);
  if (existing) {
    return existing;
  }
  return insertRow<PendingOrderRow>('orders', {
    customer_id: customerId,
    session_id: sessionId,
    status: 'pending',
    tenant_id: tenantId,
  }, { select: ORDER_SELECT });
}

type ProductRow = { id: string; catalog_key: string; name: string; price_baht: number; packer_commission_rate: number };

async function recomputeGoodsTotal(orderId: string, tenantId: string): Promise<void> {
  const items = await selectMany<{ qty: number; unit_price: number }>('order_items', {
    order_id: `eq.${orderId}`,
    select: 'qty,unit_price',
  });
  const goods = items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);
  const order = await selectOne<{ delivery_fee: number }>('orders', { id: `eq.${orderId}`, select: 'delivery_fee', tenant_id: `eq.${tenantId}` });
  const fee = order?.delivery_fee ?? 0;
  await updateRows('orders', { goods_total: goods, grand_total: goods + fee, updated_at: new Date().toISOString() }, { id: `eq.${orderId}`, tenant_id: `eq.${tenantId}` });
}

export async function addItemByCatalogKey(order: PendingOrderRow, catalogKey: string, qty: number): Promise<void> {
  const product = await selectOne<ProductRow>('products', {
    active: 'eq.true',
    catalog_key: `eq.${catalogKey}`,
    select: 'id,catalog_key,name,price_baht,packer_commission_rate',
    tenant_id: `eq.${order.tenant_id}`,
  });
  if (!product) {
    return;
  }
  await insertRow('order_items', {
    commission_snapshot: product.packer_commission_rate,
    order_id: order.id,
    product_id: product.id,
    qty: Math.max(1, qty),
    tenant_id: order.tenant_id,
    unit_price: product.price_baht,
  });
  await recomputeGoodsTotal(order.id, order.tenant_id);
}

export async function setOrderAddress(order: PendingOrderRow, patch: { lat?: number; lng?: number; address_text?: string; recipient_name?: string; recipient_phone?: string }): Promise<void> {
  await updateRows('orders', {
    address_text: patch.address_text ?? order.address_text,
    lat: patch.lat ?? order.lat,
    lng: patch.lng ?? order.lng,
    recipient_name: patch.recipient_name ?? order.recipient_name,
    recipient_phone: patch.recipient_phone ?? order.recipient_phone,
    updated_at: new Date().toISOString(),
  }, { id: `eq.${order.id}`, tenant_id: `eq.${order.tenant_id}` });
}

export async function setDeliveryType(order: PendingOrderRow, deliveryType: DeliveryType, fee: number): Promise<void> {
  await updateRows('orders', {
    delivery_fee: fee,
    delivery_type: deliveryType,
    grand_total: order.goods_total + fee,
    updated_at: new Date().toISOString(),
  }, { id: `eq.${order.id}`, tenant_id: `eq.${order.tenant_id}` });
}

export async function loadOrderPanel(orderId: string, tenantId: string, promptpayId: string | null): Promise<PkmOrderPanel> {
  const order = await selectOne<PendingOrderRow>('orders', { id: `eq.${orderId}`, select: ORDER_SELECT, tenant_id: `eq.${tenantId}` });
  if (!order) {
    return null;
  }
  const items = await selectMany<{ qty: number; unit_price: number; products: { name: string } | null }>('order_items', {
    order_id: `eq.${orderId}`,
    select: 'qty,unit_price,products(name)',
  });
  const roundLabel = order.round_id
    ? await selectOne<{ round_at: string }>('delivery_rounds', { id: `eq.${order.round_id}`, select: 'round_at' }).then((r) => (r ? roundLabelBangkok(new Date(r.round_at)) : null))
    : null;
  // The PromptPay QR is shown once the order is ready to pay (has items + address + a total).
  const readyToPay = order.status === 'pending' && order.grand_total > 0 && Boolean(order.address_text);
  const qrPayload = readyToPay && promptpayId ? buildPromptPayPayload(promptpayId, order.grand_total) : null;

  return {
    delivery_fee: order.delivery_fee,
    delivery_type: order.delivery_type,
    goods_total: order.goods_total,
    grand_total: order.grand_total,
    has_address: Boolean(order.address_text),
    id: order.id,
    items: items.map((i) => ({ name: i.products?.name ?? 'สินค้า', qty: i.qty, unit_price: i.unit_price })),
    order_no: order.order_no,
    payment_status: order.payment_status,
    qr_payload: qrPayload,
    round_label: roundLabel,
    status: order.status,
  };
}
