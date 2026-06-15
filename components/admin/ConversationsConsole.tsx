import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Pill } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { invokeFunction } from '@/lib/api/client';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { showcaseDemoTranscript } from '@/lib/showcase/demoFixtures';
import { supabase, supabaseConfigStatus } from '@/lib/supabase';

type CustomerJoin = { line_user_id: string | null; nickname: string | null };

type SessionListRow = {
  agent_mode: 'ai' | 'human' | null;
  customers: CustomerJoin | CustomerJoin[] | null;
  id: string;
  last_message_at: string | null;
};

type MessageRow = {
  content: string;
  created_at: string;
  id: string;
  role: string;
};

function fromJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatTime(value: string | null) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('th-TH', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: 'short' });
}

function customerLabel(row: SessionListRow) {
  const customer = fromJoin(row.customers);

  return customer?.nickname?.trim() || 'ลูกค้า LINE';
}

export function ConversationsConsole() {
  const { session: authSession } = useAuthSession();
  const { tour } = useLocalSearchParams<{ tour?: string }>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isCompact = width < 880;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const isTourMode = tour === 'admin';
  const ready = supabaseConfigStatus.isConfigured && Boolean(authSession) && !isTourMode;
  const demoSessions = useMemo<SessionListRow[]>(
    () => [
      {
        agent_mode: 'ai',
        customers: { line_user_id: 'demo-line-user', nickname: 'บอส' },
        id: 'demo-session',
        last_message_at: showcaseDemoTranscript[showcaseDemoTranscript.length - 1]?.created_at ?? null,
      },
    ],
    [],
  );
  const demoMessages = useMemo<MessageRow[]>(
    () =>
      showcaseDemoTranscript.map((message) => ({
        content: message.content,
        created_at: message.created_at,
        id: message.id,
        role: message.role,
      })),
    [],
  );

  const sessionsQuery = useQuery({
    enabled: ready,
    queryFn: async (): Promise<SessionListRow[]> => {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('id,agent_mode,last_message_at,customers(nickname,line_user_id)')
        .eq('channel', 'line')
        .order('last_message_at', { ascending: false })
        .limit(50);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as SessionListRow[];
    },
    queryKey: ['line-sessions'],
    refetchInterval: 6000,
  });

  const transcriptQuery = useQuery({
    enabled: ready && Boolean(selectedId),
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id,role,content,created_at')
        .eq('session_id', selectedId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as MessageRow[];
    },
    queryKey: ['line-transcript', selectedId],
    refetchInterval: 4000,
  });

  const isDemoMode = !ready || sessionsQuery.isError || transcriptQuery.isError;
  const visibleSessions = isDemoMode ? demoSessions : sessionsQuery.data ?? [];
  const activeSelectedId = isDemoMode ? selectedId ?? visibleSessions[0]?.id ?? null : selectedId;
  const visibleMessages = isDemoMode && activeSelectedId ? demoMessages : transcriptQuery.data ?? [];
  const selectedSession = useMemo(
    () => visibleSessions.find((row) => row.id === activeSelectedId) ?? null,
    [activeSelectedId, visibleSessions],
  );

  const replyMutation = useMutation({
    mutationFn: async (text: string) =>
      invokeFunction('admin-line-reply', { action: 'reply', session_id: selectedId, text }),
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'ส่งไม่สำเร็จ'),
    onSuccess: () => {
      setDraft('');
      setErrorText(null);
      queryClient.invalidateQueries({ queryKey: ['line-transcript', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['line-sessions'] });
    },
  });

  const modeMutation = useMutation({
    mutationFn: async (agentMode: 'ai' | 'human') =>
      invokeFunction('admin-line-reply', { action: 'set_mode', agent_mode: agentMode, session_id: selectedId }),
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'สลับโหมดไม่สำเร็จ'),
    onSuccess: () => {
      setErrorText(null);
      queryClient.invalidateQueries({ queryKey: ['line-sessions'] });
    },
  });

  const isHuman = !isDemoMode && selectedSession?.agent_mode === 'human';

  return (
    <View style={[styles.shell, isCompact ? styles.shellCompact : null]}>
      {/* Inbox */}
      <View style={[styles.inbox, isCompact ? styles.inboxCompact : null]}>
        <Text style={styles.inboxTitle}>แชต LINE</Text>
        {sessionsQuery.isLoading && !isDemoMode ? <ActivityIndicator color={MiraDesign.color.showcaseBlue} /> : null}
        {isDemoMode ? <Text style={styles.demoNote}>โหมดตัวอย่าง: แสดง transcript ตัวอย่างแบบอ่านอย่างเดียว</Text> : null}
        <ScrollView contentContainerStyle={styles.inboxList}>
          {visibleSessions.map((row) => {
            const active = row.id === activeSelectedId;

            return (
              <Pressable
                key={row.id}
                onPress={() => setSelectedId(row.id)}
                style={[styles.inboxRow, active ? styles.inboxRowActive : null]}
              >
                <View style={styles.inboxRowTop}>
                  <Text numberOfLines={1} style={styles.inboxName}>{customerLabel(row)}</Text>
                  <Pill label={row.agent_mode === 'human' ? 'คนดูแล' : 'AI'} tone={row.agent_mode === 'human' ? 'amber' : 'blue'} />
                </View>
                <Text style={styles.inboxTime}>{formatTime(row.last_message_at)}</Text>
              </Pressable>
            );
          })}
          {visibleSessions.length === 0 ? <Text style={styles.muted}>ยังไม่มีแชต</Text> : null}
        </ScrollView>
      </View>

      {/* Thread */}
      <View style={styles.thread}>
        {!selectedSession ? (
          <View style={styles.center}>
            <Text style={styles.muted}>เลือกห้องแชตทางซ้ายเพื่อดูบทสนทนา</Text>
          </View>
        ) : (
          <>
            <View style={styles.threadHeader}>
              <Text style={styles.threadTitle}>{customerLabel(selectedSession)}</Text>
              <Pressable
                disabled={isDemoMode || modeMutation.isPending}
                onPress={() => modeMutation.mutate(isHuman ? 'ai' : 'human')}
                style={[styles.modeBtn, isHuman ? styles.modeBtnReturn : styles.modeBtnTakeover]}
              >
                <Text style={styles.modeBtnText}>{isHuman ? 'คืนให้ AI' : 'เข้าดูแลเอง'}</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.messages}>
              {visibleMessages.map((message) => {
                const fromCustomer = message.role === 'user';

                return (
                  <View
                    key={message.id}
                    style={[styles.bubbleRow, fromCustomer ? styles.bubbleRowLeft : styles.bubbleRowRight]}
                  >
                    <View style={[styles.bubble, fromCustomer ? styles.bubbleCustomer : styles.bubbleAgent]}>
                      <Text style={fromCustomer ? styles.bubbleTextCustomer : styles.bubbleTextAgent}>{message.content}</Text>
                      <Text style={styles.bubbleMeta}>{formatTime(message.created_at)}</Text>
                    </View>
                  </View>
                );
              })}
              {visibleMessages.length === 0 ? <Text style={styles.muted}>ยังไม่มีข้อความ</Text> : null}
            </ScrollView>

            {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

            <View style={styles.composer}>
              <TextInput
                editable={isHuman && !replyMutation.isPending}
                multiline
                onChangeText={setDraft}
                placeholder={isHuman ? 'พิมพ์ข้อความตอบลูกค้า…' : 'กด “เข้าดูแลเอง” ก่อนเพื่อพิมพ์ตอบ'}
                placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                style={styles.input}
                value={draft}
              />
              <Pressable
                disabled={isDemoMode || !isHuman || !draft.trim() || replyMutation.isPending}
                onPress={() => replyMutation.mutate(draft.trim())}
                style={[styles.sendBtn, !isHuman || !draft.trim() ? styles.sendBtnDisabled : null]}
              >
                <Text style={styles.sendBtnText}>{replyMutation.isPending ? '...' : 'ส่ง'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', gap: 16, padding: 16 },
  shellCompact: { flexDirection: 'column' },
  inbox: { backgroundColor: '#fff', borderColor: MiraDesign.color.showcaseLine, borderRadius: MiraDesign.radius.md, borderWidth: 1, gap: 10, padding: 14, width: 280, ...softShadow },
  inboxCompact: { maxHeight: 220, width: '100%' },
  inboxTitle: { color: MiraDesign.color.showcaseNavy, fontSize: 16, fontWeight: '900' },
  inboxList: { gap: 8 },
  demoNote: { backgroundColor: MiraDesign.color.showcaseBlueSoft, borderRadius: MiraDesign.radius.sm, color: MiraDesign.color.showcaseNavy, fontSize: 12, fontWeight: '800', padding: 10 },
  inboxRow: { borderColor: MiraDesign.color.showcaseLine, borderRadius: MiraDesign.radius.sm, borderWidth: 1, gap: 4, padding: 12 },
  inboxRowActive: { backgroundColor: MiraDesign.color.showcaseBlueSoft, borderColor: MiraDesign.color.showcaseBlue },
  inboxRowTop: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  inboxName: { color: MiraDesign.color.showcaseNavy, flexShrink: 1, fontSize: 14, fontWeight: '800' },
  inboxTime: { color: MiraDesign.color.showcaseNavySoft, fontSize: 12 },
  thread: { backgroundColor: '#fff', borderColor: MiraDesign.color.showcaseLine, borderRadius: MiraDesign.radius.md, borderWidth: 1, flex: 1, minWidth: 0, ...softShadow },
  threadHeader: { alignItems: 'center', borderBottomColor: MiraDesign.color.showcaseLine, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  threadTitle: { color: MiraDesign.color.showcaseNavy, fontSize: 16, fontWeight: '900' },
  modeBtn: { borderRadius: MiraDesign.radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  modeBtnTakeover: { backgroundColor: MiraDesign.color.showcaseBlue },
  modeBtnReturn: { backgroundColor: MiraDesign.color.showcaseNavySoft },
  modeBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  messages: { gap: 8, padding: 14 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { borderRadius: 14, gap: 4, maxWidth: '78%', padding: 10 },
  bubbleCustomer: { backgroundColor: '#EEF2F6' },
  bubbleAgent: { backgroundColor: MiraDesign.color.showcaseBlue },
  bubbleTextCustomer: { color: MiraDesign.color.showcaseNavy, fontSize: 14 },
  bubbleTextAgent: { color: '#fff', fontSize: 14 },
  bubbleMeta: { color: MiraDesign.color.showcaseNavySoft, fontSize: 10 },
  composer: { alignItems: 'flex-end', borderTopColor: MiraDesign.color.showcaseLine, borderTopWidth: 1, flexDirection: 'row', gap: 8, padding: 12 },
  input: { backgroundColor: '#F6FAFF', borderColor: MiraDesign.color.showcaseLine, borderRadius: MiraDesign.radius.sm, borderWidth: 1, color: MiraDesign.color.showcaseNavy, flex: 1, maxHeight: 120, minHeight: 44, padding: 10 },
  sendBtn: { backgroundColor: MiraDesign.color.showcaseBlue, borderRadius: MiraDesign.radius.sm, paddingHorizontal: 20, paddingVertical: 12 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  muted: { color: MiraDesign.color.showcaseNavySoft, fontSize: 13 },
  error: { color: '#B42318', fontSize: 12, paddingHorizontal: 14 },
});
