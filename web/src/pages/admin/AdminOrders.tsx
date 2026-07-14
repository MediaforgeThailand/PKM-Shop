// Admin order operations center (Ready.md §3.1–3.5):
//  บอร์ดวันนี้  — today's orders grouped by status column, tap → detail modal.
//  รอบไรเดอร์  — today's rider rounds + rider name + orders per round.
//  Kerry       — daily Kerry round (create/sweep) + handover with tracking no.
//  ค้นหา       — lookup any-age orders by order_no.
// Reads go through supabase (anon + RLS); every state change goes through admin-action.
import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn } from '../../lib/api';
import { baht, EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, Stepper, Tabs, useUI } from '../../lib/ui';
import {
  DELIVERY_TYPE_TH,
  ORDER_STATUS_TH,
  type Customer,
  type DeliveryRound,
  type DeliveryType,
  type Order,
  type OrderStatus,
  type Product,
} from '../../lib/types';

// Order rows on this page always need customer_id (zone override + customer lookup).
type AdminOrder = Order & { customer_id: string };
type RoundRow = DeliveryRound & { profiles: { name: string } | null };
type OrderItemRow = { qty: number; unit_price: number; products: { name: string } | null };
type OrderEventRow = {
  id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor: string;
  note: string | null;
  created_at: string;
};

const ORDER_SELECT =
  'id,order_no,customer_id,status,payment_status,delivery_type,goods_total,delivery_fee,grand_total,recipient_name,recipient_phone,address_text,round_id,stop_sequence,external_ref,created_at';

// Short chips for tight card rows (full labels from DELIVERY_TYPE_TH live in the detail modal).
const DELIVERY_SHORT_TH: Record<DeliveryType, string> = {
  rider: 'ไรเดอร์ร้าน',
  express_grab: 'ด่วน (Grab)',
  lalamove: 'Lalamove',
  parcel_kerry: 'Kerry',
};

const ROUND_STATUS_TH: Record<DeliveryRound['status'], string> = {
  open: 'เปิดรับออเดอร์',
  locked: 'ปิดรอบ รอไรเดอร์รับ',
  confirmed: 'ไรเดอร์รับแล้ว',
  in_progress: 'กำลังส่ง',
  done: 'จบรอบ',
};

const BOARD_GROUPS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: 'pending', label: 'รอชำระ', statuses: ['pending'] },
  { key: 'paid', label: 'ชำระแล้ว / เข้ารอบ', statuses: ['paid', 'confirmed'] },
  { key: 'packing', label: 'กำลังแพ็ค', statuses: ['packing', 'packed'] },
  { key: 'delivering', label: 'กำลังส่ง', statuses: ['out_for_delivery', 'delivering'] },
  { key: 'done', label: 'เสร็จ / ตีกลับ / ยกเลิก', statuses: ['delivered', 'returned', 'awaiting_redelivery_fee', 'cancelled'] },
];

// Kerry parcels awaiting handover (they never enter the rider delivering states).
const KERRY_ACTIVE: OrderStatus[] = ['pending', 'paid', 'confirmed', 'packing', 'packed'];

function statusColor(s: OrderStatus): string {
  if (s === 'delivered') return 'bg-green-100 text-green-700';
  if (s === 'cancelled' || s === 'returned') return 'bg-red-100 text-red-700';
  if (s === 'pending' || s === 'awaiting_redelivery_fee') return 'bg-amber-100 text-amber-700';
  if (s === 'out_for_delivery' || s === 'delivering') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

// Bangkok is fixed UTC+7 (no DST) → today's [start, end) computed without a TZ library.
function bkkDayRange(): { start: string; end: string } {
  const DAY = 86_400_000;
  const OFFSET = 7 * 3_600_000;
  const startMs = Math.floor((Date.now() + OFFSET) / DAY) * DAY - OFFSET;
  return { start: new Date(startMs).toISOString(), end: new Date(startMs + DAY).toISOString() };
}

function bkkTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date(iso));
}

function bkkDateTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok',
  }).format(new Date(iso));
}

type TabKey = 'board' | 'rounds' | 'kerry' | 'search';

export function AdminOrders() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('board');
  const [detail, setDetail] = useState<AdminOrder | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader
        title="ออเดอร์"
        action={<button className="btn-primary btn-sm" onClick={() => setManualOpen(true)}>+ โทรสั่ง</button>}
      />

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'board', label: 'บอร์ดวันนี้' },
          { value: 'rounds', label: 'รอบไรเดอร์' },
          { value: 'kerry', label: 'Kerry' },
          { value: 'search', label: 'ค้นหา' },
        ]}
      />

      {tab === 'board' && <BoardTab onOpen={setDetail} />}
      {tab === 'rounds' && <RoundsTab onOpen={setDetail} />}
      {tab === 'kerry' && <KerryTab onOpen={setDetail} />}
      {tab === 'search' && <SearchTab onOpen={setDetail} />}

      {detail && <OrderDetailModal order={detail} onClose={() => setDetail(null)} />}
      {manualOpen && (
        <ManualOrderModal
          onClose={() => setManualOpen(false)}
          onDone={async () => {
            setManualOpen(false);
            await qc.invalidateQueries({ queryKey: ['admin-orders-board'] });
          }}
        />
      )}
    </div>
  );
}

// ── Shared order card ───────────────────────────────────────────────────────

function OrderCard({ order, onOpen }: { order: AdminOrder; onOpen: () => void }) {
  return (
    <button type="button" className="card flex w-full items-center justify-between gap-2 p-3 text-left" onClick={onOpen}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{order.order_no}</span>
          <span className="text-[11px] text-slate-400">{bkkDateTime(order.created_at)} น.</span>
        </div>
        <div className="truncate text-xs text-slate-500">
          {order.recipient_name || 'ลูกค้า'} · {DELIVERY_SHORT_TH[order.delivery_type]} · {baht(order.grand_total)}
        </div>
      </div>
      <span className={`badge shrink-0 ${statusColor(order.status)}`}>{ORDER_STATUS_TH[order.status]}</span>
    </button>
  );
}

// ── Tab 1: บอร์ดวันนี้ ──────────────────────────────────────────────────────

function BoardTab({ onOpen }: { onOpen: (o: AdminOrder) => void }) {
  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-orders-board'],
    refetchInterval: 20_000,
    queryFn: async (): Promise<AdminOrder[]> => {
      const { start, end } = bkkDayRange();
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data as AdminOrder[]) ?? [];
    },
  });

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading) return <Spinner />;
  if (orders.length === 0) {
    return <EmptyState icon="🌤️" title="ยังไม่มีออเดอร์วันนี้" hint="ออเดอร์ใหม่จะขึ้นที่นี่อัตโนมัติ" />;
  }

  return (
    <div className="space-y-5">
      {BOARD_GROUPS.map((g) => {
        const list = orders.filter((o) => g.statuses.includes(o.status));
        return (
          <section key={g.key} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              {g.label}
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold leading-none text-slate-600">{list.length}</span>
            </h2>
            {list.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">ไม่มีออเดอร์</div>
            ) : (
              list.map((o) => <OrderCard key={o.id} order={o} onOpen={() => onOpen(o)} />)
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── Tab 2: รอบไรเดอร์ ───────────────────────────────────────────────────────

function RoundsTab({ onOpen }: { onOpen: (o: AdminOrder) => void }) {
  const { data: rounds = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-rider-rounds'],
    refetchInterval: 20_000,
    queryFn: async (): Promise<RoundRow[]> => {
      const { start, end } = bkkDayRange();
      const { data, error } = await supabase
        .from('delivery_rounds')
        .select('id,round_at,type,status,rider_id,profiles(name)')
        .eq('type', 'rider')
        .gte('round_at', start)
        .lt('round_at', end)
        .order('round_at');
      if (error) throw new Error(error.message);
      return (data as unknown as RoundRow[]) ?? [];
    },
  });

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading) return <Spinner />;
  if (rounds.length === 0) {
    return <EmptyState icon="🛵" title="ยังไม่มีรอบไรเดอร์วันนี้" hint="รอบถูกสร้างอัตโนมัติเมื่อมีออเดอร์เข้ารอบ" />;
  }

  return (
    <div className="space-y-3">
      {rounds.map((r) => <AdminRoundCard key={r.id} round={r} onOpen={onOpen} />)}
    </div>
  );
}

function AdminRoundCard({ round, onOpen }: { round: RoundRow; onOpen: (o: AdminOrder) => void }) {
  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-round-orders', round.id],
    refetchInterval: 20_000,
    queryFn: async (): Promise<AdminOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('round_id', round.id)
        .order('stop_sequence', { nullsFirst: true });
      if (error) throw new Error(error.message);
      return (data as AdminOrder[]) ?? [];
    },
  });

  return (
    <div className="card space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">รอบ {bkkTime(round.round_at)} น.</span>
        <span className="badge bg-slate-100 text-slate-600">{ROUND_STATUS_TH[round.status]}</span>
      </div>
      <div className="text-xs text-slate-500">
        🛵 {round.profiles?.name ?? 'ยังไม่มีไรเดอร์รับรอบ'} · {orders.length} จุด
      </div>
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner label="กำลังโหลดออเดอร์…" />
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">ยังไม่มีออเดอร์ในรอบนี้</div>
      ) : (
        <div className="space-y-1">
          {orders.map((o) => (
            <button
              key={o.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left active:bg-slate-50"
              onClick={() => onOpen(o)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  จุด {o.stop_sequence ?? '-'} · <span className="font-mono">{o.order_no}</span>
                </div>
                <div className="truncate text-xs text-slate-500">{o.recipient_name || 'ลูกค้า'} · {baht(o.grand_total)}</div>
              </div>
              <span className={`badge shrink-0 ${statusColor(o.status)}`}>{ORDER_STATUS_TH[o.status]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Kerry ────────────────────────────────────────────────────────────

function KerryTab({ onOpen }: { onOpen: (o: AdminOrder) => void }) {
  const qc = useQueryClient();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const [handoverFor, setHandoverFor] = useState<AdminOrder | null>(null);

  const roundQ = useQuery({
    queryKey: ['admin-kerry-round'],
    refetchInterval: 20_000,
    queryFn: async (): Promise<DeliveryRound | null> => {
      const { start, end } = bkkDayRange();
      const { data, error } = await supabase
        .from('delivery_rounds')
        .select('id,round_at,type,status,rider_id')
        .eq('type', 'kerry')
        .gte('round_at', start)
        .lt('round_at', end)
        .order('round_at')
        .limit(1);
      if (error) throw new Error(error.message);
      const rows = (data as DeliveryRound[]) ?? [];
      return rows[0] ?? null;
    },
  });

  const ordersQ = useQuery({
    queryKey: ['admin-kerry-orders'],
    refetchInterval: 20_000,
    queryFn: async (): Promise<AdminOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('delivery_type', 'parcel_kerry')
        .in('status', KERRY_ACTIVE)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data as AdminOrder[]) ?? [];
    },
  });

  async function createRound() {
    setBusy(true);
    try {
      await invokeFn('admin-action', { action: 'create_kerry_round' });
      toast('เปิดรอบ Kerry วันนี้แล้ว — กวาดออเดอร์ที่ชำระแล้วเข้ารอบ', 'success');
      await qc.invalidateQueries({ queryKey: ['admin-kerry-round'] });
      await qc.invalidateQueries({ queryKey: ['admin-kerry-orders'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'เปิดรอบไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
        📦 Kerry เข้ารับพัสดุช่วง 11:00–14:00 น. (แล้วแต่วัน) — เปิดรอบแล้วเตรียมของให้พร้อมก่อนช่วงเวลานี้
      </div>

      {roundQ.isError ? (
        <ErrorState onRetry={() => void roundQ.refetch()} />
      ) : roundQ.isLoading ? (
        <Spinner />
      ) : (
        <div className="card space-y-2 p-3">
          {roundQ.data ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">รอบ Kerry วันนี้</span>
              <span className="badge bg-slate-100 text-slate-600">{ROUND_STATUS_TH[roundQ.data.status]}</span>
            </div>
          ) : (
            <div className="text-sm text-slate-500">ยังไม่ได้เปิดรอบ Kerry ของวันนี้</div>
          )}
          <button className="btn-primary w-full" disabled={busy} onClick={() => void createRound()}>
            {busy ? 'กำลังทำรายการ…' : roundQ.data ? 'กวาดออเดอร์ที่ชำระแล้วเข้ารอบอีกครั้ง' : 'เปิดรอบ Kerry วันนี้'}
          </button>
        </div>
      )}

      {ordersQ.isError ? (
        <ErrorState onRetry={() => void ordersQ.refetch()} />
      ) : ordersQ.isLoading ? (
        <Spinner />
      ) : ordersQ.data && ordersQ.data.length === 0 ? (
        <EmptyState icon="📦" title="ไม่มีพัสดุ Kerry ค้างส่งมอบ" />
      ) : (
        <div className="space-y-2">
          {(ordersQ.data ?? []).map((o) => (
            <div key={o.id} className="card space-y-2 p-3">
              <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => onOpen(o)}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{o.order_no}</span>
                    <span className="text-[11px] text-slate-400">{bkkDateTime(o.created_at)}</span>
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {o.recipient_name || 'ลูกค้า'} · {baht(o.grand_total)}
                    {o.external_ref ? ` · เลขพัสดุ ${o.external_ref}` : ''}
                  </div>
                </div>
                <span className={`badge shrink-0 ${statusColor(o.status)}`}>{ORDER_STATUS_TH[o.status]}</span>
              </button>
              {o.status === 'packed' ? (
                <button className="btn-primary btn-sm w-full" onClick={() => setHandoverFor(o)}>ส่งมอบแล้ว + เลขพัสดุ</button>
              ) : (
                <div className="text-center text-xs text-slate-400">ต้องแพ็คเสร็จก่อนจึงบันทึกส่งมอบได้</div>
              )}
            </div>
          ))}
        </div>
      )}

      {handoverFor && (
        <KerryHandoverModal
          order={handoverFor}
          onClose={() => setHandoverFor(null)}
          onDone={async () => {
            setHandoverFor(null);
            await qc.invalidateQueries({ queryKey: ['admin-kerry-orders'] });
            await qc.invalidateQueries({ queryKey: ['admin-orders-board'] });
          }}
        />
      )}
    </div>
  );
}

function KerryHandoverModal({ order, onClose, onDone }: { order: AdminOrder; onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [tracking, setTracking] = useState(order.external_ref ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!tracking.trim()) return;
    setBusy(true);
    try {
      await invokeFn('admin-action', { action: 'kerry_handover', order_id: order.id, tracking: tracking.trim() });
      toast(`บันทึกส่งมอบ ${order.order_no} แล้ว`, 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`ส่งมอบ Kerry · ${order.order_no}`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field label="เลขพัสดุ (Tracking No.)" hint="บังคับกรอก — ลูกค้าจะได้รับแจ้งเลขนี้ทาง LINE">
          <input className="input" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="เช่น KERDO1234567890" required />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy || !tracking.trim()}>
          {busy ? 'กำลังบันทึก…' : 'ยืนยันส่งมอบแล้ว'}
        </button>
      </form>
    </Modal>
  );
}

// ── Tab 4: ค้นหา ────────────────────────────────────────────────────────────

function SearchTab({ onOpen }: { onOpen: (o: AdminOrder) => void }) {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');

  const { data: results = [], isLoading, isError, refetch, isFetched } = useQuery({
    queryKey: ['admin-order-search', term],
    enabled: term.length > 0,
    queryFn: async (): Promise<AdminOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .ilike('order_no', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data as AdminOrder[]) ?? [];
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setTerm(input.trim());
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="input flex-1"
          inputMode="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="พิมพ์เลขออเดอร์ เช่น 2607-0012"
        />
        <button type="submit" className="btn-primary shrink-0 px-4">ค้นหา</button>
      </form>

      {term.length === 0 ? (
        <EmptyState icon="🔎" title="ค้นหาออเดอร์ย้อนหลัง" hint="ใส่เลขออเดอร์บางส่วนได้ เช่น 0012" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner label="กำลังค้นหา…" />
      ) : isFetched && results.length === 0 ? (
        <EmptyState icon="🤔" title={`ไม่พบออเดอร์ "${term}"`} hint="ลองพิมพ์เลขให้สั้นลงหรือตรวจตัวสะกด" />
      ) : (
        <div className="space-y-2">
          {results.map((o) => <OrderCard key={o.id} order={o} onOpen={() => onOpen(o)} />)}
        </div>
      )}
    </div>
  );
}

// ── Order detail modal ──────────────────────────────────────────────────────

const REF_TYPES: DeliveryType[] = ['express_grab', 'lalamove', 'parcel_kerry'];

function OrderDetailModal({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useUI();
  const [externalRef, setExternalRef] = useState(order.external_ref);
  const [refOpen, setRefOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [zoneBusy, setZoneBusy] = useState(false);

  const canCancel = ['pending', 'paid', 'confirmed'].includes(order.status);
  const canRef = REF_TYPES.includes(order.delivery_type);

  const itemsQ = useQuery({
    queryKey: ['admin-order-items', order.id],
    queryFn: async (): Promise<OrderItemRow[]> => {
      const { data, error } = await supabase
        .from('order_items')
        .select('qty,unit_price,products(name)')
        .eq('order_id', order.id);
      if (error) throw new Error(error.message);
      return (data as unknown as OrderItemRow[]) ?? [];
    },
  });

  const eventsQ = useQuery({
    queryKey: ['admin-order-events', order.id],
    queryFn: async (): Promise<OrderEventRow[]> => {
      const { data, error } = await supabase
        .from('order_events')
        .select('id,from_status,to_status,actor,note,created_at')
        .eq('order_id', order.id)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data as OrderEventRow[]) ?? [];
    },
  });

  const customerQ = useQuery({
    queryKey: ['admin-order-customer', order.customer_id],
    queryFn: async (): Promise<Customer | null> => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,nickname,phone,line_user_id,zone_override')
        .eq('id', order.customer_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Customer | null) ?? null;
    },
  });

  async function changeZone(value: string) {
    setZoneBusy(true);
    try {
      await invokeFn('admin-action', {
        action: 'set_customer_zone',
        customer_id: order.customer_id,
        zone: value === '' ? null : value,
      });
      toast('อัปเดตโซนลูกค้าแล้ว', 'success');
      await qc.invalidateQueries({ queryKey: ['admin-order-customer', order.customer_id] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'อัปเดตโซนไม่สำเร็จ', 'error');
    } finally {
      setZoneBusy(false);
    }
  }

  return (
    <Modal open title={order.order_no} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${statusColor(order.status)}`}>{ORDER_STATUS_TH[order.status]}</span>
          <span className="badge bg-brand/10 text-brand">{DELIVERY_TYPE_TH[order.delivery_type]}</span>
          <span className="text-xs text-slate-400">{bkkDateTime(order.created_at)}</span>
        </div>

        {/* Customer contact + address */}
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="font-medium text-slate-700">{order.recipient_name || 'ลูกค้า'}</div>
          {order.recipient_phone && (
            <a className="mt-0.5 inline-block font-medium text-brand" href={`tel:${order.recipient_phone}`}>📞 {order.recipient_phone}</a>
          )}
          <div className="mt-0.5 text-slate-600">{order.address_text || 'ยังไม่มีที่อยู่'}</div>
          {customerQ.isError ? (
            <ErrorState onRetry={() => void customerQ.refetch()} />
          ) : customerQ.data ? (
            <div className="mt-1 text-xs text-slate-400">
              บัญชีลูกค้า: {customerQ.data.nickname || '-'}{customerQ.data.phone ? ` · ${customerQ.data.phone}` : ''}
            </div>
          ) : null}
        </div>

        {/* Items + totals */}
        <div className="rounded-lg bg-slate-50 p-3">
          {itemsQ.isError ? (
            <ErrorState onRetry={() => void itemsQ.refetch()} />
          ) : itemsQ.isLoading ? (
            <Spinner label="กำลังโหลดรายการ…" />
          ) : (itemsQ.data ?? []).length === 0 ? (
            <div className="text-xs text-slate-400">ไม่มีรายการสินค้า</div>
          ) : (
            (itemsQ.data ?? []).map((it, i) => (
              <div key={i} className="flex justify-between py-0.5">
                <span>{it.products?.name ?? 'สินค้า'} × {it.qty}</span>
                <span className="tabular-nums">{baht(it.qty * it.unit_price)}</span>
              </div>
            ))
          )}
          <div className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
            <div className="flex justify-between"><span>ค่าสินค้า</span><span className="tabular-nums">{baht(order.goods_total)}</span></div>
            <div className="flex justify-between"><span>ค่าส่ง</span><span className="tabular-nums">{baht(order.delivery_fee)}</span></div>
            <div className="flex justify-between font-semibold text-slate-800"><span>รวม</span><span className="tabular-nums">{baht(order.grand_total)}</span></div>
          </div>
        </div>

        {/* External reference (Grab/Lalamove/Kerry) */}
        {canRef && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
            <div className="min-w-0">
              <div className="text-xs text-slate-500">เลขอ้างอิง Grab/Lalamove/Kerry</div>
              <div className="truncate font-mono font-medium">{externalRef || '— ยังไม่บันทึก —'}</div>
            </div>
            <button className="btn-ghost btn-sm shrink-0" onClick={() => setRefOpen(true)}>
              {externalRef ? 'แก้ไข' : 'บันทึกเลข'}
            </button>
          </div>
        )}

        {/* Customer zone override (Ready.md §3.3) */}
        <Field label="โซนลูกค้า (override)" hint="มีผลกับการคิดค่าส่งของออเดอร์ถัดไปของลูกค้าคนนี้">
          {customerQ.isLoading ? (
            <Spinner label="กำลังโหลดข้อมูลลูกค้า…" />
          ) : (
            <select
              className="input"
              value={customerQ.data?.zone_override ?? ''}
              disabled={zoneBusy || customerQ.isError || !customerQ.data}
              onChange={(e) => void changeZone(e.target.value)}
            >
              <option value="">ตามระยะจริง</option>
              <option value="in_zone">ในเขต</option>
              <option value="out_zone">นอกเขต</option>
            </select>
          )}
        </Field>

        {/* Timeline */}
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-500">ประวัติสถานะ</div>
          {eventsQ.isError ? (
            <ErrorState onRetry={() => void eventsQ.refetch()} />
          ) : eventsQ.isLoading ? (
            <Spinner label="กำลังโหลดประวัติ…" />
          ) : (eventsQ.data ?? []).length === 0 ? (
            <div className="text-xs text-slate-400">ยังไม่มีประวัติ</div>
          ) : (
            <div className="space-y-1.5">
              {(eventsQ.data ?? []).map((ev) => (
                <div key={ev.id} className="flex gap-2 text-xs">
                  <span className="w-24 shrink-0 tabular-nums text-slate-400">{bkkDateTime(ev.created_at)}</span>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700">
                      {ev.from_status ? `${ORDER_STATUS_TH[ev.from_status]} → ` : ''}{ORDER_STATUS_TH[ev.to_status]}
                    </span>
                    {ev.note && <div className="text-slate-400">{ev.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canCancel && (
          <button className="btn w-full bg-red-600 text-white hover:bg-red-700" onClick={() => setCancelOpen(true)}>
            ยกเลิกออเดอร์
          </button>
        )}
      </div>

      {refOpen && (
        <ExternalRefModal
          order={order}
          current={externalRef}
          onClose={() => setRefOpen(false)}
          onSaved={async (ref) => {
            setExternalRef(ref);
            setRefOpen(false);
            await qc.invalidateQueries({ queryKey: ['admin-orders-board'] });
            await qc.invalidateQueries({ queryKey: ['admin-kerry-orders'] });
          }}
        />
      )}

      {cancelOpen && (
        <CancelOrderModal
          order={order}
          onClose={() => setCancelOpen(false)}
          onDone={async () => {
            setCancelOpen(false);
            await qc.invalidateQueries({ queryKey: ['admin-orders-board'] });
            await qc.invalidateQueries({ queryKey: ['admin-kerry-orders'] });
            await qc.invalidateQueries({ queryKey: ['admin-order-events', order.id] });
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

function ExternalRefModal({ order, current, onClose, onSaved }: {
  order: AdminOrder;
  current: string | null;
  onClose: () => void;
  onSaved: (ref: string) => void;
}) {
  const { toast } = useUI();
  const [ref, setRef] = useState(current ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ref.trim()) return;
    setBusy(true);
    try {
      await invokeFn('admin-action', { action: 'set_external_ref', order_id: order.id, external_ref: ref.trim() });
      toast('บันทึกเลขอ้างอิงแล้ว', 'success');
      onSaved(ref.trim());
    } catch (err) {
      toast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`เลขอ้างอิง · ${order.order_no}`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field label="เลขอ้างอิง Grab/Lalamove/Kerry" hint="เลขงานจากแอปที่เรียกรถ หรือเลขพัสดุ">
          <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="เช่น GR-123456" required />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy || !ref.trim()}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </form>
    </Modal>
  );
}

function CancelOrderModal({ order, onClose, onDone }: { order: AdminOrder; onClose: () => void; onDone: () => void }) {
  const { confirm, toast } = useUI();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = reason.trim();
    const ok = await confirm({
      title: 'ยืนยันยกเลิกออเดอร์?',
      message: `${order.order_no} จะถูกยกเลิกและคืนสต็อก${trimmed ? ` — เหตุผล: ${trimmed}` : ''}`,
      confirmText: 'ยกเลิกออเดอร์',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await invokeFn('admin-action', { action: 'cancel_order', order_id: order.id, reason: trimmed || undefined });
      toast(`ยกเลิก ${order.order_no} แล้ว`, 'success');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`ยกเลิก · ${order.order_no}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="เหตุผล (ไม่บังคับ)">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ลูกค้าขอยกเลิก" />
        </Field>
        <button className="btn w-full bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={() => void submit()}>
          {busy ? 'กำลังยกเลิก…' : 'ยกเลิกออเดอร์'}
        </button>
      </div>
    </Modal>
  );
}

// ── Manual order (โทรสั่ง / หน้าร้าน) ───────────────────────────────────────

// lalamove is intentionally excluded: it is distance-priced and the server rejects it.
const MANUAL_DTYPES: { value: DeliveryType; label: string }[] = [
  { value: 'rider', label: 'ไรเดอร์ร้าน' },
  { value: 'express_grab', label: 'ด่วน (Grab)' },
  { value: 'parcel_kerry', label: 'Kerry' },
];

function ManualOrderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('rider');
  const [markPaid, setMarkPaid] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: products = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-products-for-order'],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id,catalog_key,name,description,price_baht,category_id,image_url,stock_qty,reserved_qty,active')
        .eq('active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return (data as Product[]) ?? [];
    },
  });

  const chosen = useMemo(() => products.filter((p) => (cart[p.id] ?? 0) > 0), [products, cart]);
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? products.filter((p) => p.name.toLowerCase().includes(f)) : products;
  }, [products, filter]);
  const goods = useMemo(() => chosen.reduce((s, p) => s + (cart[p.id] ?? 0) * p.price_baht, 0), [chosen, cart]);
  const count = useMemo(() => Object.values(cart).reduce((s, n) => s + n, 0), [cart]);

  function setQty(id: string, qty: number) {
    setCart((c) => {
      const copy = { ...c };
      if (qty <= 0) delete copy[id]; else copy[id] = qty;
      return copy;
    });
  }

  async function submit() {
    const items = Object.entries(cart).filter(([, qty]) => qty > 0).map(([product_id, qty]) => ({ product_id, qty }));
    if (items.length === 0) {
      toast('เลือกสินค้าอย่างน้อย 1 อย่าง', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await invokeFn<{ order?: { order_no?: string | null } }>('admin-action', {
        action: 'create_manual_order',
        items,
        delivery_type: deliveryType,
        address: address.trim() || undefined,
        recipient_name: recipientName.trim() || undefined,
        recipient_phone: recipientPhone.trim() || undefined,
        customer_phone: customerPhone.trim() || recipientPhone.trim() || undefined,
        mark_paid: markPaid,
      });
      const orderNo = res.order?.order_no;
      toast(orderNo ? `สร้างออเดอร์ ${orderNo} แล้ว` : 'สร้างออเดอร์แล้ว', 'success');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'สร้างไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="สร้างออเดอร์ (โทรสั่ง/หน้าร้าน)" onClose={onClose}>
      <div className="space-y-3">
        {/* Product picker */}
        <Field label="เลือกสินค้า">
          <div className="space-y-2">
            <input className="input" inputMode="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ค้นหาชื่อสินค้า…" />
            {isError ? (
              <ErrorState onRetry={() => void refetch()} />
            ) : isLoading ? (
              <Spinner label="กำลังโหลดสินค้า…" />
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {filtered.length === 0 && <p className="p-2 text-sm text-slate-400">ไม่พบสินค้า</p>}
                {filtered.map((p) => {
                  const qty = cart[p.id] ?? 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left ${qty > 0 ? 'bg-brand/5' : 'active:bg-slate-50'}`}
                      onClick={() => setQty(p.id, qty + 1)}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{p.name}</div>
                        <div className="text-xs text-slate-400">{baht(p.price_baht)} · คงเหลือ {p.stock_qty - p.reserved_qty}</div>
                      </div>
                      {qty > 0 ? (
                        <span className="badge shrink-0 bg-brand text-white">× {qty}</span>
                      ) : (
                        <span className="badge shrink-0 bg-slate-100 text-slate-500">+ เพิ่ม</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Field>

        {/* Chosen items with quantity steppers */}
        {chosen.length > 0 && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">รายการที่เลือก</div>
            {chosen.map((p) => (
              <div key={p.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{baht((cart[p.id] ?? 0) * p.price_baht)}</span>
                </div>
                <Stepper value={cart[p.id] ?? 0} min={0} max={99} onChange={(v) => setQty(p.id, v)} />
              </div>
            ))}
          </div>
        )}

        <Field label="วิธีจัดส่ง" hint="Lalamove คิดตามระยะทาง — สร้างผ่านแชทลูกค้าเท่านั้น">
          <Tabs<DeliveryType> value={deliveryType} onChange={setDeliveryType} options={MANUAL_DTYPES} />
        </Field>

        <Field label="ชื่อผู้รับ">
          <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="ชื่อลูกค้า" />
        </Field>
        <Field label="เบอร์ผู้รับ">
          <input className="input" inputMode="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="08xxxxxxxx" />
        </Field>
        <Field label="ที่อยู่จัดส่ง">
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="บ้านเลขที่ / จุดสังเกต" />
        </Field>
        <Field label="เบอร์ลูกค้า (ผูกประวัติ)" hint="เว้นว่างได้ — ระบบจะใช้เบอร์ผู้รับแทน">
          <input className="input" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="08xxxxxxxx" />
        </Field>

        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
          รับเงินแล้ว (เก็บเงินสด/โอนตรง)
        </label>

        <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
          <span className="text-slate-500">{count} ชิ้น · ค่าสินค้า</span>
          <span className="font-semibold">{baht(goods)}</span>
        </div>
        <button className="btn-primary w-full" disabled={busy} onClick={() => void submit()}>
          {busy ? 'กำลังสร้าง…' : 'สร้างออเดอร์'}
        </button>
      </div>
    </Modal>
  );
}
