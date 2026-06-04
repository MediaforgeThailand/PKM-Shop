import { Link } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { currentUser, featuredPackage, formatMoney } from '@/services/mockBackend';

export default function CheckoutScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Checkout"
        title="Reserve and pay through Mira."
        subtitle="This wireframe leaves payment provider open, but keeps referral attribution and hospital booking handoff visible."
        compact
      />

      <Card>
        <Text style={styles.cardTitle}>{featuredPackage.title}</Text>
        <Text style={styles.body}>{featuredPackage.hospital}</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Package price</Text>
          <Text style={styles.summaryValue}>{formatMoney(featuredPackage.price)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Referral tag</Text>
          <Pill label="DRNOK-2026" tone="mint" />
        </View>
      </Card>

      <SectionHeader title="Customer details" />
      <Card>
        <TextInput placeholder={currentUser.phone} placeholderTextColor={MiraDesign.color.muted} style={styles.input} />
        <TextInput placeholder="National ID or passport number" placeholderTextColor={MiraDesign.color.muted} style={styles.input} />
        <TextInput placeholder="Preferred hospital call time" placeholderTextColor={MiraDesign.color.muted} style={styles.input} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Payment split preview</Text>
        <Text style={styles.body}>Hospital receives net settlement. Mira records GP, referral commission, and payout schedule.</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Mira GP</Text>
          <Text style={styles.summaryValue}>5%</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Referral commission</Text>
          <Text style={styles.summaryValue}>5%</Text>
        </View>
      </Card>

      <Link href="/order-status" asChild>
        <ActionButton label="Mock payment success" />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  summaryValue: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#EEF6FC',
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: MiraDesign.space.lg,
  },
});
