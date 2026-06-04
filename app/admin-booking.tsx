import { Link } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { formatMoney, purchaseOrders } from '@/services/mockBackend';

const order = purchaseOrders[0];

export default function AdminBookingScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Hospital back admin"
        title="Lookup purchase and schedule booking."
        subtitle="Hospital sales can search by phone, national ID, or order number, then write the booking slot."
        compact
      />

      <Card>
        <Text style={styles.cardTitle}>Search order</Text>
        <TextInput placeholder="Phone, national ID, or order ID" placeholderTextColor={MiraDesign.color.muted} style={styles.input} />
        <ActionButton label="Mock lookup" />
      </Card>

      <SectionHeader title="Lookup result" meta={order.id} />
      <Card>
        <View style={styles.resultTop}>
          <Text style={styles.cardTitle}>{order.userName}</Text>
          <Pill label="paid" tone="mint" />
        </View>
        <Text style={styles.body}>{order.userPhone} - ID ending {order.nationalIdLast4}</Text>
        <Text style={styles.packageText}>{order.packageTitle}</Text>
        <Text style={styles.body}>{order.hospital} - {formatMoney(order.amount)}</Text>
      </Card>

      <SectionHeader title="Schedule booking" />
      <Card>
        <TextInput placeholder="Visit date" placeholderTextColor={MiraDesign.color.muted} style={styles.input} />
        <TextInput placeholder="Time slot" placeholderTextColor={MiraDesign.color.muted} style={styles.input} />
        <TextInput multiline placeholder="Sales note" placeholderTextColor={MiraDesign.color.muted} style={[styles.input, styles.noteInput]} />
        <ActionButton label="Save booking mock" />
      </Card>

      <Link href="/order-status" asChild>
        <ActionButton label="Back to user order status" variant="secondary" />
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
  noteInput: {
    minHeight: 96,
    paddingTop: MiraDesign.space.md,
    textAlignVertical: 'top',
  },
  resultTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  packageText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 15,
    fontWeight: '900',
  },
});
