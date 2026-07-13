import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn, uploadToBucket } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { EmptyState, PageHeader, Spinner, useUI } from '../../lib/ui';

type Payout = {
  id: string;
  profile_id: string;
  total: number;
  paid_at: string | null;
  profiles: { name: string } | null;
};
type Period = { id: string; period_start: string; period_end: string; status: string };

export function Payroll() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useUI();
  const tenantId = profile?.tenant_id ?? '';

  const { data: period, isLoading } = useQuery({
    queryKey: ['payroll-period'],
    queryFn: async (): Promise<Period | null> => {
      const { data } = await supabase.from('payroll_periods').select('id,period_start,period_end,status').order('period_start', { ascending: false }).limit(1).maybeSingle();
      return (data as Period) ?? null;
    },
  });
  const { data: payouts = [] } = useQuery({
    queryKey: ['payouts', period?.id],
    enabled: Boolean(period?.id),
    queryFn: async (): Promise<Payout[]> => {
      const { data } = await supabase.from('payroll_payouts').select('id,profile_id,total,paid_at,profiles(name)').eq('period_id', period!.id);
      return (data as unknown as Payout[]) ?? [];
    },
  });

  function confirmPayout(payout: Payout) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
        await uploadToBucket('payout-slips', path, file);
        await invokeFn('admin-action', { action: 'confirm_payout', payout_id: payout.id, slip_path: path });
        await qc.invalidateQueries({ queryKey: ['payouts'] });
        toast('บันทึกการโอนแล้ว', 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
      }
    };
    input.click();
  }

  const total = payouts.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="เงินเดือน / ค่ารอบ" />
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          {period ? (
            <div className="card">
              <div className="text-sm text-slate-500">รอบ {period.period_start} → {period.period_end}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className={`badge ${period.status === 'closed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{period.status === 'closed' ? 'ปิดรอบแล้ว' : 'กำลังสะสม'}</span>
                <span className="text-sm font-semibold">รวม ฿{total.toLocaleString('th-TH')}</span>
              </div>
            </div>
          ) : (
            <EmptyState icon="💰" title="ยังไม่มีรอบจ่ายเงิน" hint="รอบจะสร้างอัตโนมัติเมื่อมีค่ารอบ/ค่าคอม" />
          )}

          {payouts.map((p) => (
            <div key={p.id} className="card flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{p.profiles?.name ?? 'พนักงาน'}</div>
                <div className="text-xs text-slate-500">฿{p.total.toLocaleString('th-TH')}</div>
              </div>
              {p.paid_at ? (
                <span className="badge bg-green-100 text-green-700">โอนแล้ว</span>
              ) : (
                <button className="btn-primary btn-sm" onClick={() => confirmPayout(p)}>ยืนยันโอน + สลิป</button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
