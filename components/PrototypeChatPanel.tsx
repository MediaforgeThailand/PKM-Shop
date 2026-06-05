import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { askGeminiWithRag, geminiConfigStatus, type ChatMessage } from '@/lib/ai/gemini';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { localHealthKnowledge } from '@/lib/rag/healthKnowledge';
import { retrieveRagContext } from '@/lib/rag/retriever';

const logo = require('@/assets/images/mira-orbit-logo.png');

const demoMessages: ChatMessage[] = [
  {
    id: 'demo-voice-1',
    role: 'user',
    content: 'VOICE: อยากตรวจสุขภาพแบบ executive checkup ที่เหมาะกับคนทำงานหนัก',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-assistant-1',
    role: 'assistant',
    content: 'Sure! Do you want a full health checkup package or focus on a specific concern first?',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-voice-2',
    role: 'user',
    content: 'VOICE: ขอแพ็กเกจที่ดูเรื่องความเครียด นอนน้อย และความเสี่ยงระยะยาว',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-assistant-2',
    role: 'assistant',
    content: 'Got it! Generating a personalized hospital checkup plan just for you...',
    createdAt: new Date().toISOString(),
  },
];

const previewAfterMessageId = 'demo-assistant-2';
const voiceDurations = ['2:19', '1:19'];

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
      'จากข้อมูลที่มี Mira แนะนำให้เลือกแพ็กเกจตามความเสี่ยงหลักก่อน แล้วให้โรงพยาบาลยืนยันรายละเอียดวันตรวจอีกครั้ง',
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
  const translate = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { delay: 70 * index, duration: 360, toValue: 1, useNativeDriver: true }),
      Animated.spring(translate, { delay: 70 * index, friction: 8, tension: 110, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [index, opacity, translate]);

  return { opacity, transform: [{ translateY: translate }] };
}

function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { friction: 7, tension: 220, toValue: 0.92, useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.spring(scale, { friction: 7, tension: 220, toValue: 1, useNativeDriver: true }).start();
  }

  return { pressIn, pressOut, scale };
}

function GlassCircleButton({ children, onPress, large = false }: { children: ReactNode; onPress?: () => void; large?: boolean }) {
  const { pressIn, pressOut, scale } = usePressScale();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.roundButtonShadow, { transform: [{ scale }] }]}>
        <BlurView intensity={24} tint="light" style={[styles.roundButton, large ? styles.roundButtonLarge : null]}>
          {children}
        </BlurView>
      </Animated.View>
    </Pressable>
  );
}

function BackIcon() {
  return (
    <Svg height={18} viewBox="0 0 18 18" width={18}>
      <Path d="M11.5 3.5 6 9l5.5 5.5" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </Svg>
  );
}

function DotsIcon() {
  return (
    <View style={styles.dotsIcon}>
      <View style={styles.dot} />
      <View style={styles.dot} />
      <View style={styles.dot} />
    </View>
  );
}

function PlusIcon() {
  return (
    <Svg height={18} viewBox="0 0 18 18" width={18}>
      <Path d="M9 3.5v11M3.5 9h11" fill="none" stroke="#65708B" strokeLinecap="round" strokeWidth={1.5} />
    </Svg>
  );
}

function MicIcon({ color = '#5B6683' }: { color?: string }) {
  return (
    <Svg height={18} viewBox="0 0 18 18" width={18}>
      <Rect fill="none" height={8.4} rx={3.2} stroke={color} strokeWidth={1.45} width={5.7} x={6.15} y={2.3} />
      <Path d="M4.6 8.6c.2 2.35 1.9 4.05 4.4 4.05s4.2-1.7 4.4-4.05M9 12.65v2.35M6.7 15h4.6" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.45} />
    </Svg>
  );
}

function SendIcon() {
  return (
    <Svg height={20} viewBox="0 0 20 20" width={20}>
      <Path d="M3.2 10.6 16.3 4c.45-.22.92.25.7.7l-6.6 13.1c-.22.43-.85.36-.97-.11L8.1 12l-4.77-1.04c-.49-.11-.58-.77-.13-.99Z" fill="#FFFFFF" />
      <Path d="M8.25 11.82 16.05 4.3" fill="none" stroke="#DDE6FF" strokeLinecap="round" strokeWidth={1.1} />
    </Svg>
  );
}

function PlayIcon() {
  return (
    <View style={styles.playCircle}>
      <View style={styles.playTriangle} />
    </View>
  );
}

function StatusGlyphs() {
  return (
    <View style={styles.statusRight}>
      <View style={styles.signalBars}>
        <View style={[styles.signalBar, { height: 4 }]} />
        <View style={[styles.signalBar, { height: 6 }]} />
        <View style={[styles.signalBar, { height: 8 }]} />
      </View>
      <View style={styles.wifiGlyph}>
        <View style={styles.wifiArcWide} />
        <View style={styles.wifiArcSmall} />
      </View>
      <View style={styles.batteryShell}>
        <View style={styles.batteryFill} />
      </View>
    </View>
  );
}

function Waveform({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  const bars = compact ? [8, 14, 20, 11, 23, 17, 10, 19, 14, 21, 9, 16] : [8, 13, 19, 11, 25, 17, 22, 10, 18, 24, 14, 9, 21, 12, 17, 24];

  return (
    <View style={[styles.waveform, compact ? styles.waveformCompact : null]}>
      {bars.map((height, index) => (
        <View
          key={`${height}-${index}`}
          style={[
            styles.waveBar,
            {
              backgroundColor: light ? '#FFFFFF' : '#B9C7E8',
              height,
              opacity: index % 4 === 0 ? 0.52 : 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

function UserAvatar() {
  return (
    <View style={styles.userAvatarShell}>
      <LinearGradient colors={['#FFFFFF', '#E0F7FF', '#D8D3FF']} style={styles.userAvatar}>
        <Image source={logo} resizeMode="contain" style={styles.userLogo} />
      </LinearGradient>
    </View>
  );
}

function AssistantAvatar() {
  return (
    <LinearGradient colors={['#C7F8FF', '#9FB7FF', '#F0B1FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.assistantAvatar}>
      <Image source={logo} resizeMode="contain" style={styles.assistantLogo} />
    </LinearGradient>
  );
}

function MessageTime({ align = 'center' }: { align?: 'center' | 'right' }) {
  return (
    <View style={[styles.messageTimeWrap, align === 'right' ? styles.messageTimeRight : null]}>
      <Text style={styles.messageTime}>8:23 am</Text>
    </View>
  );
}

function VoiceBubble({ duration, index }: { duration: string; index: number }) {
  const entrance = useEntrance(index);

  return (
    <Animated.View style={[styles.userVoiceRow, entrance]}>
      <LinearGradient colors={['#0C122D', '#171A3C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.voiceBubble}>
        <PlayIcon />
        <Waveform light />
        <Text style={styles.voiceDuration}>{duration}</Text>
      </LinearGradient>
      <UserAvatar />
    </Animated.View>
  );
}

function AssistantBubble({ children, index }: { children: ReactNode; index: number }) {
  const entrance = useEntrance(index);

  return (
    <Animated.View style={[styles.assistantRow, entrance]}>
      <AssistantAvatar />
      <BlurView intensity={24} tint="light" style={styles.assistantBubble}>
        <Text style={styles.assistantText}>{children}</Text>
      </BlurView>
    </Animated.View>
  );
}

function TextUserBubble({ children, index }: { children: ReactNode; index: number }) {
  const entrance = useEntrance(index);

  return (
    <Animated.View style={[styles.userTextRow, entrance]}>
      <LinearGradient colors={['#0C122D', '#171A3C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userTextBubble}>
        <Text style={styles.userText}>{children}</Text>
      </LinearGradient>
      <UserAvatar />
    </Animated.View>
  );
}

function PackageVisual() {
  return (
    <View style={styles.previewVisual}>
      <Svg height="100%" viewBox="0 0 168 96" width="100%">
        <Defs>
          <SvgGradient id="previewBg" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#B7E9FF" />
            <Stop offset="0.48" stopColor="#9EAEFF" />
            <Stop offset="1" stopColor="#F4B8FF" />
          </SvgGradient>
          <SvgGradient id="glassOrb" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#66FFF0" />
            <Stop offset="0.52" stopColor="#7390FF" />
            <Stop offset="1" stopColor="#FF9CE9" />
          </SvgGradient>
        </Defs>
        <Rect fill="url(#previewBg)" height={96} rx={18} width={168} />
        <Path d="M15 70c24-28 45-18 57-43 9-19 37-15 43 5 7 26 34 10 42 32 7 20-11 27-48 22-30-4-48-7-94-16Z" fill="#FFFFFF" opacity={0.25} />
        <Circle cx={54} cy={45} fill="#FFFFFF" opacity={0.46} r={20} />
        <Circle cx={112} cy={49} fill="url(#glassOrb)" opacity={0.94} r={23} />
        <Circle cx={132} cy={32} fill="#FFFFFF" opacity={0.78} r={8} />
        <Path d="M88 39c19-19 43-17 59 3" fill="none" opacity={0.82} stroke="#FFFFFF" strokeLinecap="round" strokeWidth={5} />
        <Path d="M84 63c20 12 42 14 66 3" fill="none" opacity={0.62} stroke="#FFFFFF" strokeLinecap="round" strokeWidth={5} />
      </Svg>
      <View style={styles.previewLabel}>
        <Text style={styles.previewTitle}>Longevity Check</Text>
        <Text style={styles.previewMeta}>AI match 92%</Text>
      </View>
    </View>
  );
}

function ActionIcon({ type }: { type: 'copy' | 'like' | 'sound' | 'reply' }) {
  if (type === 'copy') {
    return (
      <Svg height={17} viewBox="0 0 18 18" width={17}>
        <Rect fill="none" height={8.5} rx={1.8} stroke="#303A55" strokeWidth={1.4} width={8.5} x={6.2} y={4.3} />
        <Path d="M4 13.2H3.3c-.9 0-1.6-.7-1.6-1.6V4.2c0-.9.7-1.6 1.6-1.6h7.4c.9 0 1.6.7 1.6 1.6v.6" fill="none" stroke="#303A55" strokeLinecap="round" strokeWidth={1.4} />
      </Svg>
    );
  }

  if (type === 'like') {
    return (
      <Svg height={17} viewBox="0 0 18 18" width={17}>
        <Path d="M6.9 7.3 8.7 3c.23-.55.95-.7 1.4-.3.42.38.55.98.34 1.5l-.95 2.45h3.77c1.1 0 1.9 1.02 1.66 2.08l-.87 3.77c-.18.78-.88 1.33-1.69 1.33H7.5c-.6 0-1.15-.31-1.46-.82L5.3 11.8V8.2l1.6-.9Z" fill="none" stroke="#303A55" strokeLinejoin="round" strokeWidth={1.35} />
        <Path d="M2.7 7.7h2.6v6.1H2.7z" fill="none" stroke="#303A55" strokeLinejoin="round" strokeWidth={1.35} />
      </Svg>
    );
  }

  if (type === 'sound') {
    return (
      <Svg height={17} viewBox="0 0 18 18" width={17}>
        <Path d="M3 7.1h2.6L9 4.2v9.6L5.6 10.9H3z" fill="none" stroke="#303A55" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.35} />
        <Path d="M11.4 6.1c.8.78 1.18 1.75 1.18 2.89s-.38 2.13-1.18 2.91M13.6 4.3A6.25 6.25 0 0 1 15.2 9c0 1.84-.54 3.4-1.6 4.7" fill="none" stroke="#303A55" strokeLinecap="round" strokeWidth={1.35} />
      </Svg>
    );
  }

  return (
    <Svg height={17} viewBox="0 0 18 18" width={17}>
      <Path d="M13.5 7.3H7.4c-1.7 0-3.1 1.4-3.1 3.1v.65M4.3 11.05 2.2 8.95M4.3 11.05l2.1-2.1" fill="none" stroke="#303A55" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.45} />
    </Svg>
  );
}

function PackagePreviewMessage({ index }: { index: number }) {
  const entrance = useEntrance(index);
  const actions: Array<'copy' | 'like' | 'sound' | 'reply'> = ['copy', 'like', 'sound', 'reply'];

  return (
    <Animated.View style={[styles.previewRow, entrance]}>
      <AssistantAvatar />
      <View style={styles.previewStack}>
        <PackageVisual />
        <View style={styles.actionRow}>
          {actions.map((type) => (
            <Pressable key={type} style={({ pressed }) => [styles.actionButton, pressed ? styles.actionButtonPressed : null]}>
              <ActionIcon type={type} />
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
      <BlurView intensity={24} tint="light" style={[styles.assistantBubble, styles.typingBubble]}>
        <ActivityIndicator color="#786AFF" size="small" />
        <Waveform compact />
      </BlurView>
    </Animated.View>
  );
}

function Composer({
  input,
  isSending,
  sendMessage,
  setInput,
}: {
  input: string;
  isSending: boolean;
  sendMessage: () => void;
  setInput: (value: string) => void;
}) {
  const { pressIn, pressOut, scale } = usePressScale();

  return (
    <View style={styles.composerWrap}>
      <BlurView intensity={28} tint="light" style={styles.composerGlass}>
        <View style={styles.plusButton}>
          <PlusIcon />
        </View>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          placeholder="Type your message..."
          placeholderTextColor="#5F6D8C"
          returnKeyType="send"
          style={styles.input}
        />
        <View style={styles.micButton}>
          <MicIcon />
        </View>
      </BlurView>
      <Pressable disabled={isSending} onPress={sendMessage} onPressIn={pressIn} onPressOut={pressOut}>
        <Animated.View style={[styles.sendShadow, { transform: [{ scale }] }]}>
          <LinearGradient colors={['#B8E9FF', '#9E85FF', '#6C7CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendButton}>
            {isSending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <SendIcon />}
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

function ScreenSheen() {
  return (
    <Svg height="100%" pointerEvents="none" style={styles.sheenLayer} viewBox="0 0 360 720" width="100%">
      <Defs>
        <SvgGradient id="topSheen" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.38} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgGradient>
        <SvgGradient id="bottomSheen" x1="1" x2="0" y1="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.3} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Path d="M-30 78C52 10 156 25 238-4h152v248C254 196 156 178-30 252Z" fill="url(#topSheen)" />
      <Path d="M-36 542C64 494 160 536 244 464c51-44 90-67 152-58v350H-36Z" fill="url(#bottomSheen)" />
    </Svg>
  );
}

function renderTimeline(messages: ChatMessage[]) {
  let voiceIndex = 0;
  const nodes: ReactNode[] = [];

  messages.forEach((message, index) => {
    const isVoice = message.role === 'user' && message.content.startsWith('VOICE:');

    if (isVoice) {
      const duration = voiceDurations[voiceIndex] ?? '0:42';
      voiceIndex += 1;
      nodes.push(
        <View key={message.id} style={styles.voiceBlock}>
          <VoiceBubble duration={duration} index={index} />
          <MessageTime align="right" />
        </View>,
      );
      return;
    }

    if (message.role === 'user') {
      nodes.push(
        <TextUserBubble key={message.id} index={index}>
          {message.content}
        </TextUserBubble>,
      );
      return;
    }

    nodes.push(
      <AssistantBubble key={message.id} index={index}>
        {message.content}
      </AssistantBubble>,
    );

    if (message.id === previewAfterMessageId) {
      nodes.push(<PackagePreviewMessage key="package-preview" index={index + 0.3} />);
    }
  });

  return nodes;
}

export function PrototypeChatPanel() {
  const auth = useAuthSession();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(demoMessages);
  const [isSending, setIsSending] = useState(false);
  const { height, width } = useWindowDimensions();

  const canUseLiveAi = Boolean(auth.session && geminiConfigStatus.hasProxy);
  const isCompact = width < 430;
  const frameSize = useMemo(
    () => ({
      height: isCompact ? height : Math.min(720, Math.max(650, height - 24)),
      width: isCompact ? width : Math.min(360, width - 32),
    }),
    [height, isCompact, width],
  );

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 70);
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
        <View style={styles.stage}>
          <View style={[styles.phoneShell, isCompact ? styles.phoneShellCompact : null, frameSize]}>
            <LinearGradient colors={['#BFD3FF', '#C8BDF8', '#DFE9FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
              <ScreenSheen />

              <View style={styles.statusBar}>
                <Text style={styles.statusTime}>9:40 PM</Text>
                <StatusGlyphs />
              </View>

              <View style={styles.header}>
                <GlassCircleButton>
                  <BackIcon />
                </GlassCircleButton>
                <Text style={styles.headerTitle}>Smart Chat</Text>
                <GlassCircleButton large>
                  <DotsIcon />
                </GlassCircleButton>
              </View>

              <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
                {renderTimeline(messages)}
                {isSending ? <TypingMessage index={messages.length + 1} /> : null}
              </ScrollView>

              <Composer input={input} isSending={isSending} sendMessage={sendMessage} setInput={setInput} />
              <View style={styles.homeIndicator} />
            </LinearGradient>
          </View>
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
  stage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 12,
  },
  phoneShell: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: 44,
    borderWidth: 1.2,
    overflow: 'hidden',
    shadowColor: '#7A72D9',
    shadowOffset: { height: 24, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 38,
  },
  phoneShellCompact: {
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheenLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  statusBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 28,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  statusTime: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  statusRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  signalBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 1.5,
    height: 10,
  },
  signalBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    width: 2.3,
  },
  wifiGlyph: {
    height: 10,
    width: 13,
  },
  wifiArcWide: {
    borderColor: '#FFFFFF',
    borderLeftWidth: 1.4,
    borderRadius: 999,
    borderRightWidth: 1.4,
    borderTopWidth: 1.4,
    height: 10,
    opacity: 0.95,
    position: 'absolute',
    top: 1,
    width: 13,
  },
  wifiArcSmall: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    bottom: 0,
    height: 3,
    left: 5,
    position: 'absolute',
    width: 3,
  },
  batteryShell: {
    borderColor: '#FFFFFF',
    borderRadius: 3,
    borderWidth: 1,
    height: 8,
    padding: 1,
    width: 17,
  },
  batteryFill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    flex: 1,
    width: '78%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 58,
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
  },
  roundButtonShadow: {
    shadowColor: '#725ECA',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  roundButtonLarge: {
    height: 48,
    width: 48,
  },
  dotsIcon: {
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 3.2,
    width: 3.2,
  },
  messages: {
    gap: 10,
    paddingBottom: 18,
    paddingTop: 16,
  },
  voiceBlock: {
    alignSelf: 'stretch',
  },
  userVoiceRow: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  voiceBubble: {
    alignItems: 'center',
    borderRadius: 21,
    flexDirection: 'row',
    gap: 7,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    width: 190,
  },
  playCircle: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  playTriangle: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 5,
    borderLeftColor: '#0F1632',
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderTopWidth: 5,
    height: 0,
    marginLeft: 2,
    width: 0,
  },
  waveform: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    width: 102,
  },
  waveformCompact: {
    width: 76,
  },
  waveBar: {
    borderRadius: 999,
    width: 2,
  },
  voiceDuration: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  userAvatarShell: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999,
    borderWidth: 1.5,
    padding: 2,
  },
  userAvatar: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 30,
  },
  userLogo: {
    height: 23,
    width: 23,
  },
  assistantRow: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    maxWidth: '100%',
  },
  assistantAvatar: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 32,
  },
  assistantLogo: {
    height: 24,
    width: 24,
  },
  assistantBubble: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.56)',
    borderRadius: 18,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: 222,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 11,
    width: 222,
  },
  assistantText: {
    color: '#202845',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  userTextRow: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    maxWidth: '100%',
  },
  userTextBubble: {
    borderRadius: 19,
    flexShrink: 1,
    maxWidth: 224,
    paddingHorizontal: 13,
    paddingVertical: 10,
    width: 224,
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  messageTimeWrap: {
    marginTop: 5,
  },
  messageTimeRight: {
    alignSelf: 'flex-end',
    paddingRight: 46,
  },
  messageTime: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '600',
  },
  previewRow: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  previewStack: {
    gap: 8,
  },
  previewVisual: {
    borderColor: 'rgba(255,255,255,0.52)',
    borderRadius: 18,
    borderWidth: 1,
    height: 96,
    overflow: 'hidden',
    width: 168,
  },
  previewLabel: {
    bottom: 9,
    left: 10,
    position: 'absolute',
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  previewMeta: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingLeft: 16,
  },
  actionButton: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  actionButtonPressed: {
    opacity: 0.58,
    transform: [{ scale: 0.94 }],
  },
  typingBubble: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 43,
  },
  composerWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    paddingBottom: 9,
  },
  composerGlass: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.56)',
    borderRadius: 27,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 52,
    overflow: 'hidden',
    paddingHorizontal: 8,
  },
  plusButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  input: {
    color: '#1F2948',
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    height: 40,
    paddingHorizontal: 2,
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.38)',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  sendShadow: {
    borderRadius: 999,
    shadowColor: '#7A72FF',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 17,
  },
  sendButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  homeIndicator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    height: 4,
    marginBottom: 7,
    width: 78,
  },
});
