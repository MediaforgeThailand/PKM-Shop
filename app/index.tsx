import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryAction, ShowcaseScreen } from '@/components/showcase/ShowcaseUI';
import { MiraDesign } from '@/constants/Design';
import { signInWithEmailPassword } from '@/lib/auth/useAuthSession';
import { getShowcaseEntriesForModule, showcaseModules, type ShowcaseModule, type ShowcaseModuleId } from '@/lib/showcase/registry';
import { supabaseConfigStatus } from '@/lib/supabase';

const brandLogo = require('@/assets/images/mira-care-logo.png');
const brandMark = require('@/assets/images/mira-care-mark.png');
type SymbolName = ComponentProps<typeof SymbolView>['name'];

const moduleNumbers: Record<ShowcaseModuleId, string> = {
  admin: '02',
  'ai-chat': '03',
  health: '04',
  referral: '01',
};

const moduleVisuals: Record<
  ShowcaseModuleId,
  {
    fit: 'contain' | 'cover';
    image: ImageSourcePropType;
    icon: SymbolName;
    wash: string;
  }
> = {
  admin: {
    fit: 'cover',
    icon: { android: 'admin_panel_settings', ios: 'slider.horizontal.3', web: 'admin_panel_settings' },
    image: require('@/assets/images/sales-package-longevity.png'),
    wash: '#DDEBFF',
  },
  'ai-chat': {
    fit: 'cover',
    icon: { android: 'chat', ios: 'message.and.waveform.fill', web: 'chat' },
    image: require('@/assets/motion/mira-landing-motion-poster.png'),
    wash: '#DDF5F3',
  },
  health: {
    fit: 'contain',
    icon: { android: 'monitor_heart', ios: 'heart.text.square.fill', web: 'monitor_heart' },
    image: require('@/assets/images/mockup-body-overview.png'),
    wash: '#DDF3FF',
  },
  referral: {
    fit: 'cover',
    icon: { android: 'link', ios: 'link', web: 'link' },
    image: require('@/assets/images/sales-package-health.png'),
    wash: '#FFF3CF',
  },
};

const demoLoginEnabled = process.env.EXPO_PUBLIC_DEMO_LOGIN === '1';

const demoAccounts = [
  {
    email: process.env.EXPO_PUBLIC_DEMO_ADMIN_EMAIL,
    label: 'เข้าสู่ระบบเดโมแอดมิน',
    password: process.env.EXPO_PUBLIC_DEMO_ADMIN_PASSWORD,
  },
  {
    email: process.env.EXPO_PUBLIC_DEMO_CUSTOMER_EMAIL,
    label: 'เข้าสู่ระบบเดโมลูกค้า',
    password: process.env.EXPO_PUBLIC_DEMO_CUSTOMER_PASSWORD,
  },
];

export default function ProductOverviewScreen() {
  const [loginMessage, setLoginMessage] = useState<string | null>(null);

  const totals = useMemo(() => {
    const entries = showcaseModules.flatMap((module) => getShowcaseEntriesForModule(module.id, true));

    return {
      concept: entries.filter((entry) => entry.status === 'concept').length,
      live: entries.filter((entry) => entry.status === 'live').length,
      mockup: entries.filter((entry) => entry.status === 'mockup').length,
      pages: entries.length,
    };
  }, []);

  async function signInDemo(email: string | undefined, password: string | undefined, label: string) {
    if (!email || !password) {
      setLoginMessage('ยังไม่ได้ตั้งค่า demo account ใน env');
      return;
    }

    try {
      setLoginMessage(`กำลังเข้าสู่ระบบ: ${label}`);
      await signInWithEmailPassword(email, password);
      setLoginMessage('เข้าสู่ระบบเดโมแล้ว');
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ');
    }
  }

  return (
    <ShowcaseScreen maxWidth={1220}>
      <View style={styles.topBar}>
        <Image resizeMode="contain" source={brandLogo} style={styles.logo} />
        <View style={styles.topActions}>
          <View style={styles.connectionBadge}>
            <View style={[styles.connectionDot, supabaseConfigStatus.isConfigured ? styles.connectionDotLive : styles.connectionDotOffline]} />
            <Text style={styles.connectionText}>{supabaseConfigStatus.isConfigured ? 'เชื่อมต่อระบบจริง' : 'โหมดออฟไลน์'}</Text>
          </View>
          <View style={styles.clientBadge}>
            <Text style={styles.clientBadgeText}>ทัวร์เดโมลูกค้า</Text>
          </View>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>MIRACARE SHOWCASE</Text>
          <Text style={styles.title}>{'เลือกหน้าจอ\nที่จะพรีเซนต์'}</Text>
          <Text style={styles.subtitle}>
            รวมระบบขายผ่านแชท, referral, หลังบ้าน และ health dashboard ไว้ใน tour เดียว โดยแยกชัดเจนว่าอะไร live, mockup หรือ concept
          </Text>

          <View style={styles.heroStats}>
            <StatPill label="หมวด" value={`${showcaseModules.length}`} />
            <StatPill label="หน้า" value={`${totals.pages}`} />
            <StatPill label="LIVE" value={`${totals.live}`} />
            <StatPill label="MOCKUP" value={`${totals.mockup}`} />
          </View>
        </View>

        <View style={styles.heroVisual}>
          <Image resizeMode="contain" source={moduleVisuals.health.image} style={styles.heroPhone} />
          <View style={styles.heroVisualCopy}>
            <Text style={styles.heroVisualTitle}>นำ UI สุขภาพกลับมาแสดงแล้ว</Text>
            <Text style={styles.heroVisualBody}>ภาพ mockup ชุดสุขภาพถูกนำกลับมาเป็น poster หลักของ showcase แล้ว</Text>
          </View>
        </View>
      </View>

      <View style={styles.moduleGrid}>
        {showcaseModules.map((module) => (
          <ModulePoster key={module.id} module={module} />
        ))}
      </View>

      {demoLoginEnabled ? (
        <View style={styles.demoPanel}>
          <View style={styles.demoCopy}>
            <Text style={styles.demoTitle}>เข้าสู่ระบบเดโม</Text>
            <Text style={styles.demoBody}>เปิดเฉพาะเมื่อ `EXPO_PUBLIC_DEMO_LOGIN=1` และตั้งค่า account ผ่าน env</Text>
            {loginMessage ? <Text style={styles.demoMessage}>{loginMessage}</Text> : null}
          </View>
          <View style={styles.demoActions}>
            {demoAccounts.map((account) => (
              <PrimaryAction
                disabled={!supabaseConfigStatus.isConfigured}
                key={account.label}
                label={account.label}
                onPress={() => void signInDemo(account.email, account.password, account.label)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ShowcaseScreen>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ModulePoster({ module }: { module: ShowcaseModule }) {
  const visual = moduleVisuals[module.id];
  const entries = getShowcaseEntriesForModule(module.id, true);
  const visibleEntries = getShowcaseEntriesForModule(module.id, false);
  const statusSummary = {
    concept: entries.filter((entry) => entry.status === 'concept').length,
    live: entries.filter((entry) => entry.status === 'live').length,
    mockup: entries.filter((entry) => entry.status === 'mockup').length,
    planned: entries.filter((entry) => entry.status === 'planned').length,
  };

  return (
    <Link asChild href={{ pathname: '/tour/[module]', params: { module: module.id } }}>
      <Pressable style={styles.moduleCard}>
        <View style={[styles.posterStage, { backgroundColor: visual.wash }]}>
          <Image resizeMode={visual.fit} source={visual.image} style={[styles.posterImage, visual.fit === 'contain' ? styles.posterImageContain : null]} />
          <Image resizeMode="contain" source={brandMark} style={styles.posterMark} />
          <LinearGradient colors={['rgba(249,253,255,0)', 'rgba(7,29,73,0.78)']} style={styles.posterScrim} />

          <View style={styles.posterTop}>
            <View style={[styles.iconBadge, { backgroundColor: module.accent }]}>
              <SymbolView name={visual.icon} size={24} tintColor={MiraDesign.color.showcaseNavy} />
            </View>
            <Text style={styles.moduleNumber}>{moduleNumbers[module.id]}</Text>
          </View>

          <View style={styles.posterBottom}>
            <View style={styles.statusRail}>
              {statusSummary.live > 0 ? <StatusDot color={MiraDesign.color.showcaseMint} count={statusSummary.live} label="live" /> : null}
              {statusSummary.mockup > 0 ? <StatusDot color={MiraDesign.color.amber} count={statusSummary.mockup} label="mockup" /> : null}
              {statusSummary.concept > 0 ? <StatusDot color={MiraDesign.color.lavender} count={statusSummary.concept} label="concept" /> : null}
            </View>

            <View style={styles.moduleTitleLine}>
              <View style={styles.moduleTitleWrap}>
                <Text style={styles.moduleEyebrow}>{module.eyebrow}</Text>
                <Text numberOfLines={2} style={styles.moduleTitle}>
                  {module.title}
                </Text>
              </View>
              <View style={[styles.countChip, { backgroundColor: module.accent }]}>
                <Text style={styles.countChipText}>{entries.length}</Text>
              </View>
            </View>

            <View style={styles.previewStrip}>
              {visibleEntries.slice(0, 3).map((entry) => (
                <Text key={entry.id} numberOfLines={1} style={styles.previewChip}>
                  {entry.label_th}
                </Text>
              ))}
            </View>

            <View style={styles.openRow}>
              <Text style={[styles.openText, { color: module.accent }]}>เปิด tour</Text>
              <SymbolView name={{ android: 'open_in_new', ios: 'arrow.up.right', web: 'open_in_new' }} size={17} tintColor={module.accent} />
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

function StatusDot({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <View style={styles.statusDotGroup}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={styles.statusDotText}>
        {count} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.lg,
    justifyContent: 'space-between',
    width: '100%',
  },
  logo: {
    height: 42,
    width: 170,
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  connectionBadge: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: '#BBD8F8',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
    minHeight: 40,
    paddingHorizontal: MiraDesign.space.md,
  },
  connectionDot: {
    borderRadius: MiraDesign.radius.pill,
    height: 9,
    width: 9,
  },
  connectionDotLive: {
    backgroundColor: MiraDesign.color.showcaseMint,
  },
  connectionDotOffline: {
    backgroundColor: MiraDesign.color.amber,
  },
  connectionText: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    fontWeight: '900',
  },
  clientBadge: {
    borderColor: '#BBD8F8',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: MiraDesign.space.md,
  },
  clientBadgeText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  hero: {
    alignItems: 'stretch',
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: '#C6E0FA',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.xxl,
    overflow: 'hidden',
    padding: MiraDesign.space.xxl,
    width: '100%',
  },
  heroCopy: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    gap: MiraDesign.space.md,
    maxWidth: '100%',
    minWidth: 280,
  },
  kicker: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 44,
  },
  subtitle: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 700,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
    marginTop: MiraDesign.space.sm,
  },
  statPill: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderColor: '#BBD8F8',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexBasis: 112,
    flexGrow: 1,
    minWidth: 94,
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.sm,
  },
  statValue: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  statLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroVisual: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseCanvas,
    borderColor: '#C6E0FA',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexBasis: 330,
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 430,
    minHeight: 360,
    minWidth: 280,
    overflow: 'hidden',
    padding: MiraDesign.space.lg,
  },
  heroPhone: {
    height: 520,
    left: '50%',
    marginLeft: -146,
    position: 'absolute',
    top: -70,
    width: 292,
  },
  heroVisualCopy: {
    backgroundColor: 'rgba(249,253,255,0.86)',
    borderColor: '#D1E7FF',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    bottom: MiraDesign.space.lg,
    gap: 4,
    left: MiraDesign.space.lg,
    padding: MiraDesign.space.md,
    position: 'absolute',
    right: MiraDesign.space.lg,
  },
  heroVisualTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 15,
    fontWeight: '900',
  },
  heroVisualBody: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    lineHeight: 17,
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.lg,
    width: '100%',
  },
  moduleCard: {
    borderRadius: MiraDesign.radius.sm,
    flexBasis: 520,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 300,
    minHeight: 370,
    overflow: 'hidden',
  },
  posterStage: {
    flex: 1,
    minHeight: 370,
    overflow: 'hidden',
  },
  posterImage: {
    height: '100%',
    opacity: 1,
    position: 'absolute',
    width: '100%',
  },
  posterImageContain: {
    height: '128%',
    right: -38,
    top: -44,
    width: '72%',
  },
  posterMark: {
    height: 240,
    opacity: 0.08,
    position: 'absolute',
    right: -48,
    top: -36,
    width: 240,
  },
  posterScrim: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  posterTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: MiraDesign.space.lg,
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: MiraDesign.radius.sm,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  moduleNumber: {
    color: MiraDesign.color.surface,
    fontSize: 14,
    fontWeight: '900',
  },
  posterBottom: {
    bottom: 0,
    gap: MiraDesign.space.md,
    left: 0,
    padding: MiraDesign.space.lg,
    position: 'absolute',
    right: 0,
  },
  statusRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  statusDotGroup: {
    alignItems: 'center',
    backgroundColor: 'rgba(249,253,255,0.14)',
    borderColor: 'rgba(249,253,255,0.28)',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusDot: {
    borderRadius: MiraDesign.radius.pill,
    height: 8,
    width: 8,
  },
  statusDotText: {
    color: MiraDesign.color.surface,
    fontSize: 11,
    fontWeight: '900',
  },
  moduleTitleLine: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  moduleTitleWrap: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  moduleEyebrow: {
    color: 'rgba(249,253,255,0.72)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  moduleTitle: {
    color: MiraDesign.color.surface,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
  },
  countChip: {
    alignItems: 'center',
    borderRadius: MiraDesign.radius.sm,
    height: 38,
    justifyContent: 'center',
    width: 42,
  },
  countChipText: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 14,
    fontWeight: '900',
  },
  previewStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  previewChip: {
    backgroundColor: 'rgba(249,253,255,0.14)',
    borderColor: 'rgba(249,253,255,0.25)',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    color: MiraDesign.color.surface,
    fontSize: 12,
    fontWeight: '800',
    maxWidth: 180,
    overflow: 'hidden',
    paddingHorizontal: MiraDesign.space.sm,
    paddingVertical: MiraDesign.space.xs,
  },
  openRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
  },
  openText: {
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  demoPanel: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: '#C6E0FA',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.lg,
    justifyContent: 'space-between',
    padding: MiraDesign.space.lg,
  },
  demoCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  demoTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 16,
    fontWeight: '900',
  },
  demoBody: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    lineHeight: 19,
  },
  demoMessage: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 13,
    fontWeight: '900',
  },
  demoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
    justifyContent: 'flex-end',
  },
});
