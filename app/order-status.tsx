import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { ActionButton, BrandHeader, Card, Screen } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';

export default function OrderStatusScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Order status"
        title="Orders live in chat"
        subtitle="The v2 order state machine stores updates in chat messages and the admin orders queue instead of a standalone mock order page."
        compact
      />

      <Card>
        <Text style={styles.cardTitle}>Customer flow</Text>
        <Text style={styles.body}>Open chat to continue a purchase, submit buyer details, view the PromptPay panel, and receive status notices.</Text>
        <Link href="/chatbot" asChild>
          <ActionButton label="Open chat" />
        </Link>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Admin flow</Text>
        <Text style={styles.body}>Tenant staff review submitted orders, confirm bookings, and write status changes through the shared transition RPC.</Text>
        <Link href="/admin/orders" asChild>
          <ActionButton label="Open orders queue" variant="secondary" />
        </Link>
      </Card>
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
});
