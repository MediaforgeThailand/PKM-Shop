import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AuthChip, MetricTile, Panel, PrimaryAction, ShowcaseHeader, ShowcaseScreen, StatusChip } from '@/components/showcase/ShowcaseUI';
import { MiraDesign } from '@/constants/Design';
import { signInWithEmailPassword } from '@/lib/auth/useAuthSession';
import { showcaseModules, getShowcaseEntriesForModule, type ShowcaseModule } from '@/lib/showcase/registry';
import { supabaseConfigStatus } from '@/lib/supabase';

const brandMark = require('@/assets/images/mira-care-mark.png');

const moduleNumbers: Record<ShowcaseModule['id'], string> = {
  admin: '02',
  'ai-chat': '03',
  health: '04',
  referral: '01',
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
  const { width } = useWindowDimensions();
  const isWide = width >= 760;

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
    <ShowcaseScreen>
      <ShowcaseHeader
        actions={
          <View style={styles.connectionBadge}>
            <View style={[styles.connectionDot, supabaseConfigStatus.isConfigured ? styles.connectionDotLive : styles.connectionDotOffline]} />
            <Text style={styles.connectionText}>{supabaseConfigStatus.isConfigured ? 'เชื่อมต่อระบบจริง' : 'โหมดออฟไลน์'}</Text>
          </View>
        }
        eyebrow="MIRACARE PLATFORM"
        subtitle="ทัวร์หน้าที่ใช้คุยกับโรงพยาบาล แยกชัดว่าอะไรพร้อมใช้ อะไรเป็น mockup และอะไรเป็น concept"
        title="เลือกระบบที่อยากดู"
      />

      <View style={[styles.metricRow, !isWide ? styles.metricRowStack : null]}>
        <MetricTile label="หมวด UI" value={`${showcaseModules.length}`} detail="กดเข้า tour ได้ทุกหมวด" />
        <MetricTile label="หน้าทั้งหมด" value={`${totals.pages}`} detail={`${totals.live} live / ${totals.mockup} mockup / ${totals.concept} concept`} />
        <MetricTile label="Login" value="0" detail="หน้า tour เปิดดูได้ทันที" />
      </View>

      <View style={styles.moduleGrid}>
        {showcaseModules.map((module) => (
          <ModulePoster key={module.id} isWide={isWide} module={module} />
        ))}
      </View>

      {demoLoginEnabled ? (
        <Panel style={styles.demoPanel}>
          <View style={styles.demoCopy}>
            <Text style={styles.demoTitle}>Demo sign-in</Text>
            <Text style={styles.demoBody}>เปิดเฉพาะเมื่อ `EXPO_PUBLIC_DEMO_LOGIN=1` และต้องตั้งค่า account ผ่าน env</Text>
            {loginMessage ? <Text style={styles.demoMessage}>{loginMessage}</Text> : null}
          </View>
          <View style={styles.demoActions}>
            {demoAccounts.map((account) => (
              <PrimaryAction
                key={account.label}
                disabled={!supabaseConfigStatus.isConfigured}
                label={account.label}
                onPress={() => void signInDemo(account.email, account.password, account.label)}
              />
            ))}
          </View>
        </Panel>
      ) : null}
    </ShowcaseScreen>
  );
}

function ModulePoster({ isWide, module }: { isWide: boolean; module: ShowcaseModule }) {
  const entries = getShowcaseEntriesForModule(module.id, true);
  const visibleEntries = getShowcaseEntriesForModule(module.id, false);
  const statusSummary = {
    concept: entries.filter((entry) => entry.status === 'concept').length,
    live: entries.filter((entry) => entry.status === 'live').length,
    mockup: entries.filter((entry) => entry.status === 'mockup').length,
    planned: entries.filter((entry) => entry.status === 'planned').length,
  };

  return (
    <Link href={{ pathname: '/tour/[module]', params: { module: module.id } }} asChild>
      <Pressable style={StyleSheet.flatten([styles.moduleCard, isWide ? styles.moduleCardWide : styles.moduleCardStacked])}>
        <View style={[styles.poster, { borderColor: module.accent }]}>
          <Image source={brandMark} style={styles.posterMark} />
          <Text style={[styles.moduleNumber, { color: module.accent }]}>{moduleNumbers[module.id]}</Text>
          <View style={styles.statusRail}>
            {statusSummary.live > 0 ? <StatusDot color="#26A269" count={statusSummary.live} /> : null}
            {statusSummary.mockup > 0 ? <StatusDot color={MiraDesign.color.amber} count={statusSummary.mockup} /> : null}
            {statusSummary.concept > 0 ? <StatusDot color="#6B7DE3" count={statusSummary.concept} /> : null}
            {statusSummary.planned > 0 ? <StatusDot color={MiraDesign.color.muted} count={statusSummary.planned} /> : null}
          </View>
        </View>

        <View style={styles.moduleBody}>
          <View style={styles.moduleHead}>
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

          <View style={styles.moduleMeta}>
            <StatusChip status={statusSummary.mockup > 0 ? 'mockup' : statusSummary.concept > 0 ? 'concept' : 'live'} />
            <AuthChip auth="none" />
          </View>

          <View style={styles.pagePreview}>
            {visibleEntries.slice(0, 3).map((entry) => (
              <Text key={entry.id} numberOfLines={1} style={styles.pagePreviewText}>
                {entry.path}
              </Text>
            ))}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

function StatusDot({ color, count }: { color: string; count: number }) {
  return (
    <View style={styles.statusDotGroup}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={styles.statusDotText}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  connectionBadge: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#D8E9F8',
    borderRadius: MiraDesign.radius.pill,
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
    backgroundColor: '#26A269',
  },
  connectionDotOffline: {
    backgroundColor: MiraDesign.color.amber,
  },
  connectionText: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  metricRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  metricRowStack: {
    flexDirection: 'column',
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.lg,
  },
  moduleCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#D8E9F8',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  moduleCardWide: {
    width: '48.7%',
  },
  moduleCardStacked: {
    width: '100%',
  },
  poster: {
    backgroundColor: '#DCEBFF',
    borderBottomWidth: 4,
    height: 220,
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: MiraDesign.space.lg,
  },
  posterMark: {
    height: 250,
    opacity: 0.08,
    position: 'absolute',
    right: -46,
    top: -18,
    width: 250,
  },
  moduleNumber: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 62,
  },
  statusRail: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  statusDotGroup: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(50,120,199,0.12)',
    borderRadius: MiraDesign.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusDot: {
    borderRadius: MiraDesign.radius.pill,
    height: 8,
    width: 8,
  },
  statusDotText: {
    color: MiraDesign.color.ink,
    fontSize: 11,
    fontWeight: '900',
  },
  moduleBody: {
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.lg,
  },
  moduleHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  moduleTitleWrap: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  moduleEyebrow: {
    color: MiraDesign.color.blue,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  moduleTitle: {
    color: MiraDesign.color.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  countChip: {
    alignItems: 'center',
    borderRadius: MiraDesign.radius.sm,
    height: 42,
    justifyContent: 'center',
    width: 46,
  },
  countChipText: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  moduleMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  pagePreview: {
    gap: 6,
  },
  pagePreviewText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  demoPanel: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  demoCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  demoTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  demoBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  demoMessage: {
    color: MiraDesign.color.blue,
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
