import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFn } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, useUI } from '../../lib/ui';
import type { PkmRole, Profile, Shift } from '../../lib/types';

const ROLES: { key: PkmRole; label: string }[] = [
  { key: 'admin', label: 'แอดมิน' },
  { key: 'stock', label: 'สต็อก' },
  { key: 'packer', label: 'แพ็ค' },
  { key: 'rider', label: 'ไรเดอร์' },
  { key: 'staff', label: 'ทั่วไป' },
];
const roleLabel = (r: string) => ROLES.find((x) => x.key === r)?.label ?? r;

// shifts.start_time/end_time are Postgres `time` — 'HH:MM:SS' on read, and we pad the
// <input type="time"> 'HH:MM' back to 'HH:MM:00' on write.
const toInputTime = (t: string) => t.slice(0, 5);
const toDbTime = (t: string) => (t.length === 5 ? `${t}:00` : t);

export function Staff() {
  const qc = useQueryClient();
  const { toast, confirm } = useUI();
  const [adding, setAdding] = useState(false);
  const [editingRoles, setEditingRoles] = useState<Profile | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [shiftModal, setShiftModal] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });

  const { data: staff = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['staff'],
    queryFn: async (): Promise<Profile[]> => {
      const res = await invokeFn<{ staff: Profile[] }>('staff-admin', { action: 'list_staff' });
      return res.staff ?? [];
    },
  });

  const { data: shifts = [], isLoading: shiftsLoading, isError: shiftsIsError, refetch: refetchShifts } = useQuery({
    queryKey: ['shifts'],
    queryFn: async (): Promise<Shift[]> => {
      const { data, error } = await supabase
        .from('shifts')
        .select('id,name,start_time,end_time,active')
        .order('start_time', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as Shift[]) ?? [];
    },
  });

  async function toggleActive(p: Profile) {
    const ok = await confirm({
      title: p.active ? 'ปิดใช้งานพนักงาน?' : 'เปิดใช้งานพนักงาน?',
      message: p.name,
      danger: p.active,
    });
    if (!ok) return;
    try {
      await invokeFn('staff-admin', { action: 'set_active', profile_id: p.id, active: !p.active });
      await qc.invalidateQueries({ queryKey: ['staff'] });
      toast('บันทึกแล้ว', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ไม่สำเร็จ', 'error');
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast('คัดลอกรหัสแล้ว', 'success');
    } catch {
      toast('คัดลอกไม่สำเร็จ — กรุณาจดรหัสด้วยตนเอง', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ทีมงาน"
        action={<button className="btn-primary btn-sm" onClick={() => setAdding(true)}>+ เพิ่มพนักงาน</button>}
      />

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : staff.length === 0 ? (
        <EmptyState icon="👥" title="ยังไม่มีพนักงาน" hint="กด “เพิ่มพนักงาน” เพื่อสร้างบัญชีเข้าระบบ" />
      ) : (
        <div className="space-y-2">
          {staff.map((p) => {
            const linkCode = p.link_code;
            return (
              <div key={p.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{p.name || '—'}</span>
                      {!p.active && <span className="badge bg-slate-200 text-slate-500">ปิดใช้งาน</span>}
                      {!p.user_id && <span className="badge bg-amber-100 text-amber-700">ยังไม่มีบัญชีเข้าระบบ</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.roles.map((r) => (
                        <span key={r} className="badge bg-brand/10 text-brand">{roleLabel(r)}</span>
                      ))}
                    </div>
                  </div>
                  <button className="btn-ghost btn-sm shrink-0" onClick={() => void toggleActive(p)}>
                    {p.active ? 'ปิด' : 'เปิด'}
                  </button>
                </div>

                {/* LINE link status */}
                {p.line_user_id ? (
                  <div className="mt-2 text-xs font-medium text-green-700">LINE: ผูกแล้ว ✅</div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2 py-1.5">
                    <span className="text-xs font-medium text-amber-700">ยังไม่ผูก LINE</span>
                    {linkCode && (
                      <>
                        <code className="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-700 ring-1 ring-amber-200">
                          {linkCode}
                        </code>
                        <button className="btn-ghost btn-sm" onClick={() => void copyCode(linkCode)}>คัดลอก</button>
                      </>
                    )}
                  </div>
                )}

                <button className="mt-2 text-sm font-medium text-brand" onClick={() => setEditingRoles(p)}>
                  แก้หน้าที่
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Shifts (Ready.md §3.8: shift definitions are admin-editable data) ── */}
      <section className="space-y-2">
        <PageHeader
          title="กะการทำงาน"
          action={<button className="btn-ghost btn-sm" onClick={() => setShiftModal({ open: true, shift: null })}>+ เพิ่มกะ</button>}
        />
        {shiftsLoading ? (
          <Spinner />
        ) : shiftsIsError ? (
          <ErrorState onRetry={() => void refetchShifts()} />
        ) : shifts.length === 0 ? (
          <EmptyState icon="🕐" title="ยังไม่มีกะ" hint="กด “เพิ่มกะ” เพื่อกำหนดช่วงเวลาเข้างาน" />
        ) : (
          <div className="space-y-2">
            {shifts.map((s) => (
              <button
                key={s.id}
                type="button"
                className="card block w-full text-left"
                onClick={() => setShiftModal({ open: true, shift: s })}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{s.name}</span>
                      {!s.active && <span className="badge bg-slate-200 text-slate-500">ปิดใช้งาน</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {toInputTime(s.start_time)} – {toInputTime(s.end_time)} น.
                    </div>
                  </div>
                  <span className="text-sm font-medium text-brand">แก้ไข</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {adding && (
        <AddStaffModal
          onClose={() => setAdding(false)}
          onDone={async (code) => {
            setAdding(false);
            await qc.invalidateQueries({ queryKey: ['staff'] });
            setCreatedCode(code ?? ''); // '' → success modal with a "see the card" fallback
          }}
        />
      )}

      {editingRoles && (
        <RoleEditorModal
          profile={editingRoles}
          onClose={() => setEditingRoles(null)}
          onSaved={async () => {
            setEditingRoles(null);
            await qc.invalidateQueries({ queryKey: ['staff'] });
          }}
        />
      )}

      {createdCode !== null && (
        <Modal open title="สร้างบัญชีสำเร็จ" onClose={() => setCreatedCode(null)}>
          {createdCode ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-600">ส่งรหัสนี้ให้พนักงานพิมพ์ใน LINE OA เพื่อผูกบัญชี</p>
              <code className="block rounded-xl bg-slate-100 px-4 py-3 font-mono text-2xl font-bold tracking-widest text-slate-800">
                {createdCode}
              </code>
              <button className="btn-primary w-full" onClick={() => void copyCode(createdCode)}>คัดลอกรหัส</button>
            </div>
          ) : (
            <p className="text-sm text-slate-600">สร้างบัญชีแล้ว — ดูรหัสผูก LINE ได้ที่การ์ดพนักงานในหน้านี้</p>
          )}
          <button className="btn-ghost mt-3 w-full" onClick={() => setCreatedCode(null)}>ปิด</button>
        </Modal>
      )}

      {shiftModal.open && (
        <ShiftModal
          shift={shiftModal.shift}
          onClose={() => setShiftModal({ open: false, shift: null })}
          onSaved={async () => {
            setShiftModal({ open: false, shift: null });
            await qc.invalidateQueries({ queryKey: ['shifts'] });
          }}
        />
      )}
    </div>
  );
}

function RoleEditorModal({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUI();
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
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`หน้าที่ของ ${profile.name || 'พนักงาน'}`} onClose={onClose}>
      <div className="space-y-1">
        {ROLES.map((r) => (
          <label key={r.key} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-slate-50">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300"
              checked={roles.includes(r.key)}
              onChange={() => toggle(r.key)}
            />
            <span className="text-sm font-medium">{r.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn-ghost flex-1" onClick={onClose}>ยกเลิก</button>
        <button className="btn-primary flex-1" onClick={() => void save()} disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </Modal>
  );
}

function AddStaffModal({ onClose, onDone }: { onClose: () => void; onDone: (linkCode: string | null) => void }) {
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
      return toast('กรอกชื่อ อีเมล รหัสผ่าน (≥6 ตัว) และหน้าที่อย่างน้อย 1 อย่าง', 'error');
    }
    setBusy(true);
    try {
      const res = await invokeFn<{ profile: Profile | null }>('staff-admin', {
        action: 'create_login',
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        roles,
      });
      toast('สร้างบัญชีพนักงานแล้ว', 'success');
      onDone(res.profile?.link_code ?? null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'สร้างไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="เพิ่มพนักงาน + บัญชีเข้าระบบ" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="ชื่อพนักงาน">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="อีเมล (สำหรับเข้าสู่ระบบ)">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="รหัสผ่าน (อย่างน้อย 6 ตัว)">
          <input
            className="input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ตั้งรหัสให้พนักงาน"
            required
          />
        </Field>
        <Field label="เบอร์โทร (ไม่บังคับ)">
          <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="หน้าที่">
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => toggle(r.key)}
                className={`btn-sm rounded-full border px-3 ${roles.includes(r.key) ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}
              >
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

// Add/edit a shift row directly (admin RLS allows insert/update on shifts).
function ShiftModal({ shift, onClose, onSaved }: { shift: Shift | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUI();
  const { profile } = useAuth();
  const [name, setName] = useState(shift?.name ?? '');
  const [start, setStart] = useState(shift ? toInputTime(shift.start_time) : '');
  const [end, setEnd] = useState(shift ? toInputTime(shift.end_time) : '');
  const [active, setActive] = useState(shift?.active ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !start || !end) {
      return toast('กรอกชื่อกะ เวลาเริ่ม และเวลาสิ้นสุด', 'error');
    }
    if (!profile?.tenant_id) return toast('ไม่พบข้อมูลร้าน — กรุณาเข้าสู่ระบบใหม่', 'error');
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        start_time: toDbTime(start),
        end_time: toDbTime(end),
        active,
      };
      if (shift) {
        const { data, error } = await supabase.from('shifts').update(payload).eq('id', shift.id).select('id');
        if (error) throw new Error(error.message);
        if (!(data as unknown[] | null)?.length) throw new Error('บันทึกไม่สำเร็จ — เซิร์ฟเวอร์ไม่ยืนยันข้อมูล');
      } else {
        const { error } = await supabase.from('shifts').insert({ tenant_id: profile.tenant_id, ...payload });
        if (error) throw new Error(error.message);
      }
      toast('บันทึกกะแล้ว', 'success');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={shift ? 'แก้ไขกะ' : 'เพิ่มกะ'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="ชื่อกะ" hint="เช่น กะเช้า / กะบ่าย / กะดึก">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="เวลาเริ่ม">
            <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </Field>
          <Field label="เวลาสิ้นสุด">
            <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
        </div>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-1">
          <input type="checkbox" className="h-5 w-5 rounded border-slate-300" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className="text-sm font-medium">เปิดใช้งานกะนี้</span>
        </label>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </form>
    </Modal>
  );
}
