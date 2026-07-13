import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invokeFn, uploadToBucket } from '../lib/api';
import { useAuth } from '../lib/auth';

type TeamChannel = { id: string; name: string };
type TeamMessage = { id: string; text: string; sender_id: string | null; created_at: string; profiles: { name: string } | null };

export function StaffHome() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? '';
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);

  function checkIn() {
    // Trigger the file/camera picker SYNCHRONOUSLY inside the tap (iOS drops the
    // user-activation gesture if we await first). Geolocation is fetched in onchange.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'user';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return; // cancelled — no stuck state
      setCheckinMsg('กำลังเช็คอิน…');
      try {
        const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
        });
        const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
        await uploadToBucket('checkin', path, file);
        const res = await invokeFn<{ geofence_pass: boolean | null }>('checkin', { lat: coords?.latitude, lng: coords?.longitude, photo_path: path });
        setCheckinMsg(res.geofence_pass === false ? 'เช็คอินแล้ว (อยู่นอกรัศมี)' : 'เช็คอินสำเร็จ ✅');
      } catch (e) {
        setCheckinMsg(`เช็คอินไม่สำเร็จ: ${e instanceof Error ? e.message : ''}`);
      }
    };
    input.click();
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-2">
        <h2 className="font-bold">เช็คอินเข้างาน</h2>
        <button className="btn-primary" onClick={() => void checkIn()}>ถ่ายรูป + เช็คอิน (GPS)</button>
        {checkinMsg && <p className="text-sm text-slate-600">{checkinMsg}</p>}
      </section>
      <TeamChat tenantId={tenantId} senderId={profile?.id ?? null} />
    </div>
  );
}

function TeamChat({ tenantId, senderId }: { tenantId: string; senderId: string | null }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const { data: channel } = useQuery({
    queryKey: ['team-channel'],
    queryFn: async (): Promise<TeamChannel | null> => {
      const { data } = await supabase.from('team_channels').select('id,name').eq('active', true).order('created_at').limit(1).maybeSingle();
      return (data as TeamChannel) ?? null;
    },
  });
  const { data: messages = [] } = useQuery({
    queryKey: ['team-messages', channel?.id],
    enabled: Boolean(channel?.id),
    refetchInterval: 5_000,
    queryFn: async (): Promise<TeamMessage[]> => {
      const { data } = await supabase.from('team_messages').select('id,text,sender_id,created_at,profiles(name)').eq('channel_id', channel!.id).order('created_at', { ascending: false }).limit(30);
      return ((data as unknown as TeamMessage[]) ?? []).reverse();
    },
  });

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !channel?.id || !senderId) return;
    await supabase.from('team_messages').insert({ tenant_id: tenantId, channel_id: channel.id, sender_id: senderId, text: text.trim() });
    setText('');
    await qc.invalidateQueries({ queryKey: ['team-messages', channel.id] });
  }

  if (!channel) {
    return <section className="card"><h2 className="font-bold">แชททีม</h2><p className="text-sm text-slate-400">ยังไม่มีห้องแชท (แอดมินสร้างใน team_channels)</p></section>;
  }

  return (
    <section className="card space-y-2">
      <h2 className="font-bold">แชททีม · {channel.name}</h2>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className="text-sm"><b className="text-slate-600">{m.profiles?.name ?? 'ทีม'}:</b> {m.text}</div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input className="input flex-1" placeholder="พิมพ์ข้อความ…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary">ส่ง</button>
      </form>
    </section>
  );
}
