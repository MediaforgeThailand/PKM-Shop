import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn } from '../../lib/api';
import { EmptyState, Field, Modal, PageHeader, Spinner, useUI } from '../../lib/ui';
import { ORDER_STATUS_TH, type DeliveryType, type Order, type Product } from '../../lib/types';

const ACTIVE = ['pending', 'paid', 'confirmed', 'packing', 'packed', 'out_for_delivery', 'delivering'];
const DELIVERY_TH: Record<string, string> = { rider: 'ไรเดอร์ร้าน', express_grab: 'ด่วน (Grab)', lalamove: 'Lalamove', parcel_kerry: 'Kerry' };

function statusColor(s: string): string {
  if (s === 'delivered') return 'bg-green-100 text-green-700';
  if (s === 'cancelled' || s === 'returned') return 'bg-red-100 text-red-700';
  if (s === 'pending') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export function AdminOrders() {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<Order | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,order_no,status,payment_status,delivery_type,goods_total,delivery_fee,grand_total,recipient_name,recipient_phone,address_text,round_id,stop_sequence,external_ref,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data as Order[]) ?? [];
    },
  });

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const done = orders.filter((o) => !ACTIVE.includes(o.status));

  return (
    <div className="space-y-4">
      <PageHeader title="กระดานออเดอร์" action={<button className="btn-primary btn-sm" onClick={() => setManualOpen(true)}>+ ออเดอร์ใหม่</button>} />
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500">กำลังดำเนินการ ({active.length})</h2>
            {active.length === 0 && <EmptyState icon="✅" title="ไม่มีออเดอร์ค้าง" />}
            {active.map((o) => (
              <button key={o.id} className="card flex w-full items-center justify-between gap-2 text-left" onClick={() => setDetail(o)}>
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold">{o.order_no}</div>
                  <div className="truncate text-xs text-slate-500">
                    {o.recipient_name || 'ลูกค้า'} · {o.address_text || 'ยังไม่มีที่อยู่'} · ฿{o.grand_total.toLocaleString('th-TH')}
                  </div>
                </div>
                <span className={`badge shrink-0 ${statusColor(o.status)}`}>{ORDER_STATUS_TH[o.status]}</span>
              </button>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500">เสร็จสิ้น/ยกเลิก ({done.length})</h2>
            {done.slice(0, 30).map((o) => (
              <button key={o.id} className="flex w-full items-center justify-between px-1 py-1.5 text-sm" onClick={() => setDetail(o)}>
                <span className="font-mono">{o.order_no}</span>
                <span className={`badge ${statusColor(o.status)}`}>{ORDER_STATUS_TH[o.status]}</span>
              </button>
            ))}
          </section>
        </>
      )}

      {detail && <OrderDetail order={detail} onClose={() => setDetail(null)} deliveryLabel={DELIVERY_TH[detail.delivery_type] ?? detail.delivery_type} />}
      {manualOpen && <ManualOrderModal onClose={() => setManualOpen(false)} onDone={async () => { setManualOpen(false); await qc.invalidateQueries({ queryKey: ['orders'] }); }} />}
    </div>
  );
}

function ManualOrderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('rider');
  const [markPaid, setMarkPaid] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-order'],
    queryFn: async (): Promise<Product[]> => {
      const { data } = await supabase.from('products').select('id,catalog_key,name,description,price_baht,category_id,category,image_url,stock_qty,reserved_qty,active').eq('active', true).order('name');
      return (data as Product[]) ?? [];
    },
  });

  const goods = useMemo(() => products.reduce((s, p) => s + (cart[p.id] ?? 0) * p.price_baht, 0), [cart, products]);
  const count = Object.values(cart).reduce((s, n) => s + n, 0);

  function setQty(id: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[id]; else copy[id] = next;
      return copy;
    });
  }

  async function submit() {
    const items = Object.entries(cart).map(([product_id, qty]) => ({ product_id, qty }));
    if (items.length === 0) return toast('เลือกสินค้าอย่างน้อย 1 อย่าง', 'error');
    setBusy(true);
    try {
      await invokeFn('admin-action', {
        action: 'create_manual_order', items, delivery_type: deliveryType,
        address: address.trim() || undefined, recipient_name: recipientName.trim() || undefined,
        recipient_phone: recipientPhone.trim() || undefined, customer_phone: recipientPhone.trim() || undefined,
        mark_paid: markPaid,
      });
      toast('สร้างออเดอร์แล้ว', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'สร้างไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  const DTYPES: { key: DeliveryType; label: string }[] = [
    { key: 'rider', label: 'ไรเดอร์ร้าน' }, { key: 'express_grab', label: 'ด่วน (Grab)' }, { key: 'parcel_kerry', label: 'Kerry' },
  ];

  return (
    <Modal open title="สร้างออเดอร์ (หน้าร้าน/โทรสั่ง)" onClose={onClose}>
      <div className="space-y-3">
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {products.length === 0 && <p className="p-2 text-sm text-slate-400">ยังไม่มีสินค้า</p>}
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <div className="min-w-0">
                <div className="truncate text-sm">{p.name}</div>
                <div className="text-xs text-slate-400">฿{p.price_baht.toLocaleString('th-TH')}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="h-8 w-8 rounded-full border border-slate-300 text-lg leading-none" onClick={() => setQty(p.id, -1)}>−</button>
                <span className="w-6 text-center text-sm tabular-nums">{cart[p.id] ?? 0}</span>
                <button className="h-8 w-8 rounded-full border border-slate-300 text-lg leading-none" onClick={() => setQty(p.id, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>

        <Field label="ชื่อผู้รับ"><input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="ชื่อลูกค้า" /></Field>
        <Field label="เบอร์โทร"><input className="input" inputMode="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="08xxxxxxxx" /></Field>
        <Field label="ที่อยู่จัดส่ง"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="บ้านเลขที่ / จุดสังเกต" /></Field>
        <Field label="วิธีจัดส่ง">
          <div className="flex flex-wrap gap-2">
            {DTYPES.map((d) => (
              <button key={d.key} type="button" onClick={() => setDeliveryType(d.key)}
                className={`btn-sm rounded-full border px-3 ${deliveryType === d.key ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>{d.label}</button>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
          รับเงินแล้ว (เข้าคิวจัดของทันที)
        </label>

        <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
          <span className="text-slate-500">{count} ชิ้น · ค่าสินค้า</span>
          <span className="font-semibold">฿{goods.toLocaleString('th-TH')}</span>
        </div>
        <button className="btn-primary w-full" disabled={busy} onClick={() => void submit()}>{busy ? 'กำลังสร้าง…' : 'สร้างออเดอร์'}</button>
      </div>
    </Modal>
  );
}

type OrderItem = { qty: number; unit_price: number; products: { name: string } | null };

function OrderDetail({ order, onClose, deliveryLabel }: { order: Order; onClose: () => void; deliveryLabel: string }) {
  const qc = useQueryClient();
  const { confirm, toast } = useUI();
  const canCancel = ['pending', 'paid', 'confirmed'].includes(order.status);

  const { data: items = [] } = useQuery({
    queryKey: ['order-items', order.id],
    queryFn: async (): Promise<OrderItem[]> => {
      const { data } = await supabase.from('order_items').select('qty,unit_price,products(name)').eq('order_id', order.id);
      return (data as unknown as OrderItem[]) ?? [];
    },
  });

  async function cancel() {
    const ok = await confirm({ title: 'ยกเลิกออเดอร์นี้?', message: `${order.order_no} จะถูกยกเลิกและคืนสต็อก`, confirmText: 'ยกเลิกออเดอร์', danger: true });
    if (!ok) return;
    try {
      await invokeFn('admin-action', { action: 'cancel_order', order_id: order.id });
      await qc.invalidateQueries({ queryKey: ['orders'] });
      toast('ยกเลิกออเดอร์แล้ว', 'success');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ', 'error');
    }
  }

  return (
    <Modal open title={order.order_no} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className={`badge ${statusColor(order.status)}`}>{ORDER_STATUS_TH[order.status]}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">{deliveryLabel}</span>
        </div>

        <div>
          <div className="font-medium text-slate-700">{order.recipient_name || 'ลูกค้า'}</div>
          {order.recipient_phone && <a className="text-brand" href={`tel:${order.recipient_phone}`}>📞 {order.recipient_phone}</a>}
          <div className="text-slate-600">{order.address_text || 'ยังไม่มีที่อยู่'}</div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          {items.length === 0 ? (
            <div className="text-xs text-slate-400">ไม่มีรายการสินค้า</div>
          ) : (
            items.map((it, i) => (
              <div key={i} className="flex justify-between py-0.5">
                <span>{it.products?.name ?? 'สินค้า'} × {it.qty}</span>
                <span className="tabular-nums">฿{(it.qty * it.unit_price).toLocaleString('th-TH')}</span>
              </div>
            ))
          )}
          <div className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
            <div className="flex justify-between"><span>ค่าสินค้า</span><span className="tabular-nums">฿{order.goods_total.toLocaleString('th-TH')}</span></div>
            <div className="flex justify-between"><span>ค่าส่ง</span><span className="tabular-nums">฿{order.delivery_fee.toLocaleString('th-TH')}</span></div>
            <div className="flex justify-between font-semibold text-slate-800"><span>รวม</span><span className="tabular-nums">฿{order.grand_total.toLocaleString('th-TH')}</span></div>
          </div>
        </div>

        {order.external_ref && <div className="text-xs text-slate-500">Tracking: {order.external_ref}</div>}

        {canCancel && <button className="btn w-full bg-red-600 text-white hover:bg-red-700" onClick={() => void cancel()}>ยกเลิกออเดอร์</button>}
      </div>
    </Modal>
  );
}
