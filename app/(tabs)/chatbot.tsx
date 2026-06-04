import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  askGeminiWithRag,
  createOfflineRagAnswer,
  geminiConfigStatus,
  type ChatMessage,
} from '@/lib/ai/gemini';
import { localHealthKnowledge, type RagChunk } from '@/lib/rag/healthKnowledge';
import { retrieveRagContext } from '@/lib/rag/retriever';
import { loadRagChunks } from '@/lib/rag/supabaseRag';

const starterPrompts = [
  'อยากตรวจสุขภาพต้องเตรียมตัวยังไง',
  'จ่ายเงินแล้วต้องจองคิวยังไง',
  'ถ้ามี referral code จากหมอ ระบบใช้ยังไง',
];

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      'สวัสดีครับ ผมคือ Mira chatbot พร้อมช่วยเรื่องแพ็กเกจตรวจสุขภาพ ขั้นตอนจองคิว และ referral flow โดยใช้ RAG context ของระบบก่อนตอบเสมอ',
    createdAt: new Date().toISOString(),
  },
];

function createMessage(role: ChatMessage['role'], content: string, sources?: ChatMessage['sources']): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    sources,
  };
}

export default function ChatbotScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [ragChunks, setRagChunks] = useState<RagChunk[]>(localHealthKnowledge);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUseGemini = geminiConfigStatus.hasProxy;
  const modeLabel = geminiConfigStatus.hasProxy
    ? geminiConfigStatus.hasSupabaseProxy
      ? 'Supabase Edge Function'
      : 'External proxy'
    : 'Local RAG only';

  const activeRagPreview = useMemo(() => retrieveRagContext(input || 'health checkup booking', ragChunks, 2), [input, ragChunks]);

  useEffect(() => {
    let isMounted = true;

    loadRagChunks()
      .then((chunks) => {
        if (isMounted) {
          setRagChunks(chunks);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRagChunks(localHealthKnowledge);
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
  }, []);

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

    const ragMatches = retrieveRagContext(question, ragChunks, 3);
    const userMessage = createMessage('user', question);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    try {
      const answer = canUseGemini
        ? await askGeminiWithRag({ messages, question, ragMatches })
        : createOfflineRagAnswer(question, ragMatches);

      setMessages((current) => [...current, createMessage('assistant', answer, ragMatches)]);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Unable to reach Gemini.';
      setError(message);
      setMessages((current) => [...current, createMessage('assistant', createOfflineRagAnswer(question, ragMatches), ragMatches)]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Gemini + RAG</Text>
          <Text style={styles.title}>Chatbot</Text>
          <Text style={styles.subtitle}>
            A healthcare assistant wired for Gemini 3.5 Flash, local RAG, and optional Supabase RAG corpus.
          </Text>
        </View>

        <View style={styles.statusGrid}>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Model</Text>
            <Text style={styles.statusValue}>{geminiConfigStatus.model}</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Mode</Text>
            <Text style={styles.statusValue}>{modeLabel}</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>RAG chunks</Text>
            <Text style={styles.statusValue}>{isLoadingKnowledge ? 'Loading' : ragChunks.length}</Text>
          </View>
        </View>

        {!canUseGemini ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Gemini proxy ยังไม่ได้ตั้งค่า</Text>
            <Text style={styles.noticeBody}>
              ใส่ Supabase URL/key แล้วตั้ง GEMINI_API_KEY เป็น Edge Function secret หรือใส่ EXPO_PUBLIC_AI_PROXY_URL แล้ว restart Expo
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Gemini request fallback</Text>
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
                      {source.title} · {source.source}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}

          {isSending ? (
            <View style={[styles.bubble, styles.assistantBubble, styles.loadingBubble]}>
              <ActivityIndicator color="#3C7864" />
              <Text style={styles.loadingText}>Retrieving context and asking Gemini...</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.ragPreview}>
          <Text style={styles.sectionTitle}>Current RAG preview</Text>
          {activeRagPreview.map((match) => (
            <View key={match.id} style={styles.ragItem}>
              <Text style={styles.ragTitle}>{match.title}</Text>
              <Text style={styles.ragBody} numberOfLines={3}>
                {match.content}
              </Text>
            </View>
          ))}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7FAF8',
    flex: 1,
  },
  container: {
    gap: 18,
    padding: 20,
    paddingBottom: 128,
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
  ragPreview: {
    gap: 10,
  },
  sectionTitle: {
    color: '#14231E',
    fontSize: 18,
    fontWeight: '800',
  },
  ragItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  ragTitle: {
    color: '#14231E',
    fontSize: 15,
    fontWeight: '800',
  },
  ragBody: {
    color: '#587069',
    fontSize: 13,
    lineHeight: 19,
  },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    left: 0,
    padding: 14,
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
