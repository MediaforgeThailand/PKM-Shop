import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { BiomarkerBar, FreshnessDots, MiniTrend, StatusRing } from '@/components/HealthVisuals';
import { MiraDesign, softShadow } from '@/constants/Design';
import { currentUser, featuredPackage, formatMoney } from '@/services/mockBackend';

export default function HomeScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Mira Health</Text>
          <Text style={styles.title}>สวัสดี {currentUser.name}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>M</Text>
        </View>
      </View>

      <View style={styles.statusHero}>
        <View style={styles.statusCopy}>
          <Pill label="AI health status" tone="mint" />
          <Text style={styles.statusTitle}>พร้อมเลือกแพ็กเกจตรวจสุขภาพ</Text>
          <FreshnessDots active={3} />
        </View>
        <StatusRing value={78} label="Ready" size={128} />
      </View>

      <SectionHeader title="แพ็กเกจที่ AI แนะนำ" meta="best match" />
      <Card style={styles.packageCard}>
        <View style={styles.packageTop}>
          <View style={styles.iconTile}>
            <Text style={styles.iconText}>+</Text>
          </View>
          <View style={styles.packageCopy}>
            <Text style={styles.packageTitle}>{featuredPackage.title}</Text>
            <Text style={styles.packageMeta}>{featuredPackage.hospital}</Text>
          </View>
          <Text style={styles.price}>{formatMoney(featuredPackage.price)}</Text>
        </View>
        <View style={styles.visualPanel}>
          <BiomarkerBar label="Heart fit" value="82%" percent={82} tone={MiraDesign.color.primary} />
          <BiomarkerBar label="Metabolic need" value="68%" percent={68} tone={MiraDesign.color.amber} />
          <MiniTrend color={MiraDesign.color.primary} />
        </View>
        <Link href="/package-detail" asChild>
          <ActionButton label="ดูรายละเอียดแพ็กเกจ" />
        </Link>
      </Card>

      <SectionHeader title="ทางลัด" meta="marketplace + health" />
      <View style={styles.quickGrid}>
        <Link href="/packages" asChild>
          <Pressable style={styles.quickCard}>
            <View style={[styles.quickIcon, styles.tealIcon]} />
            <Text style={styles.quickTitle}>Marketplace</Text>
            <Text style={styles.quickBody}>เลือกบริการตรวจสุขภาพ</Text>
          </Pressable>
        </Link>
        <Link href="/agent" asChild>
          <Pressable style={styles.quickCard}>
            <View style={[styles.quickIcon, styles.blueIcon]} />
            <Text style={styles.quickTitle}>AI Advisor</Text>
            <Text style={styles.quickBody}>ถามและให้ AI จัดอันดับ</Text>
          </Pressable>
        </Link>
        <Link href="/health" asChild>
          <Pressable style={styles.quickCard}>
            <View style={[styles.quickIcon, styles.coralIcon]} />
            <Text style={styles.quickTitle}>Dashboard</Text>
            <Text style={styles.quickBody}>ดูผลตรวจแบบ visual</Text>
          </Pressable>
        </Link>
        <Link href="/partner" asChild>
          <Pressable style={styles.quickCard}>
            <View style={[styles.quickIcon, styles.amberIcon]} />
            <Text style={styles.quickTitle}>Referral</Text>
            <Text style={styles.quickBody}>ลิงก์หมอ/creator</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 27,
    fontWeight: '900',
    marginTop: 3,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: MiraDesign.radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  statusHero: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.lg,
    ...softShadow,
  },
  statusCopy: {
    flex: 1,
    gap: MiraDesign.space.md,
  },
  statusTitle: {
    color: MiraDesign.color.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  packageCard: {
    gap: MiraDesign.space.lg,
  },
  packageTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  iconTile: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: MiraDesign.radius.md,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  iconText: {
    color: MiraDesign.color.primary,
    fontSize: 30,
    fontWeight: '300',
  },
  packageCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  packageTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  packageMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  price: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  visualPanel: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: MiraDesign.radius.lg,
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.lg,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
  },
  quickCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    gap: MiraDesign.space.sm,
    minHeight: 128,
    padding: MiraDesign.space.md,
  },
  quickIcon: {
    borderRadius: MiraDesign.radius.pill,
    height: 28,
    width: 28,
  },
  tealIcon: {
    backgroundColor: MiraDesign.color.primary,
  },
  blueIcon: {
    backgroundColor: MiraDesign.color.blue,
  },
  coralIcon: {
    backgroundColor: MiraDesign.color.coral,
  },
  amberIcon: {
    backgroundColor: MiraDesign.color.amber,
  },
  quickTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  quickBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
});
