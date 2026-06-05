import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { askGeminiWithRag, geminiConfigStatus, type ChatMessage } from '@/lib/ai/gemini';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { localHealthKnowledge } from '@/lib/rag/healthKnowledge';
import { retrieveRagContext } from '@/lib/rag/retriever';

const quickPrompts = [
  'ช่วยแนะนำแพ็กเกจตรวจสุขภาพสำหรับคนทำงานหนัก',
  'ถ้าซื้อแล้วต้องจองคิวโรงพยาบาลยังไง',
  'ผลเลือดเก่าควรใช้แนะนำแพ็กเกจได้ถึงเมื่อไหร่',
];

const initialMessages: ChatMessage[] = [
  {
    id: 'prototype-welcome',
    role: 'assistant',
    content: 'สวัสดีครับ ผมคือ Mira AI พร้อมช่วยเลือกแพ็กเกจตรวจสุขภาพ อธิบายขั้นตอนจองคิว และสรุปข้อมูลสุขภาพให้เข้าใจง่าย',
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

function createDemoAnswer(question: string) {
  const matches = retrieveRagContext(question, localHealthKnowledge, { limit: 2, maxContextChars: 1000 });

  if (matches.length === 0) {
    return {
      content:
        'ตอนนี้ผมยังไม่เจอ context ที่ตรงมากพอใน local RAG demo แต่ flow จริงจะส่งคำถามนี้ไปที่ Supabase Edge Function พร้อมข้อมูลสุขภาพและประวัติการซื้อของผู้ใช้',
      sources: [],
    };
  }

  return {
    content: [
      'จากข้อมูล demo ที่มี ผมแนะนำให้เริ่มจากการเลือกแพ็กเกจตามความเสี่ยงหลักก่อน แล้วค่อยให้โรงพยาบาลยืนยันรายละเอียดวันตรวจอีกครั้ง',
      '',
      ...matches.map((match, index) => `${index + 1}. ${match.title}: ${match.summary}`),
      '',
      'ในระบบจริง คำตอบนี้จะใช้ Gemini ผ่าน Supabase Edge Function และบันทึก health facts ที่ผู้ใช้ยืนยันแล้วกลับเข้า health memory vault',
    ].join('\n'),
    sources: matches.map((match) => ({
      category: match.category,
      id: match.id,
      riskLevel: match.riskLevel,
      score: match.score,
      source: match.source,
      sourceUrl: match.sourceUrl,
      summary: match.summary,
      title: match.title,
      topic: match.topic,
    })),
  };
}

function AnimatedGlassButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { friction: 7, tension: 140, toValue: 0.96, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { friction: 7, tension: 140, toValue: 1, useNativeDriver: true }).start()}>
      <Animated.View style={[styles.quickPrompt, { transform: [{ scale }] }]}>
        <Text style={styles.quickPromptText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function PrototypeChatPanel({ style }: { style?: StyleProp<ViewStyle> }) {
  const auth = useAuthSession();
  const scrollRef = useRef<ScrollView>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isSending, setIsSending] = useState(false);

  const canUseLiveAi = Boolean(auth.session && geminiConfigStatus.hasProxy);
  const modeLabel = canUseLiveAi ? 'Live Gemini' : geminiConfigStatus.hasProxy ? 'Login for live AI' : 'Local RAG demo';

  useEffect(() => {
    Animated.timing(fade, { duration: 520, toValue: 1, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages, isSending]);

  async function sendMessage(value = input) {
    const question = value.trim();

    if (!question || isSending) {
      return;
    }

    const userMessage = createMessage('user', question);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      if (canUseLiveAi) {
        const result = await askGeminiWithRag({ messages: nextMessages, question });
        setMessages((current) => [...current, createMessage('assistant', result.text, result.ragMatches)]);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 520));
        const demo = createDemoAnswer(question);
        setMessages((current) => [...current, createMessage('assistant', demo.content, demo.sources)]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI request failed.';
      const demo = createDemoAnswer(question);
      setMessages((current) => [
        ...current,
        createMessage('assistant', `${demo.content}\n\nหมายเหตุ: live AI ยังตอบไม่ได้ในตอนนี้ (${message})`, demo.sources),
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Animated.View style={[styles.panelWrap, style, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
      <BlurView intensity={36} tint="light" style={styles.blurShell}>
        <LinearGradient colors={['rgba(255,255,255,0.78)', 'rgba(232,242,255,0.52)']} style={styles.panel}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Mira AI Agent</Text>
              <Text style={styles.title}>ถามเรื่องสุขภาพและแพ็กเกจ</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={[styles.liveDot, canUseLiveAi ? styles.liveDotReady : null]} />
              <Text style={styles.liveBadgeText}>{modeLabel}</Text>
            </View>
          </View>

          <ScrollView ref={scrollRef} contentContainerStyle={styles.messageList} showsVerticalScrollIndicator={false}>
            {messages.map((message) => (
              <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                <Text style={[styles.bubbleText, message.role === 'user' ? styles.userBubbleText : null]}>{message.content}</Text>
                {message.sources?.length ? (
                  <Text style={[styles.sourceText, message.role === 'user' ? styles.userSourceText : null]}>
                    RAG sources {message.sources.length}
                  </Text>
                ) : null}
              </View>
            ))}
            {isSending ? (
              <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
                <ActivityIndicator color="#2D78FF" size="small" />
                <Text style={styles.typingText}>Mira กำลังวิเคราะห์...</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.quickPromptRow}>
            {quickPrompts.map((prompt) => (
              <AnimatedGlassButton key={prompt} label={prompt} onPress={() => sendMessage(prompt)} />
            ))}
          </View>

          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="ถาม Mira เช่น อยากตรวจสุขภาพแบบไหนดี"
              placeholderTextColor="#7B96C0"
              style={styles.input}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage()}
            />
            <Pressable disabled={isSending} onPress={() => sendMessage()} style={({ pressed }) => [styles.sendButton, pressed ? styles.sendButtonPressed : null]}>
              <Text style={styles.sendButtonText}>{isSending ? '...' : 'ส่ง'}</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panelWrap: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  blurShell: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  panel: {
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 32,
    borderWidth: 1,
    gap: 14,
    minHeight: 520,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#2D78FF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#071B45',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(80,139,255,0.26)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveDot: {
    backgroundColor: '#FFB84D',
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  liveDotReady: {
    backgroundColor: '#37D3A7',
  },
  liveBadgeText: {
    color: '#31527F',
    fontSize: 10,
    fontWeight: '900',
  },
  messageList: {
    gap: 10,
    minHeight: 250,
    paddingVertical: 4,
  },
  bubble: {
    borderRadius: 22,
    maxWidth: '88%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2D78FF',
  },
  bubbleText: {
    color: '#173B70',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  userBubbleText: {
    color: '#FFFFFF',
  },
  sourceText: {
    color: '#2D78FF',
    fontSize: 10,
    fontWeight: '900',
    marginTop: 8,
  },
  userSourceText: {
    color: '#DCE9FF',
  },
  typingBubble: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  typingText: {
    color: '#42679C',
    fontSize: 12,
    fontWeight: '800',
  },
  quickPromptRow: {
    gap: 8,
  },
  quickPrompt: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  quickPromptText: {
    color: '#244B82',
    fontSize: 12,
    fontWeight: '900',
  },
  composer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 8,
  },
  input: {
    color: '#071B45',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#2D78FF',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 54,
  },
  sendButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
