import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { formatMoney, purchaseOrders } from '@/services/mockBackend';

const order = purchaseOrders[0];

export default function OrderStatusScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Booking handoff"
        title="Payment done. Hospital sales books the slot."
        subtitle="The user sees what happens next, while the hospital admin can lookup this order and schedule the visit."
        compact
      />

      <Card>
        <View style={styles.orderTop}>
          <Text style={styles.orderId}>{order.id}</Text>
          <Pill label={order.bookingStatus.replace('_', ' ')} tone="amber" />
        </View>
        <Text style={styles.cardTitle}>{order.packageTitle}</Text>
        <Text style={styles.body}>{order.hospital}</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Paid</Text>
          <Text style={styles.summaryValue}>{formatMoney(order.amount)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Referral</Text>
          <Text style={styles.summaryValue}>{order.referralCode}</Text>
        </View>
      </Card>

      <SectionHeader title="Next steps" />
      {['Hospital sales calls user', 'Sales opens admin lookup', 'Sales confirms slot and writes booking note', 'User attends checkup and uploads results'].map((step, index) => (
        <View key={step} style={styles.stepRow}>
          <Text style={styles.stepNumber}>{index + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      <Link href="/admin-booking" asChild>
        <ActionButton label="Open hospital admin mock" />
      </Link>
      <Link href="/health" asChild>
        <ActionButton label="Preview health dashboard" variant="secondary" />
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  orderTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderId: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
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
  stepRow: {
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
  stepNumber: {
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: MiraDesign.radius.pill,
    color: MiraDesign.color.primary,
    fontSize: 13,
    fontWeight: '900',
    height: 30,
    lineHeight: 30,
    textAlign: 'center',
    width: 30,
  },
  stepText: {
    color: MiraDesign.color.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
});
