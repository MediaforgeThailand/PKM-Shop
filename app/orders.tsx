import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { OrderStatusCard } from '@/components/chat/OrderStatusCard';
import { MockupRibbon, SHOWCASE_MOCKUP_RIBBON } from '@/components/showcase/MockupRibbon';
import { LinkButton, MetricTile, Panel, ShowcaseHeader, ShowcaseScreen } from '@/components/showcase/ShowcaseUI';
import { MiraDesign } from '@/constants/Design';
import { showcaseDemoOrders } from '@/lib/showcase/demoFixtures';
import type { OrderStatusInfo } from '@/lib/types/api';

const activeStatuses: OrderStatusInfo['status'][] = ['submitted', 'confirmed', 'booked'];

export default function OrdersScreen() {
  const params = useLocalSearchParams<{ focus?: string; orderId?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const targetOrderId = focus || orderId;

  const orders = useMemo(() => {
    if (!targetOrderId) {
      return showcaseDemoOrders;
    }

    return [...showcaseDemoOrders].sort((left, right) => Number(right.id === targetOrderId) - Number(left.id === targetOrderId));
  }, [targetOrderId]);

  const activeCount = orders.filter((order) => activeStatuses.includes(order.status)).length;
  const completedCount = orders.filter((order) => order.status === 'done').length;
  const cancelledCount = orders.filter((order) => order.status === 'cancelled').length;

  function refreshOrders() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }

  return (
    <View style={styles.wrap}>
      <MockupRibbon label={SHOWCASE_MOCKUP_RIBBON} />
      <ShowcaseScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshOrders} />}>
        <ShowcaseHeader
          actions={<LinkButton href={{ pathname: '/tour/[module]', params: { module: 'ai-chat' } }} label="กลับทัวร์" />}
          eyebrow="AI CHAT COMMERCE"
          subtitle="รายการตัวอย่างสำหรับพรีเซนต์ flow หลังชำระเงิน ก่อนต่อข้อมูลจริงในเฟส commerce"
          title="คำสั่งซื้อของฉัน"
        />

        <View style={styles.metrics}>
          <MetricTile label="กำลังดำเนินการ" value={`${activeCount}`} detail="submitted / confirmed / booked" />
          <MetricTile label="เสร็จสิ้น" value={`${completedCount}`} detail="พร้อมดูประวัติย้อนหลัง" />
          <MetricTile label="ยกเลิก" value={`${cancelledCount}`} detail="แสดง cancelled state" />
        </View>

        <Panel style={styles.notice}>
          <Text style={styles.noticeTitle}>โหมดตัวอย่าง</Text>
          <Text style={styles.noticeBody}>ปัดเพื่อ refresh จะเล่น state จำลองเท่านั้น ข้อมูลจริงจะต่อกับ V3 chat commerce phase ถัดไป</Text>
        </Panel>

        <View style={styles.orderStack}>
          <OrderStatusCard orders={orders} />
        </View>
      </ShowcaseScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#EEF6FF',
    flex: 1,
    overflow: 'hidden',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
  },
  notice: {
    backgroundColor: '#F8FBFF',
  },
  noticeTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  noticeBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  orderStack: {
    gap: MiraDesign.space.md,
  },
});
