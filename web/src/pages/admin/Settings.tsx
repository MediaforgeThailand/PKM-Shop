import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Field, PageHeader, Spinner, useUI } from '../../lib/ui';

// Friendly, labelled settings — no raw JSON. Each field maps to one app_settings key
// (value stored as a jsonb number/string). PromptPay lives on the tenant row.
type NumField = { key: string; label: string; unit?: string; hint?: string };

const GROUPS: { title: string; fields: NumField[] }[] = [
  {
    title: 'ค่าจัดส่ง',
    fields: [
      { key: 'normal_fee', label: 'ค่าส่งปกติ (ไรเดอร์ร้าน)', unit: 'บาท' },
      { key: 'express_surcharge', label: 'ค่าส่งด่วน (บวกเพิ่มจากปกติ)', unit: 'บาท' },
      { key: 'kerry_fee', label: 'ค่าส่ง Kerry', unit: 'บาท' },
      { key: 'lalamove_per_km_over_14', label: 'Lalamove เกิน 14 กม. (ต่อ กม.)', unit: 'บาท' },
      { key: 'service_radius_km', label: 'รัศมีที่ไรเดอร์ร้านวิ่งเอง', unit: 'กม.' },
    ],
  },
  {
    title: 'ค่าตอบแทนพนักงาน',
    fields: [
      { key: 'rider_fee_per_round', label: 'ค่ารอบไรเดอร์ (ต่อ 1 รอบ)', unit: 'บาท' },
      { key: 'packer_commission_per_piece', label: 'ค่าคอมแพ็ค (ต่อชิ้น)', unit: 'บาท', hint: 'คิดเท่ากันทุกสินค้า' },
    ],
  },
  {
    title: 'ร้าน & การเข้างาน',
    fields: [
      { key: 'store_lat', label: 'พิกัดร้าน (ละติจูด)', hint: 'ใช้คิดระยะส่ง/เช็คอิน' },
      { key: 'store_lng', label: 'พิกัดร้าน (ลองจิจูด)' },
      { key: 'checkin_radius_m', label: 'รัศมีเช็คอินเข้างาน', unit: 'เมตร' },
      { key: 'payment_window_min', label: 'เวลาให้ลูกค้าชำระเงิน', unit: 'นาที' },
    ],
  },
];

export function Settings() {
  const qc = useQueryClient();
  const { toast } = useUI();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? '';

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data } = await supabase.from('app_settings').select('key,value');
      const map: Record<string, unknown> = {};
      for (const r of (data as { key: string; value: unknown }[]) ?? []) map[r.key] = r.value;
      return map;
    },
  });
  const { data: tenant } = useQuery({
    queryKey: ['tenant-row'],
    queryFn: async (): Promise<{ promptpay_id: string | null } | null> => {
      const { data } = await supabase.from('tenants').select('promptpay_id').eq('id', tenantId).maybeSingle();
      return (data as { promptpay_id: string | null }) ?? null;
    },
    enabled: Boolean(tenantId),
  });

  async function saveSetting(key: string, raw: string) {
    const trimmed = raw.trim();
    const value: unknown = trimmed === '' ? null : Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
    const { error } = await supabase.from('app_settings').update({ value }).eq('tenant_id', tenantId).eq('key', key);
    if (error) return toast(error.message, 'error');
    await qc.invalidateQueries({ queryKey: ['settings'] });
    toast('บันทึกแล้ว', 'success');
  }

  async function savePromptPay(raw: string) {
    const { error } = await supabase.from('tenants').update({ promptpay_id: raw.trim() || null }).eq('id', tenantId);
    if (error) return toast(error.message, 'error');
    await qc.invalidateQueries({ queryKey: ['tenant-row'] });
    toast('บันทึก PromptPay แล้ว', 'success');
  }

  if (isLoading || !settings) return <Spinner />;

  function fmt(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' || typeof v === 'string') return String(v);
    return JSON.stringify(v);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="ตั้งค่าร้าน" />
      <p className="text-xs text-slate-400">แก้ตัวเลขแล้วแตะที่อื่นเพื่อบันทึกอัตโนมัติ</p>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">การรับเงิน</h2>
        <Field label="พร้อมเพย์ (เบอร์/เลขบัตร ปชช.)" hint="ใช้สร้าง QR ให้ลูกค้าจ่าย">
          <input className="input" defaultValue={tenant?.promptpay_id ?? ''} placeholder="0812345678" onBlur={(e) => void savePromptPay(e.target.value)} />
        </Field>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="card space-y-3">
          <h2 className="text-sm font-semibold text-slate-500">{g.title}</h2>
          {g.fields.map((f) => (
            <Field key={f.key} label={f.unit ? `${f.label} (${f.unit})` : f.label} hint={f.hint}>
              <input
                className="input"
                inputMode="decimal"
                defaultValue={fmt(settings[f.key])}
                onBlur={(e) => void saveSetting(f.key, e.target.value)}
              />
            </Field>
          ))}
        </section>
      ))}
    </div>
  );
}
