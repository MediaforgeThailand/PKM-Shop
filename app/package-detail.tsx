import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { featuredPackage, formatMoney } from '@/services/mockBackend';

export default function PackageDetailScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Package detail"
        title={featuredPackage.title}
        subtitle={`${featuredPackage.hospital} - ${featuredPackage.location} - ${featuredPackage.duration}`}
        compact
      />

      <Card>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(featuredPackage.price)}</Text>
          <Pill label="AI recommended" />
        </View>
        <Text style={styles.body}>{featuredPackage.bestFor}</Text>
        <Text style={styles.aiReason}>{featuredPackage.aiReason}</Text>
      </Card>

      <SectionHeader title="Includes" meta={`${featuredPackage.includes.length} items`} />
      {featuredPackage.includes.map((item, index) => (
        <View key={item} style={styles.includeRow}>
          <Text style={styles.includeNumber}>{index + 1}</Text>
          <Text style={styles.includeText}>{item}</Text>
        </View>
      ))}

      <Card>
        <Text style={styles.cardTitle}>Commercial logic</Text>
        <View style={styles.commissionRow}>
          <View style={styles.commissionTile}>
            <Text style={styles.commissionValue}>5%</Text>
            <Text style={styles.commissionLabel}>Mira GP</Text>
          </View>
          <View style={styles.commissionTile}>
            <Text style={styles.commissionValue}>5%</Text>
            <Text style={styles.commissionLabel}>Referral</Text>
          </View>
          <View style={styles.commissionTile}>
            <Text style={styles.commissionValue}>10%</Text>
            <Text style={styles.commissionLabel}>Total take</Text>
          </View>
        </View>
      </Card>

      <Link href="/checkout" asChild>
        <ActionButton label="Buy package" />
      </Link>
      <Link href="/packages" asChild>
        <ActionButton label="Back to marketplace" variant="secondary" />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  price: {
    color: MiraDesign.color.ink,
    fontSize: 28,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  aiReason: {
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: MiraDesign.radius.sm,
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    padding: MiraDesign.space.md,
  },
  includeRow: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    minHeight: 64,
    paddingHorizontal: MiraDesign.space.lg,
  },
  includeNumber: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: MiraDesign.radius.pill,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    height: 30,
    lineHeight: 30,
    textAlign: 'center',
    width: 30,
  },
  includeText: {
    color: MiraDesign.color.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  cardTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  commissionRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  commissionTile: {
    backgroundColor: MiraDesign.color.surfaceStrong,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: MiraDesign.space.xs,
    padding: MiraDesign.space.md,
  },
  commissionValue: {
    color: MiraDesign.color.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  commissionLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
  },
});
