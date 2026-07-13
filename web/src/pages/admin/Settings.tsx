import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

type Setting = { key: string; value: unknown };

export function Settings() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? '';

  const { data: settings = [] } = useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Setting[]> => {
      const { data } = await supabase.from('app_settings').select('key,value').order('key');
      return (data as Setting[]) ?? [];
    },
  });

  async function save(key: string, raw: string) {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw; // treat plain text as string
    }
    const { error } = await supabase.from('app_settings').update({ value }).eq('tenant_id', tenantId).eq('key', key);
    if (error) alert(error.message);
    await qc.invalidateQueries({ queryKey: ['settings'] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">ตั้งค่า (เรท/รัศมี/เวลา)</h1>
      <p className="text-xs text-slate-400">ค่าทั้งหมดอ่านจากที่นี่ ไม่ hardcode · แก้ค่าเป็น JSON (เช่น 40, "11:00-14:00")</p>
      <div className="space-y-2">
        {settings.map((s) => (
          <div key={s.key} className="card flex items-center gap-2">
            <label className="w-56 shrink-0 font-mono text-xs text-slate-600">{s.key}</label>
            <input
              className="input flex-1"
              defaultValue={JSON.stringify(s.value)}
              onBlur={(e) => void save(s.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
