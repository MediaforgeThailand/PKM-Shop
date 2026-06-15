import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OrderStatusCard } from '@/components/chat/OrderStatusCard';
import { FreshnessDots, MiniTrend, StatusRing } from '@/components/HealthVisuals';
import { ActionButton, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { useAuthSession, useSignOut } from '@/lib/auth/useAuthSession';
import {
  deleteHealthFact,
  deleteAgentMemory,
  exportHealthDataSnapshot,
  getHealthFactTypeLabel,
  getHealthMemoryStatus,
  grantHealthMemoryConsent,
  listAgentMemory,
  listConfirmedHealthFacts,
  revokeHealthMemoryConsent,
  type HealthDataSnapshot,
  type HealthMemoryStatus,
  type StoredAgentMemory,
  type StoredHealthFact,
} from '@/lib/health/healthDataVault';
import { showcaseDemoAgentMemory, showcaseDemoHealthMemoryStatus, showcaseDemoOrders, showcaseDemoStoredFacts } from '@/lib/showcase/demoFixtures';
import { supabase } from '@/lib/supabase';
import type { OrderStatus, OrderStatusInfo } from '@/lib/types/api';

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

async function loadCustomerOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('id,status,amount_baht,booking_at,created_at,products(name),branches(name)')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as OrderListRow[]).map(toStatusInfo);
}

function profileOrderStatusLabel(status: OrderStatus) {
  if (status === 'submitted') {
    return 'รอตรวจสอบ';
  }

  if (status === 'confirmed') {
    return 'ยืนยันแล้ว';
  }

  if (status === 'booked') {
    return 'ลงคิวแล้ว';
  }

  if (status === 'done') {
    return 'เสร็จสิ้น';
  }

  if (status === 'cancelled') {
    return 'ยกเลิก';
  }

  if (status === 'awaiting_payment') {
    return 'รอชำระ';
  }

  return 'กำลังดำเนินการ';
}

export default function UserProfileScreen() {
  const params = useLocalSearchParams();
  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const auth = useAuthSession();
  const signOut = useSignOut();
  const [facts, setFacts] = useState<StoredHealthFact[]>([]);
  const [agentMemory, setAgentMemory] = useState<StoredAgentMemory[]>([]);
  const [healthMemoryStatus, setHealthMemoryStatus] = useState<HealthMemoryStatus | null>(null);
  const [snapshot, setSnapshot] = useState<HealthDataSnapshot | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(focus ?? null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isDemoMode = !auth.user;
  const ordersQuery = useQuery({
    enabled: Boolean(auth.session),
    queryFn: loadCustomerOrders,
    queryKey: ['miracare-profile-orders', auth.user?.id ?? 'demo'],
  });
  const orders = ordersQuery.data ?? (isDemoMode ? showcaseDemoOrders : []);
  const activeOrderCount = orders.filter((order) => !['cancelled', 'done'].includes(order.status)).length;
  const focusedOrder = useMemo(() => orders.find((order) => order.id === expandedOrderId) ?? null, [expandedOrderId, orders]);

  const refreshProfile = useCallback(async () => {
    if (!auth.user) {
      setFacts(showcaseDemoStoredFacts);
      setAgentMemory(showcaseDemoAgentMemory);
      setHealthMemoryStatus(showcaseDemoHealthMemoryStatus);
      setSnapshot(null);
      return;
    }

    const [nextStatus, nextFacts, nextAgentMemory] = await Promise.all([getHealthMemoryStatus(), listConfirmedHealthFacts(), listAgentMemory()]);
    setHealthMemoryStatus(nextStatus);
    setFacts(nextFacts);
    setAgentMemory(nextAgentMemory);
  }, [auth.user]);

  useEffect(() => {
    refreshProfile().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'โหลด Health Profile ไม่สำเร็จ');
    });
  }, [refreshProfile]);

  useEffect(() => {
    if (focus) {
      setExpandedOrderId(focus);
    }
  }, [focus]);

  async function handleDeleteFact(factId: string) {
    if (isDemoMode) {
      setMessage('โหมดตัวอย่าง — ยังไม่ลบข้อมูลจริง');
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      await deleteHealthFact(factId);
      await refreshProfile();
      setMessage('ลบข้อมูลสุขภาพรายการนี้แล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ลบข้อมูลไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteAgentMemory(memoryId: string) {
    if (isDemoMode) {
      setMessage('โหมดตัวอย่าง — ยังไม่ลบ memory จริง');
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      await deleteAgentMemory(memoryId);
      await refreshProfile();
      setMessage('ลบสิ่งที่ผู้ช่วยจำไว้แล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ลบความจำไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGrantConsent() {
    if (isDemoMode) {
      setHealthMemoryStatus(showcaseDemoHealthMemoryStatus);
      setMessage('โหมดตัวอย่าง — เปิดความจำสุขภาพตัวอย่างแล้ว');
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      await grantHealthMemoryConsent();
      await refreshProfile();
      setMessage('เปิดความจำสุขภาพแล้ว หลังจากนี้ผู้ช่วยจะจำข้อมูลสำคัญแบบเงียบๆ');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เปิดความจำสุขภาพไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRevokeConsent() {
    if (isDemoMode) {
      setMessage('โหมดตัวอย่าง — ยังไม่ถอน consent จริง');
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      await revokeHealthMemoryConsent();
      await refreshProfile();
      setMessage('ถอน consent สำหรับความจำสุขภาพแล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ถอน consent ไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExport() {
    if (isDemoMode) {
      setSnapshot({
        agentMemory,
        consents: [
          {
            createdAt: '2026-06-12T03:30:00.000Z',
            purpose: 'chat_health_memory',
            status: 'granted',
            version: 'demo',
          },
        ],
        contextScores: [],
        exportedAt: new Date().toISOString(),
        facts,
      });
      setMessage('โหมดตัวอย่าง — สร้าง snapshot จาก fixture แล้ว');
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      setSnapshot(await exportHealthDataSnapshot());
      setMessage('สร้าง snapshot สำหรับ export แล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'export ไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    if (isDemoMode) {
      setMessage('โหมดตัวอย่าง — ไม่มี session ให้ sign out');
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      await signOut();
      setFacts([]);
      setAgentMemory([]);
      setSnapshot(null);
      setHealthMemoryStatus(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ออกจากระบบไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  if (auth.isLoading) {
    return (
      <Screen>
        <Card>
          <Text style={styles.cardTitle}>กำลังโหลดโปรไฟล์สุขภาพ</Text>
          <Text style={styles.cardBody}>กำลังตรวจ session และข้อมูล consent</Text>
        </Card>
      </Screen>
    );
  }

  const displayName = auth.user?.user_metadata?.display_name || auth.user?.email || 'บอส Demo';
  const consentGranted = healthMemoryStatus?.reason === 'ready' && healthMemoryStatus.consentGranted;

  return (
    <Screen>
      <View style={styles.profileHero}>
        <View style={styles.profileTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{String(displayName).slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.identity}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.meta}>{auth.user?.email ?? 'demo@miracare.local'}</Text>
            <Text style={styles.meta}>รหัสผู้ใช้ {auth.user?.id.slice(0, 8) ?? 'demo-user'}</Text>
          </View>
        </View>
        <View style={styles.heroVisual}>
          <StatusRing value={facts.length ? 74 : 24} label="บริบท" size={118} color={MiraDesign.color.showcaseBlue} />
          <View style={styles.contextBox}>
            <Text style={styles.contextLabel}>ความจำสุขภาพ</Text>
            <Text style={styles.contextValue}>{facts.length + agentMemory.length} รายการ</Text>
            <FreshnessDots active={Math.min(4, Math.max(1, facts.length + agentMemory.length))} />
          </View>
        </View>
      </View>

      {message ? (
        <Card style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </Card>
      ) : null}

      {isDemoMode ? (
        <Card style={styles.messageCard}>
          <Text style={styles.messageText}>โหมดตัวอย่าง: เปิดดู profile ได้โดยไม่ต้องล็อกอิน และปุ่มข้อมูลจริงจะไม่ส่ง backend</Text>
        </Card>
      ) : null}

      <SectionHeader title="คำสั่งซื้อและสถานะคิว" meta={ordersQuery.isFetching ? 'กำลังอัปเดต' : `${activeOrderCount} กำลังดำเนินการ`} />
      {auth.session && ordersQuery.error ? (
        <Card style={styles.orderNoticeCard}>
          <Text style={styles.cardTitle}>โหลดสถานะคำสั่งซื้อไม่สำเร็จ</Text>
          <Text style={styles.cardBody}>{ordersQuery.error instanceof Error ? ordersQuery.error.message : 'ลองรีเฟรชอีกครั้งค่ะ'}</Text>
          <ActionButton disabled={ordersQuery.isFetching} label="รีเฟรชสถานะ" onPress={() => void ordersQuery.refetch()} variant="secondary" />
        </Card>
      ) : null}

      {orders.length === 0 && !ordersQuery.isLoading ? (
        <Card style={styles.orderNoticeCard}>
          <Text style={styles.cardTitle}>ยังไม่มีคำสั่งซื้อ</Text>
          <Text style={styles.cardBody}>หลังชำระเงินหรือส่งข้อมูลจองแล้ว สถานะคำสั่งซื้อของคุณจะมาอยู่ในโปรไฟล์นี้</Text>
        </Card>
      ) : null}

      {orders.length > 0 ? (
        <View style={styles.profileOrderList}>
          {orders.map((order) => {
            const expanded = order.id === expandedOrderId || (focusedOrder?.id === order.id && Boolean(focus));
            const isFinished = order.status === 'done';
            const isCancelled = order.status === 'cancelled';

            return (
              <View key={order.id} style={styles.profileOrderShell}>
                <Pressable onPress={() => setExpandedOrderId(expanded ? null : order.id)} style={styles.profileOrderHeader}>
                  <View style={styles.profileOrderCopy}>
                    <Text numberOfLines={1} style={styles.profileOrderTitle}>
                      {order.product_name}
                    </Text>
                    <Text style={styles.profileOrderMeta}>
                      {order.branch_name ?? 'ไม่ระบุสาขา'} · {order.amount_baht.toLocaleString('th-TH')} บาท
                    </Text>
                  </View>
                  <View style={[styles.profileOrderChip, isFinished ? styles.profileOrderChipDone : null, isCancelled ? styles.profileOrderChipCancelled : null]}>
                    <Text style={[styles.profileOrderChipText, isCancelled ? styles.profileOrderChipTextCancelled : null]}>{profileOrderStatusLabel(order.status)}</Text>
                  </View>
                </Pressable>
                {expanded ? <OrderStatusCard orders={[order]} /> : null}
              </View>
            );
          })}
          {auth.session ? <ActionButton disabled={ordersQuery.isFetching} label="รีเฟรชสถานะคำสั่งซื้อ" onPress={() => void ordersQuery.refetch()} variant="secondary" /> : null}
        </View>
      ) : null}

      <SectionHeader title="สถานะการยินยอม" />
      <View style={styles.consentRow}>
        <View style={styles.consentCard}>
          <View style={consentGranted ? styles.consentDot : [styles.consentDot, styles.consentAmber]} />
          <Text style={styles.consentTitle}>ความจำสุขภาพในแชท</Text>
          <Text style={styles.consentValue}>{consentGranted ? 'เปิด' : 'ปิด'}</Text>
          {!consentGranted ? (
            <Pressable disabled={isBusy} onPress={handleGrantConsent} style={styles.inlineAction}>
              <Text style={styles.inlineActionText}>เปิดใช้งาน</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.consentCard}>
          <View style={[styles.consentDot, styles.consentAmber]} />
          <Text style={styles.consentTitle}>แชร์กับโรงพยาบาล</Text>
          <Text style={styles.consentValue}>ปิด</Text>
        </View>
      </View>

      <SectionHeader title="สิ่งที่จำเกี่ยวกับคุณ" meta={`${agentMemory.length} รายการ`} />
      {agentMemory.length === 0 ? (
        <Card>
          <Text style={styles.cardTitle}>ยังไม่มีความจำส่วนตัว</Text>
          <Text style={styles.cardBody}>หลังเปิด consent ผู้ช่วยจะจำข้อมูลอย่างเช่นงบ พื้นที่สะดวก เป้าหมายสุขภาพ และความสนใจแพ็กเกจ</Text>
        </Card>
      ) : (
        <View style={styles.factList}>
          {agentMemory.map((memory) => (
            <View key={memory.id} style={styles.factCard}>
              <View style={styles.factHeader}>
                <View style={styles.factCopy}>
                  <Text style={styles.factType}>{memory.memoryType}</Text>
                  <Text style={styles.factValue}>{memory.summary}</Text>
                  {memory.value ? <Text style={styles.factMeta}>{memory.value}</Text> : null}
                </View>
                <Pill label={`${Math.round(memory.confidence * 100)}%`} tone="blue" />
              </View>
              <Text style={styles.factMeta}>จำเมื่อ {new Date(memory.observedAt).toLocaleDateString('th-TH')}</Text>
              <Pressable disabled={isBusy} onPress={() => handleDeleteAgentMemory(memory.id)} style={styles.textButton}>
                <Text style={styles.textButtonDanger}>ลบความจำนี้</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <SectionHeader title="ข้อมูลสุขภาพที่ยืนยันแล้ว" meta={`${facts.length} รายการ`} />
      {facts.length === 0 ? (
        <Card>
          <Text style={styles.cardTitle}>ยังไม่มีข้อมูลสุขภาพที่ยืนยันแล้ว</Text>
          <Text style={styles.cardBody}>เมื่อมีข้อมูลสุขภาพที่ยืนยันแล้ว รายการจะมาอยู่ตรงนี้</Text>
        </Card>
      ) : (
        <View style={styles.factList}>
          {facts.map((fact) => (
            <View key={fact.id} style={styles.factCard}>
              <View style={styles.factHeader}>
                <View>
                  <Text style={styles.factType}>{getHealthFactTypeLabel(fact.factType)}</Text>
                  <Text style={styles.factValue}>
                    {fact.value}
                    {fact.unit ? ` ${fact.unit}` : ''}
                  </Text>
                </View>
                <Pill label={`${Math.round(fact.confidence * 100)}%`} tone="mint" />
              </View>
              <Text style={styles.factMeta}>บันทึกเมื่อ {new Date(fact.createdAt).toLocaleDateString('th-TH')}</Text>
              <Pressable disabled={isBusy} onPress={() => handleDeleteFact(fact.id)} style={styles.textButton}>
                <Text style={styles.textButtonDanger}>ลบข้อมูลนี้</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <SectionHeader title="ความสดใหม่ของข้อมูล" />
      <Card>
        <View style={styles.freshTop}>
          <View>
            <Text style={styles.cardTitle}>Auto-save หลัง consent เท่านั้น</Text>
            <Text style={styles.cardBody}>ข้อมูลความมั่นใจต่ำจะไม่ถูกบันทึก และสามารถ export, revoke หรือ delete ได้จากหน้านี้</Text>
          </View>
          <Pill label="MVP" tone="amber" />
        </View>
        <MiniTrend color={MiraDesign.color.showcaseBlue} />
      </Card>

      <SectionHeader title="จัดการข้อมูล" />
      <Card>
        <ActionButton disabled={isBusy} label="ส่งออก snapshot ข้อมูลสุขภาพ" onPress={handleExport} />
        <ActionButton disabled={isBusy} label="ถอน consent ความจำสุขภาพ" onPress={handleRevokeConsent} variant="secondary" />
        <ActionButton disabled={isBusy} label="ออกจากระบบ" onPress={handleSignOut} variant="secondary" />
      </Card>

      {snapshot ? (
        <Card>
          <Text style={styles.cardTitle}>Snapshot สำหรับ export</Text>
          <Text style={styles.snapshotText}>{JSON.stringify(snapshot, null, 2)}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHero: {
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    gap: MiraDesign.space.lg,
    padding: MiraDesign.space.lg,
    ...softShadow,
  },
  profileTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlue,
    borderRadius: MiraDesign.radius.lg,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
  },
  identity: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  name: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 24,
    fontWeight: '900',
  },
  meta: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    fontWeight: '800',
  },
  heroVisual: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: MiraDesign.radius.lg,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.md,
  },
  contextBox: {
    flex: 1,
    gap: MiraDesign.space.sm,
  },
  contextLabel: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  contextValue: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 26,
    fontWeight: '900',
  },
  messageCard: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
  },
  messageText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  orderNoticeCard: {
    backgroundColor: MiraDesign.color.showcaseSurface,
  },
  profileOrderList: {
    gap: MiraDesign.space.md,
  },
  profileOrderShell: {
    gap: MiraDesign.space.sm,
  },
  profileOrderHeader: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
    minHeight: 76,
    padding: MiraDesign.space.md,
    ...softShadow,
  },
  profileOrderCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
    minWidth: 0,
  },
  profileOrderTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 15,
    fontWeight: '900',
  },
  profileOrderMeta: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '800',
  },
  profileOrderChip: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: MiraDesign.radius.pill,
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.xs,
  },
  profileOrderChipDone: {
    backgroundColor: '#E1F8EF',
  },
  profileOrderChipCancelled: {
    backgroundColor: '#FFE2E2',
  },
  profileOrderChipText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 11,
    fontWeight: '900',
  },
  profileOrderChipTextCancelled: {
    color: MiraDesign.color.danger,
  },
  consentRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  consentCard: {
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: MiraDesign.space.xs,
    minHeight: 104,
    padding: MiraDesign.space.md,
  },
  consentDot: {
    backgroundColor: MiraDesign.color.mint,
    borderRadius: MiraDesign.radius.pill,
    height: 14,
    width: 14,
  },
  consentAmber: {
    backgroundColor: MiraDesign.color.amber,
  },
  consentTitle: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '900',
  },
  consentValue: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 18,
    fontWeight: '900',
  },
  inlineAction: {
    alignSelf: 'flex-start',
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: MiraDesign.radius.pill,
    marginTop: MiraDesign.space.xs,
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.xs,
  },
  inlineActionText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  factList: {
    gap: MiraDesign.space.md,
  },
  factCard: {
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    gap: MiraDesign.space.sm,
    padding: MiraDesign.space.md,
  },
  factHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  factCopy: {
    flex: 1,
  },
  factType: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  factValue: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 17,
    fontWeight: '900',
    marginTop: MiraDesign.space.xs,
  },
  factMeta: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '800',
  },
  textButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  textButtonDanger: {
    color: MiraDesign.color.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  freshTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 17,
    fontWeight: '900',
  },
  cardBody: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: MiraDesign.space.xs,
  },
  snapshotText: {
    color: MiraDesign.color.showcaseNavySoft,
    fontFamily: 'SpaceMono',
    fontSize: 11,
    lineHeight: 17,
  },
});
