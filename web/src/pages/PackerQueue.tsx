import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invokeFn, uploadToBucket } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EmptyState, ErrorState, Spinner, useUI } from '../lib/ui';
import type { Order } from '../lib/types';

export function PackerQueue() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useUI();
  const tenantId = profile?.tenant_id ?? '';

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['packer-queue'],
    refetchInterval: 10_000,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,order_no,status,payment_status,delivery_type,goods_total,delivery_fee,grand_total,recipient_name,recipient_phone,address_text,round_id,stop_sequence,external_ref,created_at')
        .in('status', ['confirmed', 'packing'])
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data as Order[]) ?? [];
    },
  });

  async function claim(id: string) {
    try {
      await invokeFn('packer-action', { action: 'claim', order_id: id });
      await qc.invalidateQueries({ queryKey: ['packer-queue'] });
      toast('รับงานแพ็คแล้ว', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'รับงานไม่สำเร็จ', 'error');
    }
  }

  function pack(id: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
        await uploadToBucket('packing', path, file);
        await invokeFn('packer-action', { action: 'pack', order_id: id, photo_path: path });
        await qc.invalidateQueries({ queryKey: ['packer-queue'] });
        toast('แพ็คเสร็จ แจ้งลูกค้าแล้ว', 'success');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'แพ็คไม่สำเร็จ', 'error');
      }
    };
    input.click();
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">คิวแพ็คของ</h1>
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <EmptyState icon="🎁" title="ไม่มีของต้องแพ็คตอนนี้" />
      ) : (
        orders.map((o) => (
          <div key={o.id} className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm font-semibold">{o.order_no}</span>
              <span className="badge bg-slate-100 text-slate-600">{o.status === 'confirmed' ? 'รอแพ็ค' : 'กำลังแพ็ค'}</span>
            </div>
            <div className="mb-2 text-xs text-slate-500">{o.recipient_name || 'ลูกค้า'} · ฿{o.grand_total.toLocaleString('th-TH')}</div>
            {o.status === 'confirmed' ? (
              <button className="btn-primary w-full" onClick={() => void claim(o.id)}>รับงานแพ็ค</button>
            ) : (
              <button className="btn-primary w-full" onClick={() => pack(o.id)}>📷 ถ่ายรูป + แพ็คเสร็จ</button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
