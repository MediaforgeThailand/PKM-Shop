import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invokeFn, uploadToBucket } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ORDER_STATUS_TH, type DeliveryRound, type Order } from '../lib/types';

function bkkTime(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date(iso));
}

export function RiderRounds() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? '';

  const { data: rounds = [] } = useQuery({
    queryKey: ['rider-rounds'],
    refetchInterval: 10_000,
    queryFn: async (): Promise<DeliveryRound[]> => {
      const { data, error } = await supabase
        .from('delivery_rounds')
        .select('id,round_at,type,status,rider_id')
        .in('status', ['locked', 'confirmed', 'in_progress'])
        .order('round_at');
      if (error) throw new Error(error.message);
      return (data as DeliveryRound[]) ?? [];
    },
  });

  async function claimRound(id: string) {
    await invokeFn('rider-action', { action: 'claim_round', round_id: id });
    await qc.invalidateQueries();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">รอบจัดส่ง</h1>
      {rounds.length === 0 && <p className="text-sm text-slate-400">ยังไม่มีรอบที่พร้อม</p>}
      {rounds.map((r) => (
        <RoundCard key={r.id} round={r} tenantId={tenantId} onClaim={() => void claimRound(r.id)} time={bkkTime(r.round_at)} />
      ))}
    </div>
  );
}

function RoundCard({ round, tenantId, onClaim, time }: { round: DeliveryRound; tenantId: string; onClaim: () => void; time: string }) {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({
    queryKey: ['round-orders', round.id],
    enabled: round.status !== 'locked',
    refetchInterval: 10_000,
    queryFn: async (): Promise<Order[]> => {
      const { data } = await supabase
        .from('orders')
        .select('id,order_no,status,payment_status,delivery_type,goods_total,delivery_fee,grand_total,recipient_name,recipient_phone,address_text,round_id,stop_sequence,external_ref,created_at')
        .eq('round_id', round.id)
        .order('stop_sequence', { nullsFirst: true });
      return (data as Order[]) ?? [];
    },
  });

  async function act(action: string, orderId: string, extra: Record<string, unknown> = {}) {
    await invokeFn('rider-action', { action, order_id: orderId, ...extra });
    await qc.invalidateQueries({ queryKey: ['round-orders', round.id] });
  }

  async function pod(orderId: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
      await uploadToBucket('pod', path, file);
      await act('pod', orderId, { photo_path: path });
    };
    input.click();
  }

  async function ret(orderId: string) {
    const reason = prompt('เหตุผลการตีกลับ?');
    if (!reason) return;
    await act('return', orderId, { reason });
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold">รอบ {time} น.</span>
        <span className="badge bg-slate-100 text-slate-600">{round.status}</span>
      </div>
      {round.status === 'locked' ? (
        <button className="btn-primary w-full text-base" onClick={onClaim}>รับรอบนี้</button>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="rounded-lg border border-slate-200 p-3">
              <div className="text-base font-semibold">จุด {o.stop_sequence ?? '-'} · {o.recipient_name || 'ลูกค้า'}</div>
              <div className="mt-1 text-sm text-slate-700">{o.address_text || 'ไม่มีที่อยู่'}</div>
              {o.recipient_phone && <a href={`tel:${o.recipient_phone}`} className="mt-1 inline-block text-sm font-medium text-brand">📞 {o.recipient_phone}</a>}
              <div className="mt-3 flex flex-col gap-2">
                {o.status === 'out_for_delivery' && <button className="btn-primary w-full" onClick={() => void act('start_stop', o.id)}>เริ่มส่งจุดนี้</button>}
                {o.status === 'delivering' && <button className="btn-primary w-full" onClick={() => void pod(o.id)}>📷 ส่งสำเร็จ (POD)</button>}
                {['out_for_delivery', 'delivering'].includes(o.status) && <button className="btn-ghost w-full text-red-600" onClick={() => void ret(o.id)}>ตีกลับ</button>}
                {['delivered', 'returned'].includes(o.status) && <span className="badge bg-slate-100 text-slate-600">{ORDER_STATUS_TH[o.status]}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
