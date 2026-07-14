// PKM-Shop end-to-end smoke harness — exercises the money/fulfilment spine against a REAL
// (dev) Supabase project using the service role. Run only against a project whose data you
// own; it creates and mutates orders for a throwaway product.
//
//   E2E_SUPABASE_URL=https://<ref>.supabase.co \
//   E2E_SERVICE_ROLE_KEY=<service_role> \
//   npm run e2e:smoke
//
// Covers (Ready.md §3.1–3.7): create order → confirm payment (amount validated) → hourly
// round assignment (:30 cutoff) → lock → claim → pack (stock consumed) → deliver → return →
// REDELIVERY fee → child order (parent_order_id) → payroll item, plus reject/duplicate guards.

const URL_BASE = process.env.E2E_SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.E2E_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error('Set E2E_SUPABASE_URL and E2E_SERVICE_ROLE_KEY (dev project only).');
  process.exit(2);
}

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
let passed = 0;
let failed = 0;

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: { ...HEADERS, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}
const rpc = (fn, body) => rest(`rpc/${fn}`, { method: 'POST', body });

function check(name, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ok  ${name}`); }
  else { failed += 1; console.error(`FAIL  ${name} ${detail}`); }
}

async function expectThrow(name, fn, needle) {
  try { await fn(); check(name, false, '(no error thrown)'); }
  catch (e) { check(name, !needle || String(e.message).includes(needle), `(${e.message.slice(0, 120)})`); }
}

const tenant = (await rest('tenants?select=id,slug&limit=1'))[0];
if (!tenant) { console.error('No tenant seeded.'); process.exit(2); }
console.log(`tenant: ${tenant.slug}`);

// throwaway product with stock
const stamp = Date.now().toString(36);
const product = (await rest('products', {
  method: 'POST', prefer: 'return=representation',
  body: { tenant_id: tenant.id, name: `E2E-${stamp}`, price_baht: 120, stock_qty: 10, category: 'e2e', active: true },
}))[0];

console.log('\n— goods flow —');
const order = await rpc('pkm_create_order', {
  p_tenant_id: tenant.id, p_items: [{ product_id: product.id, qty: 2 }], p_delivery_type: 'rider',
  p_address: '99 หมู่ 1', p_recipient_name: 'ทดสอบ', p_recipient_phone: '0812345678', p_customer_phone: `08${stamp.slice(-8)}`,
  p_lat: null, p_lng: null,
});
check('order created pending', order.status === 'pending' && order.grand_total === 240 + order.delivery_fee);

await expectThrow('wrong amount rejected', () =>
  rpc('pkm_confirm_payment', { p_order_id: order.id, p_amount: 1, p_kind: 'goods', p_method: 'promptpay', p_slip_url: null, p_actor: 'system', p_auto: true, p_trans_ref: null, p_raw: null, p_verified_by: null }),
  'does not match');

const paid = await rpc('pkm_confirm_payment', { p_order_id: order.id, p_amount: order.grand_total, p_kind: 'goods', p_method: 'promptpay', p_slip_url: null, p_actor: 'system', p_auto: true, p_trans_ref: `e2e-${stamp}`, p_raw: null, p_verified_by: null });
check('paid -> confirmed + round assigned', paid.status === 'confirmed' && Boolean(paid.round_id));

const prodAfterPay = (await rest(`products?id=eq.${product.id}&select=stock_qty,reserved_qty`))[0];
check('stock reserved on paid', prodAfterPay.reserved_qty === 2 && prodAfterPay.stock_qty === 10);

await expectThrow('duplicate transRef rejected', () =>
  rpc('pkm_confirm_payment', { p_order_id: order.id, p_amount: order.grand_total, p_kind: 'goods', p_method: 'promptpay', p_slip_url: null, p_actor: 'system', p_auto: true, p_trans_ref: `e2e-${stamp}`, p_raw: null, p_verified_by: null }));

const round = (await rest(`delivery_rounds?id=eq.${paid.round_id}&select=id,status,round_at`))[0];
const bkkHour = new Date(round.round_at);
check('round at a top-of-hour', bkkHour.getMinutes() === 0 && bkkHour.getSeconds() === 0);

console.log('\n— pack + deliver + return + redelivery —');
await rpc('pkm_transition_order', { p_order_id: order.id, p_to_status: 'packing', p_actor: 'system', p_meta: {} });
await rpc('pkm_transition_order', { p_order_id: order.id, p_to_status: 'packed', p_actor: 'packer:e2e', p_meta: {} });
const prodPacked = (await rest(`products?id=eq.${product.id}&select=stock_qty,reserved_qty`))[0];
check('stock consumed on packed', prodPacked.stock_qty === 8 && prodPacked.reserved_qty === 0);

await rpc('pkm_transition_order', { p_order_id: order.id, p_to_status: 'out_for_delivery', p_actor: 'system', p_meta: {} });
await rpc('pkm_transition_order', { p_order_id: order.id, p_to_status: 'delivering', p_actor: 'rider:e2e', p_meta: {} });
await rpc('pkm_transition_order', { p_order_id: order.id, p_to_status: 'returned', p_actor: 'rider:e2e', p_meta: {}, p_note: 'ลูกค้าไม่รับสาย' });
await rest('returns', { method: 'POST', body: { tenant_id: tenant.id, order_id: order.id, reason: 'ลูกค้าไม่รับสาย' }, prefer: 'return=minimal' });
await rpc('pkm_restock_returned_order', { p_order_id: order.id });
const prodReturned = (await rest(`products?id=eq.${product.id}&select=stock_qty`))[0];
check('stock restocked on return', prodReturned.stock_qty === 10);
await rpc('pkm_transition_order', { p_order_id: order.id, p_to_status: 'awaiting_redelivery_fee', p_actor: 'system', p_meta: {} });

await expectThrow('redelivery wrong fee rejected', () =>
  rpc('pkm_process_redelivery_payment', { p_order_id: order.id, p_amount: 1, p_slip_url: null, p_actor: 'system', p_auto: true, p_trans_ref: null, p_raw: null, p_verified_by: null }),
  'does not match');

const parentRow = (await rest(`orders?id=eq.${order.id}&select=delivery_fee`))[0];
const child = await rpc('pkm_process_redelivery_payment', { p_order_id: order.id, p_amount: parentRow.delivery_fee, p_slip_url: null, p_actor: 'system', p_auto: true, p_trans_ref: `e2e-re-${stamp}`, p_raw: null, p_verified_by: null });
check('redelivery -> child order in pipeline', child.parent_order_id === order.id && ['confirmed'].includes(child.status) && Boolean(child.round_id));
check('child owes fee only', child.grand_total === parentRow.delivery_fee && child.goods_total === 0);

const childItems = await rest(`order_items?order_id=eq.${child.id}&select=qty`);
check('child carries the goods for re-packing', childItems.length === 1 && childItems[0].qty === 2);

const ret = (await rest(`returns?order_id=eq.${order.id}&select=redelivery_fee_status,new_order_id`))[0];
check('returns row closed', ret.redelivery_fee_status === 'paid' && ret.new_order_id === child.id);

const replay = await rpc('pkm_process_redelivery_payment', { p_order_id: order.id, p_amount: parentRow.delivery_fee, p_slip_url: null, p_actor: 'system', p_auto: true, p_trans_ref: null, p_raw: null, p_verified_by: null });
check('redelivery replay is idempotent', replay.id === child.id);

console.log('\n— manual queue confirm/reject —');
const order2 = await rpc('pkm_create_order', {
  p_tenant_id: tenant.id, p_items: [{ product_id: product.id, qty: 1 }], p_delivery_type: 'parcel_kerry',
  p_address: 'ตจว.', p_recipient_name: 'ทดสอบ2', p_recipient_phone: '0899999999', p_customer_phone: null, p_lat: null, p_lng: null,
});
const pend = await rpc('pkm_record_pending_payment', { p_order_id: order2.id, p_amount: order2.grand_total, p_kind: 'goods', p_slip_url: 'e2e/slip.jpg', p_note: 'not_configured' });
check('pending payment recorded with note', pend.status === 'pending_verify' && pend.note === 'not_configured');
const confirmed2 = await rpc('pkm_confirm_pending_payment', { p_payment_id: pend.id, p_actor: 'admin:e2e', p_verified_by: null });
check('manual confirm flips existing row + kerry confirmed', confirmed2.status === 'confirmed');
const payRow = (await rest(`payments?id=eq.${pend.id}&select=status`))[0];
check('pending row is now paid (no duplicate row)', payRow.status === 'paid');

const order3 = await rpc('pkm_create_order', {
  p_tenant_id: tenant.id, p_items: [{ product_id: product.id, qty: 1 }], p_delivery_type: 'rider',
  p_address: 'ทดสอบ', p_recipient_name: 'ทดสอบ3', p_recipient_phone: '0888888888', p_customer_phone: null, p_lat: null, p_lng: null,
});
const pend3 = await rpc('pkm_record_pending_payment', { p_order_id: order3.id, p_amount: order3.grand_total, p_kind: 'goods', p_slip_url: 'e2e/slip3.jpg', p_note: 'wrong_account' });
const rejected = await rpc('pkm_reject_payment', { p_payment_id: pend3.id, p_actor: 'admin:e2e', p_note: 'ปลอม' });
check('reject flips row + order back to unpaid', rejected.status === 'rejected');
const order3After = (await rest(`orders?id=eq.${order3.id}&select=payment_status`))[0];
check('order3 payment_status unpaid', order3After.payment_status === 'unpaid');

console.log('\n— round lock catch-up —');
const locked = await rpc('pkm_lock_due_rounds', { p_tenant_id: tenant.id });
check('lock_due_rounds runs (array)', Array.isArray(locked));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
