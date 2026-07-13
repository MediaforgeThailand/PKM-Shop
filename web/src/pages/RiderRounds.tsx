import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invokeFn, uploadToBucket } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EmptyState, Field, Modal, Spinner, useUI } from '../lib/ui';
import { ORDER_STATUS_TH, type DeliveryRound, type Order } from '../lib/types';

function bkkTime(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date(iso));
}

export function RiderRounds() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useUI();
  const tenantId = profile?.tenant_id ?? '';

  const { data: rounds = [], isLoading } = useQuery({
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
    try {
      await invokeFn('rider-action', { action: 'claim_round', round_id: id });
      await qc.invalidateQueries();
      toast('รับรอบแล้ว เริ่มวิ่งได้เลย', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'รับรอบไม่สำเร็จ', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">รอบจัดส่ง</h1>
      {isLoading ? (
        <Spinner />
      ) : rounds.length === 0 ? (
        <EmptyState icon="🛵" title="ยังไม่มีรอบที่พร้อม" hint="รอบจะขึ้นเมื่อถึงเวลาปิดรอบ" />
      ) : (
        rounds.map((r) => (
          <RoundCard key={r.id} round={r} tenantId={tenantId} onClaim={() => void claimRound(r.id)} time={bkkTime(r.round_at)} />
        ))
      )}
    </div>
  );
}

function RoundCard({ round, tenantId, onClaim, time }: { round: DeliveryRound; tenantId: string; onClaim: () => void; time: string }) {
  const qc = useQueryClient();
  const { toast } = useUI();
  const [returnFor, setReturnFor] = useState<Order | null>(null);

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

  async function startStop(o: Order) {
    try {
      await act('start_stop', o.id);
      toast(`กำลังไปส่ง ${o.recipient_name || 'ลูกค้า'}`, 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ', 'error');
    }
  }

  async function pod(o: Order) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
        await uploadToBucket('pod', path, file);
        await act('pod', o.id, { photo_path: path });
        toast(`ส่งสำเร็จ ${o.recipient_name || ''}`.trim(), 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ', 'error');
      }
    };
    input.click();
  }

  const remaining = orders.filter((o) => !['delivered', 'returned'].includes(o.status)).length;

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold">รอบ {time} น.</span>
        <span className="badge bg-slate-100 text-slate-600">
          {round.status === 'locked' ? 'พร้อมรับ' : `เหลือ ${remaining} จุด`}
        </span>
      </div>

      {round.status === 'locked' ? (
        <button className="btn-primary w-full text-base" onClick={onClaim}>รับรอบนี้ไปส่ง</button>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className={`rounded-lg border p-3 ${['delivered', 'returned'].includes(o.status) ? 'border-slate-100 bg-slate-50 opacity-70' : 'border-slate-200'}`}>
              <div className="text-base font-semibold">จุด {o.stop_sequence ?? '-'} · {o.recipient_name || 'ลูกค้า'}</div>
              <div className="mt-1 text-sm text-slate-700">{o.address_text || 'ไม่มีที่อยู่'}</div>
              {o.recipient_phone && <a href={`tel:${o.recipient_phone}`} className="mt-1 inline-block text-sm font-medium text-brand">📞 {o.recipient_phone}</a>}
              <div className="mt-3 flex flex-col gap-2">
                {o.status === 'out_for_delivery' && <button className="btn-primary w-full" onClick={() => void startStop(o)}>เริ่มไปส่งจุดนี้</button>}
                {o.status === 'delivering' && <button className="btn-primary w-full" onClick={() => void pod(o)}>📷 ถ่ายรูป + ส่งสำเร็จ</button>}
                {['out_for_delivery', 'delivering'].includes(o.status) && <button className="btn-ghost w-full text-red-600" onClick={() => setReturnFor(o)}>ส่งไม่ได้ / ตีกลับ</button>}
                {['delivered', 'returned'].includes(o.status) && <span className="badge bg-slate-200 text-slate-600">{ORDER_STATUS_TH[o.status]}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {returnFor && (
        <ReturnModal
          order={returnFor}
          onClose={() => setReturnFor(null)}
          onDone={async (reason) => {
            try {
              await act('return', returnFor.id, { reason });
              toast('บันทึกตีกลับแล้ว', 'success');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'ไม่สำเร็จ', 'error');
            }
            setReturnFor(null);
          }}
        />
      )}
    </div>
  );
}

function ReturnModal({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const PRESETS = ['ลูกค้าไม่รับสาย', 'ไม่อยู่บ้าน', 'ที่อยู่ผิด', 'ลูกค้ายกเลิก'];
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    onDone(reason.trim());
  }
  return (
    <Modal open title={`ตีกลับ · จุด ${order.stop_sequence ?? '-'}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button type="button" key={p} className={`btn-sm rounded-full border px-3 ${reason === p ? 'border-brand bg-brand text-white' : 'border-slate-300'}`} onClick={() => setReason(p)}>{p}</button>
          ))}
        </div>
        <Field label="เหตุผล">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ระบุเหตุผล" required />
        </Field>
        <button className="btn w-full bg-red-600 text-white hover:bg-red-700">ยืนยันตีกลับ</button>
      </form>
    </Modal>
  );
}
