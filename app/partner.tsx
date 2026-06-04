import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader, StatTile } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { formatMoney, referralPartners } from '@/services/mockBackend';

const partner = referralPartners[0];

export default function PartnerScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Referral program"
        title="Partner links that create commission records."
        subtitle="Doctors, nurses, clinics, and health creators can share tagged links or codes that attribute package purchases."
        compact
      />

      <View style={styles.statsRow}>
        <StatTile label="Sales" value={`${partner.attributedSales}`} detail="Attributed purchases" />
        <StatTile label="Pending payout" value={formatMoney(partner.pendingPayout)} detail="Referral commission" />
      </View>

      <Card>
        <Pill label={partner.type} tone="mint" />
        <Text style={styles.cardTitle}>{partner.name}</Text>
        <View style={styles.linkBox}>
          <Text style={styles.linkText}>mira.health/r/{partner.code}</Text>
        </View>
        <Text style={styles.body}>The link tags the user journey from discovery to checkout. The order stores referral code, package, hospital, and payout status.</Text>
      </Card>

      <SectionHeader title="Commission policy" meta="draft" />
      <Card>
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>Mira GP</Text>
          <Text style={styles.policyValue}>5%</Text>
        </View>
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>Referral commission</Text>
          <Text style={styles.policyValue}>5%</Text>
        </View>
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>Hospital settlement</Text>
          <Text style={styles.policyValue}>90%</Text>
        </View>
      </Card>

      <SectionHeader title="Partner leaderboard" />
      {referralPartners.map((item) => (
        <View key={item.id} style={styles.partnerRow}>
          <View style={styles.partnerCopy}>
            <Text style={styles.partnerName}>{item.name}</Text>
            <Text style={styles.partnerMeta}>{item.code} - {item.conversionRate} conversion</Text>
          </View>
          <Text style={styles.partnerPayout}>{formatMoney(item.pendingPayout)}</Text>
        </View>
      ))}

      <Link href="/checkout" asChild>
        <ActionButton label="Test tagged checkout" />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  cardTitle: {
    color: MiraDesign.color.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  linkBox: {
    backgroundColor: '#EEF6FC',
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    padding: MiraDesign.space.md,
  },
  linkText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 15,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  policyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  policyLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    fontWeight: '800',
  },
  policyValue: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  partnerRow: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    minHeight: 78,
    padding: MiraDesign.space.md,
  },
  partnerCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  partnerName: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  partnerMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  partnerPayout: {
    color: MiraDesign.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
});
