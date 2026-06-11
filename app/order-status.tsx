import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OrderStatusRedirect() {
  const params = useLocalSearchParams();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;

  return <Redirect href={orderId ? `/orders?focus=${encodeURIComponent(orderId)}` : '/orders'} />;
}
