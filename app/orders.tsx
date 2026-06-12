import { Link, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OrderStatusCard } from '@/components/chat/OrderStatusCard';
import { MiraDesign } from '@/constants/Design';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { showcaseDemoOrders } from '@/lib/showcase/demoFixtures';
import { supabase } from '@/lib/supabase';
import type { OrderStatusInfo, OrderStatus } from '@/lib/types/api';

type OrderListRow = {
  amount_baht: number;
  booking_at: string | null;
  branches?: {
    name: string;
  } | {
    name: string;
  }[] | null;
  created_at: string;
  id: string;
  products?: {
    name: string;
  } | {
    name: string;
  }[] | null;
  status: OrderStatus;
};

function firstJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function toStatusInfo(row: OrderListRow): OrderStatusInfo {
  return {
    amount_baht: row.amount_baht,
    booking_at: row.booking_at,
    branch_name: firstJoin(row.branches)?.name ?? null,
    created_at: row.created_at,
    id: row.id,
    product_name: firstJoin(row.products)?.name ?? 'แพ็กเกจ',
    status: row.status,
  };
}

async function loadOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('id,status,amount_baht,booking_at,created_at,products(name),branches(name)')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as OrderListRow[]).map(toStatusInfo);
}

export default function OrdersScreen() {
  const params = useLocalSearchParams();
  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const auth = useAuthSession();
  const [expandedId, setExpandedId] = useState<string | null>(focus ?? null);
  const ordersQuery = useQuery({
    enabled: Boolean(auth.session),
    queryFn: loadOrders,
    queryKey: ['miracare-orders'],
  });
  const isDemoMode = !auth.session;
  const orders = ordersQuery.data ?? (isDemoMode ? showcaseDemoOrders : []);
  const focusedOrder = useMemo(() => orders.find((order) => order.id === expandedId) ?? null, [expandedId, orders]);

  useEffect(() => {
    if (focus) {
      setExpandedId(focus);
    }
  }, [focus]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={ordersQuery.isFetching} onRefresh={() => void ordersQuery.refetch()} tintColor={MiraDesign.color.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>MiraCare</Text>
        <Text style={styles.title}>คำสั่งซื้อของฉัน</Text>
      </View>

      {isDemoMode ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>โหมดตัวอย่าง</Text>
          <Text style={styles.noticeBody}>เปิดดูรายการและ timeline ได้ทันทีโดยไม่ต้องล็อกอิน ข้อมูลนี้เป็น fixture สำหรับ demo เท่านั้น</Text>
        </View>
      ) : null}

      {auth.session && ordersQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={MiraDesign.color.primary} />
          <Text style={styles.loadingText}>กำลังโหลดคำสั่งซื้อ</Text>
        </View>
      ) : null}

      {auth.session && ordersQuery.error ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>โหลดคำสั่งซื้อไม่สำเร็จ</Text>
          <Text style={styles.noticeBody}>{ordersQuery.error instanceof Error ? ordersQuery.error.message : 'ลองรีเฟรชอีกครั้งค่ะ'}</Text>
        </View>
      ) : null}

      {auth.session && !ordersQuery.isLoading && orders.length === 0 ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>ยังไม่มีคำสั่งซื้อ</Text>
          <Link href="/" asChild>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>กลับหน้ารวม</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}

      {orders.length > 0 ? (
        <View style={styles.list}>
          {orders.map((order) => {
            const expanded = order.id === expandedId || (focusedOrder?.id === order.id && Boolean(focus));

            return (
              <View key={order.id} style={styles.orderShell}>
                <Pressable onPress={() => setExpandedId(expanded ? null : order.id)} style={styles.orderHeader}>
                  <View style={styles.orderCopy}>
                    <Text numberOfLines={1} style={styles.orderTitle}>
                      {order.product_name}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {order.branch_name ?? 'ไม่ระบุสาขา'} · {order.amount_baht.toLocaleString('th-TH')} บาท
                    </Text>
                  </View>
                  <Text style={styles.expandText}>{expanded ? 'ปิด' : 'ดูรายละเอียด'}</Text>
                </Pressable>
                {expanded ? <OrderStatusCard orders={[order]} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F7FAF8',
    flexGrow: 1,
    gap: 16,
    padding: 18,
  },
  header: {
    gap: 4,
    paddingTop: 10,
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 31,
  },
  notice: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  noticeTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  noticeBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  loading: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 30,
  },
  loadingText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    gap: 12,
  },
  orderShell: {
    gap: 10,
  },
  orderHeader: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 12,
  },
  orderCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  orderTitle: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  orderMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  expandText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
});
