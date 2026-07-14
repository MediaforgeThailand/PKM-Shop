import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { invokeFn } from '../../lib/api';
import { EmptyState, ErrorState, PageHeader, Spinner, useUI } from '../../lib/ui';
import type { ChatMessage, ChatSession, Customer } from '../../lib/types';

// Admin chat console (Ready.md §4: admin ตอบแชทแทน AI, §7: handoff).
// Reads via anon key + RLS; every state change goes through admin-action.

type SessionRow = ChatSession & { customers: Pick<Customer, 'nickname' | 'phone'> | null };

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function SessionBadges({ s }: { s: SessionRow }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {s.agent_mode === 'human' && <span className="badge bg-amber-100 text-amber-700">รอแอดมิน</span>}
      {s.flagged === 'complaint' && <span className="badge bg-red-100 text-red-700">ร้องเรียน</span>}
      {s.flagged === 'emergency' && <span className="badge bg-red-100 text-red-700">ฉุกเฉิน</span>}
    </div>
  );
}

export function AdminChat() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: sessions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['chat-sessions'],
    refetchInterval: 15_000,
    queryFn: async (): Promise<SessionRow[]> => {
      // Handoff rooms first ('human' > 'ai' when descending), then most recent activity.
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('id,tenant_id,customer_id,channel,agent_mode,flagged,last_message_at,customers(nickname,phone)')
        .order('agent_mode', { ascending: false })
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data as unknown as SessionRow[]) ?? [];
    },
  });

  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const waiting = sessions.filter((s) => s.agent_mode === 'human').length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="แชทลูกค้า"
        action={waiting > 0 ? <span className="badge bg-amber-100 text-amber-700">รอแอดมิน {waiting} ห้อง</span> : undefined}
      />

      <div className="md:grid md:grid-cols-[minmax(260px,320px)_1fr] md:items-start md:gap-4">
        {/* Session list — hidden on mobile while a conversation is open */}
        <div className={`space-y-2 ${selected ? 'hidden md:block' : ''}`}>
          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : sessions.length === 0 ? (
            <EmptyState icon="💬" title="ยังไม่มีห้องแชท" hint="เมื่อลูกค้าทักผ่าน LINE จะแสดงที่นี่" />
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`card flex w-full items-center justify-between gap-2 p-3 text-left ${s.id === selectedId ? 'border-brand' : ''}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{s.customers?.nickname || 'ลูกค้า'}</div>
                  <div className="truncate text-xs text-slate-500">{s.customers?.phone || 'ไม่มีเบอร์โทร'}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-slate-400">{fmtTime(s.last_message_at)}</span>
                  <SessionBadges s={s} />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Conversation pane */}
        <div className={selected ? '' : 'hidden md:block'}>
          {selected ? (
            <Conversation session={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="card">
              <EmptyState icon="👈" title="เลือกห้องแชทจากรายการ" hint="ห้องที่รอแอดมินจะอยู่บนสุด" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Conversation({ session, onBack }: { session: SessionRow; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast, confirm } = useUI();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: messages = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['chat-messages', session.id],
    refetchInterval: 15_000, // polling fallback when realtime is unavailable
    queryFn: async (): Promise<ChatMessage[]> => {
      // Latest 100, rendered oldest → newest.
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id,session_id,role,content,created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (((data as ChatMessage[]) ?? [])).reverse();
    },
  });

  // Realtime: new message in this session → refetch immediately.
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${session.id}` },
        () => { void refetch(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session.id, refetch]);

  // Autoscroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      // Server pushes to LINE + flips the session to human mode.
      const res = await invokeFn<{ pushed: boolean }>('admin-action', {
        action: 'send_customer_message', session_id: session.id, text: body,
      });
      setText('');
      if (!res.pushed) toast('บันทึกข้อความแล้ว แต่ลูกค้ายังไม่ได้เชื่อม LINE', 'info');
      await refetch();
      await qc.invalidateQueries({ queryKey: ['chat-sessions'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ส่งข้อความไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function closeCase() {
    const ok = await confirm({
      title: 'ปิดเคสห้องนี้?',
      message: 'AI จะกลับมาตอบลูกค้าห้องนี้อัตโนมัติ',
      confirmText: 'ปิดเคส',
    });
    if (!ok) return;
    setClosing(true);
    try {
      await invokeFn('admin-action', { action: 'close_handoff', session_id: session.id });
      toast('ปิดเคสแล้ว — AI กลับมาตอบต่อ', 'success');
      await refetch();
      await qc.invalidateQueries({ queryKey: ['chat-sessions'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ปิดเคสไม่สำเร็จ', 'error');
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="card overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <button className="btn-ghost btn-sm md:hidden" onClick={onBack} aria-label="กลับไปรายชื่อแชท">←</button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{session.customers?.nickname || 'ลูกค้า'}</div>
          {session.customers?.phone ? (
            <a className="text-xs text-brand" href={`tel:${session.customers.phone}`}>📞 {session.customers.phone}</a>
          ) : (
            <span className="text-xs text-slate-400">ไม่มีเบอร์โทร</span>
          )}
        </div>
        <SessionBadges s={session} />
      </div>

      {/* Handoff banner */}
      {session.agent_mode === 'human' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-xs font-medium text-amber-800">AI หยุดตอบห้องนี้ — คุณกำลังดูแลลูกค้าอยู่</span>
          <button className="btn-ghost btn-sm" disabled={closing} onClick={() => void closeCase()}>
            {closing ? 'กำลังปิดเคส…' : 'ปิดเคส ให้ AI ตอบต่อ'}
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="h-[55vh] space-y-2 overflow-y-auto bg-slate-50/50 p-3 md:h-[60vh]">
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : messages.length === 0 ? (
          <EmptyState icon="💬" title="ยังไม่มีข้อความ" />
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-slate-200 p-2">
        <textarea
          className="input min-h-[44px] flex-1 resize-none"
          rows={2}
          placeholder="พิมพ์ข้อความถึงลูกค้า…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={busy || !text.trim()} onClick={() => void send()}>
          {busy ? 'กำลังส่ง…' : 'ส่ง'}
        </button>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === 'system_notice') {
    return <div className="py-1 text-center text-xs text-slate-400">{m.content}</div>;
  }
  const mine = m.role !== 'user'; // assistant + admin sit on the right (shop side)
  const style = m.role === 'admin'
    ? 'bg-brand text-white'
    : m.role === 'assistant'
      ? 'border border-brand/50 bg-white text-slate-800'
      : 'bg-slate-200 text-slate-800';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${style}`}>
        {m.role === 'assistant' && <div className="text-[10px] font-semibold text-brand">AI</div>}
        {m.role === 'admin' && <div className="text-[10px] font-semibold text-white/80">แอดมิน</div>}
        <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>
        <div className={`mt-0.5 text-right text-[10px] ${m.role === 'admin' ? 'text-white/70' : 'text-slate-400'}`}>
          {fmtTime(m.created_at)}
        </div>
      </div>
    </div>
  );
}
