import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { transcribeAudio } from '@/lib/ai/openaiTranscription';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { localHealthKnowledge } from '@/lib/rag/healthKnowledge';
import { retrieveRagContext } from '@/lib/rag/retriever';

const logo = require('@/assets/images/mira-orbit-logo.png');
const iconInk = '#536491';

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

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read recorded audio.'));
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Recorded audio could not be converted.'));
        return;
      }
      resolve(result.includes(',') ? result.split(',').pop() ?? '' : result);
    };
    reader.readAsDataURL(blob);
  });
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
  const orbit = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { duration: 1800, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: true }),
        Animated.timing(float, { duration: 1800, easing: Easing.inOut(Easing.sin), toValue: 0, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(Animated.timing(orbit, { duration: 9000, easing: Easing.linear, toValue: 1, useNativeDriver: true })).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 1450, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 1450, easing: Easing.in(Easing.quad), toValue: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, [float, orbit, pulse]);

  return {
    haloOpacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.58] }),
    haloScale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }),
    logoScale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.025] }),
    orbitRotate: orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    rootTransform: [
      {
        translateY: float.interpolate({ inputRange: [0, 1], outputRange: [2, -8] }),
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

function BackIcon() {
  return (
    <Svg height={18} viewBox="0 0 18 18" width={18}>
      <Path d="M11.2 3.7 6 9l5.2 5.3" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} />
    </Svg>
  );
}

function DotsIcon() {
  return (
    <View style={styles.dotsIcon}>
      <View style={styles.dotsIconDot} />
      <View style={styles.dotsIconDot} />
      <View style={styles.dotsIconDot} />
    </View>
  );
}

function MicIcon({ color = iconInk }: { color?: string }) {
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
      <Path d="M5.1 5.35h9.8c1.15 0 2.08.93 2.08 2.08v4.25c0 1.15-.93 2.08-2.08 2.08H9.55l-3.32 2.1c-.48.3-1.1-.05-1.1-.62v-1.48h-.03A2.08 2.08 0 0 1 3 11.68V7.43c0-1.15.93-2.08 2.1-2.08Z" fill="none" stroke={iconInk} strokeLinejoin="round" strokeWidth={1.3} />
      <Path d="M7.1 9.6h.02M10 9.6h.02M12.9 9.6h.02" stroke={iconInk} strokeLinecap="round" strokeWidth={2.1} />
    </Svg>
  );
}

function ImageIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Rect fill="none" height={11.2} rx={2.2} stroke={iconInk} strokeWidth={1.3} width={12.2} x={3.9} y={4.4} />
      <Circle cx={8} cy={8} fill="none" r={1.3} stroke={iconInk} strokeWidth={1.2} />
      <Path d="m4.7 13.9 3.2-3.1 2.25 2.05 1.42-1.32 3.7 3.3" fill="none" stroke={iconInk} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} />
    </Svg>
  );
}

function ScanIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Path d="M6.3 3.8H4.8c-.62 0-1 .38-1 1v1.5M13.7 3.8h1.5c.62 0 1 .38 1 1v1.5M3.8 13.7v1.5c0 .62.38 1 1 1h1.5M16.2 13.7v1.5c0 .62-.38 1-1 1h-1.5" fill="none" stroke={iconInk} strokeLinecap="round" strokeWidth={1.35} />
      <Circle cx={10} cy={10} fill="none" r={3.05} stroke={iconInk} strokeWidth={1.25} />
      <Path d="M8.55 10.1h2.9M10 8.65v2.9" stroke={iconInk} strokeLinecap="round" strokeWidth={1.15} />
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
      <Animated.View style={[styles.glassCircleShadow, { borderRadius: size / 2, height: size, transform: [{ scale }], width: size }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.36)', 'rgba(255,255,255,0.1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.glassCircle, { borderRadius: size / 2, height: size, width: size }]}>
          <View style={styles.glassCircleHighlight} />
          {children}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function Avatar() {
  return (
    <View style={styles.avatarOuter}>
      <Svg height={34} viewBox="0 0 40 40" width={34}>
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

function HeroLogo() {
  const motion = useFloatMotion();

  return (
    <Animated.View style={[styles.orbWrap, { transform: motion.rootTransform }]}>
      <Animated.View style={[styles.logoHaloOuter, { opacity: motion.haloOpacity, transform: [{ scale: motion.haloScale }] }]} />
      <Animated.View style={[styles.logoOrbitRing, { transform: [{ rotate: motion.orbitRotate }] }]}>
        <View style={styles.logoOrbitDot} />
        <View style={styles.logoOrbitDotSoft} />
      </Animated.View>
      <Animated.View style={[styles.logoCard, { transform: [{ scale: motion.logoScale }] }]}>
        <LinearGradient colors={['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.2)']} style={styles.logoCardGlass}>
          <Image source={logo} resizeMode="contain" style={styles.heroLogoImage} />
        </LinearGradient>
      </Animated.View>
      <Animated.View style={[styles.logoSparkOne, { opacity: motion.haloOpacity, transform: [{ rotate: motion.orbitRotate }] }]}>
        <SparkleIcon />
      </Animated.View>
      <Animated.View style={[styles.logoSparkTwo, { opacity: motion.haloOpacity, transform: [{ scale: motion.logoScale }] }]}>
        <SparkleIcon />
      </Animated.View>
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

function ChatAvatar() {
  return (
    <LinearGradient colors={['#E9F8FF', '#CFE2FF']} style={styles.chatAvatar}>
      <Image source={logo} resizeMode="contain" style={styles.chatAvatarLogo} />
    </LinearGradient>
  );
}

function ChatMessageBubble({ index, message }: { index: number; message: ChatMessage }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { delay: Math.min(index * 55, 240), duration: 260, toValue: 1, useNativeDriver: true }),
      Animated.spring(translate, { delay: Math.min(index * 55, 240), friction: 8, tension: 120, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [index, opacity, translate]);

  if (message.role === 'user') {
    return (
      <Animated.View style={[styles.userChatRow, { opacity, transform: [{ translateY: translate }] }]}>
        <LinearGradient colors={['rgba(80,147,255,0.94)', 'rgba(103,178,255,0.82)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userChatBubble}>
          <Text style={styles.userChatText}>{message.content}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.assistantChatRow, { opacity, transform: [{ translateY: translate }] }]}>
      <ChatAvatar />
      <BlurView intensity={30} tint="light" style={styles.assistantChatBubble}>
        <Text style={styles.assistantChatText}>{message.content}</Text>
      </BlurView>
    </Animated.View>
  );
}

function EmptyChatHint() {
  return (
    <View style={styles.emptyChatWrap}>
      <ChatAvatar />
      <BlurView intensity={28} tint="light" style={styles.emptyChatBubble}>
        <Text style={styles.emptyChatText}>พร้อมคุยแล้วค่ะ พิมพ์หรือกดไมค์เพื่อให้ Mira ช่วยเลือกแพ็กเกจสุขภาพ</Text>
      </BlurView>
    </View>
  );
}

function Composer({
  input,
  isRecording,
  isSending,
  isTranscribing,
  sendMessage,
  setInput,
  toggleVoiceRecording,
  voiceStatus,
}: {
  input: string;
  isRecording: boolean;
  isSending: boolean;
  isTranscribing: boolean;
  sendMessage: () => void;
  setInput: (value: string) => void;
  toggleVoiceRecording: () => void;
  voiceStatus: string | null;
}) {
  const { pressIn, pressOut, scale } = usePressScale();
  const placeholder = isRecording ? 'Listening...' : isTranscribing ? 'Transcribing voice...' : 'Ask anything';

  return (
    <View>
      {voiceStatus ? (
        <View style={styles.voiceStatusPill}>
          <View style={[styles.voiceStatusDot, isRecording ? styles.voiceStatusDotLive : null]} />
          <Text numberOfLines={1} style={styles.voiceStatusText}>
            {voiceStatus}
          </Text>
        </View>
      ) : null}

      <BlurView intensity={36} tint="light" style={styles.composerGlass}>
        <Pressable disabled={isSending || isTranscribing} onPress={toggleVoiceRecording} style={({ pressed }) => [styles.voiceButtonPress, pressed ? styles.voiceButtonPressed : null]}>
          <LinearGradient
            colors={isRecording ? ['#6FE7FF', '#587CFF'] : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.32)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.voiceButton, isRecording ? styles.voiceButtonRecording : null]}>
            {isTranscribing ? <ActivityIndicator color="#536491" size="small" /> : <MicIcon color={isRecording ? '#FFFFFF' : iconInk} />}
          </LinearGradient>
        </Pressable>

        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          placeholder={placeholder}
          placeholderTextColor="#6677A3"
          returnKeyType="send"
          style={styles.input}
        />

        <Pressable disabled={isSending || isTranscribing} onPress={sendMessage} onPressIn={pressIn} onPressOut={pressOut}>
          <Animated.View style={[styles.sendShadow, { transform: [{ scale }] }]}>
            <LinearGradient colors={['#C4ECFF', '#8FA6FF', '#6176F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendButton}>
              {isSending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <SparkleIcon />}
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </BlurView>
    </View>
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
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewMode, setViewMode] = useState<'chat' | 'home'>('home');
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  const canUseLiveAi = Boolean(auth.session && geminiConfigStatus.hasProxy);
  const isCompact = width < 390;
  const frameSize = useMemo(
    () => ({
      height: isCompact ? height : Math.min(604, Math.max(590, height - 36)),
      width: isCompact ? width : 292,
    }),
    [height, isCompact, width],
  );

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopMediaStream();
    };
  }, []);

  useEffect(() => {
    if (viewMode === 'chat') {
      const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isSending, messages, viewMode]);

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  async function transcribeRecordedAudio(mimeType: string) {
    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
    audioChunksRef.current = [];
    stopMediaStream();

    if (audioBlob.size <= 0) {
      setVoiceStatus('ไม่ได้ยินเสียง ลองกดพูดใหม่อีกครั้ง');
      return;
    }

    setIsTranscribing(true);
    setVoiceStatus('กำลังถอดเสียงด้วย OpenAI...');

    try {
      const audioBase64 = await blobToBase64(audioBlob);
      const transcript = await transcribeAudio({
        audioBase64,
        fileName: mimeType.includes('mp4') ? 'mira-voice.mp4' : 'mira-voice.webm',
        language: 'th',
        mimeType,
      });

      setInput((current) => (current.trim() ? `${current.trim()} ${transcript.text}` : transcript.text));
      setVoiceStatus('ถอดเสียงเรียบร้อย พร้อมส่ง');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice transcription failed.';
      setVoiceStatus(`ยังใช้ voice ไม่ได้: ${message}`);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function startVoiceRecording() {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceStatus('Voice input รองรับบน web prototype ก่อน ต้องเพิ่ม native audio module สำหรับ iOS/Android');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void transcribeRecordedAudio(mimeType);
      };
      recorder.start();
      setIsRecording(true);
      setVoiceStatus('กำลังฟัง... กดไมค์อีกครั้งเพื่อหยุด');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microphone permission failed.';
      stopMediaStream();
      setIsRecording(false);
      setVoiceStatus(`เปิดไมค์ไม่ได้: ${message}`);
    }
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      stopMediaStream();
      return;
    }

    setIsRecording(false);
    setVoiceStatus('หยุดฟังแล้ว กำลังเตรียมเสียง...');
    recorder.stop();
    mediaRecorderRef.current = null;
  }

  function toggleVoiceRecording() {
    if (isRecording) {
      stopVoiceRecording();
      return;
    }

    void startVoiceRecording();
  }

  async function sendMessage() {
    const question = input.trim();

    if (!question || isSending) {
      return;
    }

    const userMessage = createMessage('user', question);
    const nextMessages = [...messages, userMessage];
    setViewMode('chat');
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);
    setVoiceStatus(null);

    try {
      if (canUseLiveAi) {
        const result = await askGeminiWithRag({ messages: nextMessages, question });
        const answer = createMessage('assistant', result.text, result.ragMatches);
        setMessages((current) => [...current, answer]);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 520));
        const demo = createDemoAnswer(question);
        const answer = createMessage('assistant', demo.content, demo.sources);
        setMessages((current) => [...current, answer]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI request failed.';
      const demo = createDemoAnswer(question);
      const fallback = `${demo.content}\n\nLive AI ยังตอบไม่ได้ตอนนี้ (${message})`;
      setMessages((current) => [...current, createMessage('assistant', fallback, demo.sources)]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.stage}>
          <View style={[styles.phoneShell, isCompact ? styles.phoneShellCompact : null, frameSize]}>
            <LinearGradient colors={['#A8C8FF', '#D8E9FF', '#F5FBFF']} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
              <BackgroundSheen />

              <View style={styles.statusBar}>
                <Text style={styles.statusTime}>9:40 PM</Text>
                <StatusGlyphs />
              </View>

              {viewMode === 'home' ? (
                <>
                  <View style={styles.topActions}>
                    <Avatar />
                    <GlassCircleButton size={36}>
                      <BellIcon />
                    </GlassCircleButton>
                  </View>

                  <View style={styles.heroCopy}>
                    <Text style={styles.heroTitle}>Hi Amelia,</Text>
                    <Text style={styles.heroSubtitle}>Ask any questions you have — your AI voice chatbot is always listening.</Text>
                  </View>

                  <HeroLogo />

                  <View style={styles.tileGrid}>
                    <FeatureTile icon={<MicIcon />} label={'Voice\nChat AI'} onPress={toggleVoiceRecording} />
                    <FeatureTile icon={<ChatIcon />} label={'Chat\nwith AI'} onPress={() => setViewMode('chat')} />
                    <FeatureTile icon={<ImageIcon />} label={'Generate\nImages'} />
                    <FeatureTile icon={<ScanIcon />} label={'Scan and\nSearch'} />
                  </View>

                  <View style={styles.bottomArea}>
                    <Composer
                      input={input}
                      isRecording={isRecording}
                      isSending={isSending}
                      isTranscribing={isTranscribing}
                      sendMessage={sendMessage}
                      setInput={setInput}
                      toggleVoiceRecording={toggleVoiceRecording}
                      voiceStatus={voiceStatus}
                    />
                    <View style={styles.homeIndicator} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.chatHeader}>
                    <GlassCircleButton onPress={() => setViewMode('home')} size={40}>
                      <BackIcon />
                    </GlassCircleButton>
                    <Text style={styles.chatTitle}>Smart Chat</Text>
                    <GlassCircleButton size={44}>
                      <DotsIcon />
                    </GlassCircleButton>
                  </View>

                  <ScrollView ref={scrollRef} contentContainerStyle={styles.chatMessages} showsVerticalScrollIndicator={false}>
                    {messages.length === 0 ? <EmptyChatHint /> : messages.map((message, index) => <ChatMessageBubble key={message.id} index={index} message={message} />)}
                    {isSending ? (
                      <View style={styles.assistantChatRow}>
                        <ChatAvatar />
                        <BlurView intensity={30} tint="light" style={[styles.assistantChatBubble, styles.typingChatBubble]}>
                          <ActivityIndicator color="#5E8DFF" size="small" />
                          <Text style={styles.assistantChatText}>Mira is thinking...</Text>
                        </BlurView>
                      </View>
                    ) : null}
                  </ScrollView>

                  <View style={styles.bottomArea}>
                    <Composer
                      input={input}
                      isRecording={isRecording}
                      isSending={isSending}
                      isTranscribing={isTranscribing}
                      sendMessage={sendMessage}
                      setInput={setInput}
                      toggleVoiceRecording={toggleVoiceRecording}
                      voiceStatus={voiceStatus}
                    />
                    <View style={styles.homeIndicator} />
                  </View>
                </>
              )}
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
    paddingTop: 34,
  },
  phoneShell: {
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 36,
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
    marginTop: 11,
  },
  avatarOuter: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    borderWidth: 1.2,
    padding: 1.8,
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#6F60C7',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  glassCircle: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.56)',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  glassCircleHighlight: {
    backgroundColor: 'rgba(255,255,255,0.36)',
    borderRadius: 999,
    height: '52%',
    left: 7,
    opacity: 0.58,
    position: 'absolute',
    top: 5,
    width: '52%',
  },
  dotsIcon: {
    alignItems: 'center',
    gap: 3,
  },
  dotsIconDot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 3,
    width: 3,
  },
  heroCopy: {
    alignItems: 'center',
    marginTop: 7,
    paddingHorizontal: 26,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 23.5,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 28,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 9.7,
    fontWeight: '600',
    lineHeight: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  orbWrap: {
    alignItems: 'center',
    height: 150,
    justifyContent: 'center',
    marginTop: 0,
  },
  logoHaloOuter: {
    backgroundColor: 'rgba(107,153,255,0.22)',
    borderColor: 'rgba(255,255,255,0.36)',
    borderRadius: 999,
    borderWidth: 1,
    height: 122,
    position: 'absolute',
    width: 122,
  },
  logoOrbitRing: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 999,
    borderWidth: 1,
    height: 136,
    justifyContent: 'center',
    position: 'absolute',
    width: 136,
  },
  logoOrbitDot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 8,
    position: 'absolute',
    right: 13,
    top: 30,
    width: 8,
  },
  logoOrbitDotSoft: {
    backgroundColor: '#9ECAFF',
    borderRadius: 999,
    bottom: 24,
    height: 6,
    left: 18,
    position: 'absolute',
    width: 6,
  },
  logoCard: {
    alignItems: 'center',
    borderRadius: 999,
    height: 104,
    justifyContent: 'center',
    shadowColor: '#5F8CFF',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    width: 104,
  },
  logoCardGlass: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 999,
    borderWidth: 1,
    height: 104,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 104,
  },
  heroLogoImage: {
    height: 88,
    width: 88,
  },
  logoSparkOne: {
    position: 'absolute',
    right: 45,
    top: 17,
  },
  logoSparkTwo: {
    bottom: 20,
    left: 47,
    opacity: 0.5,
    position: 'absolute',
    transform: [{ scale: 0.58 }],
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 0,
    rowGap: 7,
  },
  tilePressable: {
    width: 126,
  },
  tileShadow: {
    shadowColor: '#7062C4',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  featureTile: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.38)',
    borderRadius: 16,
    borderWidth: 1,
    height: 84,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingBottom: 10,
    paddingLeft: 12,
    paddingTop: 12,
  },
  tileIconCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(255,255,255,0.84)',
    borderRadius: 999,
    borderWidth: 0.9,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  tileLabel: {
    color: '#43547E',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 14.8,
  },
  chatHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-between',
  },
  chatTitle: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0,
  },
  chatMessages: {
    flexGrow: 1,
    gap: 12,
    paddingBottom: 96,
    paddingTop: 16,
  },
  chatAvatar: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 30,
  },
  chatAvatarLogo: {
    height: 23,
    width: 23,
  },
  assistantChatRow: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    maxWidth: '92%',
  },
  assistantChatBubble: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 205,
  },
  assistantChatText: {
    color: '#40527B',
    fontSize: 11.6,
    fontWeight: '600',
    lineHeight: 16.6,
  },
  userChatRow: {
    alignSelf: 'flex-end',
    maxWidth: '84%',
  },
  userChatBubble: {
    borderColor: 'rgba(255,255,255,0.56)',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  userChatText: {
    color: '#FFFFFF',
    fontSize: 11.8,
    fontWeight: '700',
    lineHeight: 16.8,
  },
  typingChatBubble: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  emptyChatWrap: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    marginTop: 10,
  },
  emptyChatBubble: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 205,
  },
  emptyChatText: {
    color: '#40527B',
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16.5,
  },
  bottomArea: {
    bottom: 0,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  composerGlass: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.56)',
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    height: 48,
    overflow: 'hidden',
    gap: 7,
    paddingLeft: 7,
    paddingRight: 5,
    shadowColor: '#7265CF',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
  },
  voiceButtonPress: {
    borderRadius: 999,
  },
  voiceButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  voiceButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  voiceButtonRecording: {
    shadowColor: '#5E9DFF',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.34,
    shadowRadius: 10,
  },
  voiceStatusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 7,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  voiceStatusDot: {
    backgroundColor: '#88A9D8',
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  voiceStatusDotLive: {
    backgroundColor: '#6FE7FF',
  },
  voiceStatusText: {
    color: '#44547E',
    fontSize: 10.6,
    fontWeight: '700',
    maxWidth: 210,
  },
  input: {
    color: '#36466E',
    flex: 1,
    fontSize: 11.8,
    fontWeight: '600',
    height: 39,
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
    height: 39,
    justifyContent: 'center',
    width: 39,
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
