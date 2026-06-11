import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { ActionButton, BrandHeader, Card, Screen } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';

export default function OrderStatusScreen() {
  const params = useLocalSearchParams();
  const payment = Array.isArray(params.payment) ? params.payment[0] : params.payment;
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const stripeSessionId = Array.isArray(params.stripeSessionId) ? params.stripeSessionId[0] : params.stripeSessionId;
  const isStripeSuccess = payment === 'stripe_success';
  const isStripeCancelled = payment === 'stripe_cancelled';

  return (
    <Screen>
      <BrandHeader
        eyebrow="Order status"
        title="Orders live in chat"
        subtitle="The v2 order state machine stores updates in chat messages and the admin orders queue instead of a standalone mock order page."
        compact
      />

      {isStripeSuccess || isStripeCancelled ? (
        <Card>
          <Text style={styles.cardTitle}>{isStripeSuccess ? 'Stripe checkout returned' : 'Stripe checkout cancelled'}</Text>
          <Text style={styles.body}>
            {isStripeSuccess
              ? 'If payment completed, the Stripe webhook will move the order into the admin review queue.'
              : 'No Stripe payment was submitted. You can return to chat and choose another payment method.'}
          </Text>
          {orderId ? <Text style={styles.metaText}>Order: {orderId}</Text> : null}
          {stripeSessionId ? <Text style={styles.metaText}>Stripe session: {stripeSessionId}</Text> : null}
          <Link href="/chatbot" asChild>
            <ActionButton label="Back to chat" />
          </Link>
        </Card>
      ) : null}

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
  metaText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
});
