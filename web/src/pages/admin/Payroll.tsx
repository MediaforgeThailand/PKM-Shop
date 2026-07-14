import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn, signedUrl, uploadToBucket } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { EmptyState, ErrorState, Field, Modal, PageHeader, PhotoPicker, Spinner, baht, useUI } from '../../lib/ui';

// Page-local shapes (Ready.md §3.7: per-person payout + "ยืนยันโอนแล้ว + แนบสลิป").
type Period = { id: string; period_start: string; period_end: string; status: string };
type PayoutRow = {
  id: string;
  profile_id: string;
  total: number;
  slip_photo_url: string | null;
  paid_at: string | null;
  profiles: { name: string } | null;
};
type ItemRow = { profile_id: string; amount: number; profiles: { name: string } | null };

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}
function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

// Confirm-transfer modal: slip photo is REQUIRED before the server marks the payout paid.
function ConfirmPayoutModal({ payout, onClose, onDone }: { payout: PayoutRow; onClose: () => void; onDone: () => Promise<void> }) {
  const { toast } = useUI();
  const { profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) return toast('กรุณาแนบรูปสลิปการโอน', 'error');
    if (!profile) return toast('ไม่พบโปรไฟล์ผู้ใช้ กรุณาเข้าสู่ระบบใหม่', 'error');
    setBusy(true);
    try {
      const path = `${profile.tenant_id}/${crypto.randomUUID()}.jpg`;
      await uploadToBucket('payout-slips', path, file);
      await invokeFn('admin-action', { action: 'confirm_payout', payout_id: payout.id, slip_path: path });
      toast('บันทึกการโอนแล้ว ระบบแจ้งพนักงานให้เรียบร้อย', 'success');
      await onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
      setBusy(false);
    }
  }

  return (
    <Modal open title={`ยืนยันโอนให้ ${payout.profiles?.name ?? 'พนักงาน'}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">ยอดที่ต้องโอน</span>
            <span className="font-bold">{baht(payout.total)}</span>
          </div>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">สลิปการโอน</span>
          <PhotoPicker file={file} onPick={setFile} label="แนบสลิปการโอน" required />
          <span className="mt-1 block text-xs text-slate-400">ถ่ายหรือเลือกรูปสลิปที่โอนให้พนักงานคนนี้</span>
        </div>
        <button className="btn-primary w-full" disabled={busy || !file} onClick={() => void submit()}>
          {busy ? 'กำลังบันทึก…' : 'ยืนยันโอนแล้ว'}
        </button>
      </div>
    </Modal>
  );
}

// View the transfer slip of a paid payout (signed URL, private bucket).
function PayoutSlipModal({ payout, onClose }: { payout: PayoutRow; onClose: () => void }) {
  const { data: url, isLoading, isError, refetch } = useQuery({
    queryKey: ['payout-slip-url', payout.id],
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<string> => {
      if (!payout.slip_photo_url) throw new Error('รายการนี้ไม่มีสลิปแนบ');
      const u = await signedUrl('payout-slips', payout.slip_photo_url);
      if (!u) throw new Error('สร้างลิงก์รูปสลิปไม่สำเร็จ');
      return u;
    },
  });

  return (
    <Modal open title={`สลิปโอนให้ ${payout.profiles?.name ?? 'พนักงาน'}`} onClose={onClose}>
      {isLoading ? (
        <Spinner label="กำลังโหลดสลิป…" />
      ) : isError || !url ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <img src={url} alt="สลิปการโอนค่าจ้าง" className="w-full rounded-lg object-contain" />
      )}
      {payout.paid_at && <div className="mt-2 text-center text-xs text-slate-400">โอนเมื่อ {fmtDateTime(payout.paid_at)}</div>}
    </Modal>
  );
}

export function Payroll() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayoutRow | null>(null);
  const [viewSlip, setViewSlip] = useState<PayoutRow | null>(null);

  const { data: periods = [], isLoading: periodsLoading, isError: periodsError, refetch: refetchPeriods } = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: async (): Promise<Period[]> => {
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('id,period_start,period_end,status')
        .order('period_start', { ascending: false })
        .limit(26);
      if (error) throw new Error(error.message);
      return (data as Period[]) ?? [];
    },
  });

  // Default = latest period; the select below lets the admin jump to past periods.
  const period = periods.find((p) => p.id === selectedId) ?? periods[0] ?? null;

  const { data: payouts = [], isLoading: payoutsLoading, isError: payoutsError, refetch: refetchPayouts } = useQuery({
    queryKey: ['payouts', period?.id],
    enabled: Boolean(period?.id),
    queryFn: async (): Promise<PayoutRow[]> => {
      const { data, error } = await supabase
        .from('payroll_payouts')
        .select('id,profile_id,total,slip_photo_url,paid_at,profiles(name)')
        .eq('period_id', period!.id)
        .order('total', { ascending: false });
      if (error) throw new Error(error.message);
      return (data as unknown as PayoutRow[]) ?? [];
    },
  });

  // Items feed the per-person accumulation view for periods not yet cut (no payout rows).
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery({
    queryKey: ['payroll-items', period?.id],
    enabled: Boolean(period?.id),
    queryFn: async (): Promise<ItemRow[]> => {
      const { data, error } = await supabase
        .from('payroll_items')
        .select('profile_id,amount,profiles(name)')
        .eq('period_id', period!.id);
      if (error) throw new Error(error.message);
      return (data as unknown as ItemRow[]) ?? [];
    },
  });

  const perPerson = useMemo(() => {
    const m = new Map<string, { name: string; total: number }>();
    for (const it of items) {
      const cur = m.get(it.profile_id) ?? { name: it.profiles?.name ?? 'พนักงาน', total: 0 };
      cur.total += it.amount;
      m.set(it.profile_id, cur);
    }
    return [...m.entries()]
      .map(([profile_id, v]) => ({ profile_id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const total = payouts.length > 0
    ? payouts.reduce((s, p) => s + p.total, 0)
    : perPerson.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="เงินเดือน / ค่ารอบ" />

      {periodsLoading ? (
        <Spinner />
      ) : periodsError ? (
        <ErrorState onRetry={() => void refetchPeriods()} />
      ) : periods.length === 0 ? (
        <EmptyState icon="💰" title="ยังไม่มีรอบจ่ายเงิน" hint="รอบจะสร้างอัตโนมัติเมื่อมีค่ารอบ/ค่าคอม" />
      ) : (
        <>
          <Field label="เลือกรอบ">
            <select className="input" value={period?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {fmtDate(p.period_start)} – {fmtDate(p.period_end)} {p.status === 'closed' ? '· ปิดรอบแล้ว' : '· กำลังสะสม'}
                </option>
              ))}
            </select>
          </Field>

          {period && (
            <div className="card">
              <div className="text-sm text-slate-500">รอบ {fmtDate(period.period_start)} → {fmtDate(period.period_end)}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className={`badge ${period.status === 'closed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {period.status === 'closed' ? 'ปิดรอบแล้ว' : 'กำลังสะสม'}
                </span>
                <span className="text-sm font-semibold">รวม {baht(total)}</span>
              </div>
            </div>
          )}

          {payoutsLoading || itemsLoading ? (
            <Spinner />
          ) : payoutsError ? (
            <ErrorState onRetry={() => void refetchPayouts()} />
          ) : itemsError ? (
            <ErrorState onRetry={() => void refetchItems()} />
          ) : payouts.length > 0 ? (
            payouts.map((p) => (
              <div key={p.id} className="card">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.profiles?.name ?? 'พนักงาน'}</div>
                    <div className="text-xs text-slate-500">{baht(p.total)}</div>
                  </div>
                  {p.paid_at ? (
                    <div className="shrink-0 text-right">
                      <span className="badge bg-green-100 text-green-700">✅ โอนแล้ว</span>
                      <div className="mt-0.5 text-xs text-slate-400">{fmtDateTime(p.paid_at)}</div>
                    </div>
                  ) : (
                    <button className="btn-primary btn-sm shrink-0" onClick={() => setPaying(p)}>ยืนยันโอน + แนบสลิป</button>
                  )}
                </div>
                {p.paid_at && p.slip_photo_url && (
                  <button className="btn-ghost btn-sm mt-2 w-full" onClick={() => setViewSlip(p)}>ดูสลิปการโอน</button>
                )}
              </div>
            ))
          ) : perPerson.length > 0 ? (
            <>
              <h2 className="text-sm font-semibold text-slate-500">ยอดสะสมต่อคน (ยังไม่ตัดรอบ)</h2>
              {perPerson.map((p) => (
                <div key={p.profile_id} className="card flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="shrink-0 text-sm font-semibold">{baht(p.total)}</div>
                </div>
              ))}
            </>
          ) : (
            <EmptyState icon="🧾" title="ยังไม่มีรายการในรอบนี้" hint="ค่ารอบ/ค่าคอมจะปรากฏเมื่อมีงานเสร็จในรอบนี้" />
          )}
        </>
      )}

      {paying && (
        <ConfirmPayoutModal
          payout={paying}
          onClose={() => setPaying(null)}
          onDone={async () => {
            setPaying(null);
            await refetchPayouts();
          }}
        />
      )}

      {viewSlip && <PayoutSlipModal payout={viewSlip} onClose={() => setViewSlip(null)} />}
    </div>
  );
}
