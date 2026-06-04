import { StyleSheet, Text, View } from 'react-native';

import { BiomarkerBar, FreshnessDots, HealthFigure, MiniTrend, StatusRing } from '@/components/HealthVisuals';
import { Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { currentUser, healthMetrics } from '@/services/mockBackend';

export default function HealthScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.eyebrow}>Personal health dashboard</Text>
            <Text style={styles.title}>ผลตรวจสุขภาพที่อ่านง่าย</Text>
          </View>
          <Pill label="Updated 45d" tone="amber" />
        </View>
        <View style={styles.visualHealth}>
          <View style={styles.figure}>
            <HealthFigure />
          </View>
          <StatusRing value={78} label="Score" size={130} />
        </View>
      </View>

      <View style={styles.freshnessCard}>
        <View>
          <Text style={styles.freshTitle}>Data freshness</Text>
          <Text style={styles.freshBody}>Latest hospital result: {currentUser.latestHealthDataAt}</Text>
        </View>
        <FreshnessDots active={3} />
      </View>

      <SectionHeader title="Visual health signals" meta="AI summary" />
      <Card>
        <BiomarkerBar label="Cardio baseline" value="Good" percent={82} tone={MiraDesign.color.primary} />
        <BiomarkerBar label="Metabolic load" value="Watch" percent={62} tone={MiraDesign.color.amber} />
        <BiomarkerBar label="Inflammation context" value="Missing" percent={36} tone={MiraDesign.color.coral} />
        <MiniTrend color={MiraDesign.color.blue} />
      </Card>

      <SectionHeader title="Metric cards" meta="dated records" />
      <View style={styles.metricGrid}>
        {healthMetrics.map((metric) => (
          <View key={metric.label} style={styles.metricCard}>
            <View style={[styles.metricDot, metric.status === 'good' ? styles.goodDot : metric.status === 'risk' ? styles.riskDot : styles.watchDot]} />
            <Text style={styles.metricValue}>{metric.value}</Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricDate}>{metric.updatedAt}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    gap: MiraDesign.space.lg,
    padding: MiraDesign.space.lg,
    ...softShadow,
  },
  heroTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 33,
    marginTop: MiraDesign.space.xs,
  },
  visualHealth: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  figure: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: MiraDesign.radius.lg,
    flex: 1,
    minHeight: 174,
  },
  freshnessCard: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surfaceTint,
    borderRadius: MiraDesign.radius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: MiraDesign.space.lg,
  },
  freshTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  freshBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
    marginTop: MiraDesign.space.xs,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
  },
  metricCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    gap: MiraDesign.space.xs,
    minHeight: 132,
    padding: MiraDesign.space.md,
  },
  metricDot: {
    borderRadius: MiraDesign.radius.pill,
    height: 13,
    width: 13,
  },
  goodDot: {
    backgroundColor: MiraDesign.color.mint,
  },
  watchDot: {
    backgroundColor: MiraDesign.color.amber,
  },
  riskDot: {
    backgroundColor: MiraDesign.color.coral,
  },
  metricValue: {
    color: MiraDesign.color.ink,
    fontSize: 26,
    fontWeight: '900',
  },
  metricLabel: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  metricDate: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '800',
  },
});
