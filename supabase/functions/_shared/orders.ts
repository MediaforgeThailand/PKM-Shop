import { rpc, selectMany, selectOne, updateRows } from './db.ts';
import { HttpError } from './http.ts';
import { buildPromptPayPayload } from './promptpay.ts';
import { formatBangkokDateTime } from './templates.ts';
import type {
  ChatChannel,
  OrderPanelBranch,
  OrderPanelState,
  OrderRow,
  OrderStatus,
  OrderWithProductRow,
  ReferrerRow,
  TenantRow,
} from './types.ts';

export type Actor = 'ai' | 'customer' | `admin:${string}` | `referrer:${string}` | 'system';

export const orderStatuses: OrderStatus[] = [
  'selecting_branch',
  'collecting_info',
  'awaiting_payment',
  'submitted',
  'confirmed',
  'booked',
  'done',
  'cancelled',
];

export const ORDER_WITH_PRODUCT_SELECT =
  'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,branch_id,buyer_age,admin_note,created_at,updated_at,products(name,catalog_key,category,price_baht),branches(id,name,address,district)';

function hasBuyerInfo(order: Pick<OrderRow, 'buyer_age' | 'buyer_name' | 'buyer_phone'>) {
  return Boolean(order.buyer_name?.trim() && order.buyer_phone?.trim() && order.buyer_age);
}

function adminOnly(actor: string) {
  return actor.startsWith('admin:');
}

export function canTransition(order: Pick<OrderRow, 'booking_at' | 'buyer_age' | 'buyer_name' | 'buyer_phone' | 'status'>, to: OrderStatus, actor: string) {
  const from = order.status;

  if (from === to) {
    return true;
  }

  if (from === 'selecting_branch') {
    return actor === 'customer' && (to === 'collecting_info' || to === 'cancelled');
  }

  if (from === 'collecting_info') {
    return to === 'cancelled' || (to === 'awaiting_payment' && hasBuyerInfo(order));
  }

  if (from === 'awaiting_payment') {
    return to === 'submitted' || to === 'cancelled';
  }

  if (from === 'submitted') {
    return (to === 'confirmed' || to === 'cancelled') && adminOnly(actor);
  }

  if (from === 'confirmed') {
    return (to === 'cancelled' && adminOnly(actor)) || (to === 'booked' && adminOnly(actor) && Boolean(order.booking_at));
  }

  if (from === 'booked') {
    return (to === 'done' || to === 'cancelled') && adminOnly(actor);
  }

  return false;
}

export function commissionSchemeForConfirmedOrder(
  order: Pick<OrderRow, 'commission_scheme_snapshot'>,
  referrer: Pick<ReferrerRow, 'commission_scheme'> | null,
) {
  return order.commission_scheme_snapshot ?? referrer?.commission_scheme ?? null;
}

export class IllegalTransition extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Illegal order transition from ${from} to ${to}.`);
  }
}

export async function transition(orderId: string, to: OrderStatus, actor: Actor, meta: Record<string, unknown> = {}) {
  return rpc<OrderRow>('transition_order', {
    p_actor: actor,
    p_meta: meta,
    p_order_id: orderId,
    p_to_status: to,
  });
}

function productFromJoin(order: OrderWithProductRow) {
  if (Array.isArray(order.products)) {
    return order.products[0] ?? null;
  }

  return order.products ?? null;
}

function branchFromJoin(order: OrderWithProductRow) {
  if (Array.isArray(order.branches)) {
    return order.branches[0] ?? null;
  }

  return order.branches ?? null;
}

export function missingOrderFields(order: Pick<OrderRow, 'buyer_age' | 'buyer_name' | 'buyer_phone'>) {
  const missing: string[] = [];

  if (!order.buyer_name?.trim()) {
    missing.push('buyer_name');
  }

  if (!order.buyer_phone?.trim()) {
    missing.push('buyer_phone');
  }

  if (!order.buyer_age) {
    missing.push('buyer_age');
  }

  return missing;
}

export function assertOrderBelongsToSession(
  order: Pick<OrderRow, 'customer_id' | 'session_id'> | null,
  scope: {
    customerId: string;
    sessionId: string;
  },
) {
  if (!order || order.customer_id !== scope.customerId || order.session_id !== scope.sessionId) {
    throw new HttpError('VALIDATION', 'Order not found for this session.', 404);
  }
}

export function paymentSlipExtension(contentType: string) {
  if (contentType === 'image/jpeg') {
    return 'jpg';
  }

  if (contentType === 'image/png') {
    return 'png';
  }

  throw new HttpError('VALIDATION', 'Payment slip must be a JPEG or PNG image.', 400);
}

export function paymentSlipStoragePath({
  contentType,
  objectId = crypto.randomUUID(),
  orderId,
  tenantId,
}: {
  contentType: string;
  objectId?: string;
  orderId: string;
  tenantId: string;
}) {
  return `${tenantId}/${orderId}/${objectId}.${paymentSlipExtension(contentType)}`;
}

export function normalizePaymentSlipPath(path: string) {
  return path.replace(/^payment-slips\//, '').replace(/^\/+/, '');
}

export function assertPaymentSlipPathForOrder({
  orderId,
  slipPath,
  tenantId,
}: {
  orderId: string;
  slipPath: string;
  tenantId: string;
}) {
  const normalizedPath = normalizePaymentSlipPath(slipPath);
  const expectedPrefix = `${tenantId}/${orderId}/`;

  if (!normalizedPath.startsWith(expectedPrefix) || !/\.(jpg|png)$/i.test(normalizedPath)) {
    throw new HttpError('VALIDATION', 'Payment slip path is not valid for this order.', 400);
  }

  return normalizedPath;
}

function orderStepForStatus(status: OrderStatus): NonNullable<OrderPanelState>['step'] {
  if (status === 'selecting_branch') {
    return 'branch';
  }

  if (status === 'collecting_info') {
    return 'form';
  }

  if (status === 'awaiting_payment') {
    return 'qr';
  }

  if (status === 'cancelled') {
    return 'cancelled';
  }

  return 'tracking';
}

function activeStepLabel(status: OrderStatus) {
  if (status === 'selecting_branch') {
    return 'เลือกสาขา';
  }

  if (status === 'collecting_info') {
    return 'กรอกข้อมูล';
  }

  if (status === 'awaiting_payment') {
    return 'รอชำระเงิน';
  }

  return null;
}

function recentOrderStatusText(order: Pick<OrderRow, 'booking_at' | 'status'>) {
  if (order.status === 'submitted') {
    return 'รอโรงพยาบาลตรวจสอบการชำระเงิน';
  }

  if (order.status === 'confirmed') {
    return 'ชำระแล้ว รอเจ้าหน้าที่โทรนัดวันเวลา';
  }

  if (order.status === 'booked') {
    const when = formatBangkokDateTime(order.booking_at);

    return when ? `ลงคิวแล้ว ${when} น.` : 'ลงคิวแล้ว';
  }

  if (order.status === 'done') {
    return 'ใช้บริการเรียบร้อยแล้ว';
  }

  if (order.status === 'cancelled') {
    return 'ยกเลิกแล้ว';
  }

  return null;
}

export function toOrderPanel(
  order: OrderWithProductRow | null,
  tenant: Pick<TenantRow, 'promptpay_id'>,
  branches: OrderPanelBranch[] = [],
): OrderPanelState {
  if (!order) {
    return null;
  }

  const product = productFromJoin(order);
  const branch = branchFromJoin(order);
  const missingFields = missingOrderFields(order);
  const step = orderStepForStatus(order.status);
  const base = {
    amount_baht: order.amount_baht,
    booking_at: order.booking_at,
    branch_name: branch?.name ?? order.preferred_branch ?? null,
    ...(step === 'branch' && branches.length > 0 ? { branches } : {}),
    id: order.id,
    missing_fields: missingFields,
    product_name: product?.name ?? 'แพ็กเกจ',
    show_form: step === 'form',
    step,
    status: order.status,
  };

  if (step === 'qr' && tenant.promptpay_id) {
    return {
      ...base,
      qr_payload: buildPromptPayPayload(tenant.promptpay_id, order.amount_baht),
    };
  }

  return base;
}

export function formatActiveOrderContext(order: OrderWithProductRow | null, channel: ChatChannel = 'line') {
  if (!order || !['selecting_branch', 'collecting_info', 'awaiting_payment'].includes(order.status)) {
    return null;
  }

  const product = productFromJoin(order);

  if (channel === 'line' && order.status === 'collecting_info') {
    const missing = missingOrderFields(order);

    return `กำลังสั่งซื้อ: ${product?.name ?? 'แพ็กเกจ'} จำนวน ${order.qty} / ข้อมูลที่ยังขาด: ${missing.join(', ') || 'ไม่มี'}`;
  }

  const step = activeStepLabel(order.status);

  return step ? `กำลังสั่งซื้อ: ${product?.name ?? 'แพ็กเกจ'} ขั้นตอนปัจจุบัน: ${step}` : null;
}

export async function formatOrderContextLines(customerId: string, sessionId: string, tenantId: string, channel: ChatChannel = 'app') {
  const activeOrder = await loadActiveOrder(sessionId, tenantId);
  const activeLine = formatActiveOrderContext(activeOrder, channel);
  const recentOrders = await selectMany<OrderWithProductRow>('orders', {
    customer_id: `eq.${customerId}`,
    limit: '2',
    order: 'created_at.desc',
    select: ORDER_WITH_PRODUCT_SELECT,
    status: 'in.(submitted,confirmed,booked,done,cancelled)',
    tenant_id: `eq.${tenantId}`,
  });
  const recentLines = recentOrders
    .map((order) => {
      const product = productFromJoin(order);
      const statusText = recentOrderStatusText(order);

      return statusText ? `คำสั่งซื้อ: ${product?.name ?? 'แพ็กเกจ'} สถานะ: ${statusText}` : null;
    })
    .filter((line): line is string => Boolean(line));
  const lines = [activeLine, ...recentLines].filter((line): line is string => Boolean(line)).slice(0, 3);

  return lines.length > 0 ? lines.join('\n') : null;
}

export async function loadActiveOrder(sessionId: string, tenantId: string) {
  return selectOne<OrderWithProductRow>('orders', {
    order: 'created_at.desc',
    select: ORDER_WITH_PRODUCT_SELECT,
    session_id: `eq.${sessionId}`,
    status: 'in.(selecting_branch,collecting_info,awaiting_payment,submitted,confirmed,booked)',
    tenant_id: `eq.${tenantId}`,
  });
}

export async function loadOrderForPanel(orderId: string, tenantId: string) {
  return selectOne<OrderWithProductRow>('orders', {
    id: `eq.${orderId}`,
    select: ORDER_WITH_PRODUCT_SELECT,
    tenant_id: `eq.${tenantId}`,
  });
}

export async function updateOrderFields(
  orderId: string,
  scope: {
    customerId?: string;
    sessionId?: string;
    tenantId: string;
  },
  fields: Partial<Pick<OrderRow, 'buyer_age' | 'buyer_name' | 'buyer_phone' | 'preferred_date'>>,
) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.buyer_name !== undefined) {
    patch.buyer_name = fields.buyer_name;
  }

  if (fields.buyer_phone !== undefined) {
    patch.buyer_phone = fields.buyer_phone;
  }

  if (fields.buyer_age !== undefined) {
    patch.buyer_age = fields.buyer_age;
  }

  if (fields.preferred_date !== undefined) {
    patch.preferred_date = fields.preferred_date;
  }

  const rows = await updateRows<OrderRow>('orders', patch, {
    ...(scope.customerId ? { customer_id: `eq.${scope.customerId}` } : {}),
    id: `eq.${orderId}`,
    select:
      'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,branch_id,buyer_age,admin_note,created_at,updated_at',
    ...(scope.sessionId ? { session_id: `eq.${scope.sessionId}` } : {}),
    tenant_id: `eq.${scope.tenantId}`,
  });

  const row = rows[0];

  if (!row) {
    throw new HttpError('VALIDATION', 'Order not found.', 404);
  }

  return row;
}
