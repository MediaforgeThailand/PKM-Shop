import { Link } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, Card, Screen } from '@/components/MiraUI';
import { HealthFigure, StatusRing } from '@/components/HealthVisuals';
import { MiraDesign, softShadow } from '@/constants/Design';

export default function LoginScreen() {
  return (
    <Screen>
      <View style={styles.heroCard}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark} />
          <Text style={styles.brand}>Mira</Text>
          <Text style={styles.brandSoft}>Health</Text>
        </View>
        <View style={styles.visualRow}>
          <View style={styles.figureWrap}>
            <HealthFigure />
          </View>
          <StatusRing value={82} label="Match" size={112} />
        </View>
        <Text style={styles.title}>ตรวจสุขภาพที่ใช่ พร้อม AI ช่วยจำบริบทสุขภาพของคุณ</Text>
        <Text style={styles.subtitle}>เลือกแพ็กเกจโรงพยาบาล ซื้อผ่านแอป แล้วเปลี่ยนผลตรวจให้เป็น dashboard ที่อ่านง่าย</Text>
      </View>

      <Card style={styles.loginCard}>
        <Text style={styles.cardTitle}>เข้าสู่ระบบ</Text>
        <TextInput keyboardType="phone-pad" placeholder="เบอร์โทรศัพท์" placeholderTextColor={MiraDesign.color.muted} style={styles.input} />
        <Link href="/home" asChild>
          <ActionButton label="รับ OTP" />
        </Link>
        <Link href="/home" asChild>
          <ActionButton label="เข้าสู่ระบบด้วย LINE" variant="secondary" />
        </Link>
      </Card>

      <View style={styles.marketStrip}>
        <View style={styles.marketItem}>
          <Text style={styles.marketValue}>5%</Text>
          <Text style={styles.marketLabel}>Mira GP</Text>
        </View>
        <View style={styles.marketItem}>
          <Text style={styles.marketValue}>5%</Text>
          <Text style={styles.marketLabel}>Referral</Text>
        </View>
        <View style={styles.marketItem}>
          <Text style={styles.marketValue}>AI</Text>
          <Text style={styles.marketLabel}>Recommendation</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    gap: MiraDesign.space.lg,
    overflow: 'hidden',
    padding: MiraDesign.space.xl,
    ...softShadow,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
  },
  brandMark: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: MiraDesign.radius.pill,
    height: 18,
    width: 36,
  },
  brand: {
    color: MiraDesign.color.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  brandSoft: {
    color: MiraDesign.color.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  visualRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  figureWrap: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: MiraDesign.radius.lg,
    flex: 1,
    minHeight: 180,
    paddingTop: MiraDesign.space.sm,
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 15,
    lineHeight: 23,
  },
  loginCard: {
    gap: MiraDesign.space.md,
  },
  cardTitle: {
    color: MiraDesign.color.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  input: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: MiraDesign.space.lg,
  },
  marketStrip: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  marketItem: {
    backgroundColor: MiraDesign.color.surface,
    borderRadius: MiraDesign.radius.md,
    flex: 1,
    gap: MiraDesign.space.xs,
    padding: MiraDesign.space.md,
  },
  marketValue: {
    color: MiraDesign.color.primary,
    fontSize: 21,
    fontWeight: '900',
  },
  marketLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
  },
});
