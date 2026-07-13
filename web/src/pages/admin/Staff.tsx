import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '../../lib/api';
import { EmptyState, Field, Modal, PageHeader, Spinner, useUI } from '../../lib/ui';
import type { PkmRole, Profile } from '../../lib/types';

const ROLES: { key: PkmRole; label: string }[] = [
  { key: 'admin', label: 'แอดมิน' },
  { key: 'stock', label: 'สต็อก' },
  { key: 'packer', label: 'แพ็ค' },
  { key: 'rider', label: 'ไรเดอร์' },
  { key: 'staff', label: 'ทั่วไป' },
];
const roleLabel = (r: string) => ROLES.find((x) => x.key === r)?.label ?? r;

export function Staff() {
  const qc = useQueryClient();
  const { toast, confirm } = useUI();
  const [adding, setAdding] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: async (): Promise<Profile[]> => {
      const res = await invokeFn<{ staff: Profile[] }>('staff-admin', { action: 'list_staff' });
      return res.staff ?? [];
    },
  });

  async function toggleActive(p: Profile) {
    const ok = await confirm({ title: p.active ? 'ปิดใช้งานพนักงาน?' : 'เปิดใช้งานพนักงาน?', message: p.name, danger: p.active });
    if (!ok) return;
    try {
      await invokeFn('staff-admin', { action: 'set_active', profile_id: p.id, active: !p.active });
      await qc.invalidateQueries({ queryKey: ['staff'] });
      toast('บันทึกแล้ว', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ไม่สำเร็จ', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="ทีมงาน" action={<button className="btn-primary btn-sm" onClick={() => setAdding(true)}>+ เพิ่มพนักงาน</button>} />

      {isLoading ? (
        <Spinner />
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title="ยังไม่มีพนักงาน" hint="กด “เพิ่มพนักงาน” เพื่อสร้างบัญชีเข้าระบบ" />
      ) : (
        <div className="space-y-2">
          {staff.map((p) => (
            <div key={p.id} className="card">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{p.name || '—'}</span>
                    {!p.active && <span className="badge bg-slate-200 text-slate-500">ปิด</span>}
                    {!p.user_id && <span className="badge bg-amber-100 text-amber-700">ยังไม่ผูกบัญชี</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.roles.map((r) => <span key={r} className="badge bg-brand/10 text-brand">{roleLabel(r)}</span>)}
                  </div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => void toggleActive(p)}>{p.active ? 'ปิด' : 'เปิด'}</button>
              </div>
              <RoleEditor profile={p} onSaved={() => qc.invalidateQueries({ queryKey: ['staff'] })} />
            </div>
          ))}
        </div>
      )}

      {adding && <AddStaffModal onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await qc.invalidateQueries({ queryKey: ['staff'] }); }} />}
    </div>
  );
}

function RoleEditor({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<PkmRole[]>(profile.roles);
  const [busy, setBusy] = useState(false);

  function toggle(r: PkmRole) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }
  async function save() {
    if (roles.length === 0) return toast('ต้องมีอย่างน้อย 1 หน้าที่', 'error');
    setBusy(true);
    try {
      await invokeFn('staff-admin', { action: 'set_roles', profile_id: profile.id, roles });
      toast('บันทึกหน้าที่แล้ว', 'success');
      setOpen(false);
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button className="mt-2 text-xs font-medium text-brand" onClick={() => setOpen(true)}>แก้หน้าที่</button>;
  }
  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2">
      <div className="flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <button key={r.key} type="button" onClick={() => toggle(r.key)}
            className={`btn-sm rounded-full border px-3 ${roles.includes(r.key) ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white'}`}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button className="btn-primary btn-sm flex-1" onClick={() => void save()} disabled={busy}>บันทึก</button>
        <button className="btn-ghost btn-sm flex-1" onClick={() => { setRoles(profile.roles); setOpen(false); }}>ยกเลิก</button>
      </div>
    </div>
  );
}

function AddStaffModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [roles, setRoles] = useState<PkmRole[]>(['packer']);
  const [busy, setBusy] = useState(false);

  function toggle(r: PkmRole) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 6 || roles.length === 0) {
      return toast('กรอกชื่อ อีเมล รหัสผ่าน (≥6) และหน้าที่', 'error');
    }
    setBusy(true);
    try {
      await invokeFn('staff-admin', { action: 'create_login', name: name.trim(), email: email.trim(), password, phone: phone.trim() || undefined, roles });
      toast('สร้างบัญชีพนักงานแล้ว', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'สร้างไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="เพิ่มพนักงาน + บัญชีเข้าระบบ" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="ชื่อพนักงาน"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="อีเมล (สำหรับเข้าสู่ระบบ)"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="รหัสผ่าน (อย่างน้อย 6 ตัว)"><input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="ตั้งรหัสให้พนักงาน" required /></Field>
        <Field label="เบอร์โทร (ไม่บังคับ)"><input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="หน้าที่">
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button key={r.key} type="button" onClick={() => toggle(r.key)}
                className={`btn-sm rounded-full border px-3 ${roles.includes(r.key) ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'กำลังสร้าง…' : 'สร้างบัญชี'}</button>
      </form>
    </Modal>
  );
}
