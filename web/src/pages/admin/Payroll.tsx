import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn, uploadToBucket } from '../../lib/api';
import { useAuth } from '../../lib/auth';

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
  const tenantId = profile?.tenant_id ?? '';

  const { data: period } = useQuery({
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

  async function confirm(payout: Payout) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
      await uploadToBucket('payout-slips', path, file);
      await invokeFn('admin-action', { action: 'confirm_payout', payout_id: payout.id, slip_path: path });
      await qc.invalidateQueries({ queryKey: ['payouts'] });
    };
    input.click();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">เงินเดือน/ค่ารอบ</h1>
      {period ? (
        <p className="text-sm text-slate-500">รอบ {period.period_start} → {period.period_end} · {period.status === 'closed' ? 'ปิดรอบแล้ว' : 'กำลังสะสม'}</p>
      ) : (
        <p className="text-sm text-slate-400">ยังไม่มีรอบ payroll</p>
      )}
      {payouts.map((p) => (
        <div key={p.id} className="card flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{p.profiles?.name ?? p.profile_id}</div>
            <div className="text-xs text-slate-500">฿{p.total.toLocaleString('th-TH')}</div>
          </div>
          {p.paid_at ? (
            <span className="badge bg-green-100 text-green-700">โอนแล้ว</span>
          ) : (
            <button className="btn-primary py-1 text-xs" onClick={() => void confirm(p)}>ยืนยันโอน + แนบสลิป</button>
          )}
        </div>
      ))}
    </div>
  );
}
