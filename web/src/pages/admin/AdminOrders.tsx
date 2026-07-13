import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn } from '../../lib/api';
import { ORDER_STATUS_TH, type Order } from '../../lib/types';

const ACTIVE = ['pending', 'paid', 'confirmed', 'packing', 'packed', 'out_for_delivery', 'delivering'];

function statusColor(s: string): string {
  if (s === 'delivered') return 'bg-green-100 text-green-700';
  if (s === 'cancelled' || s === 'returned') return 'bg-red-100 text-red-700';
  if (s === 'pending') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export function AdminOrders() {
  const qc = useQueryClient();
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

  async function cancel(id: string) {
    const reason = prompt('เหตุผลการยกเลิก?') ?? undefined;
    await invokeFn('admin-action', { action: 'cancel_order', order_id: id, reason });
    await qc.invalidateQueries({ queryKey: ['orders'] });
  }

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const done = orders.filter((o) => !ACTIVE.includes(o.status));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">กระดานออเดอร์</h1>
      {isLoading && <p className="text-slate-400">กำลังโหลด…</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">กำลังดำเนินการ ({active.length})</h2>
        {active.map((o) => (
          <div key={o.id} className="card flex items-center justify-between">
            <div>
              <div className="font-mono text-sm font-semibold">{o.order_no}</div>
              <div className="text-xs text-slate-500">
                {o.recipient_name || 'ลูกค้า'} · {o.address_text || 'ยังไม่มีที่อยู่'} · ฿{o.grand_total.toLocaleString('th-TH')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${statusColor(o.status)}`}>{ORDER_STATUS_TH[o.status]}</span>
              {['pending', 'paid', 'confirmed'].includes(o.status) && (
                <button className="btn-ghost py-1 text-xs" onClick={() => void cancel(o.id)}>ยกเลิก</button>
              )}
            </div>
          </div>
        ))}
        {active.length === 0 && !isLoading && <p className="text-sm text-slate-400">ไม่มีออเดอร์ที่กำลังดำเนินการ</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">เสร็จสิ้น/ยกเลิก ({done.length})</h2>
        {done.slice(0, 20).map((o) => (
          <div key={o.id} className="flex items-center justify-between px-1 py-1 text-sm">
            <span className="font-mono">{o.order_no}</span>
            <span className={`badge ${statusColor(o.status)}`}>{ORDER_STATUS_TH[o.status]}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
