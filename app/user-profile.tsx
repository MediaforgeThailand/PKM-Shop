import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FreshnessDots, MiniTrend, StatusRing } from '@/components/HealthVisuals';
import { ActionButton, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { useAuthSession, useSignOut } from '@/lib/auth/useAuthSession';
import {
  deleteHealthFact,
  exportHealthDataSnapshot,
  getHealthFactTypeLabel,
  getHealthMemoryStatus,
  listConfirmedHealthFacts,
  revokeHealthMemoryConsent,
  type HealthDataSnapshot,
  type HealthMemoryStatus,
  type StoredHealthFact,
} from '@/lib/health/healthDataVault';

export default function UserProfileScreen() {
  const auth = useAuthSession();
  const signOut = useSignOut();
  const [facts, setFacts] = useState<StoredHealthFact[]>([]);
  const [healthMemoryStatus, setHealthMemoryStatus] = useState<HealthMemoryStatus | null>(null);
  const [snapshot, setSnapshot] = useState<HealthDataSnapshot | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!auth.user) {
      setFacts([]);
      setHealthMemoryStatus(null);
      setSnapshot(null);
      return;
    }

    const [nextStatus, nextFacts] = await Promise.all([getHealthMemoryStatus(), listConfirmedHealthFacts()]);
    setHealthMemoryStatus(nextStatus);
    setFacts(nextFacts);
  }, [auth.user]);

  useEffect(() => {
    refreshProfile().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'โหลด Health Profile ไม่สำเร็จ');
    });
  }, [refreshProfile]);

  async function handleDeleteFact(factId: string) {
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

  async function handleRevokeConsent() {
    setIsBusy(true);
    setMessage(null);

    try {
      await revokeHealthMemoryConsent();
      await refreshProfile();
      setMessage('ถอน consent สำหรับ health memory แล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ถอน consent ไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExport() {
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
    setIsBusy(true);
    setMessage(null);

    try {
      await signOut();
      setFacts([]);
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
          <Text style={styles.cardTitle}>กำลังโหลด Health Profile</Text>
          <Text style={styles.cardBody}>กำลังตรวจ session และข้อมูล consent</Text>
        </Card>
      </Screen>
    );
  }

  if (!auth.user) {
    return (
      <Screen>
        <Card>
          <Text style={styles.cardTitle}>ต้องเข้าสู่ระบบก่อน</Text>
          <Text style={styles.cardBody}>Health Profile ใช้ข้อมูลส่วนตัว จึงต้องมี user session ก่อนดูหรือบันทึกข้อมูลสุขภาพ</Text>
          <Link href="/" asChild>
            <ActionButton label="ไปหน้าเข้าสู่ระบบ" />
          </Link>
        </Card>
      </Screen>
    );
  }

  const displayName = auth.user.user_metadata?.display_name || auth.user.email || 'Mira user';
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
            <Text style={styles.meta}>{auth.user.email}</Text>
            <Text style={styles.meta}>User ID {auth.user.id.slice(0, 8)}</Text>
          </View>
        </View>
        <View style={styles.heroVisual}>
          <StatusRing value={facts.length ? 74 : 24} label="Context" size={118} color={MiraDesign.color.blue} />
          <View style={styles.contextBox}>
            <Text style={styles.contextLabel}>Health memory</Text>
            <Text style={styles.contextValue}>{facts.length} facts</Text>
            <FreshnessDots active={Math.min(4, Math.max(1, facts.length))} />
          </View>
        </View>
      </View>

      {message ? (
        <Card style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </Card>
      ) : null}

      <SectionHeader title="Consent status" />
      <View style={styles.consentRow}>
        <View style={styles.consentCard}>
          <View style={consentGranted ? styles.consentDot : [styles.consentDot, styles.consentAmber]} />
          <Text style={styles.consentTitle}>Chat health memory</Text>
          <Text style={styles.consentValue}>{consentGranted ? 'On' : 'Off'}</Text>
        </View>
        <View style={styles.consentCard}>
          <View style={[styles.consentDot, styles.consentAmber]} />
          <Text style={styles.consentTitle}>Hospital sharing</Text>
          <Text style={styles.consentValue}>Off</Text>
        </View>
      </View>

      <SectionHeader title="Confirmed health facts" meta={`${facts.length} records`} />
      {facts.length === 0 ? (
        <Card>
          <Text style={styles.cardTitle}>ยังไม่มีข้อมูลสุขภาพที่ยืนยันแล้ว</Text>
          <Text style={styles.cardBody}>เมื่อคุยกับ chatbot และกดยินยอมบันทึก รายการที่ยืนยันแล้วจะมาอยู่ตรงนี้</Text>
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

      <SectionHeader title="Record freshness" />
      <Card>
        <View style={styles.freshTop}>
          <View>
            <Text style={styles.cardTitle}>ข้อมูลจากแชทต้องมี user confirmation</Text>
            <Text style={styles.cardBody}>ข้อมูลที่ยังไม่ได้ยืนยันจะไม่ถูกใช้เป็น Health Profile สำหรับ analytics</Text>
          </View>
          <Pill label="MVP" tone="amber" />
        </View>
        <MiniTrend color={MiraDesign.color.primary} />
      </Card>

      <SectionHeader title="Data controls" />
      <Card>
        <ActionButton disabled={isBusy} label="Export health data snapshot" onPress={handleExport} />
        <ActionButton disabled={isBusy} label="Revoke health memory consent" onPress={handleRevokeConsent} variant="secondary" />
        <ActionButton disabled={isBusy} label="Sign out" onPress={handleSignOut} variant="secondary" />
      </Card>

      {snapshot ? (
        <Card>
          <Text style={styles.cardTitle}>Export snapshot</Text>
          <Text style={styles.snapshotText}>{JSON.stringify(snapshot, null, 2)}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHero: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
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
    backgroundColor: MiraDesign.color.primary,
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
    color: MiraDesign.color.ink,
    fontSize: 24,
    fontWeight: '900',
  },
  meta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  heroVisual: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surfaceSoft,
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
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  contextValue: {
    color: MiraDesign.color.ink,
    fontSize: 26,
    fontWeight: '900',
  },
  messageCard: {
    backgroundColor: MiraDesign.color.primarySoft,
  },
  messageText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  consentRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  consentCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
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
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  consentValue: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  factList: {
    gap: MiraDesign.space.md,
  },
  factCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
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
  factType: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  factValue: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
    marginTop: MiraDesign.space.xs,
  },
  factMeta: {
    color: MiraDesign.color.inkSoft,
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
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  cardBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    marginTop: MiraDesign.space.xs,
  },
  snapshotText: {
    color: MiraDesign.color.inkSoft,
    fontFamily: 'SpaceMono',
    fontSize: 11,
    lineHeight: 17,
  },
});
