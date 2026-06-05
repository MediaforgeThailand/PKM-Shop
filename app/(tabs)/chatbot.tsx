import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  aiChatConfigStatus,
  askAiWithRag,
  createSmallTalkAnswer,
  createOfflineRagAnswer,
  DEFAULT_SYSTEM_PROMPT,
  type ChatMessage,
} from '@/lib/ai/gemini';
import {
  loadActivePromptVersion,
  resolveAppRole,
  saveActivePromptVersion,
  type AppRole,
} from '@/lib/ai/promptGovernance';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import {
  getHealthFactTypeLabel,
  getHealthMemoryStatus,
  persistConfirmedHealthFacts,
  type HealthMemoryStatus,
} from '@/lib/health/healthDataVault';
import { extractHealthFactsFromText, type ExtractedHealthFact } from '@/lib/health/healthFactExtractor';
import { localHealthKnowledge, type RagChunk } from '@/lib/rag/healthKnowledge';
import { retrieveRagContext } from '@/lib/rag/retriever';
import { loadRagChunks } from '@/lib/rag/supabaseRag';

const starterPrompts = [
  'อยากตรวจสุขภาพต้องเตรียมตัวยังไง',
  'จ่ายเงินแล้วต้องจองคิวยังไง',
  'ถ้ามี referral code จากหมอ ระบบใช้ยังไง',
];

const bottomTabBarOffset = 104;

const logTabs = [
  { key: 'ai', label: 'AI' },
  { key: 'rag', label: 'RAG' },
  { key: 'health', label: 'Health save' },
  { key: 'api', label: 'API' },
] as const;

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      'สวัสดีค่ะ วันนี้อยากให้ Mira ช่วยเรื่องอะไรคะ',
    createdAt: new Date().toISOString(),
  },
];

type LogCategory = (typeof logTabs)[number]['key'];
type LogStatus = 'error' | 'info' | 'success' | 'warning';

type OpsLog = {
  category: LogCategory;
  createdAt: string;
  detail: string;
  id: string;
  meta?: {
    label: string;
    value: string;
  }[];
  status: LogStatus;
  title: string;
};

function createMessage(role: ChatMessage['role'], content: string, sources?: ChatMessage['sources']): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    sources,
  };
}

function createOpsLog({
  category,
  detail,
  meta,
  status = 'info',
  title,
}: {
  category: LogCategory;
  detail: string;
  meta?: OpsLog['meta'];
  status?: LogStatus;
  title: string;
}): OpsLog {
  return {
    category,
    createdAt: new Date().toISOString(),
    detail,
    id: `${category}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    meta,
    status,
    title,
  };
}

function formatLogTime(value: string) {
  return new Date(value).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function ChatbotScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const lastHealthStatusLogKeyRef = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const auth = useAuthSession();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [ragChunks, setRagChunks] = useState<RagChunk[]>(localHealthKnowledge);
  const [activeLogTab, setActiveLogTab] = useState<LogCategory>('ai');
  const [appRole, setAppRole] = useState<AppRole>('user');
  const [activePromptVersionKey, setActivePromptVersionKey] = useState<string | null>(null);
  const [healthMemoryStatus, setHealthMemoryStatus] = useState<HealthMemoryStatus | null>(null);
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false);
  const [opsLogs, setOpsLogs] = useState<OpsLog[]>(() => [
    createOpsLog({
      category: 'api',
      detail: 'Chatbot screen initialized and waiting for user input.',
      status: 'info',
      title: 'Console ready',
    }),
  ]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [systemPromptDraft, setSystemPromptDraft] = useState(DEFAULT_SYSTEM_PROMPT);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(true);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWideLayout = width >= 1100;
  const authUserId = auth.user?.id ?? null;
  const isAdminUser = appRole === 'admin';
  const canUseAi = aiChatConfigStatus.hasProxy && Boolean(auth.session);
  const modeLabel = !aiChatConfigStatus.hasProxy
    ? 'Local RAG only'
    : auth.session
    ? aiChatConfigStatus.hasSupabaseProxy
      ? 'Supabase Edge Function'
      : 'External proxy'
    : 'Login required';

  const activeLogs = useMemo(() => opsLogs.filter((log) => log.category === activeLogTab), [activeLogTab, opsLogs]);
  const logCounts = useMemo(
    () =>
      logTabs.reduce(
        (counts, tab) => ({
          ...counts,
          [tab.key]: opsLogs.filter((log) => log.category === tab.key).length,
        }),
        {} as Record<LogCategory, number>,
      ),
    [opsLogs],
  );

  const appendLog = useCallback((entry: Omit<OpsLog, 'createdAt' | 'id'>) => {
    setOpsLogs((current) => [createOpsLog(entry), ...current].slice(0, 160));
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadPromptGovernance() {
      if (!auth.user) {
        setAppRole('user');
        setActivePromptVersionKey(null);
        setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
        setSystemPromptDraft(DEFAULT_SYSTEM_PROMPT);
        return;
      }

      try {
        const [role, activePrompt] = await Promise.all([resolveAppRole(auth.user), loadActivePromptVersion()]);

        if (!isMounted) {
          return;
        }

        setAppRole(role);

        if (activePrompt) {
          setActivePromptVersionKey(activePrompt.versionKey);
          setSystemPrompt(activePrompt.promptText);
          setSystemPromptDraft(activePrompt.promptText);
          appendLog({
            category: 'api',
            detail: 'Loaded active system prompt version from Supabase prompt governance.',
            meta: [
              { label: 'role', value: role },
              { label: 'version', value: activePrompt.versionKey },
              { label: 'chars', value: String(activePrompt.promptText.length) },
            ],
            status: 'success',
            title: 'Prompt governance loaded',
          });
        } else {
          setActivePromptVersionKey(null);
          setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
          setSystemPromptDraft(DEFAULT_SYSTEM_PROMPT);
          appendLog({
            category: 'api',
            detail: 'No active prompt version was readable yet, so the app is showing the built-in default prompt.',
            meta: [{ label: 'role', value: role }],
            status: 'warning',
            title: 'Prompt governance fallback',
          });
        }
      } catch (promptError) {
        if (!isMounted) {
          return;
        }

        setAppRole('user');
        setActivePromptVersionKey(null);
        setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
        setSystemPromptDraft(DEFAULT_SYSTEM_PROMPT);
        appendLog({
          category: 'api',
          detail: promptError instanceof Error ? promptError.message : 'Unable to load prompt governance state.',
          status: 'warning',
          title: 'Prompt governance unavailable',
        });
      }
    }

    void loadPromptGovernance();

    return () => {
      isMounted = false;
    };
  }, [appendLog, auth.user]);

  useEffect(() => {
    let isMounted = true;

    getHealthMemoryStatus()
      .then((status) => {
        if (isMounted) {
          setHealthMemoryStatus(status);
          const nextStatusKey = `${status.reason}:${status.userId ?? 'none'}:${
            status.consentGranted ? 'granted' : 'not_granted'
          }`;

          if (lastHealthStatusLogKeyRef.current !== nextStatusKey) {
            lastHealthStatusLogKeyRef.current = nextStatusKey;
            appendLog({
              category: 'api',
              detail:
                status.reason === 'ready'
                  ? status.consentGranted
                    ? 'User is authenticated and health memory consent is granted.'
                    : 'User is authenticated but health memory consent is not granted yet.'
                  : status.reason === 'not_authenticated'
                    ? 'No authenticated user session is available.'
                    : 'Supabase is not configured for health memory.',
              meta: [
                { label: 'reason', value: status.reason },
                { label: 'consent', value: status.consentGranted ? 'granted' : 'not granted' },
              ],
              status: status.reason === 'ready' && status.consentGranted ? 'success' : 'warning',
              title: 'Health memory status updated',
            });
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setHealthMemoryStatus({
            consentGranted: false,
            reason: 'not_authenticated',
            userId: null,
          });
          appendLog({
            category: 'api',
            detail: 'Unable to read health memory status, so the app treated the session as unauthenticated.',
            status: 'error',
            title: 'Health memory status failed',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [appendLog, authUserId]);

  useEffect(() => {
    let isMounted = true;

    appendLog({
      category: 'rag',
      detail: 'Loading approved RAG corpus from Supabase, with local knowledge as fallback.',
      status: 'info',
      title: 'RAG corpus load started',
    });

    loadRagChunks()
      .then((chunks) => {
        if (isMounted) {
          setRagChunks(chunks);
          appendLog({
            category: 'rag',
            detail: 'Approved active RAG chunks loaded and ready for retrieval.',
            meta: [
              { label: 'chunks', value: String(chunks.length) },
              { label: 'source', value: 'Supabase or fallback loader' },
            ],
            status: 'success',
            title: 'RAG corpus loaded',
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setRagChunks(localHealthKnowledge);
          appendLog({
            category: 'rag',
            detail: 'Supabase RAG load failed, so local embedded knowledge is being used.',
            meta: [{ label: 'chunks', value: String(localHealthKnowledge.length) }],
            status: 'warning',
            title: 'RAG fallback active',
          });
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingKnowledge(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [appendLog]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, isSending]);

  async function sendMessage(prompt?: string) {
    const question = (prompt ?? input).trim();

    if (!question || isSending) {
      return;
    }

    setInput('');
    setError(null);
    setIsSending(true);
    appendLog({
      category: 'api',
      detail: 'User submitted a chatbot message and the app started the request pipeline.',
      meta: [
        { label: 'mode', value: canUseAi ? modeLabel : 'Local RAG preview' },
        { label: 'chars', value: String(question.length) },
      ],
      status: 'info',
      title: 'Chat request started',
    });

    const fallbackRagMatches = retrieveRagContext(question, ragChunks, 3);
    const extractedFacts = extractHealthFactsFromText(question);
    const userMessage = createMessage('user', question);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    const smallTalkAnswer = createSmallTalkAnswer(question);

    if (smallTalkAnswer) {
      const assistantMessage = createMessage('assistant', smallTalkAnswer);
      setMessages((current) => [...current, assistantMessage]);
      appendLog({
        category: 'ai',
        detail: 'Answered with the local small-talk shortcut so simple greetings stay short and human.',
        status: 'success',
        title: 'Small-talk shortcut used',
      });
      setIsSending(false);
      return;
    }

    if (canUseAi) {
      appendLog({
        category: 'rag',
        detail: 'RAG retrieval is delegated to the Supabase Edge Function so the mobile app does not send client-built context.',
        meta: [{ label: 'fallback preview', value: `${fallbackRagMatches.length} local matches` }],
        status: 'info',
        title: 'Backend RAG delegated',
      });
    } else {
      appendLog({
        category: 'rag',
        detail: fallbackRagMatches.length
          ? `Selected ${fallbackRagMatches.length} local fallback chunks for this question.`
          : 'Local preview used general clinical-advisor mode.',
        meta: fallbackRagMatches.map((match) => ({
          label: match.category,
          value: match.title,
        })),
        status: fallbackRagMatches.length ? 'success' : 'warning',
        title: 'Local RAG retrieval completed',
      });
    }
    if (extractedFacts.length > 0) {
      appendLog({
        category: 'health',
        detail: `Detected ${extractedFacts.length} possible health facts from the user message.`,
        meta: extractedFacts.map((fact) => ({
          label: getHealthFactTypeLabel(fact.factType),
          value: fact.value,
        })),
        status: 'warning',
        title: 'Health extraction completed',
      });
    }

    try {
      let answer: string;
      let answerSources: ChatMessage['sources'] = [];

      if (canUseAi) {
        appendLog({
          category: 'api',
          detail: 'Calling the OpenAI chat backend with the user question. RAG retrieval, prompt selection, rate limiting, and AI logs run on the backend.',
          meta: [
            { label: 'model', value: aiChatConfigStatus.model },
            { label: 'prompt override', value: isAdminUser ? 'admin available' : 'disabled' },
          ],
          status: 'info',
          title: 'OpenAI API call started',
        });
        const result = await askAiWithRag({
          messages,
          question,
          systemPrompt: isAdminUser ? systemPrompt : undefined,
        });
        answer = result.text;
        answerSources = result.ragMatches;
        appendLog({
          category: 'rag',
          detail: result.ragMatches.length
            ? `Backend returned ${result.ragMatches.length} approved RAG chunks for this answer.`
            : 'Backend used general clinical-advisor mode for this answer.',
          meta: result.ragMatches.map((match) => ({
            label: match.category,
            value: match.title,
          })),
          status: result.ragMatches.length ? 'success' : 'warning',
          title: 'Backend RAG retrieval completed',
        });
        appendLog({
          category: 'ai',
          detail: 'OpenAI returned an assistant answer.',
          meta: [
            { label: 'model', value: result.model },
            { label: 'finish', value: result.finishReason ?? 'UNKNOWN' },
            { label: 'latency', value: `${result.latencyMs}ms` },
            { label: 'chars', value: String(result.text.length) },
            ...(result.promptVersion ? [{ label: 'prompt', value: result.promptVersion.versionKey }] : []),
          ],
          status: result.finishReason === 'MAX_TOKENS' ? 'warning' : 'success',
          title: 'AI response received',
        });
        appendLog({
          category: 'api',
          detail: 'The chat backend completed successfully and returned text to the app.',
          meta: [
            { label: 'mode', value: result.mode },
            { label: 'latency', value: `${result.latencyMs}ms` },
            ...(result.requestId ? [{ label: 'request', value: result.requestId }] : []),
          ],
          status: 'success',
          title: 'OpenAI API call completed',
        });
      } else {
        answer = createOfflineRagAnswer(question, fallbackRagMatches);
        answerSources = fallbackRagMatches;
        appendLog({
          category: 'ai',
          detail: 'OpenAI was unavailable, so the app rendered a local RAG preview answer.',
          meta: [{ label: 'reason', value: auth.session ? 'proxy_not_configured' : 'login_required' }],
          status: 'warning',
          title: 'AI fallback used',
        });
      }

      setMessages((current) => [...current, createMessage('assistant', answer, answerSources)]);
      void handleHealthFactsAfterAnswer(question, answer, answerSources.map((match) => match.id), extractedFacts);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Unable to reach OpenAI.';
      const offlineAnswer = createOfflineRagAnswer(question, fallbackRagMatches);
      setError(message);
      appendLog({
        category: 'api',
        detail: message,
        status: 'error',
        title: 'OpenAI API call failed',
      });
      appendLog({
        category: 'ai',
        detail: 'The app displayed the local RAG fallback answer after the AI request failed.',
        status: 'warning',
        title: 'Fallback answer rendered',
      });
      setMessages((current) => [...current, createMessage('assistant', offlineAnswer, fallbackRagMatches)]);
      void handleHealthFactsAfterAnswer(
        question,
        offlineAnswer,
        fallbackRagMatches.map((match) => match.id),
        extractedFacts,
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleHealthFactsAfterAnswer(
    question: string,
    assistantAnswer: string,
    ragChunkIds: string[],
    facts: ExtractedHealthFact[],
  ) {
    if (facts.length === 0) {
      return;
    }

    if (!auth.session) {
      appendLog({
        category: 'health',
        detail: 'Detected health facts were not saved because there is no authenticated user session.',
        meta: facts.map((fact) => ({
          label: getHealthFactTypeLabel(fact.factType),
          value: fact.value,
        })),
        status: 'warning',
        title: 'Auto-save skipped',
      });
      return;
    }

    try {
      appendLog({
        category: 'health',
        detail: 'Detected facts are being auto-saved into the personal health data vault.',
        meta: facts.map((fact) => ({
          label: getHealthFactTypeLabel(fact.factType),
          value: fact.value,
        })),
        status: 'info',
        title: 'Auto-save started',
      });
      const result = await persistConfirmedHealthFacts({
        assistantAnswer,
        facts,
        model: aiChatConfigStatus.model,
        question,
        ragChunkIds,
      });

      if (result.status === 'skipped') {
        const reason =
          result.reason === 'not_authenticated'
            ? 'ต้อง login ก่อน ระบบถึงจะบันทึกข้อมูลสุขภาพส่วนตัวได้'
            : result.reason === 'supabase_not_configured'
              ? 'Supabase ยังไม่ได้ตั้งค่า จึงยังบันทึกข้อมูลสุขภาพไม่ได้'
              : 'ไม่มีข้อมูลสุขภาพที่ต้องบันทึก';

        appendLog({
          category: 'health',
          detail: reason,
          status: 'warning',
          title: 'Auto-save skipped',
        });
        return;
      }

      appendLog({
        category: 'health',
        detail: `Saved ${result.savedCount} health facts into the personal health data vault.`,
        meta: [
          { label: 'status', value: result.status },
          { label: 'facts', value: String(result.savedCount) },
        ],
        status: 'success',
        title: 'Auto-save completed',
      });
      setHealthMemoryStatus(await getHealthMemoryStatus());
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'บันทึกข้อมูลสุขภาพไม่สำเร็จ';
      appendLog({
        category: 'health',
        detail: message,
        status: 'error',
        title: 'Auto-save failed',
      });
    }
  }

  function openSystemPromptEditor() {
    if (!isAdminUser) {
      appendLog({
        category: 'api',
        detail: 'System prompt editor is restricted to admin users.',
        meta: [{ label: 'role', value: appRole }],
        status: 'warning',
        title: 'Prompt editor blocked',
      });
      return;
    }

    setSystemPromptDraft(systemPrompt);
    setIsPromptEditorOpen(true);
  }

  async function saveSystemPrompt() {
    if (!isAdminUser || isSavingPrompt) {
      return;
    }

    const nextPrompt = systemPromptDraft.trim() || DEFAULT_SYSTEM_PROMPT;

    try {
      setIsSavingPrompt(true);
      const savedPrompt = await saveActivePromptVersion(nextPrompt);
      setActivePromptVersionKey(savedPrompt.versionKey);
      setSystemPrompt(savedPrompt.promptText);
      setSystemPromptDraft(savedPrompt.promptText);
      appendLog({
        category: 'api',
        detail: 'Saved a new active system prompt version in Supabase.',
        meta: [
          { label: 'version', value: savedPrompt.versionKey },
          { label: 'chars', value: String(savedPrompt.promptText.length) },
        ],
        status: 'success',
        title: 'System prompt saved',
      });
      setIsPromptEditorOpen(false);
    } catch (promptError) {
      appendLog({
        category: 'api',
        detail: promptError instanceof Error ? promptError.message : 'Unable to save prompt version.',
        status: 'error',
        title: 'System prompt save failed',
      });
    } finally {
      setIsSavingPrompt(false);
    }
  }

  function resetSystemPrompt() {
    setSystemPromptDraft(DEFAULT_SYSTEM_PROMPT);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={[styles.workspace, !isWideLayout ? styles.workspaceStack : null]}>
        <View style={[styles.chatPane, !isWideLayout ? styles.chatPaneStack : null]}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
          <Text style={styles.eyebrow}>OpenAI + RAG</Text>
          <Text style={styles.title}>Chatbot</Text>
          <Text style={styles.subtitle}>
            A healthcare assistant wired for GPT-5.5, backend RAG, and local fallback knowledge.
          </Text>
        </View>

        <View style={styles.statusGrid}>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Model</Text>
            <Text style={styles.statusValue}>{aiChatConfigStatus.model}</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Mode</Text>
            <Text style={styles.statusValue}>{modeLabel}</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Fallback RAG</Text>
            <Text style={styles.statusValue}>{isLoadingKnowledge ? 'Loading' : ragChunks.length}</Text>
          </View>
        </View>

        {!aiChatConfigStatus.hasProxy ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>OpenAI proxy ยังไม่ได้ตั้งค่า</Text>
            <Text style={styles.noticeBody}>
              ใส่ Supabase URL/key แล้วตั้ง OPENAI_API_KEY เป็น Edge Function secret หรือใส่ EXPO_PUBLIC_AI_PROXY_URL แล้ว restart Expo
            </Text>
          </View>
        ) : null}

        {aiChatConfigStatus.hasProxy && !auth.session ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>ต้อง login ก่อนใช้ OpenAI และ Health Memory</Text>
            <Text style={styles.noticeBody}>
              Edge Function เปิด JWT verification แล้ว จึงต้องมี user session ก่อนเรียก AI และก่อนบันทึกข้อมูลสุขภาพ
            </Text>
            <Link href="/" asChild>
              <Pressable style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>ไปหน้าเข้าสู่ระบบ</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>OpenAI request fallback</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.promptRow}>
          {starterPrompts.map((prompt) => (
            <Pressable key={prompt} disabled={isSending} onPress={() => sendMessage(prompt)} style={styles.promptChip}>
              <Text style={styles.promptText}>{prompt}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.chatList}>
          {messages.map((message) => (
            <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={[styles.bubbleText, message.role === 'user' ? styles.userBubbleText : styles.assistantBubbleText]}>
                {message.content}
              </Text>
              {message.sources?.length ? (
                <View style={styles.sources}>
                  <Text style={styles.sourcesTitle}>RAG sources</Text>
                  {message.sources.map((source) => (
                    <Text key={source.id} style={styles.sourceText}>
                      {source.title} · {source.category} · {source.source}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}

          {isSending ? (
            <View style={[styles.bubble, styles.assistantBubble, styles.loadingBubble]}>
              <ActivityIndicator color="#3C7864" />
                <Text style={styles.loadingText}>Retrieving backend context and asking OpenAI...</Text>
            </View>
          ) : null}
        </View>

          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              multiline
              onChangeText={setInput}
              placeholder="Ask about checkups, booking, referral code..."
              placeholderTextColor="#87948F"
              style={styles.input}
              value={input}
            />
            <Pressable disabled={!input.trim() || isSending} onPress={() => sendMessage()} style={styles.sendButton}>
              <Text style={styles.sendButtonText}>{isSending ? '...' : 'Send'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.opsPane, !isWideLayout ? styles.opsPaneStack : null]}>
          <View style={styles.opsHeader}>
            <View style={styles.opsTitleBlock}>
              <Text style={styles.opsEyebrow}>Live observability</Text>
              <Text style={styles.opsTitle}>Ops logs</Text>
              <Text style={styles.opsSubtitle}>AI, RAG, health save, and API process logs from this chat session.</Text>
            </View>
            {isAdminUser ? (
              <Pressable onPress={openSystemPromptEditor} style={styles.promptButton}>
                <Text style={styles.promptButtonText}>System prompt</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.opsMetrics}>
            <View style={styles.opsMetric}>
              <Text style={styles.opsMetricLabel}>Total logs</Text>
              <Text style={styles.opsMetricValue}>{opsLogs.length}</Text>
            </View>
            <View style={styles.opsMetric}>
              <Text style={styles.opsMetricLabel}>Role</Text>
              <Text style={styles.opsMetricValue}>{appRole}</Text>
            </View>
            <View style={styles.opsMetric}>
              <Text style={styles.opsMetricLabel}>Prompt</Text>
              <Text style={styles.opsMetricValue}>{activePromptVersionKey ? activePromptVersionKey.slice(-8) : systemPrompt.length}</Text>
            </View>
            <View style={styles.opsMetric}>
              <Text style={styles.opsMetricLabel}>Tab</Text>
              <Text style={styles.opsMetricValue}>{activeLogs.length}</Text>
            </View>
          </View>

          <View style={styles.logTabs}>
            {logTabs.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveLogTab(tab.key)}
                style={[styles.logTab, activeLogTab === tab.key ? styles.activeLogTab : null]}
              >
                <Text style={[styles.logTabText, activeLogTab === tab.key ? styles.activeLogTabText : null]}>
                  {tab.label}
                </Text>
                <Text style={[styles.logTabCount, activeLogTab === tab.key ? styles.activeLogTabCount : null]}>
                  {logCounts[tab.key] ?? 0}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.logList} showsVerticalScrollIndicator={false}>
            {activeLogs.length === 0 ? (
              <View style={styles.emptyLogState}>
                <Text style={styles.emptyLogTitle}>No logs yet</Text>
                <Text style={styles.emptyLogBody}>Send a chat message to populate this tab.</Text>
              </View>
            ) : (
              activeLogs.map((log) => (
                <View key={log.id} style={styles.logItem}>
                  <View style={styles.logItemHeader}>
                    <View
                      style={[
                        styles.logDot,
                        log.status === 'success'
                          ? styles.successLogDot
                          : log.status === 'warning'
                            ? styles.warningLogDot
                            : log.status === 'error'
                              ? styles.errorLogDot
                              : styles.infoLogDot,
                      ]}
                    />
                    <View style={styles.logTitleBlock}>
                      <Text style={styles.logTitle}>{log.title}</Text>
                      <Text style={styles.logTime}>{formatLogTime(log.createdAt)}</Text>
                    </View>
                    <Text
                      style={[
                        styles.logStatus,
                        log.status === 'success'
                          ? styles.successLogStatus
                          : log.status === 'warning'
                            ? styles.warningLogStatus
                            : log.status === 'error'
                              ? styles.errorLogStatus
                              : styles.infoLogStatus,
                      ]}
                    >
                      {log.status}
                    </Text>
                  </View>
                  <Text style={styles.logDetail}>{log.detail}</Text>
                  {log.meta?.length ? (
                    <View style={styles.logMetaGrid}>
                      {log.meta.slice(0, 6).map((item, index) => (
                        <View key={`${log.id}-${item.label}-${index}`} style={styles.logMetaPill}>
                          <Text style={styles.logMetaLabel}>{item.label}</Text>
                          <Text style={styles.logMetaValue} numberOfLines={1}>
                            {item.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>

      <Modal animationType="fade" transparent visible={isPromptEditorOpen} onRequestClose={() => setIsPromptEditorOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.promptModal}>
            <View style={styles.promptModalHeader}>
              <View>
                <Text style={styles.promptModalEyebrow}>OpenAI system prompt</Text>
                <Text style={styles.promptModalTitle}>Prompt editor</Text>
              </View>
              <Pressable onPress={() => setIsPromptEditorOpen(false)} style={styles.modalIconButton}>
                <Text style={styles.modalIconText}>X</Text>
              </Pressable>
            </View>

            <TextInput
              multiline
              onChangeText={setSystemPromptDraft}
              style={styles.promptEditorInput}
              textAlignVertical="top"
              value={systemPromptDraft}
            />

            <View style={styles.promptModalFooter}>
              <Pressable onPress={resetSystemPrompt} style={styles.secondaryPromptButton}>
                <Text style={styles.secondaryPromptButtonText}>Reset</Text>
              </Pressable>
              <View style={styles.promptModalActions}>
                <Pressable onPress={() => setIsPromptEditorOpen(false)} style={styles.secondaryPromptButton}>
                  <Text style={styles.secondaryPromptButtonText}>Cancel</Text>
                </Pressable>
                <Pressable disabled={isSavingPrompt} onPress={saveSystemPrompt} style={styles.primaryPromptButton}>
                  <Text style={styles.primaryPromptButtonText}>{isSavingPrompt ? 'Saving' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7FAF8',
    flex: 1,
  },
  workspace: {
    backgroundColor: '#F7FAF8',
    flex: 1,
    flexDirection: 'row',
  },
  workspaceStack: {
    flexDirection: 'column',
  },
  chatPane: {
    backgroundColor: '#F7FAF8',
    borderRightColor: '#DCE8E2',
    borderRightWidth: 1,
    maxWidth: 660,
    minWidth: 520,
    position: 'relative',
    width: 620,
  },
  chatPaneStack: {
    borderRightWidth: 0,
    flex: 1,
    maxWidth: '100%',
    minWidth: 0,
    width: '100%',
  },
  opsPane: {
    backgroundColor: '#F3F7F6',
    flex: 1,
    gap: 14,
    minWidth: 420,
    padding: 20,
    paddingBottom: bottomTabBarOffset + 24,
  },
  opsPaneStack: {
    minHeight: 620,
    minWidth: 0,
  },
  container: {
    gap: 18,
    padding: 20,
    paddingBottom: 236,
  },
  header: {
    gap: 8,
    paddingTop: 24,
  },
  eyebrow: {
    color: '#3C7864',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: '#14231E',
    fontSize: 38,
    fontWeight: '800',
  },
  subtitle: {
    color: '#587069',
    fontSize: 16,
    lineHeight: 23,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 128,
    padding: 14,
  },
  statusLabel: {
    color: '#587069',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusValue: {
    color: '#14231E',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
  },
  notice: {
    backgroundColor: '#FFF7D6',
    borderColor: '#E8D47A',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  noticeTitle: {
    color: '#4C3F10',
    fontSize: 16,
    fontWeight: '800',
  },
  noticeBody: {
    color: '#695B22',
    fontSize: 14,
    lineHeight: 20,
  },
  noticeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#163F34',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  noticeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderColor: '#F4BBBB',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  errorTitle: {
    color: '#8F2424',
    fontSize: 15,
    fontWeight: '800',
  },
  errorBody: {
    color: '#793232',
    fontSize: 14,
    lineHeight: 20,
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  promptChip: {
    backgroundColor: '#E8F3EE',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  promptText: {
    color: '#163F34',
    fontSize: 13,
    fontWeight: '800',
  },
  healthMemoryPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  healthMemoryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  healthMemoryTitle: {
    color: '#14231E',
    fontSize: 16,
    fontWeight: '900',
  },
  healthMemoryBody: {
    color: '#587069',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  healthMemoryBadge: {
    backgroundColor: '#E8F3EE',
    borderRadius: 8,
    color: '#163F34',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  factList: {
    gap: 8,
  },
  factRow: {
    backgroundColor: '#F7FAF8',
    borderColor: '#E4EEE9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  factType: {
    color: '#3C7864',
    fontSize: 12,
    fontWeight: '900',
  },
  factValue: {
    color: '#14231E',
    fontSize: 15,
    fontWeight: '900',
  },
  factEvidence: {
    color: '#587069',
    fontSize: 12,
    lineHeight: 17,
  },
  healthMemoryError: {
    color: '#8F2424',
    fontSize: 13,
    fontWeight: '800',
  },
  healthMemorySuccess: {
    color: '#087B7A',
    fontSize: 13,
    fontWeight: '900',
  },
  healthMemoryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  healthMemoryButton: {
    alignItems: 'center',
    backgroundColor: '#163F34',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  healthMemoryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  dismissButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  dismissButtonText: {
    color: '#587069',
    fontSize: 13,
    fontWeight: '900',
  },
  disabledButton: {
    backgroundColor: '#87948F',
  },
  chatList: {
    gap: 12,
  },
  bubble: {
    borderRadius: 8,
    maxWidth: '92%',
    padding: 14,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderWidth: 1,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#163F34',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  assistantBubbleText: {
    color: '#243B34',
  },
  userBubbleText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sources: {
    borderTopColor: '#E4EEE9',
    borderTopWidth: 1,
    gap: 5,
    marginTop: 12,
    paddingTop: 10,
  },
  sourcesTitle: {
    color: '#3C7864',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sourceText: {
    color: '#587069',
    fontSize: 12,
    lineHeight: 17,
  },
  loadingBubble: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadingText: {
    color: '#587069',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  opsHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  opsTitleBlock: {
    flex: 1,
    gap: 5,
  },
  opsEyebrow: {
    color: '#2E6B8D',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  opsTitle: {
    color: '#14231E',
    fontSize: 30,
    fontWeight: '900',
  },
  opsSubtitle: {
    color: '#687A76',
    fontSize: 13,
    lineHeight: 19,
  },
  promptButton: {
    alignItems: 'center',
    backgroundColor: '#14231E',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 13,
  },
  promptButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  opsMetrics: {
    flexDirection: 'row',
    gap: 10,
  },
  opsMetric: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 12,
  },
  opsMetricLabel: {
    color: '#687A76',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  opsMetricValue: {
    color: '#14231E',
    fontSize: 19,
    fontWeight: '900',
  },
  logTabs: {
    backgroundColor: '#E8EEF2',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    padding: 5,
  },
  logTab: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 8,
  },
  activeLogTab: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C9D9E3',
    borderWidth: 1,
  },
  logTabText: {
    color: '#50646D',
    fontSize: 12,
    fontWeight: '900',
  },
  activeLogTabText: {
    color: '#17384A',
  },
  logTabCount: {
    backgroundColor: '#D8E3E8',
    borderRadius: 8,
    color: '#50646D',
    fontSize: 11,
    fontWeight: '900',
    minWidth: 20,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: 'center',
  },
  activeLogTabCount: {
    backgroundColor: '#E8F3EE',
    color: '#163F34',
  },
  logList: {
    gap: 10,
    paddingBottom: 18,
  },
  emptyLogState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 180,
    padding: 18,
  },
  emptyLogTitle: {
    color: '#14231E',
    fontSize: 16,
    fontWeight: '900',
  },
  emptyLogBody: {
    color: '#687A76',
    fontSize: 13,
  },
  logItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  logItemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  infoLogDot: {
    backgroundColor: '#2E6B8D',
  },
  successLogDot: {
    backgroundColor: '#1E7C63',
  },
  warningLogDot: {
    backgroundColor: '#C27B1A',
  },
  errorLogDot: {
    backgroundColor: '#B33A3A',
  },
  logTitleBlock: {
    flex: 1,
    gap: 2,
  },
  logTitle: {
    color: '#14231E',
    fontSize: 14,
    fontWeight: '900',
  },
  logTime: {
    color: '#7A8985',
    fontSize: 11,
    fontWeight: '700',
  },
  logStatus: {
    borderRadius: 8,
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  infoLogStatus: {
    backgroundColor: '#E5F0F6',
    color: '#2E6B8D',
  },
  successLogStatus: {
    backgroundColor: '#E8F3EE',
    color: '#1E7C63',
  },
  warningLogStatus: {
    backgroundColor: '#FFF1D6',
    color: '#8A540D',
  },
  errorLogStatus: {
    backgroundColor: '#FDECEC',
    color: '#9D2F2F',
  },
  logDetail: {
    color: '#445851',
    fontSize: 13,
    lineHeight: 19,
  },
  logMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  logMetaPill: {
    backgroundColor: '#F6F9FA',
    borderColor: '#E0EAEE',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  logMetaLabel: {
    color: '#6B7B84',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  logMetaValue: {
    color: '#14231E',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(13, 27, 23, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  promptModal: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxWidth: 820,
    padding: 18,
    width: '100%',
  },
  promptModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  promptModalEyebrow: {
    color: '#2E6B8D',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  promptModalTitle: {
    color: '#14231E',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 3,
  },
  modalIconButton: {
    alignItems: 'center',
    backgroundColor: '#F0F5F3',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  modalIconText: {
    color: '#14231E',
    fontSize: 14,
    fontWeight: '900',
  },
  promptEditorInput: {
    backgroundColor: '#F7FAF8',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#14231E',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 300,
    padding: 14,
  },
  promptModalFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  promptModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryPromptButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  secondaryPromptButtonText: {
    color: '#587069',
    fontSize: 13,
    fontWeight: '900',
  },
  primaryPromptButton: {
    alignItems: 'center',
    backgroundColor: '#163F34',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 16,
  },
  primaryPromptButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    bottom: bottomTabBarOffset,
    flexDirection: 'row',
    gap: 10,
    left: 0,
    marginHorizontal: 14,
    padding: 12,
    position: 'absolute',
    right: 0,
  },
  input: {
    backgroundColor: '#F7FAF8',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#14231E',
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#163F34',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 72,
    paddingHorizontal: 14,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
