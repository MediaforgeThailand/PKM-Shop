import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn, signedUrl } from '../../lib/api';
import { EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, baht, useUI } from '../../lib/ui';
import { DELIVERY_TYPE_TH, ORDER_STATUS_TH, type DeliveryType, type OrderStatus } from '../../lib/types';

// Page-local shape: pending payments joined to their order (Ready.md §3.6 manual queue).
type SlipOrder = {
  order_no: string;
  grand_total: number;
  delivery_type: DeliveryType;
  recipient_name: string | null;
  status: OrderStatus;
};

type SlipRow = {
  id: string;
  order_id: string;
  amount: number;
  kind: 'goods' | 'delivery' | 'redelivery';
  slip_photo_url: string | null;
  note: string | null;
  created_at: string;
  orders: SlipOrder | null;
};

const KIND_TH: Record<SlipRow['kind'], string> = {
  goods: 'ค่าสินค้า',
  delivery: 'ค่าส่ง',
  redelivery: 'ค่าส่งรอบใหม่',
};

// slip-verify stores the auto-check failure code in payments.note → Thai chip label
// so the admin sees WHY the slip landed in the manual queue.
const NOTE_TH: Record<string, string> = {
  wrong_account: 'บัญชีผู้รับไม่ตรงกับร้าน',
  amount_unverified: 'ตรวจยอดเงินไม่ผ่าน',
  not_configured: 'ยังไม่ได้เชื่อม SlipOK',
  slipok_quota_exceeded: 'โควต้าตรวจสลิปหมด',
  error: 'ระบบตรวจสลิปขัดข้อง',
};

function noteLabel(note: string | null): string {
  if (!note) return 'รอตรวจด้วยตนเอง';
  return NOTE_TH[note] ?? note;
}

// Inline slip preview with its own signed-URL fetch (tap to zoom via onZoom).
function SlipImage({ path, onZoom }: { path: string; onZoom: (url: string) => void }) {
  const { data: url, isLoading, isError, refetch } = useQuery({
    queryKey: ['slip-url', path],
    staleTime: 30 * 60_000, // signed URL lives 1h — refresh well before expiry
    queryFn: async (): Promise<string> => {
      const u = await signedUrl('payment-slips', path);
      if (!u) throw new Error('สร้างลิงก์รูปสลิปไม่สำเร็จ');
      return u;
    },
  });
  if (isLoading) {
    return <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">กำลังโหลดรูปสลิป…</div>;
  }
  if (isError || !url) {
    return <ErrorState onRetry={() => void refetch()} />;
  }
  return (
    <button type="button" className="block w-full" onClick={() => onZoom(url)} aria-label="แตะเพื่อขยายรูปสลิป">
      <img src={url} alt="สลิปโอนเงิน" className="max-h-64 w-full rounded-lg bg-slate-100 object-contain" />
      <span className="mt-1 block text-center text-xs text-slate-400">แตะรูปเพื่อขยาย</span>
    </button>
  );
}

function RejectModal({ payment, onClose, onDone }: { payment: SlipRow; onClose: () => void; onDone: () => Promise<void> }) {
  const { toast } = useUI();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed) return toast('กรุณาระบุเหตุผลที่ปฏิเสธ', 'error');
    setBusy(true);
    try {
      await invokeFn('admin-action', { action: 'reject_payment', payment_id: payment.id, reason: trimmed });
      toast('ปฏิเสธสลิปแล้ว ระบบแจ้งลูกค้าให้เรียบร้อย', 'success');
      await onDone();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ปฏิเสธไม่สำเร็จ', 'error');
      setBusy(false);
    }
  }

  return (
    <Modal open title={`ปฏิเสธสลิป · ${payment.orders?.order_no ?? ''}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">ลูกค้าจะได้รับแจ้งเหตุผลนี้ และต้องส่งสลิปที่ถูกต้องใหม่</p>
        <Field label="เหตุผลที่ปฏิเสธ (บังคับ)">
          <textarea
            className="input min-h-[96px]"
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ยอดเงินไม่ตรงกับออเดอร์ / สลิปไม่ชัด / โอนผิดบัญชี"
          />
        </Field>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>ยกเลิก</button>
          <button
            className="btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            disabled={busy || reason.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? 'กำลังปฏิเสธ…' : 'ปฏิเสธสลิป'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SlipQueue() {
  const { toast, confirm } = useUI();
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<SlipRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['slip-queue'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<SlipRow[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('id,order_id,amount,kind,slip_photo_url,note,created_at,orders(order_no,grand_total,delivery_type,recipient_name,status)')
        .eq('status', 'pending_verify')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as unknown as SlipRow[]) ?? [];
    },
  });

  async function confirmPay(p: SlipRow) {
    const ok = await confirm({
      title: 'ยืนยันว่าได้รับเงินแล้ว?',
      message: `${p.orders?.order_no ?? ''} · ${KIND_TH[p.kind]} ${baht(p.amount)} — ตรวจสลิปกับยอดเข้าบัญชีแล้วใช่ไหม`,
      confirmText: 'ยืนยันชำระ',
    });
    if (!ok) return;
    setBusyId(p.id);
    try {
      await invokeFn('admin-action', { action: 'confirm_payment', payment_id: p.id });
      toast('ยืนยันชำระแล้ว เข้าสู่รอบจัดส่ง', 'success');
      await refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="คิวตรวจสลิป" />
      <p className="text-xs text-slate-400">สลิปที่ระบบตรวจอัตโนมัติไม่ผ่าน หรือยังไม่ได้เชื่อม SlipOK จะมารอตรงนี้</p>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="🎉" title="ไม่มีสลิปรอตรวจ" />
      ) : (
        rows.map((p) => (
          <div key={p.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold">{p.orders?.order_no ?? p.order_id}</div>
                <div className="truncate text-xs text-slate-500">
                  {p.orders?.recipient_name || 'ลูกค้า'} · {p.orders ? DELIVERY_TYPE_TH[p.orders.delivery_type] : '—'}
                </div>
                <div className="text-xs text-slate-400">
                  ส่งสลิปเมื่อ {new Date(p.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-bold">{baht(p.amount)}</div>
                <div className="text-xs text-slate-400">{KIND_TH[p.kind]}{p.orders ? ` · ออเดอร์รวม ${baht(p.orders.grand_total)}` : ''}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="badge bg-red-100 text-red-700">⚠ {noteLabel(p.note)}</span>
              {p.orders && <span className="badge bg-slate-100 text-slate-700">{ORDER_STATUS_TH[p.orders.status]}</span>}
            </div>

            {p.slip_photo_url ? (
              <SlipImage path={p.slip_photo_url} onZoom={setZoomUrl} />
            ) : (
              <div className="rounded-lg bg-slate-50 py-6 text-center text-xs text-slate-400">ไม่มีรูปสลิปแนบ</div>
            )}

            <div className="flex gap-2">
              <button
                className="btn flex-1 border border-red-300 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                disabled={busyId === p.id}
                onClick={() => setRejecting(p)}
              >
                ปฏิเสธ
              </button>
              <button className="btn-primary flex-1" disabled={busyId === p.id} onClick={() => void confirmPay(p)}>
                {busyId === p.id ? 'กำลังยืนยัน…' : 'ยืนยันชำระ'}
              </button>
            </div>
          </div>
        ))
      )}

      {zoomUrl && (
        <Modal open title="สลิปโอนเงิน" onClose={() => setZoomUrl(null)}>
          <img src={zoomUrl} alt="สลิปโอนเงิน (ขยาย)" className="w-full rounded-lg object-contain" />
        </Modal>
      )}

      {rejecting && (
        <RejectModal
          payment={rejecting}
          onClose={() => setRejecting(null)}
          onDone={async () => {
            await refetch();
          }}
        />
      )}
    </div>
  );
}
