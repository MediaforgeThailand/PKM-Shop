import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader, StatTile } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { currentUser, featuredPackage, formatMoney, mockBackendStatus, purchaseOrders } from '@/services/mockBackend';

export default function HomeScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="AI health concierge"
        title={`Welcome, ${currentUser.name}`}
        subtitle="Buy hospital checkups, let the agent keep health context, and turn results into a personal health dashboard."
        compact
      />

      <View style={styles.statsRow}>
        <StatTile label="Latest data" value="45d" detail={currentUser.agentStatus} />
        <StatTile label="Backend mode" value={mockBackendStatus.mode} detail="Supabase-ready service contract" />
      </View>

      <Card>
        <View style={styles.cardTop}>
          <Pill label="AI match" tone="blue" />
          <Text style={styles.price}>{formatMoney(featuredPackage.price)}</Text>
        </View>
        <Text style={styles.featureTitle}>{featuredPackage.title}</Text>
        <Text style={styles.featureMeta}>{featuredPackage.hospital} - {featuredPackage.duration}</Text>
        <Text style={styles.body}>{featuredPackage.aiReason}</Text>
        <Link href="/package-detail" asChild>
          <ActionButton label="View package" />
        </Link>
      </Card>

      <SectionHeader title="Core flows" meta="wireframe" />
      <View style={styles.flowGrid}>
        <Link href="/packages" asChild>
          <Pressable style={styles.flowCard}>
            <Text style={styles.flowTitle}>Marketplace</Text>
            <Text style={styles.flowBody}>Hospital packages, price, GP, referral tags.</Text>
          </Pressable>
        </Link>
        <Link href="/agent" asChild>
          <Pressable style={styles.flowCard}>
            <Text style={styles.flowTitle}>AI Agent</Text>
            <Text style={styles.flowBody}>Collect context and recommend services.</Text>
          </Pressable>
        </Link>
        <Link href="/health" asChild>
          <Pressable style={styles.flowCard}>
            <Text style={styles.flowTitle}>Health dashboard</Text>
            <Text style={styles.flowBody}>Timed records, freshness, deep stats.</Text>
          </Pressable>
        </Link>
        <Link href="/partner" asChild>
          <Pressable style={styles.flowCard}>
            <Text style={styles.flowTitle}>Referral</Text>
            <Text style={styles.flowBody}>Doctor, nurse, creator link tracking.</Text>
          </Pressable>
        </Link>
      </View>

      <SectionHeader title="After purchase" meta={purchaseOrders[0].id} />
      <Card>
        <Text style={styles.featureTitle}>Call hospital sales to book</Text>
        <Text style={styles.body}>After payment, the hospital sales team can look up the order by phone, ID card, or order number.</Text>
        <Link href="/order-status" asChild>
          <ActionButton label="Open booking status" variant="secondary" />
        </Link>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  price: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  featureTitle: {
    color: MiraDesign.color.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  featureMeta: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  flowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
  },
  flowCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flexBasis: '47%',
    gap: MiraDesign.space.sm,
    minHeight: 118,
    padding: MiraDesign.space.md,
  },
  flowTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  flowBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
});
