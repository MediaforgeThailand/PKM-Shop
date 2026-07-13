import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn, signedUrl } from '../../lib/api';

type PendingPayment = {
  id: string;
  order_id: string;
  amount: number;
  slip_photo_url: string | null;
  orders: { order_no: string } | null;
};

export function SlipQueue() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['slip-queue'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<PendingPayment[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('id,order_id,amount,slip_photo_url,orders(order_no)')
        .eq('status', 'pending_verify')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as unknown as PendingPayment[]) ?? [];
    },
  });

  async function view(path: string | null) {
    if (!path) return;
    const url = await signedUrl('payment-slips', path);
    if (url) window.open(url, '_blank');
  }

  async function confirm(orderId: string) {
    await invokeFn('admin-action', { action: 'confirm_payment', order_id: orderId });
    await qc.invalidateQueries({ queryKey: ['slip-queue'] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">คิวตรวจสลิป (SlipOK ไม่ผ่าน / ยังไม่เชื่อม)</h1>
      {isLoading && <p className="text-slate-400">กำลังโหลด…</p>}
      {rows.length === 0 && !isLoading && <p className="text-sm text-slate-400">ไม่มีสลิปรอตรวจ 🎉</p>}
      {rows.map((p) => (
        <div key={p.id} className="card flex items-center justify-between">
          <div>
            <div className="font-mono text-sm font-semibold">{p.orders?.order_no ?? p.order_id}</div>
            <div className="text-xs text-slate-500">฿{p.amount.toLocaleString('th-TH')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost py-1 text-xs" onClick={() => void view(p.slip_photo_url)}>ดูสลิป</button>
            <button className="btn-primary py-1 text-xs" onClick={() => void confirm(p.order_id)}>ยืนยันชำระ</button>
          </div>
        </div>
      ))}
    </div>
  );
}
