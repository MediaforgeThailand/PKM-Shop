import { StyleSheet, Text, View } from 'react-native';

import { FreshnessDots, MiniTrend, StatusRing } from '@/components/HealthVisuals';
import { Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { currentUser } from '@/services/mockBackend';

export default function UserProfileScreen() {
  return (
    <Screen>
      <View style={styles.profileHero}>
        <View style={styles.profileTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>M</Text>
          </View>
          <View style={styles.identity}>
            <Text style={styles.name}>{currentUser.name}</Text>
            <Text style={styles.meta}>{currentUser.phone}</Text>
            <Text style={styles.meta}>LINE {currentUser.lineId}</Text>
          </View>
        </View>
        <View style={styles.heroVisual}>
          <StatusRing value={74} label="Context" size={118} color={MiraDesign.color.blue} />
          <View style={styles.contextBox}>
            <Text style={styles.contextLabel}>AI knows</Text>
            <Text style={styles.contextValue}>3 goals</Text>
            <FreshnessDots active={3} />
          </View>
        </View>
      </View>

      <SectionHeader title="Health goals" meta="profile signals" />
      <View style={styles.goalGrid}>
        {currentUser.goals.map((goal, index) => (
          <View key={goal} style={styles.goalCard}>
            <View style={[styles.goalIcon, index === 1 ? styles.goalAmber : index === 2 ? styles.goalBlue : null]} />
            <Text style={styles.goalText}>{goal}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Record freshness" meta={currentUser.latestHealthDataAt} />
      <Card>
        <View style={styles.freshTop}>
          <View>
            <Text style={styles.cardTitle}>ข้อมูลผลตรวจล่าสุด</Text>
            <Text style={styles.cardBody}>AI จะใช้ข้อมูลที่มีวันที่กำกับเท่านั้น และลด confidence เมื่อข้อมูลเก่า</Text>
          </View>
          <Pill label="45d" tone="amber" />
        </View>
        <MiniTrend color={MiraDesign.color.primary} />
      </Card>

      <SectionHeader title="Consent status" />
      <View style={styles.consentRow}>
        <View style={styles.consentCard}>
          <View style={styles.consentDot} />
          <Text style={styles.consentTitle}>AI advice</Text>
          <Text style={styles.consentValue}>On</Text>
        </View>
        <View style={styles.consentCard}>
          <View style={[styles.consentDot, styles.consentAmber]} />
          <Text style={styles.consentTitle}>Referral tag</Text>
          <Text style={styles.consentValue}>Limited</Text>
        </View>
      </View>
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
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
  },
  goalCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    gap: MiraDesign.space.md,
    minHeight: 116,
    padding: MiraDesign.space.md,
  },
  goalIcon: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: MiraDesign.radius.pill,
    height: 28,
    width: 28,
  },
  goalAmber: {
    backgroundColor: MiraDesign.color.amber,
  },
  goalBlue: {
    backgroundColor: MiraDesign.color.blue,
  },
  goalText: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
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
});
