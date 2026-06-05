import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { askGeminiWithRag, geminiConfigStatus, type ChatMessage } from '@/lib/ai/gemini';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { localHealthKnowledge } from '@/lib/rag/healthKnowledge';
import { retrieveRagContext } from '@/lib/rag/retriever';

const logo = require('@/assets/images/mira-orbit-logo.png');

const initialMessages: ChatMessage[] = [
  {
    id: 'demo-audio-1',
    role: 'user',
    content: 'VOICE: อยากตรวจสุขภาพแบบ executive checkup ที่เหมาะกับคนทำงานหนัก',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-assistant-1',
    role: 'assistant',
    content: 'ได้เลยค่ะ Mira จะช่วยคัดแพ็กเกจตามความเสี่ยง สุขภาพล่าสุด งบประมาณ และโรงพยาบาลที่เหมาะกับคุณ',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-audio-2',
    role: 'user',
    content: 'VOICE: ถ้าซื้อแล้วต้องจองคิวโรงพยาบาลยังไง',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-assistant-2',
    role: 'assistant',
    content: 'หลังชำระเงิน ระบบจะสร้าง order ให้ จากนั้นแจ้งเลขคำสั่งซื้อกับทีม Sales ของโรงพยาบาลเพื่อเลือกวันและเวลาตรวจได้ทันที',
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
        'ตอนนี้ยังไม่มี context ที่ตรงพอใน RAG demo แต่ระบบจริงจะส่งคำถามนี้ไปที่ Supabase Edge Function พร้อม health profile และประวัติการซื้อของผู้ใช้',
      sources: [],
    };
  }

  return {
    content: [
      'จากข้อมูลที่มี Mira แนะนำให้เลือกแพ็กเกจตามความเสี่ยงหลักก่อน แล้วค่อยให้โรงพยาบาลยืนยันรายละเอียดวันตรวจอีกครั้ง',
      ...matches.map((match, index) => `${index + 1}. ${match.title}: ${match.summary}`),
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

function useEntrance(index: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { delay: 90 * index, duration: 420, toValue: 1, useNativeDriver: true }),
      Animated.spring(translate, { delay: 90 * index, friction: 8, tension: 95, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [index, opacity, translate]);

  return { opacity, transform: [{ translateY: translate }] };
}

function GlassIconButton({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { friction: 8, tension: 180, toValue: 0.92, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { friction: 8, tension: 180, toValue: 1, useNativeDriver: true }).start()}>
      <Animated.View style={[styles.glassIconShadow, { transform: [{ scale }] }]}>
        <BlurView intensity={28} tint="light" style={styles.glassIcon}>
          {children}
        </BlurView>
      </Animated.View>
    </Pressable>
  );
}

function Waveform({ light = false }: { light?: boolean }) {
  const bars = [8, 14, 21, 12, 28, 18, 24, 10, 20, 26, 15, 9, 22, 13, 18, 28, 16, 10];

  return (
    <View style={styles.waveform}>
      {bars.map((height, index) => (
        <View
          key={`${height}-${index}`}
          style={[
            styles.waveBar,
            {
              backgroundColor: light ? '#FFFFFF' : '#9EB8EA',
              height,
              opacity: index % 3 === 0 ? 0.55 : 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

function VoiceBubble({ duration, index }: { duration: string; index: number }) {
  const entrance = useEntrance(index);

  return (
    <Animated.View style={[styles.userVoiceRow, entrance]}>
      <LinearGradient colors={['#0E1733', '#151B3D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.voiceBubble}>
        <View style={styles.playCircle}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
        <Waveform light />
        <Text style={styles.voiceDuration}>{duration}</Text>
      </LinearGradient>
      <Image source={logo} resizeMode="contain" style={styles.userAvatar} />
    </Animated.View>
  );
}

function AssistantAvatar() {
  return (
    <LinearGradient colors={['#D9FFFF', '#B5C9FF', '#F6B8FF']} style={styles.assistantAvatar}>
      <Image source={logo} resizeMode="contain" style={styles.assistantLogo} />
    </LinearGradient>
  );
}

function AssistantBubble({ children, index }: { children: React.ReactNode; index: number }) {
  const entrance = useEntrance(index);

  return (
    <Animated.View style={[styles.assistantRow, entrance]}>
      <AssistantAvatar />
      <BlurView intensity={28} tint="light" style={styles.assistantBubble}>
        <Text style={styles.assistantText}>{children}</Text>
      </BlurView>
    </Animated.View>
  );
}

function TextUserBubble({ children, index }: { children: React.ReactNode; index: number }) {
  const entrance = useEntrance(index);

  return (
    <Animated.View style={[styles.textUserBubble, entrance]}>
      <Text style={styles.textUser}>{children}</Text>
    </Animated.View>
  );
}

function PackagePreviewCard() {
  return (
    <View style={styles.previewCard}>
      <Svg height={116} width="100%" viewBox="0 0 240 116">
        <Defs>
          <SvgGradient id="previewBg" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#B8E8FF" />
            <Stop offset="0.55" stopColor="#B8C6FF" />
            <Stop offset="1" stopColor="#F0B8FF" />
          </SvgGradient>
          <SvgGradient id="orb" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#38E8E0" />
            <Stop offset="0.5" stopColor="#7378FF" />
            <Stop offset="1" stopColor="#FF99E8" />
          </SvgGradient>
        </Defs>
        <Rect fill="url(#previewBg)" height="116" rx="24" width="240" />
        <Circle cx="64" cy="54" fill="rgba(255,255,255,0.58)" r="28" />
        <Path d="M122 70 C145 19 206 18 214 61 C219 88 190 104 146 98 C121 95 113 87 122 70 Z" fill="none" stroke="rgba(255,255,255,0.82)" strokeLinecap="round" strokeWidth="9" />
        <Circle cx="164" cy="62" fill="url(#orb)" r="28" />
        <Circle cx="198" cy="49" fill="#FFFFFF" opacity="0.82" r="10" />
      </Svg>
      <View style={styles.previewOverlay}>
        <Text style={styles.previewTitle}>Executive Longevity</Text>
        <Text style={styles.previewMeta}>AI match 92% · 24,900 THB</Text>
      </View>
    </View>
  );
}

function PackagePreviewMessage({ index }: { index: number }) {
  const entrance = useEntrance(index);

  return (
    <Animated.View style={[styles.previewRow, entrance]}>
      <AssistantAvatar />
      <View style={styles.previewStack}>
        <PackagePreviewCard />
        <View style={styles.actionRow}>
          {['▢', '♡', '⌁', '↩'].map((icon) => (
            <Pressable key={icon} style={({ pressed }) => [styles.smallAction, pressed ? styles.smallActionPressed : null]}>
              <Text style={styles.smallActionText}>{icon}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function TypingMessage({ index }: { index: number }) {
  const entrance = useEntrance(index);

  return (
    <Animated.View style={[styles.assistantRow, entrance]}>
      <AssistantAvatar />
      <BlurView intensity={28} tint="light" style={[styles.assistantBubble, styles.typingBubble]}>
        <ActivityIndicator color="#735EFF" size="small" />
        <Text style={styles.typingText}>Mira is thinking...</Text>
      </BlurView>
    </Animated.View>
  );
}

function Composer({ input, isSending, setInput, sendMessage }: { input: string; isSending: boolean; setInput: (value: string) => void; sendMessage: () => void }) {
  return (
    <BlurView intensity={34} tint="light" style={styles.composerGlass}>
      <View style={styles.plusButton}>
        <Text style={styles.plusText}>＋</Text>
      </View>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="Type your message..."
        placeholderTextColor="#667EA8"
        returnKeyType="send"
        style={styles.input}
        onSubmitEditing={sendMessage}
      />
      <View style={styles.micButton}>
        <Text style={styles.micText}>◉</Text>
      </View>
      <Pressable disabled={isSending} onPress={sendMessage} style={({ pressed }) => [styles.sendButton, pressed ? styles.sendPressed : null]}>
        <LinearGradient colors={['#A9B6FF', '#7F74FF', '#5C91FF']} style={styles.sendGradient}>
          <Text style={styles.sendText}>{isSending ? '…' : '➤'}</Text>
        </LinearGradient>
      </Pressable>
    </BlurView>
  );
}

export function PrototypeChatPanel() {
  const auth = useAuthSession();
  const scrollRef = useRef<ScrollView>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isSending, setIsSending] = useState(false);

  const canUseLiveAi = Boolean(auth.session && geminiConfigStatus.hasProxy);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 1400, toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 1400, toValue: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages, isSending]);

  async function sendMessage() {
    const question = input.trim();

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
      setMessages((current) => [...current, createMessage('assistant', `${demo.content}\n\nLive AI ยังตอบไม่ได้ตอนนี้ (${message})`, demo.sources)]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.phoneFrame}>
          <LinearGradient colors={['#C9D8FF', '#DCCEFF', '#EEF5FF']} style={styles.screen}>
            <View style={styles.statusBar}>
              <Text style={styles.statusTime}>9:40 PM</Text>
              <View style={styles.statusRight}>
                <Text style={styles.statusGlyph}>▴</Text>
                <Text style={styles.statusGlyph}>⌁</Text>
                <View style={styles.battery} />
              </View>
            </View>

            <View style={styles.header}>
              <GlassIconButton>
                <Text style={styles.headerIcon}>‹</Text>
              </GlassIconButton>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Smart Chat</Text>
                <View style={styles.modeRow}>
                  <Animated.View
                    style={[
                      styles.modeDot,
                      {
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.15] }) }],
                      },
                    ]}
                  />
                  <Text style={styles.modeText}>{canUseLiveAi ? 'Live Gemini' : 'RAG demo'}</Text>
                </View>
              </View>
              <GlassIconButton>
                <Text style={styles.headerIcon}>•••</Text>
              </GlassIconButton>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
              {messages.map((message, index) => {
                if (message.role === 'user' && message.content.startsWith('VOICE:')) {
                  return <VoiceBubble key={message.id} duration={index === 0 ? '2:19' : '1:19'} index={index} />;
                }

                if (message.role === 'user') {
                  return (
                    <TextUserBubble key={message.id} index={index}>
                      {message.content}
                    </TextUserBubble>
                  );
                }

                return (
                  <AssistantBubble key={message.id} index={index}>
                    {message.content}
                  </AssistantBubble>
                );
              })}

              <View style={styles.timestampWrap}>
                <Text style={styles.timestamp}>8:23 am</Text>
              </View>

              <PackagePreviewMessage index={messages.length + 1} />

              {isSending ? (
                <TypingMessage index={messages.length + 2} />
              ) : null}
            </ScrollView>

            <Composer input={input} isSending={isSending} sendMessage={sendMessage} setInput={setInput} />
            <View style={styles.homeIndicator} />
          </LinearGradient>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  phoneFrame: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 42,
    borderWidth: 1,
    flex: 1,
    margin: 12,
    maxWidth: 430,
    overflow: 'hidden',
    shadowColor: '#8874E8',
    shadowOffset: { height: 24, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 42,
    width: '94%',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  statusBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 5,
  },
  statusTime: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  statusRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  statusGlyph: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  battery: {
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    height: 8,
    width: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingTop: 8,
  },
  glassIconShadow: {
    shadowColor: '#8A76EA',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  glassIcon: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.38)',
    borderRadius: 999,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 46,
  },
  headerIcon: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  modeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 5,
  },
  modeDot: {
    backgroundColor: '#8BFFE8',
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  modeText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '900',
  },
  messages: {
    gap: 12,
    paddingBottom: 18,
    paddingTop: 8,
  },
  userVoiceRow: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  voiceBubble: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 250,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  playCircle: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  playIcon: {
    color: '#0C1534',
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 2,
  },
  waveform: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minWidth: 104,
  },
  waveBar: {
    borderRadius: 999,
    width: 2,
  },
  voiceDuration: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  userAvatar: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    height: 34,
    width: 34,
  },
  assistantRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    maxWidth: '90%',
  },
  assistantAvatar: {
    alignItems: 'center',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 34,
  },
  assistantLogo: {
    height: 26,
    width: 26,
  },
  assistantBubble: {
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  assistantText: {
    color: '#1B2446',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  textUserBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#141C3E',
    borderRadius: 20,
    maxWidth: '82%',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  textUser: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  timestampWrap: {
    alignSelf: 'center',
    marginVertical: -2,
  },
  timestamp: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '900',
  },
  previewRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  previewStack: {
    flex: 1,
    gap: 9,
  },
  previewCard: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  previewOverlay: {
    bottom: 10,
    left: 12,
    position: 'absolute',
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  previewMeta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 14,
    paddingLeft: 6,
  },
  smallAction: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  smallActionPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.94 }],
  },
  smallActionText: {
    color: '#3B456B',
    fontSize: 14,
    fontWeight: '900',
  },
  typingBubble: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  typingText: {
    color: '#40517D',
    fontSize: 12,
    fontWeight: '900',
  },
  composerGlass: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.48)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    overflow: 'hidden',
    padding: 8,
  },
  plusButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  plusText: {
    color: '#3B4D77',
    fontSize: 18,
    fontWeight: '700',
  },
  input: {
    color: '#1B2446',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    minHeight: 36,
    paddingHorizontal: 4,
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  micText: {
    color: '#4B5E8E',
    fontSize: 14,
    fontWeight: '900',
  },
  sendButton: {
    borderRadius: 999,
    height: 44,
    shadowColor: '#6F6CFF',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 16,
    width: 44,
  },
  sendPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.95 }],
  },
  sendGradient: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 2,
  },
  homeIndicator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999,
    height: 4,
    marginBottom: 6,
    width: 78,
  },
});
