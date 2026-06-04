import { StyleSheet, Text, View } from 'react-native';

import { BrandHeader, Card, Pill, Screen, SectionHeader, StatTile } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { currentUser, healthMetrics } from '@/services/mockBackend';

const dashboardModes = ['Simple visual', 'Stats heavy', 'Doctor summary'];

export default function HealthScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Personal health record"
        title="Deep health, made readable."
        subtitle="Hospital reports and AI intake become dated health snapshots so the agent knows what is current."
        compact
      />

      <View style={styles.statsRow}>
        <StatTile label="Latest report" value={currentUser.latestHealthDataAt} detail="Source: hospital result upload" />
        <StatTile label="Agent status" value="Watch" detail={currentUser.agentStatus} />
      </View>

      <Card style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Mira health score</Text>
        <Text style={styles.scoreValue}>78</Text>
        <Text style={styles.scoreBody}>Good baseline, but metabolic freshness is becoming the next priority.</Text>
      </Card>

      <SectionHeader title="Dashboard styles" meta="user selectable" />
      <View style={styles.modeRow}>
        {dashboardModes.map((mode, index) => (
          <View key={mode} style={[styles.modeCard, index === 0 ? styles.activeMode : null]}>
            <Text style={styles.modeTitle}>{mode}</Text>
            <Text style={styles.modeBody}>{index === 0 ? 'Large visuals and simple labels.' : 'Alternative display mode.'}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Health metrics" meta="dated" />
      {healthMetrics.map((metric) => (
        <Card key={metric.label}>
          <View style={styles.metricTop}>
            <Text style={styles.metricTitle}>{metric.label}</Text>
            <Pill label={metric.status} tone={metric.status === 'good' ? 'mint' : metric.status === 'watch' ? 'amber' : 'danger'} />
          </View>
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text style={styles.metricDate}>Updated {metric.updatedAt}</Text>
          <Text style={styles.body}>{metric.explanation}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  scoreCard: {
    backgroundColor: MiraDesign.color.ink,
  },
  scoreLabel: {
    color: '#BFE8FF',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  scoreValue: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '900',
    lineHeight: 70,
  },
  scoreBody: {
    color: '#D7ECFF',
    fontSize: 14,
    lineHeight: 21,
  },
  modeRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  modeCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: MiraDesign.space.xs,
    minHeight: 96,
    padding: MiraDesign.space.md,
  },
  activeMode: {
    borderColor: MiraDesign.color.primary,
    borderWidth: 2,
  },
  modeTitle: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  modeBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    lineHeight: 16,
  },
  metricTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  metricValue: {
    color: MiraDesign.color.primary,
    fontSize: 36,
    fontWeight: '900',
  },
  metricDate: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
});
