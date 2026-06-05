import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { askGeminiWithRag, geminiConfigStatus, type ChatMessage } from '@/lib/ai/gemini';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { localHealthKnowledge } from '@/lib/rag/healthKnowledge';
import { retrieveRagContext } from '@/lib/rag/retriever';

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

function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { friction: 7, tension: 220, toValue: 0.94, useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.spring(scale, { friction: 7, tension: 220, toValue: 1, useNativeDriver: true }).start();
  }

  return { pressIn, pressOut, scale };
}

function useFloatMotion() {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { duration: 1700, toValue: 1, useNativeDriver: true }),
        Animated.timing(float, { duration: 1700, toValue: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, [float]);

  return {
    transform: [
      {
        translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }),
      },
    ],
  };
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

function BellIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Path d="M5.2 13.7h9.6l-1.08-1.5V8.55c0-2.08-1.33-3.75-3.72-3.75S6.28 6.47 6.28 8.55v3.65L5.2 13.7Z" fill="none" stroke="#FFFFFF" strokeLinejoin="round" strokeWidth={1.35} />
      <Path d="M8.25 14.2c.18.9.78 1.38 1.75 1.38s1.57-.48 1.75-1.38" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={1.35} />
    </Svg>
  );
}

function MicIcon({ color = '#23294B' }: { color?: string }) {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Rect fill="none" height={8.2} rx={3.1} stroke={color} strokeWidth={1.3} width={5.5} x={7.25} y={3.2} />
      <Path d="M5.2 9.5c.2 2.7 2.03 4.48 4.8 4.48s4.6-1.78 4.8-4.48M10 13.98v2.42M7.5 16.4h5" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.3} />
    </Svg>
  );
}

function ChatIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Path d="M5.1 5.35h9.8c1.15 0 2.08.93 2.08 2.08v4.25c0 1.15-.93 2.08-2.08 2.08H9.55l-3.32 2.1c-.48.3-1.1-.05-1.1-.62v-1.48h-.03A2.08 2.08 0 0 1 3 11.68V7.43c0-1.15.93-2.08 2.1-2.08Z" fill="none" stroke="#23294B" strokeLinejoin="round" strokeWidth={1.3} />
      <Path d="M7.1 9.6h.02M10 9.6h.02M12.9 9.6h.02" stroke="#23294B" strokeLinecap="round" strokeWidth={2.1} />
    </Svg>
  );
}

function ImageIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Rect fill="none" height={11.2} rx={2.2} stroke="#23294B" strokeWidth={1.3} width={12.2} x={3.9} y={4.4} />
      <Circle cx={8} cy={8} fill="none" r={1.3} stroke="#23294B" strokeWidth={1.2} />
      <Path d="m4.7 13.9 3.2-3.1 2.25 2.05 1.42-1.32 3.7 3.3" fill="none" stroke="#23294B" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} />
    </Svg>
  );
}

function ScanIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Path d="M6.3 3.8H4.8c-.62 0-1 .38-1 1v1.5M13.7 3.8h1.5c.62 0 1 .38 1 1v1.5M3.8 13.7v1.5c0 .62.38 1 1 1h1.5M16.2 13.7v1.5c0 .62-.38 1-1 1h-1.5" fill="none" stroke="#23294B" strokeLinecap="round" strokeWidth={1.35} />
      <Circle cx={10} cy={10} fill="none" r={3.05} stroke="#23294B" strokeWidth={1.25} />
      <Path d="M8.55 10.1h2.9M10 8.65v2.9" stroke="#23294B" strokeLinecap="round" strokeWidth={1.15} />
    </Svg>
  );
}

function SparkleIcon() {
  return (
    <Svg height={21} viewBox="0 0 22 22" width={21}>
      <Path d="M13.4 3.4 14.8 7l3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4L12 7l1.4-3.6Z" fill="#FFFFFF" />
      <Path d="M6.2 11.8 7 13.9l2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z" fill="#FFFFFF" opacity={0.9} />
      <Path d="M17.2 13.9 17.7 15l1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1Z" fill="#FFFFFF" opacity={0.76} />
    </Svg>
  );
}

function GlassCircleButton({ children, size = 47, onPress }: { children: ReactNode; size?: number; onPress?: () => void }) {
  const { pressIn, pressOut, scale } = usePressScale();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.glassCircleShadow, { transform: [{ scale }] }]}>
        <BlurView intensity={28} tint="light" style={[styles.glassCircle, { height: size, width: size }]}>
          {children}
        </BlurView>
      </Animated.View>
    </Pressable>
  );
}

function Avatar() {
  return (
    <View style={styles.avatarOuter}>
      <Svg height={40} viewBox="0 0 40 40" width={40}>
        <Defs>
          <SvgGradient id="avatarBg" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#FFE7D1" />
            <Stop offset="0.48" stopColor="#F7B1C9" />
            <Stop offset="1" stopColor="#9DC0FF" />
          </SvgGradient>
          <SvgGradient id="hair" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#4B241F" />
            <Stop offset="1" stopColor="#160F19" />
          </SvgGradient>
        </Defs>
        <Circle cx={20} cy={20} fill="url(#avatarBg)" r={20} />
        <Path d="M8.5 22.5C6.8 13.5 12.9 6.2 20.5 6.2c8.2 0 13.2 7.1 11 16.6-1 4.4-4 8.7-8.2 10.2h-6.6c-4-1.4-7.3-5.9-8.2-10.5Z" fill="url(#hair)" />
        <Circle cx={20} cy={19.5} fill="#FFD9C7" r={10.4} />
        <Path d="M10.3 19.1c4.4-.8 8.1-3.1 11.1-6.6 2.7 3.6 5.5 5.7 8.4 6.3-1.3-7.1-5.1-10.6-9.8-10.6-4.9 0-8.7 3.7-9.7 10.9Z" fill="url(#hair)" />
        <Circle cx={16.4} cy={20.1} fill="#3B2731" r={1.25} />
        <Circle cx={23.6} cy={20.1} fill="#3B2731" r={1.25} />
        <Path d="M17.1 25.2c1.55 1.35 4.25 1.35 5.8 0" fill="none" stroke="#8C4A53" strokeLinecap="round" strokeWidth={1.15} />
        <Circle cx={13.6} cy={23.2} fill="#F0A2AB" opacity={0.55} r={2.1} />
        <Circle cx={26.4} cy={23.2} fill="#F0A2AB" opacity={0.55} r={2.1} />
        <Path d="M7.3 31.8c4.5-4.4 21.1-4.4 25.4 0A19.9 19.9 0 0 1 20 40 19.9 19.9 0 0 1 7.3 31.8Z" fill="#FFFFFF" opacity={0.78} />
      </Svg>
    </View>
  );
}

function HeroOrb() {
  const floating = useFloatMotion();

  return (
    <Animated.View style={[styles.orbWrap, floating]}>
      <Svg height={170} viewBox="0 0 210 190" width={196}>
        <Defs>
          <SvgGradient id="orbBase" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#BFFFEF" />
            <Stop offset="0.27" stopColor="#7AE6EE" />
            <Stop offset="0.53" stopColor="#BB9DFF" />
            <Stop offset="0.78" stopColor="#FF9DE8" />
            <Stop offset="1" stopColor="#95FFE2" />
          </SvgGradient>
          <SvgGradient id="orbStripe" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="#E8FFF8" />
            <Stop offset="0.4" stopColor="#75E7F4" />
            <Stop offset="0.72" stopColor="#D68CFF" />
            <Stop offset="1" stopColor="#F6ECFF" />
          </SvgGradient>
          <SvgGradient id="orbShadow" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
            <Stop offset="1" stopColor="#6B71D8" stopOpacity={0.2} />
          </SvgGradient>
          <ClipPath id="orbClip">
            <Ellipse cx={104} cy={94} rx={72} ry={64} />
          </ClipPath>
        </Defs>
        <Ellipse cx={105} cy={103} fill="rgba(64,96,170,0.16)" rx={78} ry={63} />
        <Ellipse cx={104} cy={94} fill="url(#orbBase)" rx={72} ry={64} />
        <G clipPath="url(#orbClip)" opacity={0.92} transform="rotate(-18 105 95)">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <Path
              key={item}
              d={`M28 ${45 + item * 14} C63 ${25 + item * 14} 124 ${27 + item * 14} 181 ${55 + item * 14}`}
              fill="none"
              stroke="url(#orbStripe)"
              strokeLinecap="round"
              strokeWidth={11.5}
            />
          ))}
        </G>
        <Path d="M65 65c26-26 72-28 103 2" fill="none" opacity={0.38} stroke="#FFFFFF" strokeLinecap="round" strokeWidth={12} />
        <Path d="M61 124c35 20 74 22 112 1" fill="none" opacity={0.2} stroke="#19D5D3" strokeLinecap="round" strokeWidth={19} />
        <Ellipse cx={104} cy={94} fill="url(#orbShadow)" rx={72} ry={64} />
      </Svg>
    </Animated.View>
  );
}

function FeatureTile({ icon, label, onPress }: { icon: ReactNode; label: string; onPress?: () => void }) {
  const { pressIn, pressOut, scale } = usePressScale();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={styles.tilePressable}>
      <Animated.View style={[styles.tileShadow, { transform: [{ scale }] }]}>
        <BlurView intensity={34} tint="light" style={styles.featureTile}>
          <View style={styles.tileIconCircle}>{icon}</View>
          <Text style={styles.tileLabel}>{label}</Text>
        </BlurView>
      </Animated.View>
    </Pressable>
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
    <BlurView intensity={36} tint="light" style={styles.composerGlass}>
      <TextInput
        value={input}
        onChangeText={setInput}
        onSubmitEditing={sendMessage}
        placeholder="Ask anything"
        placeholderTextColor="#414866"
        returnKeyType="send"
        style={styles.input}
      />
      <Pressable disabled={isSending} onPress={sendMessage} onPressIn={pressIn} onPressOut={pressOut}>
        <Animated.View style={[styles.sendShadow, { transform: [{ scale }] }]}>
          <LinearGradient colors={['#BDF2FF', '#9F83FF', '#626CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendButton}>
            {isSending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <SparkleIcon />}
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </BlurView>
  );
}

function MiniResponse({ answer }: { answer: string | null }) {
  if (!answer) {
    return null;
  }

  return (
    <BlurView intensity={28} tint="light" style={styles.responseGlass}>
      <Text numberOfLines={3} style={styles.responseText}>
        {answer}
      </Text>
    </BlurView>
  );
}

function BackgroundSheen() {
  return (
    <Svg height="100%" pointerEvents="none" style={styles.sheenLayer} viewBox="0 0 320 646" width="100%">
      <Defs>
        <SvgGradient id="topGlow" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.38} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgGradient>
        <SvgGradient id="midGlow" x1="1" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.24} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgGradient>
        <SvgGradient id="bottomGlow" x1="0" x2="1" y1="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.32} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Path d="M-34 95C42 24 128 33 196 5c50-21 92-15 158 12v198C237 174 126 166-34 244Z" fill="url(#topGlow)" />
      <Path d="M-42 370c78-57 166-49 247-92 44-24 88-27 149-2v158c-116-40-221-18-396 44Z" fill="url(#midGlow)" />
      <Path d="M-33 543c92-48 174-33 248-88 47-34 92-40 146-25v252H-33Z" fill="url(#bottomGlow)" />
    </Svg>
  );
}

export function PrototypeChatPanel() {
  const auth = useAuthSession();
  const { height, width } = useWindowDimensions();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const canUseLiveAi = Boolean(auth.session && geminiConfigStatus.hasProxy);
  const isCompact = width < 390;
  const frameSize = useMemo(
    () => ({
      height: isCompact ? height : Math.min(622, Math.max(610, height - 28)),
      width: isCompact ? width : 304,
    }),
    [height, isCompact, width],
  );

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
        const answer = createMessage('assistant', result.text, result.ragMatches);
        setMessages((current) => [...current, answer]);
        setLastAnswer(result.text);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 520));
        const demo = createDemoAnswer(question);
        const answer = createMessage('assistant', demo.content, demo.sources);
        setMessages((current) => [...current, answer]);
        setLastAnswer(demo.content);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI request failed.';
      const demo = createDemoAnswer(question);
      const fallback = `${demo.content}\n\nLive AI ยังตอบไม่ได้ตอนนี้ (${message})`;
      setMessages((current) => [...current, createMessage('assistant', fallback, demo.sources)]);
      setLastAnswer(fallback);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.stage}>
          <View style={[styles.phoneShell, isCompact ? styles.phoneShellCompact : null, frameSize]}>
            <LinearGradient colors={['#99B7FA', '#B6A9F0', '#D7E4FF']} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
              <BackgroundSheen />

              <View style={styles.statusBar}>
                <Text style={styles.statusTime}>9:40 PM</Text>
                <StatusGlyphs />
              </View>

              <View style={styles.topActions}>
                <Avatar />
                <GlassCircleButton size={48}>
                  <BellIcon />
                </GlassCircleButton>
              </View>

              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Hi Amelia,</Text>
                <Text style={styles.heroSubtitle}>Ask any questions you have — your AI voice chatbot is always listening.</Text>
              </View>

              <HeroOrb />

              <View style={styles.tileGrid}>
                <FeatureTile icon={<MicIcon />} label={'Voice\nChat AI'} />
                <FeatureTile icon={<ChatIcon />} label={'Chat\nwith AI'} onPress={() => setLastAnswer('Chat mode is ready. Type anything below and Mira will answer with the existing chatbot logic.')} />
                <FeatureTile icon={<ImageIcon />} label={'Generate\nImages'} />
                <FeatureTile icon={<ScanIcon />} label={'Scan and\nSearch'} />
              </View>

              <MiniResponse answer={lastAnswer} />

              <View style={styles.bottomArea}>
                <Composer input={input} isSending={isSending} sendMessage={sendMessage} setInput={setInput} />
                <View style={styles.homeIndicator} />
              </View>
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
    justifyContent: 'flex-start',
    padding: 12,
    paddingTop: 38,
  },
  phoneShell: {
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 38,
    borderWidth: 1.4,
    overflow: 'hidden',
    shadowColor: '#796BE0',
    shadowOffset: { height: 25, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 34,
  },
  phoneShellCompact: {
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingTop: 9,
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
    height: 24,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  statusTime: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  statusRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  signalBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 1.3,
    height: 9,
  },
  signalBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    width: 2,
  },
  wifiGlyph: {
    height: 9,
    width: 12,
  },
  wifiArcWide: {
    borderColor: '#FFFFFF',
    borderLeftWidth: 1.25,
    borderRadius: 999,
    borderRightWidth: 1.25,
    borderTopWidth: 1.25,
    height: 9,
    opacity: 0.95,
    position: 'absolute',
    top: 1,
    width: 12,
  },
  wifiArcSmall: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    bottom: 0,
    height: 3,
    left: 4.5,
    position: 'absolute',
    width: 3,
  },
  batteryShell: {
    borderColor: '#FFFFFF',
    borderRadius: 3,
    borderWidth: 1,
    height: 7.5,
    padding: 1,
    width: 16,
  },
  batteryFill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    flex: 1,
    width: '78%',
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 13,
  },
  avatarOuter: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    borderWidth: 1.2,
    padding: 2,
    shadowColor: '#584992',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  avatarInner: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  avatarLogo: {
    height: 30,
    width: 30,
  },
  glassCircleShadow: {
    shadowColor: '#6F60C7',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  glassCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.34)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroCopy: {
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 28,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 31,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 10.6,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 7,
    textAlign: 'center',
  },
  orbWrap: {
    alignItems: 'center',
    height: 170,
    justifyContent: 'center',
    marginTop: 0,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 1,
  },
  tilePressable: {
    width: 134,
  },
  tileShadow: {
    shadowColor: '#7062C4',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  featureTile: {
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderColor: 'rgba(255,255,255,0.34)',
    borderRadius: 17,
    borderWidth: 1,
    height: 93,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingBottom: 12,
    paddingLeft: 14,
    paddingTop: 14,
  },
  tileIconCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(255,255,255,0.84)',
    borderRadius: 999,
    borderWidth: 0.9,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  tileLabel: {
    color: '#1F2445',
    fontSize: 13.2,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 16.2,
  },
  responseGlass: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 14,
    borderWidth: 1,
    bottom: 86,
    left: 15,
    maxHeight: 68,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: 'absolute',
    right: 15,
  },
  responseText: {
    color: '#1F2445',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  bottomArea: {
    bottom: 0,
    left: 13,
    position: 'absolute',
    right: 13,
  },
  composerGlass: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.56)',
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: 'row',
    height: 51,
    overflow: 'hidden',
    paddingLeft: 15,
    paddingRight: 5,
    shadowColor: '#7265CF',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
  },
  input: {
    color: '#1F2445',
    flex: 1,
    fontSize: 12.2,
    fontWeight: '500',
    height: 42,
    paddingHorizontal: 0,
  },
  sendShadow: {
    borderRadius: 999,
    shadowColor: '#7566FF',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 13,
  },
  sendButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  homeIndicator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    height: 3.2,
    marginBottom: 9,
    marginTop: 10,
    width: 73,
  },
});
