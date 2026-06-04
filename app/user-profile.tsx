import { StyleSheet, Text, View } from 'react-native';

import { BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { currentUser } from '@/services/mockBackend';

export default function UserProfileScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="User intelligence"
        title="Profile, consent, and dated health context."
        subtitle="This page shows the data shape the AI agent needs before Supabase connects."
        compact
      />

      <Card>
        <Text style={styles.name}>{currentUser.name}</Text>
        <Text style={styles.body}>{currentUser.phone} - LINE {currentUser.lineId}</Text>
        <Pill label={`Age ${currentUser.ageRange}`} />
      </Card>

      <SectionHeader title="Health goals" />
      {currentUser.goals.map((goal) => (
        <View key={goal} style={styles.goalRow}>
          <View style={styles.goalDot} />
          <Text style={styles.goalText}>{goal}</Text>
        </View>
      ))}

      <SectionHeader title="Consent and data freshness" />
      <Card>
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>Latest health data</Text>
          <Text style={styles.policyValue}>{currentUser.latestHealthDataAt}</Text>
        </View>
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>AI recommendation consent</Text>
          <Text style={styles.policyValue}>Granted</Text>
        </View>
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>Marketing/referral attribution</Text>
          <Text style={styles.policyValue}>Limited</Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: {
    color: MiraDesign.color.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  goalRow: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    minHeight: 62,
    paddingHorizontal: MiraDesign.space.lg,
  },
  goalDot: {
    backgroundColor: MiraDesign.color.mint,
    borderRadius: MiraDesign.radius.pill,
    height: 12,
    width: 12,
  },
  goalText: {
    color: MiraDesign.color.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  policyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  policyLabel: {
    color: MiraDesign.color.inkSoft,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  policyValue: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
});
