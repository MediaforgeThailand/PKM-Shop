import { Link } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
  chatHistoryQueryKeys,
  createSmallTalkAnswer,
  createOfflineRagAnswer,
  createStripeCheckoutSession,
  DEFAULT_USER_NICKNAME,
  formatUserDisplayName,
  loadChatHistoryPage,
  loadHealthDataConsent,
  loadLatestChatHistoryPage,
  refreshActiveOrderPanel,
  requestPaymentSlipUpload,
  setCurrentChatSessionId,
  uploadPaymentSlipFile,
  type ChatMessage,
  type SlipUploadFile,
} from '@/lib/ai/miraChat';
import {
  resolveAppRole,
  type AppRole,
} from '@/lib/ai/promptGovernance';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { getHealthFactTypeLabel } from '@/lib/health/healthDataVault';
import { extractHealthFactsFromText, type ExtractedHealthFact } from '@/lib/health/healthFactExtractor';
import { localHealthKnowledge, type RagChunk } from '@/lib/rag/healthKnowledge';
import { retrieveRagContext } from '@/lib/rag/retriever';
import { loadRagChunks } from '@/lib/rag/supabaseRag';
import type { ChatUiCard } from '@/lib/ai/healthChatTypes';
import { ConsentSheet } from '@/components/chat/ConsentSheet';
import { MessageBubble, messageBubbleStyles } from '@/components/chat/MessageBubble';
import { OrderPanel } from '@/components/chat/OrderPanel';
import { ProductCarousel } from '@/components/chat/ProductCarousel';
import type { ChatAction, ChatProduct } from '@/lib/types/api';

const starterPrompts = [
  'อยากตรวจสุขภาพต้องเตรียมตัวยังไง',
  'จ่ายเงินแล้วต้องจองคิวยังไง',
  'ถ้ามี referral code จากหมอ ระบบใช้ยังไง',
];

const bottomTabBarOffset = 104;
const defaultUserDisplayName = formatUserDisplayName(DEFAULT_USER_NICKNAME);

const logTabs = [
  { key: 'ai', label: 'AI' },
  { key: 'rag', label: 'Context' },
  { key: 'health', label: 'Health save' },
  { key: 'api', label: 'API' },
] as const;

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: `สวัสดีค่ะ${defaultUserDisplayName} วันนี้อยากให้ฉันช่วยเรื่องอะไรคะ`,
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

function createMessage(
  role: ChatMessage['role'],
  content: string,
  sources?: ChatMessage['sources'],
  uiCards?: ChatMessage['uiCards'],
  order?: ChatMessage['order'],
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    order,
    sources,
    uiCards,
  };
}

function MemorySavedCard({ card }: { card: Extract<ChatUiCard, { type: 'memory_saved' }> }) {
  return (
    <View style={styles.memoryCard}>
      <Text style={styles.memoryCardTitle}>{'\u0e08\u0e33\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2a\u0e33\u0e04\u0e31\u0e0d\u0e44\u0e27\u0e49\u0e41\u0e25\u0e49\u0e27'}</Text>
      <Text numberOfLines={2} style={styles.memoryCardText}>
        {card.summaries.slice(0, 2).join(' · ') || `${card.count} items`}
      </Text>
    </View>
  );
}

function productGridToChatProducts(card: Extract<ChatUiCard, { type: 'product_grid' }>): ChatProduct[] {
  return card.products.map((product) => ({
    catalog_key: product.id,
    category: product.category,
    description: product.description,
    image_url: product.productImagePreviewUri ?? null,
    name: product.title,
    price_baht: product.priceAmount,
  }));
}

function slipContentType(file: SlipUploadFile): 'image/jpeg' | 'image/png' | null {
  if (file.type === 'image/jpeg' || file.type === 'image/png') {
    return file.type;
  }

  const name = file.name?.toLowerCase() ?? '';

  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (name.endsWith('.png')) {
    return 'image/png';
  }

  return null;
}

function ChatUiCardRenderer({
  card,
  disabled,
  onSelectProduct,
}: {
  card: ChatUiCard;
  disabled?: boolean;
  onSelectProduct: (product: ChatProduct) => void;
}) {
  if (card.type === 'product_grid') {
    return <ProductCarousel disabled={disabled} onSelectProduct={onSelectProduct} products={productGridToChatProducts(card)} />;
  }

  if (card.type === 'memory_saved') {
    return <MemorySavedCard card={card} />;
  }

  return null;
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
  const historyHydrationKeyRef = useRef<string | null>(null);
  const orderRefreshKeyRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const auth = useAuthSession();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [restoredOrder, setRestoredOrder] = useState<ChatMessage['order']>(null);
  const [ragChunks, setRagChunks] = useState<RagChunk[]>(localHealthKnowledge);
  const [activeLogTab, setActiveLogTab] = useState<LogCategory>('ai');
  const [appRole, setAppRole] = useState<AppRole>('user');
  const [activePromptVersionKey, setActivePromptVersionKey] = useState<string | null>(null);
  const [opsLogs, setOpsLogs] = useState<OpsLog[]>(() => [
    createOpsLog({
      category: 'api',
      detail: 'Chatbot screen initialized and waiting for user input.',
      status: 'info',
      title: 'Console ready',
    }),
  ]);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(true);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isStartingStripeCheckout, setIsStartingStripeCheckout] = useState(false);
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWideLayout = width >= 1100;
  const canUseAi = aiChatConfigStatus.hasProxy && Boolean(auth.session);
  const canUseOrderActions = aiChatConfigStatus.hasSupabaseProxy && Boolean(auth.session);
  const canUsePersistedChat = aiChatConfigStatus.hasSupabaseProxy && Boolean(auth.session);
  const modeLabel = !aiChatConfigStatus.hasProxy
    ? 'Local fallback only'
    : auth.session
    ? aiChatConfigStatus.hasSupabaseProxy
      ? 'Supabase Edge Function'
      : 'External proxy'
    : 'Login required';

  const activeLogs = useMemo(() => opsLogs.filter((log) => log.category === activeLogTab), [activeLogTab, opsLogs]);
  const shouldRenderRestoredOrder = useMemo(
    () => Boolean(restoredOrder && !messages.some((message) => message.order?.id === restoredOrder.id)),
    [messages, restoredOrder],
  );
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

  const chatHistoryQuery = useQuery({
    enabled: canUsePersistedChat,
    queryFn: () => loadLatestChatHistoryPage(),
    queryKey: chatHistoryQueryKeys.latest(),
  });

  const consentQuery = useQuery({
    enabled: canUsePersistedChat,
    queryFn: loadHealthDataConsent,
    queryKey: chatHistoryQueryKeys.consent(),
  });

  useEffect(() => {
    if (canUsePersistedChat) {
      return;
    }

    setActiveSessionId(null);
    setCurrentChatSessionId(null);
    setHasMoreHistory(false);
    setHistoryCursor(null);
    setRestoredOrder(null);
    orderRefreshKeyRef.current = null;
    historyHydrationKeyRef.current = null;
    setMessages(initialMessages);
  }, [canUsePersistedChat]);

  useEffect(() => {
    if (!canUsePersistedChat || !chatHistoryQuery.data || isSending) {
      return;
    }

    const page = chatHistoryQuery.data;
    const lastMessageId = page.messages[page.messages.length - 1]?.id ?? 'empty';
    const hydrationKey = `${page.sessionId ?? 'none'}:${page.nextBefore ?? 'none'}:${lastMessageId}:${page.messages.length}`;

    if (historyHydrationKeyRef.current === hydrationKey) {
      return;
    }

    historyHydrationKeyRef.current = hydrationKey;
    setActiveSessionId(page.sessionId);
    setCurrentChatSessionId(page.sessionId);
    setHasMoreHistory(page.hasMore);
    setHistoryCursor(page.nextBefore);
    setMessages(page.messages.length ? page.messages : initialMessages);

    if (page.sessionId) {
      const orderRefreshKey = hydrationKey;

      orderRefreshKeyRef.current = orderRefreshKey;
      void refreshActiveOrderPanel(page.sessionId)
        .then((result) => {
          if (orderRefreshKeyRef.current !== orderRefreshKey) {
            return;
          }

          setActiveSessionId(result.session_id);
          setCurrentChatSessionId(result.session_id);
          setRestoredOrder(result.order ?? null);

          if (result.order) {
            appendLog({
              category: 'api',
              detail: 'Restored the active order panel for the latest persisted chat session.',
              meta: [{ label: 'status', value: result.order.status }],
              status: 'success',
              title: 'Order panel refreshed',
            });
          }
        })
        .catch((refreshError) => {
          if (orderRefreshKeyRef.current !== orderRefreshKey) {
            return;
          }

          setRestoredOrder(null);
          appendLog({
            category: 'api',
            detail: refreshError instanceof Error ? refreshError.message : 'Unable to refresh active order.',
            status: 'warning',
            title: 'Order panel refresh failed',
          });
        });

      appendLog({
        category: 'api',
        detail: 'Loaded the latest persisted chat session from Supabase.',
        meta: [
          { label: 'messages', value: String(page.messages.length) },
          { label: 'older page', value: page.hasMore ? 'available' : 'none' },
        ],
        status: 'success',
        title: 'Chat history loaded',
      });
    } else {
      setRestoredOrder(null);
      orderRefreshKeyRef.current = null;
    }
  }, [appendLog, canUsePersistedChat, chatHistoryQuery.data, isSending]);

  useEffect(() => {
    if (!chatHistoryQuery.error) {
      return;
    }

    appendLog({
      category: 'api',
      detail: chatHistoryQuery.error instanceof Error ? chatHistoryQuery.error.message : 'Unable to load chat history.',
      status: 'warning',
      title: 'Chat history unavailable',
    });
  }, [appendLog, chatHistoryQuery.error]);

  useEffect(() => {
    if (!consentQuery.error) {
      return;
    }

    appendLog({
      category: 'api',
      detail: consentQuery.error instanceof Error ? consentQuery.error.message : 'Unable to load health data consent.',
      status: 'warning',
      title: 'Consent status unavailable',
    });
  }, [appendLog, consentQuery.error]);

  useEffect(() => {
    let isMounted = true;

    async function loadPromptGovernance() {
      if (!auth.user) {
        setAppRole('user');
        setActivePromptVersionKey('platform-v2');
        return;
      }

      try {
        const role = await resolveAppRole(auth.user);

        if (!isMounted) {
          return;
        }

        setAppRole(role);
        setActivePromptVersionKey('platform-v2');
        appendLog({
          category: 'api',
          detail: 'Using the published OpenAI Platform prompt for production chat.',
          meta: [
            { label: 'role', value: role },
            { label: 'version', value: 'platform-v2' },
          ],
          status: 'success',
          title: 'Platform prompt ready',
        });
      } catch (promptError) {
        if (!isMounted) {
          return;
        }

        setAppRole('user');
        setActivePromptVersionKey('platform-v2');
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

    appendLog({
      category: 'rag',
      detail: 'Loading local fallback health knowledge for offline preview.',
      status: 'info',
      title: 'Fallback knowledge load started',
    });

    loadRagChunks()
      .then((chunks) => {
        if (isMounted) {
          setRagChunks(chunks);
          appendLog({
            category: 'rag',
            detail: 'Fallback health knowledge loaded and ready for local preview.',
            meta: [
              { label: 'chunks', value: String(chunks.length) },
              { label: 'source', value: 'Supabase or fallback loader' },
            ],
            status: 'success',
            title: 'Fallback knowledge loaded',
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setRagChunks(localHealthKnowledge);
          appendLog({
            category: 'rag',
            detail: 'Supabase fallback knowledge load failed, so local embedded knowledge is being used.',
            meta: [{ label: 'chunks', value: String(localHealthKnowledge.length) }],
            status: 'warning',
            title: 'Local fallback active',
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

  async function sendMessage(prompt?: string, action?: ChatAction | null) {
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
        { label: 'mode', value: canUseAi ? modeLabel : 'Local fallback preview' },
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

    if (smallTalkAnswer && !canUseAi) {
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
        detail: 'Backend context is handled by the Supabase Edge Function so the mobile app does not send client-built prompt context.',
        meta: [{ label: 'fallback preview', value: `${fallbackRagMatches.length} local matches` }],
        status: 'info',
        title: 'Backend context delegated',
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
        title: 'Local fallback retrieval completed',
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
      let answerOrder: ChatMessage['order'] = null;
      let answerRole: ChatMessage['role'] = 'assistant';
      let answerSources: ChatMessage['sources'] = [];
      let answerUiCards: ChatMessage['uiCards'] = [];

      if (canUseAi) {
        appendLog({
          category: 'api',
          detail: 'Calling the OpenAI chat backend with the user question. The published OpenAI Platform prompt, rate limiting, and AI logs run on the backend.',
          meta: [
            { label: 'model', value: aiChatConfigStatus.model },
            { label: 'prompt', value: 'OpenAI Platform' },
          ],
          status: 'info',
          title: 'OpenAI API call started',
        });
        const result = await askAiWithRag({
          action,
          messages,
          question,
          sessionId: activeSessionId,
        });
        if (result.sessionId) {
          setActiveSessionId(result.sessionId);
          setCurrentChatSessionId(result.sessionId);
        }
        if (result.promptVersion) {
          setActivePromptVersionKey(result.promptVersion.versionKey);
        }
        answer = result.text;
        answerOrder = result.order ?? null;
        setRestoredOrder(answerOrder);
        answerRole = result.responseRole ?? 'assistant';
        answerSources = result.ragMatches;
        answerUiCards = result.uiCards;
        appendLog({
          category: 'rag',
          detail: result.ragMatches.length
            ? `Backend returned ${result.ragMatches.length} source references for this answer.`
            : 'Backend used the Platform prompt without extra source references for this answer.',
          meta: result.ragMatches.map((match) => ({
            label: match.category,
            value: match.title,
          })),
          status: result.ragMatches.length ? 'success' : 'warning',
          title: 'Backend context completed',
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
          detail: 'OpenAI was unavailable, so the app rendered a local fallback preview answer.',
          meta: [{ label: 'reason', value: auth.session ? 'proxy_not_configured' : 'login_required' }],
          status: 'warning',
          title: 'AI fallback used',
        });
      }

      setMessages((current) => [...current, createMessage(answerRole, answer, answerSources, answerUiCards, answerOrder)]);
      if (canUsePersistedChat) {
        void queryClient.invalidateQueries({ queryKey: chatHistoryQueryKeys.latest() });
      }
      if (action?.type === 'consent_granted') {
        void queryClient.invalidateQueries({ queryKey: chatHistoryQueryKeys.consent() });
      }
      handleHealthFactsAfterAnswer(extractedFacts);
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
        detail: 'The app displayed the local fallback answer after the AI request failed.',
        status: 'warning',
        title: 'Fallback answer rendered',
      });
      setMessages((current) => [...current, createMessage('assistant', offlineAnswer, fallbackRagMatches)]);
      handleHealthFactsAfterAnswer(extractedFacts);
    } finally {
      setIsSending(false);
    }
  }

  function handleHealthFactsAfterAnswer(facts: ExtractedHealthFact[]) {
    if (facts.length === 0) {
      return;
    }

    appendLog({
      category: 'health',
      detail: 'Detected possible facts locally for operator visibility. Canonical extraction now runs server-side after the user message is saved.',
      meta: facts.map((fact) => ({
        label: getHealthFactTypeLabel(fact.factType),
        value: fact.value,
      })),
      status: 'info',
      title: 'Server extraction delegated',
    });
  }

  function handleSelectProduct(product: ChatProduct) {
    void sendMessage(`ต้องการจอง ${product.name}`, {
      catalog_key: product.catalog_key,
      type: 'select_product',
    });
  }

  function handleOrderFormSubmit(payload: { buyer_name: string; buyer_phone: string; order_id: string; preferred_date?: string }) {
    void sendMessage('ส่งข้อมูลผู้ซื้อแล้ว', {
      ...payload,
      type: 'order_form_submit',
    });
  }

  function handlePaymentDone(orderId: string) {
    void sendMessage('จ่ายแล้ว', {
      order_id: orderId,
      type: 'payment_done',
    });
  }

  async function handleStripeCheckout(orderId: string) {
    if (isSending || isStartingStripeCheckout || !canUseOrderActions) {
      return;
    }

    try {
      setError(null);
      setIsStartingStripeCheckout(true);
      appendLog({
        category: 'api',
        detail: 'Creating a Stripe Checkout Session for the active order.',
        status: 'info',
        title: 'Stripe checkout started',
      });
      const checkout = await createStripeCheckoutSession({
        orderId,
        sessionId: activeSessionId,
      });
      appendLog({
        category: 'api',
        detail: 'Stripe returned a hosted checkout URL. Opening it in the browser.',
        meta: [{ label: 'session', value: checkout.stripe_checkout_session_id.slice(-12) }],
        status: 'success',
        title: 'Stripe checkout ready',
      });
      await WebBrowser.openBrowserAsync(checkout.checkout_url);

      if (activeSessionId) {
        const refreshed = await refreshActiveOrderPanel(activeSessionId);

        setRestoredOrder(refreshed.order ?? checkout.order ?? null);
      }
    } catch (stripeError) {
      const message = stripeError instanceof Error ? stripeError.message : 'Unable to start Stripe Checkout.';

      setError(message);
      appendLog({
        category: 'api',
        detail: message,
        status: 'error',
        title: 'Stripe checkout failed',
      });
    } finally {
      setIsStartingStripeCheckout(false);
    }
  }

  async function handleSlipSelected({ file, order_id }: { file: SlipUploadFile; order_id: string }) {
    if (isSending || isUploadingSlip || !canUseOrderActions) {
      return;
    }

    const contentType = slipContentType(file);

    if (!contentType) {
      setError('Payment slip must be a JPEG or PNG image.');
      return;
    }

    try {
      setError(null);
      setIsUploadingSlip(true);
      appendLog({
        category: 'api',
        detail: 'Requesting a signed payment slip upload URL from the chat backend.',
        status: 'info',
        title: 'Slip upload started',
      });
      const upload = await requestPaymentSlipUpload({
        contentType,
        orderId: order_id,
        sessionId: activeSessionId,
      });
      await uploadPaymentSlipFile(upload.upload_url, file);
      appendLog({
        category: 'api',
        detail: 'Slip image uploaded to private storage; confirming payment with the storage path.',
        status: 'success',
        title: 'Slip uploaded',
      });
      await sendMessage('จ่ายแล้ว', {
        order_id,
        slip_path: upload.storage_path,
        type: 'payment_done',
      });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Unable to upload payment slip.';
      setError(message);
      appendLog({
        category: 'api',
        detail: message,
        status: 'error',
        title: 'Slip upload failed',
      });
    } finally {
      setIsUploadingSlip(false);
    }
  }

  function handleGrantConsent() {
    void sendMessage('Health data consent granted.', {
      type: 'consent_granted',
    });
  }

  async function loadEarlierHistory() {
    if (!activeSessionId || !historyCursor || isLoadingMoreHistory) {
      return;
    }

    setIsLoadingMoreHistory(true);

    try {
      const page = await queryClient.fetchQuery({
        queryFn: () => loadChatHistoryPage(activeSessionId, { before: historyCursor }),
        queryKey: chatHistoryQueryKeys.page(activeSessionId, historyCursor),
      });

      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        const olderMessages = page.messages.filter((message) => !existingIds.has(message.id));
        const currentMessages = current.length === 1 && current[0]?.id === 'welcome' ? [] : current;

        return [...olderMessages, ...currentMessages];
      });
      setHasMoreHistory(page.hasMore);
      setHistoryCursor(page.nextBefore);
      appendLog({
        category: 'api',
        detail: 'Loaded an older page of persisted chat messages.',
        meta: [
          { label: 'messages', value: String(page.messages.length) },
          { label: 'older page', value: page.hasMore ? 'available' : 'none' },
        ],
        status: 'success',
        title: 'Older history loaded',
      });
    } catch (historyError) {
      appendLog({
        category: 'api',
        detail: historyError instanceof Error ? historyError.message : 'Unable to load older chat history.',
        status: 'error',
        title: 'Older history failed',
      });
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }

  /*
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

  */

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={[styles.workspace, !isWideLayout ? styles.workspaceStack : null]}>
        <View style={[styles.chatPane, !isWideLayout ? styles.chatPaneStack : null]}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
          <Text style={styles.eyebrow}>OpenAI Platform</Text>
          <Text style={styles.title}>Chatbot</Text>
          <Text style={styles.subtitle}>
            A healthcare assistant wired for the MiraCare Platform prompt, backend product cards, and local fallback knowledge.
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
            <Text style={styles.statusLabel}>Fallback knowledge</Text>
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
            <Text style={styles.noticeTitle}>ต้อง login ก่อนใช้ OpenAI</Text>
            <Text style={styles.noticeBody}>
              Edge Function เปิด JWT verification แล้ว จึงต้องมี user session ก่อนเรียก AI
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

        {canUsePersistedChat && consentQuery.data && !consentQuery.data.granted ? (
          <View style={styles.consentSheetWrap}>
            <ConsentSheet disabled={isSending || consentQuery.isFetching} onGrant={handleGrantConsent} />
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
          {canUsePersistedChat && chatHistoryQuery.isLoading ? (
            <View style={styles.historyStatus}>
              <ActivityIndicator color="#3C7864" />
              <Text style={styles.historyStatusText}>Loading chat history...</Text>
            </View>
          ) : null}

          {canUsePersistedChat && activeSessionId && hasMoreHistory ? (
            <Pressable disabled={isLoadingMoreHistory} onPress={loadEarlierHistory} style={styles.loadHistoryButton}>
              <Text style={styles.loadHistoryButtonText}>{isLoadingMoreHistory ? 'Loading...' : 'Load earlier messages'}</Text>
            </Pressable>
          ) : null}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message}>
              {false && message.sources?.length ? (
                <View style={styles.sources}>
                  <Text style={styles.sourcesTitle}>Sources</Text>
                  {message.sources?.map((source) => (
                    <Text key={source.id} style={styles.sourceText}>
                      {source.title} · {source.category} · {source.source}
                    </Text>
                  ))}
                </View>
              ) : null}
              {message.role === 'assistant' && message.uiCards?.length ? (
                <View style={styles.uiCardStack}>
                  {message.uiCards.map((card) => (
                    <ChatUiCardRenderer
                      key={card.id}
                      card={card}
                      disabled={isSending || !canUseOrderActions}
                      onSelectProduct={handleSelectProduct}
                    />
                  ))}
                </View>
              ) : null}
              {message.role === 'assistant' && message.order ? (
                <View style={styles.uiCardStack}>
                  <OrderPanel
                    disabled={isSending || isUploadingSlip || isStartingStripeCheckout || !canUseOrderActions}
                    onPaymentDone={handlePaymentDone}
                    onSlipSelected={(payload) => void handleSlipSelected(payload)}
                    onStripeCheckout={(orderId) => void handleStripeCheckout(orderId)}
                    onSubmitForm={handleOrderFormSubmit}
                    order={message.order}
                  />
                </View>
              ) : null}
            </MessageBubble>
          ))}

          {shouldRenderRestoredOrder && restoredOrder ? (
            <View style={styles.restoredOrderPanel}>
              <OrderPanel
                disabled={isSending || isUploadingSlip || isStartingStripeCheckout || !canUseOrderActions}
                onPaymentDone={handlePaymentDone}
                onSlipSelected={(payload) => void handleSlipSelected(payload)}
                onStripeCheckout={(orderId) => void handleStripeCheckout(orderId)}
                onSubmitForm={handleOrderFormSubmit}
                order={restoredOrder}
              />
            </View>
          ) : null}

          {isSending ? (
            <View style={[styles.loadingBubble, messageBubbleStyles.loadingBubble]}>
              <ActivityIndicator color="#3C7864" />
                <Text style={styles.loadingText}>Preparing backend context and asking OpenAI...</Text>
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
              <Text style={styles.opsSubtitle}>AI, context, health save, and API process logs from this chat session.</Text>
            </View>
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
              <Text style={styles.opsMetricValue}>{activePromptVersionKey ? activePromptVersionKey.slice(-8) : 'platform'}</Text>
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
  consentSheetWrap: {
    gap: 8,
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
  historyStatus: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  historyStatusText: {
    color: '#587069',
    fontSize: 12,
    fontWeight: '800',
  },
  restoredOrderPanel: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    width: '100%',
  },
  loadHistoryButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  loadHistoryButtonText: {
    color: '#3C7864',
    fontSize: 12,
    fontWeight: '900',
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
  uiCardStack: {
    gap: 10,
    marginTop: 12,
  },
  productCardGroup: {
    gap: 10,
  },
  productCard: {
    backgroundColor: '#F7FAF8',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    overflow: 'hidden',
    padding: 10,
  },
  productImage: {
    backgroundColor: '#E4EEE9',
    borderRadius: 8,
    height: 78,
    width: 78,
  },
  productImageFallback: {
    alignItems: 'center',
    backgroundColor: '#DCE8E2',
    borderRadius: 8,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  productImageFallbackText: {
    color: '#3C7864',
    fontSize: 24,
    fontWeight: '900',
  },
  productCardBody: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  productTitle: {
    color: '#14231E',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  productHospital: {
    color: '#587069',
    fontSize: 12,
    fontWeight: '700',
  },
  productPrice: {
    color: '#163F34',
    fontSize: 14,
    fontWeight: '900',
  },
  productCta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#163F34',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 14,
  },
  productCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  memoryCard: {
    backgroundColor: '#F0F5F3',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  memoryCardTitle: {
    color: '#3C7864',
    fontSize: 12,
    fontWeight: '900',
  },
  memoryCardText: {
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
