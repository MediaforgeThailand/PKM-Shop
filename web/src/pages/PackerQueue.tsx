import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invokeFn, uploadToBucket } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EmptyState, ErrorState, Modal, PageHeader, PhotoPicker, Spinner, baht, useUI } from '../lib/ui';
import type { Order } from '../lib/types';

// Ready.md §3.1: หลังรอบ lock (นาที :30) แพ็คเกอร์มีเวลา ~30 นาที — คิวนี้ต้องบอกชัดว่า
// "แพ็คอะไร กี่ชิ้น รอบไหน" โดยไม่ต้องเปิดหน้าอื่น

type PackItem = { qty: number; products: { name: string } | null };
type QueueOrder = Order & {
  packer_id: string | null;
  order_items: PackItem[];
  round: { round_at: string } | null;
};

function bkkTime(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date(iso));
}

// รายการที่ต้องแพ็ค — แตะเพื่อติ๊กว่าหยิบแล้ว (สถานะติ๊กอยู่แค่ในเครื่อง ช่วยกันหยิบตกหล่น)
function ItemChecklist({ items }: { items: PackItem[] }) {
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  if (items.length === 0) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">ไม่พบรายการสินค้าของออเดอร์นี้ — เช็คกับแอดมินก่อนแพ็ค</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const checked = done.has(i);
        return (
          <li key={i}>
            <button
              type="button"
              className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors ${
                checked ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50 active:bg-slate-100'
              }`}
              onClick={() =>
                setDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${
                  checked ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 bg-white text-transparent'
                }`}
              >
                ✓
              </span>
              <span className={`flex-1 text-base font-medium ${checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {it.products?.name ?? 'สินค้า'}
              </span>
              <span className={`text-base font-bold ${checked ? 'text-slate-400' : 'text-brand'}`}>× {it.qty}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OrderCard({ order, children }: { order: QueueOrder; children?: ReactNode }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold">{order.order_no}</span>
        <div className="flex items-center gap-1.5">
          {order.round && (
            <span className="badge bg-brand/10 font-semibold text-brand">⏱ รอบ {bkkTime(order.round.round_at)}</span>
          )}
          <span className="badge bg-slate-100 text-slate-600">{order.status === 'confirmed' ? 'รอแพ็ค' : 'กำลังแพ็ค'}</span>
        </div>
      </div>
      <ItemChecklist items={order.order_items} />
      <div className="text-xs text-slate-500">
        {order.recipient_name || 'ลูกค้า'} · {baht(order.grand_total)}
        {order.order_items.length > 0 && ` · รวม ${order.order_items.reduce((s, it) => s + it.qty, 0)} ชิ้น`}
      </div>
      {children}
    </div>
  );
}

export function PackerQueue() {
  const { profile, roles } = useAuth();
  const { toast } = useUI();
  const isAdmin = roles.includes('admin');
  const myId = profile?.id ?? '';

  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [packOrder, setPackOrder] = useState<QueueOrder | null>(null);
  const [packPhoto, setPackPhoto] = useState<File | null>(null);
  const [packBusy, setPackBusy] = useState(false);

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['packer-queue'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<QueueOrder[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,order_no,status,payment_status,delivery_type,goods_total,delivery_fee,grand_total,recipient_name,recipient_phone,address_text,round_id,stop_sequence,external_ref,created_at,packer_id,order_items(qty,products(name)),round:delivery_rounds(round_at)')
        .in('status', ['confirmed', 'packing'])
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data as unknown as QueueOrder[]) ?? [];
    },
  });

  const waiting = orders.filter((o) => o.status === 'confirmed');
  const mine = orders.filter((o) => o.status === 'packing' && (o.packer_id === myId || isAdmin));
  const othersPacking = orders.filter((o) => o.status === 'packing' && o.packer_id !== myId && !isAdmin);

  async function claim(id: string) {
    setClaimingId(id);
    try {
      await invokeFn('packer-action', { action: 'claim', order_id: id });
      toast('รับงานแพ็คแล้ว เริ่มแพ็คได้เลย', 'success');
    } catch (e) {
      // packer-action คืน 409 พร้อมข้อความไทยเมื่อมีคนชิงรับไปก่อน — invokeFn ส่งข้อความนั้นต่อมา
      const msg = e instanceof Error ? e.message : '';
      toast(/มีคนรับ/.test(msg) ? 'มีคนรับงานนี้แล้ว' : msg || 'รับงานไม่สำเร็จ', 'error');
    } finally {
      setClaimingId(null);
      await refetch();
    }
  }

  async function submitPack() {
    if (!packOrder || !packPhoto || !profile) return;
    setPackBusy(true);
    try {
      const path = `${profile.tenant_id}/${crypto.randomUUID()}.jpg`;
      await uploadToBucket('packing', path, packPhoto);
      await invokeFn('packer-action', { action: 'pack', order_id: packOrder.id, photo_path: path });
      toast('แพ็คเสร็จ แจ้งลูกค้าแล้ว', 'success');
      setPackOrder(null);
      setPackPhoto(null);
      await refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'แพ็คไม่สำเร็จ', 'error');
    } finally {
      setPackBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="คิวแพ็คของ" action={<span className="text-xs text-slate-400">อัปเดตทุก 15 วิ</span>} />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState icon="🎁" title="ไม่มีของต้องแพ็คตอนนี้" hint="งานจะเข้าคิวเมื่อรอบถูกปิด (นาทีที่ :30)" />
      ) : (
        <>
          {/* งานของฉัน — กำลังแพ็คอยู่ ต้องปิดงานด้วยรูป */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700">
              งานของฉัน {mine.length > 0 && <span className="badge bg-brand text-white">{mine.length}</span>}
            </h2>
            {mine.length === 0 ? (
              <p className="text-sm text-slate-400">ยังไม่มีงานที่รับไว้ — กด "รับงานแพ็ค" ด้านล่าง</p>
            ) : (
              mine.map((o) => (
                <OrderCard key={o.id} order={o}>
                  <button
                    className="btn-primary w-full"
                    onClick={() => {
                      setPackPhoto(null);
                      setPackOrder(o);
                    }}
                  >
                    📷 แพ็คเสร็จ (ถ่ายรูป)
                  </button>
                </OrderCard>
              ))
            )}
          </section>

          {/* รอรับงาน — ออเดอร์ confirmed ที่ยังไม่มีใครแพ็ค */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700">
              รอรับงาน {waiting.length > 0 && <span className="badge bg-slate-200 text-slate-700">{waiting.length}</span>}
            </h2>
            {waiting.length === 0 ? (
              <p className="text-sm text-slate-400">ไม่มีงานรอรับตอนนี้</p>
            ) : (
              waiting.map((o) => (
                <OrderCard key={o.id} order={o}>
                  <button className="btn-primary w-full" disabled={claimingId === o.id} onClick={() => void claim(o.id)}>
                    {claimingId === o.id ? 'กำลังรับงาน…' : 'รับงานแพ็ค'}
                  </button>
                </OrderCard>
              ))
            )}
          </section>

          {othersPacking.length > 0 && (
            <p className="text-xs text-slate-400">อีก {othersPacking.length} ออเดอร์กำลังแพ็คโดยเพื่อนร่วมทีม</p>
          )}
        </>
      )}

      {/* ปิดงานแพ็ค — บังคับรูปก่อนส่ง */}
      <Modal
        open={packOrder !== null}
        title={`แพ็คเสร็จ · ${packOrder?.order_no ?? ''}`}
        onClose={() => {
          if (!packBusy) {
            setPackOrder(null);
            setPackPhoto(null);
          }
        }}
      >
        {packOrder && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">เช็ครายการให้ครบ แล้วถ่ายรูปของที่แพ็คเสร็จเพื่อยืนยัน</p>
            <ItemChecklist items={packOrder.order_items} />
            <PhotoPicker file={packPhoto} onPick={setPackPhoto} label="ถ่ายรูปของที่แพ็คเสร็จ" required />
            {!packPhoto && <p className="text-xs text-amber-600">ต้องแนบรูปก่อนจึงจะยืนยันได้</p>}
            <button className="btn-primary w-full" disabled={!packPhoto || packBusy} onClick={() => void submitPack()}>
              {packBusy ? 'กำลังส่ง…' : 'ยืนยันแพ็คเสร็จ'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
