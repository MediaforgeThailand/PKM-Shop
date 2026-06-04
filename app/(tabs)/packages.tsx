import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { formatMoney, healthPackages } from '@/services/mockBackend';

export default function PackagesScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Hospital marketplace"
        title="Compare packages by health goal."
        subtitle="The AI agent ranks hospital services from user context, freshness of records, and partner availability."
        compact
      />

      <View style={styles.filterRow}>
        <Pill label="AI ranked" />
        <Pill label="Preventive" tone="mint" />
        <Pill label="Bangkok" tone="amber" />
      </View>

      <SectionHeader title="Recommended packages" meta={`${healthPackages.length} offers`} />
      {healthPackages.map((item) => (
        <Card key={item.id}>
          <View style={styles.cardTop}>
            <View style={styles.titleWrap}>
              <Text style={styles.packageTitle}>{item.title}</Text>
              <Text style={styles.hospital}>{item.hospital}</Text>
            </View>
            <Text style={styles.price}>{formatMoney(item.price)}</Text>
          </View>
          <Text style={styles.body}>{item.bestFor}</Text>
          <View style={styles.tagRow}>
            {item.tags.map((tag) => (
              <Pill key={tag} label={tag} tone="blue" />
            ))}
          </View>
          <View style={styles.commissionRow}>
            <Text style={styles.commissionText}>GP {(item.gpRate * 100).toFixed(0)}%</Text>
            <Text style={styles.commissionText}>Referral {(item.referralRate * 100).toFixed(0)}%</Text>
          </View>
          <Link href="/package-detail" asChild>
            <ActionButton label="Open package detail" />
          </Link>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  cardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  titleWrap: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  packageTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  hospital: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  price: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  commissionRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
  },
  commissionText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
});
