import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn, signedUrl } from '../../lib/api';
import { EmptyState, PageHeader, Spinner, useUI } from '../../lib/ui';

type PendingPayment = {
  id: string;
  order_id: string;
  amount: number;
  slip_photo_url: string | null;
  orders: { order_no: string } | null;
};

export function SlipQueue() {
  const qc = useQueryClient();
  const { toast, confirm } = useUI();
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
    if (!path) return toast('สลิปนี้ไม่มีรูปแนบ', 'info');
    const url = await signedUrl('payment-slips', path);
    if (url) window.open(url, '_blank');
    else toast('เปิดสลิปไม่สำเร็จ', 'error');
  }

  async function confirmPay(p: PendingPayment) {
    const ok = await confirm({ title: 'ยืนยันว่าได้รับเงินแล้ว?', message: `${p.orders?.order_no ?? ''} · ฿${p.amount.toLocaleString('th-TH')}`, confirmText: 'ยืนยันชำระ' });
    if (!ok) return;
    try {
      await invokeFn('admin-action', { action: 'confirm_payment', order_id: p.order_id });
      await qc.invalidateQueries({ queryKey: ['slip-queue'] });
      toast('ยืนยันชำระแล้ว เข้าสู่รอบจัดส่ง', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="ตรวจสลิป" />
      <p className="text-xs text-slate-400">สลิปที่ระบบตรวจอัตโนมัติไม่ผ่าน หรือยังไม่ได้เชื่อม SlipOK จะมารอตรงนี้</p>
      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon="🎉" title="ไม่มีสลิปรอตรวจ" />
      ) : (
        rows.map((p) => (
          <div key={p.id} className="card flex items-center justify-between">
            <div>
              <div className="font-mono text-sm font-semibold">{p.orders?.order_no ?? p.order_id}</div>
              <div className="text-xs text-slate-500">฿{p.amount.toLocaleString('th-TH')}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-ghost btn-sm" onClick={() => void view(p.slip_photo_url)}>ดูสลิป</button>
              <button className="btn-primary btn-sm" onClick={() => void confirmPay(p)}>ยืนยันชำระ</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
