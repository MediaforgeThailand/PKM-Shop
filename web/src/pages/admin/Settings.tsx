import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { ErrorState, Field, PageHeader, Spinner, useUI } from '../../lib/ui';

// Friendly, labelled settings — no raw JSON. Each field maps to one app_settings key.
// The value column is jsonb: numbers are stored as jsonb numbers, strings as jsonb strings
// (we pass raw JS values). Saves go through UPSERT on (tenant_id,key) so a missing seed row
// is created instead of silently no-op'ing an UPDATE, and the returned row is verified
// before we toast success. PromptPay lives on the tenants row (separate update).

type SettingField = {
  key: string;
  label: string;
  kind: 'number' | 'string';
  unit?: string;
  hint?: string;
  placeholder?: string;
};

const DELIVERY_FIELDS: SettingField[] = [
  { key: 'normal_fee', label: 'ค่าส่งปกติ (ไรเดอร์ร้าน)', kind: 'number', unit: 'บาท' },
  { key: 'express_surcharge', label: 'ค่าส่งด่วน (บวกเพิ่มจากค่าส่งปกติ)', kind: 'number', unit: 'บาท' },
  { key: 'kerry_fee', label: 'ค่าส่งพัสดุ Kerry', kind: 'number', unit: 'บาท' },
  { key: 'lalamove_per_km_over_14', label: 'Lalamove ส่วนที่เกิน 14 กม. (ต่อ กม.)', kind: 'number', unit: 'บาท' },
];

const ZONE_FIELDS: SettingField[] = [
  { key: 'service_radius_km', label: 'รัศมีให้บริการไรเดอร์ร้าน', kind: 'number', unit: 'กม.', hint: 'เกินรัศมีนี้ระบบเสนอ Lalamove/Kerry' },
  { key: 'store_lat', label: 'พิกัดร้าน — ละติจูด', kind: 'number', hint: 'ใช้คำนวณระยะส่งและเช็คอินพนักงาน' },
  { key: 'store_lng', label: 'พิกัดร้าน — ลองจิจูด', kind: 'number' },
];

const SYSTEM_FIELDS: SettingField[] = [
  { key: 'rider_fee_per_round', label: 'ค่ารอบไรเดอร์ (ต่อ 1 รอบ)', kind: 'number', unit: 'บาท' },
  { key: 'packer_commission_per_piece', label: 'ค่าคอมแพ็ค (ต่อชิ้น)', kind: 'number', unit: 'บาท', hint: 'คิดเท่ากันทุกสินค้า' },
  { key: 'checkin_radius_m', label: 'รัศมีเช็คอินเข้างาน', kind: 'number', unit: 'เมตร' },
  { key: 'payment_window_min', label: 'เวลาให้ลูกค้าชำระเงิน', kind: 'number', unit: 'นาที' },
  { key: 'ai_model', label: 'โมเดล AI', kind: 'string', hint: 'โมเดล AI ผู้ช่วยขาย', placeholder: 'claude-sonnet-4-6' },
];

type LalamoveTier = { max_km?: number; fee?: number };

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return JSON.stringify(v);
}

export function Settings() {
  const qc = useQueryClient();
  const { toast } = useUI();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? '';

  const { data: settings, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase.from('app_settings').select('key,value');
      if (error) throw new Error(error.message);
      const map: Record<string, unknown> = {};
      for (const r of (data as { key: string; value: unknown }[]) ?? []) map[r.key] = r.value;
      return map;
    },
  });

  const { data: tenant, isLoading: tenantLoading, isError: tenantIsError, refetch: refetchTenant } = useQuery({
    queryKey: ['tenant-row'],
    queryFn: async (): Promise<{ promptpay_id: string | null } | null> => {
      const { data, error } = await supabase.from('tenants').select('promptpay_id').eq('id', tenantId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { promptpay_id: string | null } | null) ?? null;
    },
    enabled: Boolean(tenantId),
  });

  async function saveSetting(field: SettingField, raw: string) {
    if (!tenantId) return toast('ไม่พบข้อมูลร้าน — กรุณาเข้าสู่ระบบใหม่', 'error');
    const trimmed = raw.trim();
    // Skip untouched fields so blur alone doesn't spam writes.
    if (trimmed === fmt(settings?.[field.key])) return;

    let value: number | string;
    if (field.kind === 'number') {
      const n = Number(trimmed);
      if (trimmed === '' || !Number.isFinite(n)) {
        return toast(`"${field.label}" ต้องเป็นตัวเลข — ยังไม่ได้บันทึก`, 'error');
      }
      value = n; // jsonb number
    } else {
      value = trimmed; // jsonb string
    }

    // UPSERT: creates the row when the seed key is missing (UPDATE-by-key would silently no-op).
    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ tenant_id: tenantId, key: field.key, value }, { onConflict: 'tenant_id,key' })
      .select('key,value');
    if (error) return toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error');
    const saved = (data as { key: string; value: unknown }[] | null)?.[0];
    if (!saved) return toast('บันทึกไม่สำเร็จ — เซิร์ฟเวอร์ไม่ยืนยันข้อมูล กรุณาลองใหม่', 'error');
    await qc.invalidateQueries({ queryKey: ['settings'] });
    toast('บันทึกแล้ว', 'success');
  }

  async function savePromptPay(raw: string) {
    if (!tenantId) return toast('ไม่พบข้อมูลร้าน — กรุณาเข้าสู่ระบบใหม่', 'error');
    const trimmed = raw.trim();
    if (trimmed === (tenant?.promptpay_id ?? '')) return;
    const { data, error } = await supabase
      .from('tenants')
      .update({ promptpay_id: trimmed || null })
      .eq('id', tenantId)
      .select('promptpay_id');
    if (error) return toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error');
    if (!(data as unknown[] | null)?.length) {
      return toast('บันทึกไม่สำเร็จ — เซิร์ฟเวอร์ไม่ยืนยันข้อมูล กรุณาลองใหม่', 'error');
    }
    await qc.invalidateQueries({ queryKey: ['tenant-row'] });
    toast('บันทึกพร้อมเพย์แล้ว', 'success');
  }

  if (isLoading || tenantLoading) return <Spinner />;
  if (isError || tenantIsError || !settings) {
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
          void refetchTenant();
        }}
      />
    );
  }

  const tiers: LalamoveTier[] = Array.isArray(settings['lalamove_tiers'])
    ? (settings['lalamove_tiers'] as LalamoveTier[])
    : [];

  const renderField = (f: SettingField) => (
    <Field key={f.key} label={f.unit ? `${f.label} (${f.unit})` : f.label} hint={f.hint}>
      <input
        className="input"
        inputMode={f.kind === 'number' ? 'decimal' : undefined}
        placeholder={f.placeholder}
        defaultValue={fmt(settings[f.key])}
        onBlur={(e) => void saveSetting(f, e.target.value)}
      />
    </Field>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="ตั้งค่าร้าน" />
      <p className="text-xs text-slate-400">แก้ค่าแล้วแตะที่อื่นเพื่อบันทึกอัตโนมัติ — ระบบยืนยันทุกครั้งว่าบันทึกสำเร็จ</p>

      {/* 1) ค่าจัดส่ง */}
      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">ค่าจัดส่ง</h2>
        {DELIVERY_FIELDS.map(renderField)}
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">ขั้นราคา Lalamove ตามระยะทาง</span>
          {tiers.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-3 py-2 font-medium">ไม่เกิน (กม.)</th>
                    <th className="px-3 py-2 font-medium">ค่าส่ง (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2">{t.max_km ?? '—'}</td>
                      <td className="px-3 py-2">{t.fee ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">ยังไม่มีข้อมูลขั้นราคา</div>
          )}
          <span className="mt-1 block text-xs text-slate-400">ตารางนี้แสดงอย่างเดียว — แก้ไขผ่านทีมเทคนิค</span>
        </div>
      </section>

      {/* 2) เขตบริการ */}
      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">เขตบริการ</h2>
        {ZONE_FIELDS.map(renderField)}
      </section>

      {/* 3) บัญชีรับเงิน */}
      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">บัญชีรับเงิน</h2>
        <Field label="เลขบัญชีรับโอน" hint="เลขบัญชีที่รับโอน ใช้ตรวจสลิปอัตโนมัติ">
          <input
            className="input"
            defaultValue={fmt(settings['store_receiver_account'])}
            placeholder="เช่น 1234567890"
            onBlur={(e) => void saveSetting({ key: 'store_receiver_account', label: 'เลขบัญชีรับโอน', kind: 'string' }, e.target.value)}
          />
        </Field>
        <Field label="พร้อมเพย์ (เบอร์/เลขบัตร ปชช.)" hint="พร้อมเพย์ที่ใช้สร้าง QR ให้ลูกค้าชำระ">
          <input
            className="input"
            defaultValue={tenant?.promptpay_id ?? ''}
            placeholder="0812345678"
            onBlur={(e) => void savePromptPay(e.target.value)}
          />
        </Field>
      </section>

      {/* 4) พนักงานและระบบ */}
      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">พนักงานและระบบ</h2>
        {SYSTEM_FIELDS.map(renderField)}
      </section>
    </div>
  );
}
