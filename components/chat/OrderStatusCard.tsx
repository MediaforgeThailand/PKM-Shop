import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';
import type { OrderStatusInfo } from '@/lib/types/api';

const timeline = [
  'ชำระเงินแล้ว',
  'โรงพยาบาลยืนยันแล้ว',
  'ลงคิวแล้ว',
  'เสร็จสิ้น',
] as const;

function reachedStep(status: OrderStatusInfo['status']) {
  if (status === 'done') {
    return 4;
  }

  if (status === 'booked') {
    return 3;
  }

  if (status === 'confirmed') {
    return 2;
  }

  if (status === 'submitted') {
    return 1;
  }

  return 0;
}

function statusText(order: OrderStatusInfo) {
  if (order.status === 'submitted') {
    return 'รอโรงพยาบาลตรวจสอบการชำระเงิน';
  }

  if (order.status === 'confirmed') {
    return 'ชำระแล้ว รอเจ้าหน้าที่โทรนัดวันเวลา';
  }

  if (order.status === 'booked') {
    return order.booking_at ? `นัดวันที่ ${formatThaiDateTime(order.booking_at)}` : 'ลงคิวแล้ว';
  }

  if (order.status === 'done') {
    return 'ใช้บริการเรียบร้อยแล้ว';
  }

  if (order.status === 'cancelled') {
    return 'ยกเลิกแล้ว';
  }

  return 'กำลังดำเนินการ';
}

function formatThaiDateTime(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(date);
}

function formatRelative(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return 'ล่าสุด';
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));

  if (diffMinutes < 1) {
    return 'เมื่อสักครู่';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes.toLocaleString('th-TH')} นาทีที่แล้ว`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours.toLocaleString('th-TH')} ชั่วโมงที่แล้ว`;
  }

  return formatThaiDateTime(iso);
}

function OrderTimeline({ order }: { order: OrderStatusInfo }) {
  const reached = reachedStep(order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <View style={styles.timeline}>
      {timeline.map((label, index) => {
        const step = index + 1;
        const isReached = !isCancelled && step <= reached;
        const isActive = !isCancelled && step === Math.max(reached, 1);

        return (
          <View key={label} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View style={[styles.dot, isReached ? styles.dotReached : null, isCancelled ? styles.dotCancelled : null]} />
              {index < timeline.length - 1 ? <View style={[styles.rail, step < reached ? styles.railReached : null]} /> : null}
            </View>
            <View style={styles.timelineCopy}>
              <Text style={[styles.timelineLabel, isReached || isActive ? styles.timelineLabelActive : null]}>{label}</Text>
              {isActive ? <Text style={styles.timelineStatus}>{statusText(order)}</Text> : null}
            </View>
          </View>
        );
      })}
      {isCancelled ? <Text style={styles.cancelledText}>ยกเลิกแล้ว</Text> : null}
    </View>
  );
}

export function OrderStatusCard({
  orders,
  onPressOrder,
}: {
  orders: OrderStatusInfo[];
  onPressOrder?: (order: OrderStatusInfo) => void;
}) {
  if (orders.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>สถานะคิว</Text>
        <Text style={styles.emptyText}>ยังไม่มีคำสั่งซื้อที่ต้องติดตามค่ะ</Text>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {orders.map((order) => (
        <Pressable
          key={order.id}
          disabled={!onPressOrder}
          onPress={() => onPressOrder?.(order)}
          style={({ pressed }) => [styles.card, pressed && onPressOrder ? styles.pressed : null]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>สถานะคิว</Text>
              <Text numberOfLines={2} style={styles.title}>
                {order.product_name}
              </Text>
              <Text style={styles.meta}>
                {order.branch_name ?? 'ไม่ระบุสาขา'} · {order.amount_baht.toLocaleString('th-TH')} บาท
              </Text>
            </View>
            <View style={[styles.chip, order.status === 'cancelled' ? styles.chipDanger : null]}>
              <Text style={[styles.chipText, order.status === 'cancelled' ? styles.chipDangerText : null]}>{statusText(order)}</Text>
            </View>
          </View>
          <OrderTimeline order={order} />
          <Text style={styles.updated}>อัปเดตล่าสุด {formatRelative(order.created_at)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const cardShadow = {
  shadowColor: '#12343B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
  card: {
    ...cardShadow,
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  meta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  chip: {
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: 999,
    maxWidth: 148,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  chipText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 10,
    fontWeight: '900',
  },
  chipDanger: {
    backgroundColor: '#FDECEC',
  },
  chipDangerText: {
    color: '#A23538',
  },
  timeline: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 42,
  },
  timelineRail: {
    alignItems: 'center',
    width: 22,
  },
  dot: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 999,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  dotReached: {
    backgroundColor: MiraDesign.color.primary,
    borderColor: MiraDesign.color.primary,
  },
  dotCancelled: {
    borderColor: MiraDesign.color.danger,
  },
  rail: {
    backgroundColor: MiraDesign.color.line,
    flex: 1,
    width: 2,
  },
  railReached: {
    backgroundColor: MiraDesign.color.primary,
  },
  timelineCopy: {
    flex: 1,
    gap: 2,
    paddingBottom: 10,
  },
  timelineLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  timelineLabelActive: {
    color: MiraDesign.color.ink,
  },
  timelineStatus: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  cancelledText: {
    color: MiraDesign.color.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  updated: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
