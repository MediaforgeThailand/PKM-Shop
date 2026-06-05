import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { PrototypeChatPanel } from '@/components/PrototypeChatPanel';

const logo = require('@/assets/images/mira-orbit-logo.png');

function useEntrance(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { delay, duration: 620, toValue: 1, useNativeDriver: true }),
      Animated.spring(translate, { delay, friction: 8, tension: 70, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [delay, opacity, translate]);

  return {
    opacity,
    transform: [{ translateY: translate }],
  };
}

function AnimatedAction({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: object;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { friction: 7, tension: 160, toValue: 0.96, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { friction: 7, tension: 160, toValue: 1, useNativeDriver: true }).start()}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Animated.View style={[styles.glassShadow, style]}>
      <BlurView intensity={32} tint="light" style={styles.glassBlur}>
        <LinearGradient colors={['rgba(255,255,255,0.78)', 'rgba(225,239,255,0.48)']} style={styles.glassCard}>
          {children}
        </LinearGradient>
      </BlurView>
    </Animated.View>
  );
}

function HeroVisual() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 1700, toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 1700, toValue: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <View style={styles.heroVisual}>
      <Svg height={176} width="100%" viewBox="0 0 220 176">
        <Defs>
          <SvgGradient id="miraLine" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#166CFF" />
            <Stop offset="1" stopColor="#B8D4FF" />
          </SvgGradient>
        </Defs>
        <Circle cx="110" cy="88" fill="rgba(255,255,255,0.48)" r="68" />
        <Path d="M44 102 C72 28 171 8 191 57 C208 98 155 150 76 154 C36 156 25 134 44 102 Z" fill="none" stroke="url(#miraLine)" strokeLinecap="round" strokeWidth="12" />
        <Circle cx="110" cy="88" fill="url(#miraLine)" r="30" />
        <Circle cx="158" cy="83" fill="#2D78FF" r="14" />
      </Svg>
      <Animated.View
        style={[
          styles.pulseRing,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.04] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.2] }) }],
          },
        ]}
      />
    </View>
  );
}

function MetricRing({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.metricRing}>
      <View style={[styles.metricHalo, { borderColor: tone }]}>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export default function PrototypeScreen() {
  const { width } = useWindowDimensions();
  const [activeSegment, setActiveSegment] = useState<'packages' | 'insights' | 'booking'>('packages');
  const heroAnim = useEntrance(60);
  const cardAnim = useEntrance(220);
  const chatAnim = useEntrance(380);
  const isWide = width >= 820;

  return (
    <LinearGradient colors={['#F7FBFF', '#DDEBFF', '#F8FBFF']} style={styles.page}>
      <View style={styles.backdropBandTop} />
      <View style={styles.backdropBandBottom} />
      <ScrollView contentContainerStyle={[styles.scroll, isWide ? styles.scrollWide : null]} showsVerticalScrollIndicator={false}>
        <View style={styles.phoneShell}>
          <View style={styles.statusBar}>
            <Text style={styles.time}>09:41</Text>
            <View style={styles.statusPills}>
              <View style={styles.signalPill} />
              <View style={styles.batteryPill} />
            </View>
          </View>

          <Animated.View style={[styles.hero, heroAnim]}>
            <View style={styles.nav}>
              <BlurView intensity={26} tint="light" style={styles.logoGlass}>
                <Image source={logo} style={styles.logo} resizeMode="contain" />
              </BlurView>
              <View style={styles.navTextWrap}>
                <Text style={styles.navTitle}>Mira</Text>
                <Text style={styles.navSubtitle}>Health Intelligence</Text>
              </View>
              <Link href="/home" asChild>
                <Pressable style={styles.skipButton}>
                  <Text style={styles.skipText}>App</Text>
                </Pressable>
              </Link>
            </View>

            <Text style={styles.eyebrow}>Premium sales prototype</Text>
            <Text style={styles.heroTitle}>AI ผู้ช่วยเลือกแพ็กเกจตรวจสุขภาพ พร้อม Health Dashboard ส่วนตัว</Text>
            <Text style={styles.heroBody}>ประสบการณ์แบบ mobile app จริง เชื่อม Marketplace, Booking, Health Memory และ AI Chatbot ในหน้าเดียว</Text>
            <HeroVisual />
          </Animated.View>

          <Animated.View style={[styles.segmentWrap, cardAnim]}>
            {(['packages', 'insights', 'booking'] as const).map((segment) => (
              <AnimatedAction key={segment} onPress={() => setActiveSegment(segment)} style={[styles.segment, activeSegment === segment ? styles.segmentActive : null]}>
                <Text style={[styles.segmentText, activeSegment === segment ? styles.segmentTextActive : null]}>
                  {segment === 'packages' ? 'Packages' : segment === 'insights' ? 'Insights' : 'Booking'}
                </Text>
              </AnimatedAction>
            ))}
          </Animated.View>

          <Animated.View style={cardAnim}>
            <GlassCard>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.sectionKicker}>AI Match</Text>
                  <Text style={styles.sectionTitle}>
                    {activeSegment === 'packages'
                      ? 'Executive Longevity Check'
                      : activeSegment === 'insights'
                      ? 'Health Readiness'
                      : 'Hospital Booking'}
                  </Text>
                </View>
                <Text style={styles.priceTag}>{activeSegment === 'packages' ? '24,900 THB' : activeSegment === 'insights' ? '88%' : 'Ready'}</Text>
              </View>

              {activeSegment === 'packages' ? (
                <View style={styles.packagePreview}>
                  <MetricRing label="Heart" value="92" tone="#2D78FF" />
                  <MetricRing label="Metabolic" value="78" tone="#6DA6FF" />
                  <MetricRing label="Fit" value="AI" tone="#A9CAFF" />
                </View>
              ) : activeSegment === 'insights' ? (
                <View style={styles.insightChart}>
                  <View style={[styles.chartBar, { height: 58 }]} />
                  <View style={[styles.chartBar, { height: 88 }]} />
                  <View style={[styles.chartBar, { height: 70 }]} />
                  <View style={[styles.chartBar, styles.chartBarActive, { height: 112 }]} />
                  <View style={[styles.chartBar, { height: 80 }]} />
                </View>
              ) : (
                <View style={styles.bookingSteps}>
                  {['Paid', 'Sales call', 'Slot locked'].map((step, index) => (
                    <View key={step} style={styles.bookingStep}>
                      <View style={[styles.stepDot, index === 2 ? styles.stepDotDim : null]} />
                      <Text style={styles.stepLabel}>{step}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.cardBody}>
                {activeSegment === 'packages'
                  ? 'แพ็กเกจถูกจัดอันดับด้วยข้อมูลสุขภาพล่าสุด เป้าหมายของผู้ใช้ และเงื่อนไขการขายของโรงพยาบาล'
                  : activeSegment === 'insights'
                  ? 'Dashboard แสดงสถานะสุขภาพด้วยภาพก่อน แล้วให้ AI อธิบาย insight ที่อ่านง่าย'
                  : 'หลังจ่ายเงิน ระบบส่ง order ให้ทีมโรงพยาบาล lookup และลงคิวได้ทันที'}
              </Text>
            </GlassCard>
          </Animated.View>

          <Animated.View style={chatAnim}>
            <PrototypeChatPanel />
          </Animated.View>

          <GlassCard style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>พร้อมสำหรับ demo call</Text>
            <Text style={styles.ctaBody}>หน้า `/prototype` นี้ออกแบบให้เปิดโชว์ลูกค้า เห็นทั้ง marketplace, status visual และ AI assistant ใน flow เดียว</Text>
            <Link href="/prototype" asChild>
              <AnimatedAction style={styles.primaryCta}>
                <Text style={styles.primaryCtaText}>รีเฟรช Demo</Text>
              </AnimatedAction>
            </Link>
          </GlassCard>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  backdropBandTop: {
    backgroundColor: 'rgba(45,120,255,0.14)',
    height: 220,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  backdropBandBottom: {
    backgroundColor: 'rgba(178,210,255,0.34)',
    bottom: 0,
    height: 260,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  scroll: {
    alignItems: 'center',
    padding: 14,
    paddingBottom: 42,
  },
  scrollWide: {
    paddingTop: 28,
  },
  phoneShell: {
    backgroundColor: 'rgba(246,250,255,0.72)',
    borderColor: 'rgba(255,255,255,0.84)',
    borderRadius: 42,
    borderWidth: 1,
    gap: 18,
    maxWidth: 430,
    overflow: 'hidden',
    padding: 14,
    shadowColor: '#1755B8',
    shadowOffset: { height: 24, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 42,
    width: '100%',
  },
  statusBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  time: {
    color: '#071B45',
    fontSize: 13,
    fontWeight: '900',
  },
  statusPills: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  signalPill: {
    backgroundColor: '#071B45',
    borderRadius: 999,
    height: 9,
    width: 26,
  },
  batteryPill: {
    borderColor: '#071B45',
    borderRadius: 4,
    borderWidth: 2,
    height: 11,
    width: 22,
  },
  hero: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 34,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  nav: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logoGlass: {
    alignItems: 'center',
    borderRadius: 20,
    height: 46,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 46,
  },
  logo: {
    height: 42,
    width: 42,
  },
  navTextWrap: {
    flex: 1,
  },
  navTitle: {
    color: '#071B45',
    fontSize: 18,
    fontWeight: '900',
  },
  navSubtitle: {
    color: '#56739F',
    fontSize: 11,
    fontWeight: '800',
  },
  skipButton: {
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  skipText: {
    color: '#2D78FF',
    fontSize: 12,
    fontWeight: '900',
  },
  eyebrow: {
    color: '#2D78FF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#071B45',
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 37,
  },
  heroBody: {
    color: '#476A9E',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  heroVisual: {
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 30,
    minHeight: 184,
    overflow: 'hidden',
    position: 'relative',
  },
  pulseRing: {
    borderColor: '#2D78FF',
    borderRadius: 999,
    borderWidth: 26,
    height: 180,
    left: '50%',
    marginLeft: -90,
    marginTop: -90,
    position: 'absolute',
    top: '50%',
    width: 180,
  },
  segmentWrap: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 6,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  segmentActive: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#2D78FF',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  segmentText: {
    color: '#6B86AD',
    fontSize: 12,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#2D78FF',
  },
  glassShadow: {
    borderRadius: 32,
    shadowColor: '#1755B8',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
  },
  glassBlur: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  glassCard: {
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 32,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionKicker: {
    color: '#2D78FF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: '#071B45',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  priceTag: {
    color: '#071B45',
    fontSize: 14,
    fontWeight: '900',
  },
  packagePreview: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  metricRing: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  metricHalo: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    borderWidth: 5,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  metricValue: {
    color: '#071B45',
    fontSize: 21,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#55739F',
    fontSize: 11,
    fontWeight: '900',
  },
  insightChart: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRadius: 26,
    flexDirection: 'row',
    gap: 12,
    height: 134,
    justifyContent: 'center',
    padding: 14,
  },
  chartBar: {
    backgroundColor: 'rgba(112,164,255,0.42)',
    borderRadius: 999,
    width: 28,
  },
  chartBarActive: {
    backgroundColor: '#2D78FF',
  },
  bookingSteps: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRadius: 26,
    gap: 12,
    padding: 16,
  },
  bookingStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  stepDot: {
    backgroundColor: '#2D78FF',
    borderRadius: 999,
    height: 16,
    width: 16,
  },
  stepDotDim: {
    backgroundColor: '#BBD4FF',
  },
  stepLabel: {
    color: '#123B73',
    fontSize: 14,
    fontWeight: '900',
  },
  cardBody: {
    color: '#476A9E',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  ctaCard: {
    marginBottom: 10,
  },
  ctaTitle: {
    color: '#071B45',
    fontSize: 20,
    fontWeight: '900',
  },
  ctaBody: {
    color: '#476A9E',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },
  primaryCta: {
    alignItems: 'center',
    backgroundColor: '#2D78FF',
    borderRadius: 22,
    justifyContent: 'center',
    minHeight: 54,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
