import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { baht, EmptyState, ErrorState, Field, PageHeader, Spinner, StatCard } from '../../lib/ui';
import { DELIVERY_TYPE_TH, ORDER_STATUS_TH, type DeliveryType, type Order, type OrderStatus } from '../../lib/types';

// Analytics — Ready.md §3.9: "สถิติคร่าวๆ ห้าม over-engineer".
// ยอดขาย · จำนวนบ้าน = จำนวนออเดอร์ · วันขายดีสุด · ค้นประวัติด้วยเลขออเดอร์
// Counted orders: not cancelled AND payment_status = 'paid'.

type SalesOrder = Pick<Order, 'id' | 'grand_total' | 'delivery_type' | 'created_at'>;
type OrderEventRow = {
  id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor: string;
  note: string | null;
  created_at: string;
};
type OrderSearchResult = { order: Order; events: OrderEventRow[] } | null;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

function addDays(dateStr: string, days: number): string {
  const d = parseYmd(dateStr);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

function statusColor(s: OrderStatus): string {
  if (s === 'delivered') return 'bg-green-100 text-green-700';
  if (s === 'cancelled' || s === 'returned') return 'bg-red-100 text-red-700';
  if (s === 'pending') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export function Analytics() {
  // Default range: 1st of current month → today (Ready.md §3.9).
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [to, setTo] = useState(() => ymd(new Date()));
  const validRange = Boolean(from && to) && from <= to;

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-orders', from, to],
    enabled: validRange,
    queryFn: async (): Promise<SalesOrder[]> => {
      // Thai business day boundaries (+07:00); exclusive upper bound = to + 1 day.
      const { data, error } = await supabase
        .from('orders')
        .select('id,grand_total,delivery_type,created_at')
        .neq('status', 'cancelled')
        .eq('payment_status', 'paid')
        .gte('created_at', `${from}T00:00:00+07:00`)
        .lt('created_at', `${addDays(to, 1)}T00:00:00+07:00`)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (error) throw new Error(error.message);
      return (data as SalesOrder[]) ?? [];
    },
  });

  const stats = useMemo(() => {
    const total = orders.reduce((s, o) => s + o.grand_total, 0);
    const count = orders.length;
    const avg = count > 0 ? Math.round(total / count) : 0;
    const byDay = new Map<string, number>();
    const byType = new Map<DeliveryType, { count: number; total: number }>();
    for (const o of orders) {
      const key = ymd(new Date(o.created_at));
      byDay.set(key, (byDay.get(key) ?? 0) + o.grand_total);
      const cur = byType.get(o.delivery_type) ?? { count: 0, total: 0 };
      byType.set(o.delivery_type, { count: cur.count + 1, total: cur.total + o.grand_total });
    }
    return { total, count, avg, byDay, byType };
  }, [orders]);

  // Every day in the range (capped at 92 columns to keep the bar chart sane).
  const days = useMemo(() => {
    const out: { key: string; date: Date }[] = [];
    if (!validRange) return out;
    let cur = from;
    for (let i = 0; i < 92 && cur <= to; i += 1) {
      out.push({ key: cur, date: parseYmd(cur) });
      cur = addDays(cur, 1);
    }
    return out;
  }, [from, to, validRange]);

  const maxDay = days.reduce((mx, d) => Math.max(mx, stats.byDay.get(d.key) ?? 0), 0);
  const best = days.reduce<{ key: string; date: Date; amount: number } | null>((acc, d) => {
    const amount = stats.byDay.get(d.key) ?? 0;
    if (amount <= 0) return acc;
    return !acc || amount > acc.amount ? { ...d, amount } : acc;
  }, null);

  return (
    <div className="space-y-4">
      <PageHeader title="สถิติ" />

      {/* Date range */}
      <div className="card grid grid-cols-2 gap-2">
        <Field label="ตั้งแต่วันที่">
          <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="ถึงวันที่">
          <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {!validRange && <p className="col-span-2 text-xs text-red-600">ช่วงวันที่ไม่ถูกต้อง — วันเริ่มต้องไม่เกินวันสิ้นสุด</p>}
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : validRange ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <StatCard label="ยอดขายรวม" value={baht(stats.total)} hint="เฉพาะออเดอร์ที่ชำระแล้ว" tone="brand" />
            </div>
            <StatCard label="จำนวนออเดอร์" value={`${stats.count.toLocaleString('th-TH')}`} hint="= จำนวนบ้าน" />
            <StatCard label="เฉลี่ย/ออเดอร์" value={stats.count > 0 ? baht(stats.avg) : '—'} />
          </div>

          {/* Daily bar chart (pure CSS) */}
          <div className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-600">ยอดขายรายวัน</h2>
              {best && (
                <span className="badge bg-amber-100 text-amber-700">
                  🏆 วันขายดีสุด: {best.date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })} · {baht(best.amount)}
                </span>
              )}
            </div>
            {maxDay === 0 ? (
              <EmptyState icon="📊" title="ไม่มียอดขายในช่วงนี้" />
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="flex items-end gap-1" style={{ minWidth: days.length > 16 ? `${days.length * 22}px` : undefined }}>
                  {days.map((d) => {
                    const amount = stats.byDay.get(d.key) ?? 0;
                    const isBest = best?.key === d.key;
                    const pct = amount > 0 ? Math.max(4, Math.round((amount / maxDay) * 100)) : 0;
                    return (
                      <div
                        key={d.key}
                        className="flex flex-1 flex-col items-center gap-1"
                        title={`${d.date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' })} · ${baht(amount)}`}
                      >
                        <div className="flex h-28 w-full items-end justify-center">
                          {amount > 0 ? (
                            <div className={`w-full max-w-[26px] rounded-t ${isBest ? 'bg-amber-400' : 'bg-brand'}`} style={{ height: `${pct}%` }} />
                          ) : (
                            <div className="h-[2px] w-full max-w-[26px] rounded bg-slate-200" />
                          )}
                        </div>
                        <span className={`text-[10px] leading-tight ${isBest ? 'font-bold text-amber-600' : 'text-slate-400'}`}>{d.date.getDate()}</span>
                        {days.length <= 10 && (
                          <span className="text-[9px] leading-tight text-slate-400">{d.date.toLocaleDateString('th-TH', { weekday: 'short' })}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Breakdown by delivery type */}
          {stats.count > 0 && (
            <div className="card">
              <h2 className="mb-2 text-sm font-semibold text-slate-600">แยกตามวิธีจัดส่ง</h2>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DELIVERY_TYPE_TH) as DeliveryType[]).map((t) => {
                  const agg = stats.byType.get(t);
                  if (!agg) return null;
                  return (
                    <span key={t} className="badge bg-slate-100 px-3 py-1.5 text-slate-700">
                      {DELIVERY_TYPE_TH[t]} · {agg.count.toLocaleString('th-TH')} ออเดอร์ · {baht(agg.total)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}

      <OrderSearch />
    </div>
  );
}

function OrderSearch() {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');

  const { data: found, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-order-search', term],
    enabled: term.length > 0,
    queryFn: async (): Promise<OrderSearchResult> => {
      const { data: order, error } = await supabase
        .from('orders')
        .select('id,order_no,status,payment_status,delivery_type,goods_total,delivery_fee,grand_total,recipient_name,recipient_phone,address_text,round_id,stop_sequence,external_ref,created_at')
        .ilike('order_no', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!order) return null;
      const o = order as Order;
      const { data: events, error: evError } = await supabase
        .from('order_events')
        .select('id,from_status,to_status,actor,note,created_at')
        .eq('order_id', o.id)
        .order('created_at', { ascending: true });
      if (evError) throw new Error(evError.message);
      return { order: o, events: (events as OrderEventRow[]) ?? [] };
    },
  });

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold text-slate-600">ค้นหาออเดอร์</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(input.trim());
        }}
      >
        <input
          className="input flex-1"
          placeholder="เลขออเดอร์ เช่น ORD-260714-001"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!input.trim()}>ค้นหา</button>
      </form>

      {term.length === 0 ? null : isLoading ? (
        <Spinner label="กำลังค้นหา…" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !found ? (
        <EmptyState icon="🔍" title="ไม่พบออเดอร์" hint={`ไม่มีเลขออเดอร์ที่ตรงกับ "${term}"`} />
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{found.order.order_no}</span>
            <span className={`badge ${statusColor(found.order.status)}`}>{ORDER_STATUS_TH[found.order.status]}</span>
            <span className="badge bg-slate-100 text-slate-600">{DELIVERY_TYPE_TH[found.order.delivery_type]}</span>
          </div>
          <div className="text-sm text-slate-600">
            <div>{found.order.recipient_name || 'ลูกค้า'}{found.order.recipient_phone ? ` · ${found.order.recipient_phone}` : ''}</div>
            {found.order.address_text && <div className="text-xs text-slate-500">{found.order.address_text}</div>}
            <div className="mt-1 font-semibold text-slate-800">รวม {baht(found.order.grand_total)} <span className="font-normal text-xs text-slate-400">(ค่าสินค้า {baht(found.order.goods_total)} + ค่าส่ง {baht(found.order.delivery_fee)})</span></div>
          </div>

          {/* Status timeline from order_events */}
          {found.events.length === 0 ? (
            <p className="text-xs text-slate-400">ยังไม่มีประวัติสถานะ</p>
          ) : (
            <ol className="relative ml-1.5 space-y-3 border-l-2 border-slate-200 pl-4">
              {found.events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand" />
                  <div className="text-sm font-medium">{ORDER_STATUS_TH[ev.to_status]}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(ev.created_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {ev.note ? ` · ${ev.note}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
