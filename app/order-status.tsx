import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OrderStatusRedirect() {
  const params = useLocalSearchParams();
  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const targetOrderId = focus || orderId;

  return <Redirect href={targetOrderId ? `/user-profile?focus=${encodeURIComponent(targetOrderId)}` : '/user-profile'} />;
}
