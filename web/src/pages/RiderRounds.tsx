import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invokeFn, signedUrl, uploadToBucket } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EmptyState, ErrorState, Field, Modal, PageHeader, PhotoPicker, Spinner, StatCard, Tabs, baht, useUI } from '../lib/ui';
import { ORDER_STATUS_TH, type DeliveryRound, type Order, type OrderStatus, type PayrollItem, type PayrollPayout } from '../lib/types';

// ── Time helpers (Asia/Bangkok, UTC+7 fixed — no DST) ──────────────────────

// Round label "HH:00" in Bangkok wall time (rounds are hourly, Ready.md §3.1).
function bkkRoundLabel(iso: string): string {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
    .formatToParts(new Date(iso))
    .find((p) => p.type === 'hour')?.value ?? '--';
  return `${hour}:00`;
}

function bkkDateTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok',
  }).format(new Date(iso));
}

// Start of the current payroll week = Monday 00:00 Bangkok (cutoff Sun 24:00, Ready.md §3.7).
function openWeekStartMs(now = new Date()): number {
  const BKK_OFFSET_MS = 7 * 3_600_000;
  const wall = new Date(now.getTime() + BKK_OFFSET_MS); // read UTC getters as Bangkok wall clock
  const sinceMonday = (wall.getUTCDay() + 6) % 7;
  const startWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - sinceMonday);
  return startWall - BKK_OFFSET_MS;
}

function stopChipClass(status: OrderStatus): string {
  if (status === 'delivered') return 'bg-green-100 text-green-700';
  if (status === 'returned' || status === 'awaiting_redelivery_fee') return 'bg-red-100 text-red-700';
  if (status === 'delivering') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

type RiderTab = 'available' | 'mine' | 'earnings';
type AvailableRound = DeliveryRound & { stop_count: number };

const ORDER_COLS = 'id,order_no,status,payment_status,delivery_type,goods_total,delivery_fee,grand_total,recipient_name,recipient_phone,address_text,round_id,stop_sequence,external_ref,created_at';

export function RiderRounds() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState<RiderTab>('available');
  const profileId = profile?.id ?? '';
  const tenantId = profile?.tenant_id ?? '';

  // Tab 1 — locked rider rounds nobody claimed yet, with their stop counts.
  const { data: available = [], isLoading: availLoading, isError: availError, refetch: refetchAvail } = useQuery({
    queryKey: ['rider-available-rounds'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<AvailableRound[]> => {
      const { data, error } = await supabase
        .from('delivery_rounds')
        .select('id,round_at,type,status,rider_id')
        .eq('status', 'locked')
        .eq('type', 'rider')
        .is('rider_id', null)
        .order('round_at');
      if (error) throw new Error(error.message);
      const rounds = (data as DeliveryRound[]) ?? [];
      if (rounds.length === 0) return [];
      const { data: orderRows, error: countError } = await supabase
        .from('orders')
        .select('id,round_id')
        .in('round_id', rounds.map((r) => r.id));
      if (countError) throw new Error(countError.message);
      const counts = new Map<string, number>();
      for (const row of (orderRows as { id: string; round_id: string | null }[]) ?? []) {
        if (row.round_id) counts.set(row.round_id, (counts.get(row.round_id) ?? 0) + 1);
      }
      return rounds.map((r) => ({ ...r, stop_count: counts.get(r.id) ?? 0 }));
    },
  });

  // Tab 2 — rounds I claimed and haven't finished.
  const { data: myRounds = [], isLoading: mineLoading, isError: mineError, refetch: refetchMine } = useQuery({
    queryKey: ['rider-my-rounds', profileId],
    enabled: Boolean(profileId),
    refetchInterval: 15_000,
    queryFn: async (): Promise<DeliveryRound[]> => {
      const { data, error } = await supabase
        .from('delivery_rounds')
        .select('id,round_at,type,status,rider_id')
        .eq('rider_id', profileId)
        .in('status', ['confirmed', 'in_progress'])
        .order('round_at');
      if (error) throw new Error(error.message);
      return (data as DeliveryRound[]) ?? [];
    },
  });

  async function claimRound(r: AvailableRound) {
    const ok = await confirm({
      title: `รับรอบ ${bkkRoundLabel(r.round_at)} น. ?`,
      message: `รอบนี้มี ${r.stop_count} จุดส่ง — เมื่อกดรับ ลูกค้าทุกคนในรอบจะได้รับแจ้งเตือนทันที`,
      confirmText: 'รับรอบนี้',
    });
    if (!ok) return;
    try {
      await invokeFn('rider-action', { action: 'claim_round', round_id: r.id });
      toast('รับรอบแล้ว เริ่มวิ่งได้เลย', 'success');
      setTab('mine');
      await qc.invalidateQueries();
    } catch (e) {
      // 409 (มีคนรับไปแล้ว) / 403 มาเป็นข้อความไทยจาก edge function
      toast(e instanceof Error ? e.message : 'รับรอบไม่สำเร็จ', 'error');
      await qc.invalidateQueries({ queryKey: ['rider-available-rounds'] });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="งานไรเดอร์" />
      <Tabs<RiderTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'available', label: 'รอบพร้อมรับ', badge: available.length },
          { value: 'mine', label: 'งานของฉัน', badge: myRounds.length },
          { value: 'earnings', label: 'รายได้' },
        ]}
      />

      {tab === 'available' && (
        availError ? (
          <ErrorState onRetry={() => void refetchAvail()} />
        ) : availLoading ? (
          <Spinner />
        ) : available.length === 0 ? (
          <EmptyState icon="🛵" title="ยังไม่มีรอบให้รับตอนนี้" hint="รอบจะปลดล็อกทุกนาทีที่ :30 ก่อนถึงเวลารอบ" />
        ) : (
          <div className="space-y-3">
            {available.map((r) => (
              <div key={r.id} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">รอบ {bkkRoundLabel(r.round_at)} น.</div>
                    <div className="text-sm text-slate-500">{r.stop_count} จุดส่ง</div>
                  </div>
                  <span className="badge bg-amber-100 text-amber-700">พร้อมรับ</span>
                </div>
                <button className="btn-primary min-h-[56px] w-full text-lg" onClick={() => void claimRound(r)}>
                  รับรอบนี้
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'mine' && (
        mineError ? (
          <ErrorState onRetry={() => void refetchMine()} />
        ) : mineLoading ? (
          <Spinner />
        ) : myRounds.length === 0 ? (
          <EmptyState icon="📦" title="ยังไม่มีรอบที่รับไว้" hint="ไปที่แท็บ 'รอบพร้อมรับ' เพื่อกดรับรอบ" />
        ) : (
          <div className="space-y-4">
            {myRounds.map((r) => (
              <MyRoundCard key={r.id} round={r} tenantId={tenantId} />
            ))}
          </div>
        )
      )}

      {tab === 'earnings' && <EarningsTab profileId={profileId} />}
    </div>
  );
}

// ── Tab 2: one claimed round with its ordered stops ────────────────────────

function MyRoundCard({ round, tenantId }: { round: DeliveryRound; tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useUI();
  const [podFor, setPodFor] = useState<Order | null>(null);
  const [returnFor, setReturnFor] = useState<Order | null>(null);

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['rider-round-orders', round.id],
    refetchInterval: 15_000,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLS)
        .eq('round_id', round.id)
        .order('stop_sequence', { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data as Order[]) ?? [];
    },
  });

  const delivering = orders.find((o) => o.status === 'delivering');
  // "เริ่มส่งจุดที่ N" only on the lowest not-yet-started stop, one stop at a time (Ready.md §3.2).
  const nextStop = delivering ? undefined : orders.find((o) => o.status === 'out_for_delivery');
  const remaining = orders.filter((o) => ['out_for_delivery', 'delivering'].includes(o.status)).length;

  async function afterStopAction(message: string) {
    setPodFor(null);
    setReturnFor(null);
    toast(message, 'success');
    await qc.invalidateQueries({ queryKey: ['rider-round-orders', round.id] });
    await qc.invalidateQueries({ queryKey: ['rider-my-rounds'] });
    await qc.invalidateQueries({ queryKey: ['rider-earnings'] });
  }

  async function startStop(o: Order) {
    try {
      await invokeFn('rider-action', { action: 'start_stop', order_id: o.id });
      toast(`เริ่มส่งจุดที่ ${o.stop_sequence ?? '-'} แล้ว — ลูกค้าได้รับแจ้งเตือน`, 'info');
      await qc.invalidateQueries({ queryKey: ['rider-round-orders', round.id] });
      await qc.invalidateQueries({ queryKey: ['rider-my-rounds'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', 'error');
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">รอบ {bkkRoundLabel(round.round_at)} น.</span>
        <span className={`badge ${round.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
          {round.status === 'in_progress' ? `กำลังวิ่ง · เหลือ ${remaining} จุด` : 'รับแล้ว รอเริ่ม'}
        </span>
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState icon="📭" title="ไม่มีออเดอร์ในรอบนี้" />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const done = ['delivered', 'returned', 'awaiting_redelivery_fee', 'cancelled'].includes(o.status);
            return (
              <div key={o.id} className={`rounded-xl border p-3 ${done ? 'border-slate-100 bg-slate-50 opacity-70' : o.status === 'delivering' ? 'border-brand/40 bg-brand/5' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">
                      {o.stop_sequence ?? '-'}
                    </span>
                    <div>
                      <div className="font-mono text-sm font-semibold">{o.order_no}</div>
                      <div className="text-base font-semibold">{o.recipient_name || 'ลูกค้า'}</div>
                    </div>
                  </div>
                  <span className={`badge ${stopChipClass(o.status)}`}>{ORDER_STATUS_TH[o.status]}</span>
                </div>
                <div className="mt-2 text-sm text-slate-700">{o.address_text || 'ไม่มีที่อยู่'}</div>
                {o.recipient_phone && (
                  <a href={`tel:${o.recipient_phone}`} className="btn-ghost mt-2 w-full">📞 โทร {o.recipient_phone}</a>
                )}
                <div className="mt-2 flex flex-col gap-2">
                  {nextStop?.id === o.id && (
                    <button className="btn-primary min-h-[52px] w-full text-base" onClick={() => void startStop(o)}>
                      เริ่มส่งจุดที่ {o.stop_sequence ?? '-'}
                    </button>
                  )}
                  {o.status === 'delivering' && (
                    <>
                      <button className="btn-primary min-h-[52px] w-full text-base" onClick={() => setPodFor(o)}>
                        📷 ส่งสำเร็จ (ถ่ายรูป POD)
                      </button>
                      <button className="btn-ghost w-full text-red-600" onClick={() => setReturnFor(o)}>
                        ตีกลับ
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {podFor && (
        <PodModal
          order={podFor}
          tenantId={tenantId}
          onClose={() => setPodFor(null)}
          onDone={() => void afterStopAction(`ส่งสำเร็จ จุดที่ ${podFor.stop_sequence ?? '-'} 🎉`)}
        />
      )}
      {returnFor && (
        <ReturnModal
          order={returnFor}
          onClose={() => setReturnFor(null)}
          onDone={() => void afterStopAction('บันทึกตีกลับแล้ว ระบบแจ้งลูกค้าให้ชำระค่าส่งใหม่')}
        />
      )}
    </div>
  );
}

// POD modal — photo is REQUIRED before the stop can be closed (Ready.md §3.2).
function PodModal({ order, tenantId, onClose, onDone }: { order: Order; tenantId: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!file || saving) return;
    setSaving(true);
    try {
      const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
      await uploadToBucket('pod', path, file);
      await invokeFn('rider-action', { action: 'pod', order_id: order.id, photo_path: path });
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ยืนยันส่งสำเร็จไม่สำเร็จ', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal open title={`ส่งสำเร็จ · จุดที่ ${order.stop_sequence ?? '-'}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{order.order_no} · {order.recipient_name || 'ลูกค้า'}</p>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">รูปหลักฐานการส่ง (POD)</span>
          <PhotoPicker file={file} onPick={setFile} label="ถ่ายรูปสินค้า ณ จุดส่ง" required />
          <span className="mt-1 block text-xs text-slate-400">บังคับถ่ายรูปก่อนปิดจุด — ลูกค้าจะได้รับรูปนี้พร้อมแจ้งเตือน</span>
        </div>
        <button className="btn-primary min-h-[52px] w-full" disabled={!file || saving} onClick={() => void submit()}>
          {saving ? 'กำลังบันทึก…' : 'ยืนยันส่งสำเร็จ'}
        </button>
      </div>
    </Modal>
  );
}

// Return modal — reason is REQUIRED (Ready.md §3.4: รอ 5 นาที + โทรแล้วไม่รับ จึงตีกลับได้).
function ReturnModal({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const PRESETS = ['โทรแล้วไม่รับสาย + รอครบ 5 นาที', 'ไม่มีคนอยู่รับของ', 'ที่อยู่ผิด/หาไม่เจอ', 'ลูกค้ายกเลิก'];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await invokeFn('rider-action', { action: 'return', order_id: order.id, reason: trimmed });
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'บันทึกตีกลับไม่สำเร็จ', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal open title={`ตีกลับ · จุดที่ ${order.stop_sequence ?? '-'}`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <p className="text-sm text-slate-600">{order.order_no} · {order.recipient_name || 'ลูกค้า'}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p}
              className={`btn-sm rounded-full border px-3 ${reason === p ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-600'}`}
              onClick={() => setReason(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <Field
          label="เหตุผลการตีกลับ (บังคับ)"
          hint="ตีกลับได้เมื่อ: โทรหาลูกค้าแล้วไม่รับสาย และรอที่จุดส่งครบ 5 นาที — ระบบจะแจ้งเหตุผลนี้ให้ลูกค้าพร้อมให้ชำระค่าส่งใหม่"
        >
          <textarea
            className="input min-h-[88px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ระบุเหตุผล เช่น โทร 2 ครั้งไม่รับสาย รอหน้าบ้าน 5 นาที"
            required
          />
        </Field>
        <button type="submit" className="btn min-h-[52px] w-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" disabled={!reason.trim() || saving}>
          {saving ? 'กำลังบันทึก…' : 'ยืนยันตีกลับ'}
        </button>
      </form>
    </Modal>
  );
}

// ── Tab 3: real-time earnings + payout history (Ready.md §3.7) ─────────────

function EarningsTab({ profileId }: { profileId: string }) {
  const { toast } = useUI();
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery({
    queryKey: ['rider-earnings', profileId],
    enabled: Boolean(profileId),
    refetchInterval: 30_000,
    queryFn: async (): Promise<PayrollItem[]> => {
      const { data, error } = await supabase
        .from('payroll_items')
        .select('id,period_id,profile_id,kind,amount,created_at')
        .eq('profile_id', profileId)
        .eq('kind', 'rider_round')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data as PayrollItem[]) ?? [];
    },
  });

  const { data: payouts = [], isLoading: payoutsLoading, isError: payoutsError, refetch: refetchPayouts } = useQuery({
    queryKey: ['rider-payouts', profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<PayrollPayout[]> => {
      const { data, error } = await supabase
        .from('payroll_payouts')
        .select('id,period_id,profile_id,total,slip_photo_url,confirmed_by,paid_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(52);
      if (error) throw new Error(error.message);
      return (data as PayrollPayout[]) ?? [];
    },
  });

  if (itemsError) return <ErrorState onRetry={() => void refetchItems()} />;
  if (itemsLoading) return <Spinner />;

  const weekStart = openWeekStartMs();
  const weekItems = items.filter((i) => new Date(i.created_at).getTime() >= weekStart);
  const weekSum = weekItems.reduce((s, i) => s + i.amount, 0);

  async function openSlip(path: string) {
    try {
      const url = await signedUrl('payout-slips', path);
      if (!url) throw new Error('เปิดสลิปไม่สำเร็จ');
      setSlipUrl(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'เปิดสลิปไม่สำเร็จ', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="รอบนี้ (สัปดาห์นี้)" value={baht(weekSum)} hint="ตัดรอบคืนวันอาทิตย์ เที่ยงคืน" tone="brand" />
        <StatCard label="จำนวนรอบที่วิ่ง" value={`${weekItems.length} รอบ`} hint={`สะสมทั้งหมด ${items.length} รอบ`} />
      </div>

      <div>
        <h2 className="mb-2 text-base font-bold">ประวัติการจ่ายเงิน</h2>
        {payoutsError ? (
          <ErrorState onRetry={() => void refetchPayouts()} />
        ) : payoutsLoading ? (
          <Spinner />
        ) : payouts.length === 0 ? (
          <EmptyState icon="💰" title="ยังไม่มีประวัติการจ่ายเงิน" hint="ยอดจะสรุปให้อัตโนมัติเมื่อตัดรอบสัปดาห์" />
        ) : (
          <div className="space-y-2">
            {payouts.map((p) => {
              const slipPath = p.slip_photo_url;
              return (
                <div key={p.id} className="card flex items-center justify-between gap-2">
                  <div>
                    <div className="text-base font-bold">{baht(p.total)}</div>
                    <div className="text-xs text-slate-500">
                      {p.paid_at ? `โอนเมื่อ ${bkkDateTime(p.paid_at)}` : 'รอผู้บริหารโอน'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${p.paid_at ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {p.paid_at ? 'โอนแล้ว' : 'รอโอน'}
                    </span>
                    {slipPath && (
                      <button className="btn-ghost btn-sm" onClick={() => void openSlip(slipPath)}>
                        ดูสลิป
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {slipUrl && (
        <Modal open title="สลิปโอนเงิน" onClose={() => setSlipUrl(null)}>
          <img src={slipUrl} alt="สลิปโอนเงิน" className="max-h-[70vh] w-full rounded-xl object-contain" />
        </Modal>
      )}
    </div>
  );
}
