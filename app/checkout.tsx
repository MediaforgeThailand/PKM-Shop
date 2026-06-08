import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { currentUser, featuredPackage, formatMoney, healthPackages, hospitalBranches } from '@/services/mockBackend';

function resolveParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function CheckoutScreen() {
  const params = useLocalSearchParams();
  const packageId = resolveParam(params.packageId);
  const branchId = resolveParam(params.branchId);
  const selectedPackage = healthPackages.find((item) => item.id === packageId) ?? featuredPackage;
  const selectedBranch = hospitalBranches.find((branch) => branch.id === branchId && branch.supportedPackageIds.includes(selectedPackage.id));

  return (
    <Screen>
      <BrandHeader
        eyebrow="Checkout"
        title="ยืนยันแพ็กเกจและชำระเงิน"
        subtitle="Flow นี้รับแพ็กเกจและสาขาจากแชท เพื่อจำลอง chat-to-checkout ก่อนเชื่อมสินค้า DB จริง"
        compact
      />

      <Card>
        <Text style={styles.cardTitle}>{selectedPackage.title}</Text>
        <Text style={styles.body}>{selectedBranch ? `${selectedBranch.hospital} - ${selectedBranch.name}` : selectedPackage.hospital}</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Package price</Text>
          <Text style={styles.summaryValue}>{formatMoney(selectedPackage.price)}</Text>
        </View>
        {selectedBranch ? (
          <View style={styles.branchBox}>
            <Text style={styles.branchLabel}>Selected location</Text>
            <Text style={styles.branchName}>{selectedBranch.name}</Text>
            <Text style={styles.branchBody}>
              {selectedBranch.address} - {selectedBranch.distanceKm.toFixed(1)} km - slot {selectedBranch.nextSlot}
            </Text>
          </View>
        ) : null}
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
  branchBox: {
    backgroundColor: MiraDesign.color.blueSoft,
    borderColor: '#CFE3FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    gap: 4,
    padding: MiraDesign.space.md,
  },
  branchLabel: {
    color: MiraDesign.color.blue,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  branchName: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  branchBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
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
