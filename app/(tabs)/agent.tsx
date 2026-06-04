import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { currentUser, packageRecommendations } from '@/services/mockBackend';

const memoryEvents = [
  { label: 'Lifestyle intake', date: '2026-06-04', body: 'High stress, late dinners, no recent lipid report.' },
  { label: 'Purchase intent', date: '2026-06-04', body: 'Prefers half-day checkups and clear doctor summary.' },
  { label: 'Latest lab context', date: currentUser.latestHealthDataAt, body: 'Metabolic data is usable but will age out soon.' },
];

export default function AgentScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="AI agent"
        title="The agent remembers what matters."
        subtitle="This is the moat: user context, health record freshness, package matching, and next-best-action guidance."
        compact
      />

      <Card>
        <Pill label={currentUser.agentStatus} tone="amber" />
        <Text style={styles.cardTitle}>Ask Mira</Text>
        <TextInput
          multiline
          placeholder="Tell Mira your goal, symptoms, age, family risk, or budget..."
          placeholderTextColor={MiraDesign.color.muted}
          style={styles.promptBox}
        />
        <ActionButton label="Generate recommendation" />
      </Card>

      <SectionHeader title="AI package matches" meta="mock result" />
      {packageRecommendations.map((item) => (
        <Card key={item.packageId}>
          <View style={styles.matchTop}>
            <Text style={styles.rank}>#{item.rank}</Text>
            <Text style={styles.matchTitle}>{item.title}</Text>
          </View>
          <Text style={styles.body}>{item.reason}</Text>
          <Link href="/package-detail" asChild>
            <ActionButton label="View recommended service" variant="secondary" />
          </Link>
        </Card>
      ))}

      <SectionHeader title="Agent memory" meta="dated records" />
      {memoryEvents.map((item) => (
        <View key={item.label} style={styles.memoryRow}>
          <View style={styles.memoryDot} />
          <View style={styles.memoryBody}>
            <Text style={styles.memoryTitle}>{item.label}</Text>
            <Text style={styles.memoryDate}>{item.date}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  promptBox: {
    backgroundColor: '#EEF6FC',
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 15,
    minHeight: 116,
    padding: MiraDesign.space.md,
    textAlignVertical: 'top',
  },
  matchTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  rank: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: MiraDesign.radius.pill,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    height: 34,
    lineHeight: 34,
    textAlign: 'center',
    width: 34,
  },
  matchTitle: {
    color: MiraDesign.color.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  memoryRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  memoryDot: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: MiraDesign.radius.pill,
    height: 12,
    marginTop: MiraDesign.space.sm,
    width: 12,
  },
  memoryBody: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: MiraDesign.space.xs,
    padding: MiraDesign.space.md,
  },
  memoryTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  memoryDate: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
});
