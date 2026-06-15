import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';
import type { OrderPanelState } from '@/lib/types/api';

type Order = NonNullable<OrderPanelState>;

const statusLabels: Record<Order['status'], string> = {
  awaiting_payment: 'รอชำระเงิน',
  booked: 'ลงคิวแล้ว',
  cancelled: 'ยกเลิก',
  collecting_info: 'กรอกข้อมูล',
  confirmed: 'ยืนยันแล้ว',
  done: 'เสร็จสิ้น',
  selecting_branch: 'เลือกสาขา',
  submitted: 'รอตรวจสอบ',
};

function statusTone(status: Order['status']) {
  if (status === 'cancelled') {
    return styles.chipDanger;
  }

  if (status === 'submitted' || status === 'confirmed' || status === 'booked' || status === 'done') {
    return styles.chipGood;
  }

  return styles.chipWaiting;
}

export function OrderPanel({
  disabled,
  onOpenDetails,
  order,
}: {
  disabled?: boolean;
  onOpenDetails: (order: Order) => void;
  order: Order;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>สถานะคิว</Text>
        <Text numberOfLines={2} style={styles.title}>
          {order.product_name}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {order.branch_name ?? 'ไม่ระบุสาขา'} · {order.amount_baht.toLocaleString('th-TH')} บาท
        </Text>
      </View>
      <View style={styles.actions}>
        <View style={[styles.chip, statusTone(order.status)]}>
          <Text style={styles.chipText}>{statusLabels[order.status]}</Text>
        </View>
        <Pressable disabled={disabled} onPress={() => onOpenDetails(order)} style={({ pressed }) => [styles.detailButton, disabled ? styles.disabled : null, pressed && !disabled ? styles.pressed : null]}>
          <Text style={styles.detailText}>ดูรายละเอียด</Text>
        </Pressable>
      </View>
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
  panel: {
    ...cardShadow,
    alignItems: 'flex-start',
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12,
  },
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  eyebrow: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  title: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  meta: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '800',
  },
  actions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  chipGood: {
    backgroundColor: '#E5F3EC',
  },
  chipDanger: {
    backgroundColor: '#FDECEC',
  },
  chipWaiting: {
    backgroundColor: '#FFF4D9',
  },
  chipText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 10,
    fontWeight: '900',
  },
  detailButton: {
    alignItems: 'center',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 10,
  },
  detailText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
