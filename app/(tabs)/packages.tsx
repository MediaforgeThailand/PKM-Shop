import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { BiomarkerBar, StatusRing } from '@/components/HealthVisuals';
import { MiraDesign, softShadow } from '@/constants/Design';
import { formatMoney, healthPackages } from '@/services/mockBackend';

const categories = ['All', 'Heart', 'Cancer', 'Longevity', 'Metabolic'];

export default function PackagesScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>Health package marketplace</Text>
          <Text style={styles.title}>แพ็กเกจตรวจสุขภาพที่เลือกง่ายกว่าเดิม</Text>
          <Text style={styles.subtitle}>จัดกลุ่มตามเป้าหมายสุขภาพ พร้อมคะแนน match จาก AI</Text>
        </View>
        <StatusRing value={86} label="Match" size={104} color={MiraDesign.color.blue} />
      </View>

      <View style={styles.categoryRow}>
        {categories.map((category, index) => (
          <Text key={category} style={[styles.categoryChip, index === 0 ? styles.categoryActive : null]}>
            {category}
          </Text>
        ))}
      </View>

      <SectionHeader title="แพ็กเกจแนะนำ" meta={`${healthPackages.length} offers`} />
      {healthPackages.map((item, index) => {
        const match = [86, 79, 73][index] ?? 70;

        return (
          <Card key={item.id} style={styles.packageCard}>
            <View style={styles.cardTop}>
              <View style={[styles.hospitalBadge, index === 1 ? styles.blueBadge : index === 2 ? styles.lavenderBadge : null]}>
                <Text style={styles.hospitalBadgeText}>{item.hospital.slice(0, 1)}</Text>
              </View>
              <View style={styles.titleWrap}>
                <Text style={styles.packageTitle}>{item.title}</Text>
                <Text style={styles.hospital}>{item.hospital}</Text>
              </View>
              <Text style={styles.price}>{formatMoney(item.price)}</Text>
            </View>

            <View style={styles.visualMatch}>
              <View style={styles.matchCircle}>
                <Text style={styles.matchValue}>{match}</Text>
                <Text style={styles.matchLabel}>AI</Text>
              </View>
              <View style={styles.matchBars}>
                <BiomarkerBar label="Goal fit" value={`${match}%`} percent={match} tone={MiraDesign.color.primary} />
                <BiomarkerBar label="Data need" value={`${Math.max(match - 14, 55)}%`} percent={Math.max(match - 14, 55)} tone={MiraDesign.color.amber} />
              </View>
            </View>

            <View style={styles.tagRow}>
              {item.tags.slice(0, 3).map((tag) => (
                <Pill key={tag} label={tag} tone="blue" />
              ))}
            </View>

            <Link href="/package-detail" asChild>
              <ActionButton label="ดูแพ็กเกจ" variant={index === 0 ? 'primary' : 'secondary'} />
            </Link>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
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
  heroCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
  },
  categoryChip: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.pill,
    borderWidth: 1,
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.sm,
  },
  categoryActive: {
    backgroundColor: MiraDesign.color.primary,
    color: '#FFFFFF',
  },
  packageCard: {
    gap: MiraDesign.space.lg,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  hospitalBadge: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: MiraDesign.radius.lg,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  blueBadge: {
    backgroundColor: MiraDesign.color.blueSoft,
  },
  lavenderBadge: {
    backgroundColor: '#EFEDFF',
  },
  hospitalBadgeText: {
    color: MiraDesign.color.primary,
    fontSize: 24,
    fontWeight: '900',
  },
  titleWrap: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  packageTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  hospital: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  price: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  visualMatch: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: MiraDesign.radius.lg,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.md,
  },
  matchCircle: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderRadius: MiraDesign.radius.pill,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  matchValue: {
    color: MiraDesign.color.primary,
    fontSize: 25,
    fontWeight: '900',
  },
  matchLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 10,
    fontWeight: '900',
  },
  matchBars: {
    flex: 1,
    gap: MiraDesign.space.md,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
});
