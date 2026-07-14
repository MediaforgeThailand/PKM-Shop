import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invokeFn, uploadToBucket } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ErrorState, Field, PageHeader, PhotoPicker, Spinner, useUI } from '../lib/ui';
import type { Shift } from '../lib/types';

// Ready.md §3.8: เช็คอิน = รูป + GPS บังคับทั้งคู่ — ระบบ "บันทึก" pass/fail ไม่บล็อกการทำงาน

function bkkDateTime(iso: string) {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok',
  }).format(new Date(iso));
}

function bkkTime(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date(iso));
}

export function StaffHome() {
  const { profile } = useAuth();
  return (
    <div className="space-y-4">
      <PageHeader title={`สวัสดี ${profile?.name ?? 'พนักงาน'} 👋`} />
      <CheckinCard />
      <TeamChat />
    </div>
  );
}

// ── เช็คอินเข้างาน ─────────────────────────────────────────────────────────

type GpsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; lat: number; lng: number; accuracy: number }
  | { status: 'denied' }
  | { status: 'error' };

type AttendanceRow = { id: string; geofence_pass: boolean | null; checked_in_at: string; shift_id: string | null };

function CheckinCard() {
  const { profile } = useAuth();
  const { toast } = useUI();

  const [photo, setPhoto] = useState<File | null>(null);
  const [shiftId, setShiftId] = useState('');
  const [gps, setGps] = useState<GpsState>({ status: 'idle' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<boolean | null | 'none'>('none');

  function requestGps() {
    if (!('geolocation' in navigator)) {
      setGps({ status: 'error' });
      return;
    }
    setGps({ status: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ status: 'ready', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => setGps({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'error' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }

  useEffect(() => {
    requestGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shiftsQ = useQuery({
    queryKey: ['shifts-active'],
    queryFn: async (): Promise<Shift[]> => {
      const { data, error } = await supabase
        .from('shifts')
        .select('id,name,start_time,end_time,active')
        .eq('active', true)
        .order('start_time');
      if (error) throw new Error(error.message);
      return (data as Shift[]) ?? [];
    },
  });
  const { isLoading: shiftsLoading, isError: shiftsError, refetch: refetchShifts } = shiftsQ;

  const attQ = useQuery({
    queryKey: ['my-attendance', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabase
        .from('attendance')
        .select('id,geofence_pass,checked_in_at,shift_id')
        .eq('profile_id', profile!.id)
        .order('checked_in_at', { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      return (data as AttendanceRow[]) ?? [];
    },
  });
  const { isLoading: attLoading, isError: attError, refetch: refetchAtt } = attQ;

  const canSubmit = Boolean(photo) && gps.status === 'ready' && !busy;

  async function submit() {
    if (!photo || gps.status !== 'ready' || !profile) return;
    setBusy(true);
    try {
      const path = `${profile.tenant_id}/${crypto.randomUUID()}.jpg`;
      await uploadToBucket('checkin', path, photo);
      const res = await invokeFn<{ geofence_pass: boolean | null }>('checkin', {
        photo_path: path,
        lat: gps.lat,
        lng: gps.lng,
        ...(shiftId ? { shift_id: shiftId } : {}),
      });
      setResult(res.geofence_pass);
      toast(res.geofence_pass === false ? 'เช็คอินแล้ว (นอกพื้นที่ — บันทึกไว้แล้ว)' : 'เช็คอินสำเร็จ', res.geofence_pass === false ? 'info' : 'success');
      setPhoto(null);
      await refetchAtt();
    } catch (e) {
      toast(e instanceof Error ? `เช็คอินไม่สำเร็จ: ${e.message}` : 'เช็คอินไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-bold">เช็คอินเข้างาน</h2>

      {/* ผลเช็คอินล่าสุดของรอบนี้ */}
      {result !== 'none' && (
        <div
          className={`rounded-xl px-3 py-2.5 text-sm font-medium ${
            result === false ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'
          }`}
        >
          {result === true && '✅ เช็คอินสำเร็จ — อยู่ในพื้นที่ร้าน'}
          {result === false && '⚠️ อยู่นอกพื้นที่ร้าน — บันทึกแล้ว ไม่บล็อกการทำงาน'}
          {result === null && '✅ บันทึกเช็คอินแล้ว (ร้านยังไม่ตั้งพิกัดสำหรับตรวจรัศมี)'}
        </div>
      )}

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">รูปถ่ายหน้างาน (บังคับ)</span>
        <PhotoPicker file={photo} onPick={setPhoto} label="ถ่ายรูปเช็คอิน" required />
      </div>

      {/* สถานะ GPS — บังคับก่อนเช็คอิน */}
      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">ตำแหน่ง GPS (บังคับ)</span>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          {gps.status === 'idle' && (
            <button type="button" className="btn-ghost btn-sm" onClick={requestGps}>📡 ขอตำแหน่ง</button>
          )}
          {gps.status === 'loading' && (
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
              กำลังหาตำแหน่ง…
            </span>
          )}
          {gps.status === 'ready' && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-green-700">📍 ได้พิกัดแล้ว ±{Math.round(gps.accuracy)} ม.</span>
              <button type="button" className="btn-ghost btn-sm" onClick={requestGps}>ขอใหม่</button>
            </div>
          )}
          {gps.status === 'denied' && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-red-600">ปฏิเสธสิทธิ์ตำแหน่ง — เช็คอินไม่ได้ถ้าไม่มี GPS</p>
              <p className="text-xs text-slate-500">เปิดสิทธิ์ Location ให้เบราว์เซอร์ใน ตั้งค่า → แอป/เว็บไซต์ → ตำแหน่ง แล้วกดลองใหม่</p>
              <button type="button" className="btn-ghost btn-sm" onClick={requestGps}>ลองใหม่</button>
            </div>
          )}
          {gps.status === 'error' && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-red-600">หาตำแหน่งไม่สำเร็จ (สัญญาณ GPS อ่อนหรือหมดเวลา)</p>
              <button type="button" className="btn-ghost btn-sm" onClick={requestGps}>ลองใหม่</button>
            </div>
          )}
        </div>
      </div>

      <Field label="กะทำงาน" hint="เลือกได้ถ้ารู้กะของตัวเอง — ไม่บังคับ">
        {shiftsError ? (
          <ErrorState onRetry={() => void refetchShifts()} />
        ) : shiftsLoading ? (
          <Spinner label="กำลังโหลดกะ…" />
        ) : (
          <select className="input" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">— ไม่ระบุกะ —</option>
            {(shiftsQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <button className="btn-primary w-full" disabled={!canSubmit} onClick={() => void submit()}>
        {busy ? 'กำลังเช็คอิน…' : 'เช็คอิน'}
      </button>
      {!canSubmit && !busy && (
        <p className="text-xs text-slate-400">
          {!photo && gps.status !== 'ready' ? 'ต้องมีรูปถ่ายและพิกัด GPS ก่อนเช็คอิน' : !photo ? 'ต้องถ่ายรูปก่อนเช็คอิน' : 'ต้องได้พิกัด GPS ก่อนเช็คอิน'}
        </p>
      )}

      {/* ประวัติเช็คอิน 5 ครั้งล่าสุด */}
      <div className="border-t border-slate-100 pt-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-600">เช็คอินล่าสุดของฉัน</h3>
        {attError ? (
          <ErrorState onRetry={() => void refetchAtt()} />
        ) : attLoading ? (
          <Spinner label="กำลังโหลดประวัติ…" />
        ) : (attQ.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">ยังไม่มีประวัติเช็คอิน</p>
        ) : (
          <ul className="space-y-1.5">
            {(attQ.data ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-700">{bkkDateTime(a.checked_in_at)}</span>
                <span
                  className={`badge ${
                    a.geofence_pass === true ? 'bg-green-100 text-green-700'
                      : a.geofence_pass === false ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {a.geofence_pass === true ? '✅ ในพื้นที่' : a.geofence_pass === false ? '⚠️ นอกพื้นที่' : 'บันทึกแล้ว'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── แชททีม (Realtime) ──────────────────────────────────────────────────────

type TeamChannel = { id: string; name: string };
type TeamMessage = { id: string; text: string; sender_id: string | null; created_at: string; profiles: { name: string } | null };

function TeamChat() {
  const qc = useQueryClient();
  const { profile, roles } = useAuth();
  const { toast } = useUI();
  const isAdmin = roles.includes('admin');

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const channelQ = useQuery({
    queryKey: ['team-channel'],
    queryFn: async (): Promise<TeamChannel | null> => {
      const { data, error } = await supabase
        .from('team_channels')
        .select('id,name')
        .eq('active', true)
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as TeamChannel | null) ?? null;
    },
  });
  const { isLoading: channelLoading, isError: channelError, refetch: refetchChannel } = channelQ;
  const chId = channelQ.data?.id;

  const messagesQ = useQuery({
    queryKey: ['team-messages', chId],
    enabled: Boolean(chId),
    // Fallback ช้าๆ เผื่อ Realtime หลุด — ตัวหลักคือ postgres_changes ด้านล่าง
    refetchInterval: 30_000,
    queryFn: async (): Promise<TeamMessage[]> => {
      const { data, error } = await supabase
        .from('team_messages')
        .select('id,text,sender_id,created_at,profiles(name)')
        .eq('channel_id', chId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return ((data as unknown as TeamMessage[]) ?? []).slice().reverse();
    },
  });
  const { isLoading: msgsLoading, isError: msgsError, refetch: refetchMsgs } = messagesQ;
  const messages = messagesQ.data ?? [];

  // Realtime: ข้อความใหม่เด้งทันที ไม่ต้องรอ polling
  useEffect(() => {
    if (!chId) return;
    const ch = supabase
      .channel('team-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_messages', filter: `channel_id=eq.${chId}` },
        () => void qc.invalidateQueries({ queryKey: ['team-messages', chId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [chId, qc]);

  // เลื่อนไปข้อความล่าสุดเสมอ
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !chId || !profile || sending) return;
    setSending(true);
    try {
      const { error } = await supabase
        .from('team_messages')
        .insert({ tenant_id: profile.tenant_id, channel_id: chId, sender_id: profile.id, text: body });
      if (error) throw new Error(error.message);
      setText('');
      await qc.invalidateQueries({ queryKey: ['team-messages', chId] });
    } catch (e2) {
      toast(e2 instanceof Error ? e2.message : 'ส่งข้อความไม่สำเร็จ', 'error');
    } finally {
      setSending(false);
    }
  }

  async function createChannel() {
    if (!profile) return;
    setCreating(true);
    try {
      const { error } = await supabase.from('team_channels').insert({ tenant_id: profile.tenant_id, name: 'ทีม' });
      if (error) throw new Error(error.message);
      toast('สร้างห้องแชททีมแล้ว', 'success');
      await qc.invalidateQueries({ queryKey: ['team-channel'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'สร้างห้องแชทไม่สำเร็จ', 'error');
    } finally {
      setCreating(false);
    }
  }

  if (channelError) {
    return (
      <section className="card">
        <h2 className="font-bold">แชททีม</h2>
        <ErrorState onRetry={() => void refetchChannel()} />
      </section>
    );
  }
  if (channelLoading) {
    return (
      <section className="card">
        <h2 className="font-bold">แชททีม</h2>
        <Spinner />
      </section>
    );
  }
  if (!channelQ.data) {
    return (
      <section className="card space-y-2">
        <h2 className="font-bold">แชททีม</h2>
        {isAdmin ? (
          <>
            <p className="text-sm text-slate-500">ยังไม่มีห้องแชททีม — สร้างห้องแรกให้ทีมคุยกันได้เลย</p>
            <button className="btn-primary" disabled={creating} onClick={() => void createChannel()}>
              {creating ? 'กำลังสร้าง…' : 'สร้างห้องแชททีม'}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-400">ยังไม่มีห้องแชททีม — รอแอดมินสร้างห้องก่อน</p>
        )}
      </section>
    );
  }

  return (
    <section className="card space-y-2">
      <h2 className="font-bold">แชททีม · {channelQ.data.name}</h2>
      {msgsError ? (
        <ErrorState onRetry={() => void refetchMsgs()} />
      ) : msgsLoading ? (
        <Spinner />
      ) : (
        <div ref={listRef} className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {messages.length === 0 && <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีข้อความ — ทักทายทีมได้เลย</p>}
          {messages.map((m) => {
            const mine = m.sender_id !== null && m.sender_id === profile?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'bg-brand text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {!mine && <div className="text-xs font-semibold text-slate-500">{m.profiles?.name ?? 'ทีม'}</div>}
                  <div className="whitespace-pre-wrap break-words text-sm">{m.text}</div>
                  <div className={`mt-0.5 text-right text-[10px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>{bkkTime(m.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <form onSubmit={(e) => void send(e)} className="flex gap-2">
        <input className="input flex-1" placeholder="พิมพ์ข้อความ…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary" disabled={sending || !text.trim()}>ส่ง</button>
      </form>
    </section>
  );
}
