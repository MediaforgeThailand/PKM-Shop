import { ScrollView, StyleSheet, Text, View } from 'react-native';

const habits = [
  { label: 'Hydration', value: '1.8 L', trend: '+0.4 L' },
  { label: 'Sleep', value: '7h 20m', trend: 'on track' },
  { label: 'Movement', value: '6,420', trend: 'steps' },
];

export default function TodayScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Mira Health</Text>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.subtitle}>A calm first screen for daily check-ins, health logs, and care reminders.</Text>
      </View>

      <View style={styles.scorePanel}>
        <View>
          <Text style={styles.panelLabel}>Readiness</Text>
          <Text style={styles.score}>82</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>Good</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily signals</Text>
        {habits.map((habit) => (
          <View key={habit.label} style={styles.metricRow}>
            <View>
              <Text style={styles.metricLabel}>{habit.label}</Text>
              <Text style={styles.metricValue}>{habit.value}</Text>
            </View>
            <Text style={styles.metricTrend}>{habit.trend}</Text>
          </View>
        ))}
      </View>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Next product step</Text>
        <Text style={styles.noteBody}>
          Replace this static data with Supabase rows once auth and the first health-log workflow are finalized.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#F7FAF8',
  },
  header: {
    gap: 8,
    paddingTop: 24,
  },
  eyebrow: {
    color: '#3C7864',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: '#14231E',
    fontSize: 38,
    fontWeight: '800',
  },
  subtitle: {
    color: '#587069',
    fontSize: 16,
    lineHeight: 23,
  },
  scorePanel: {
    alignItems: 'center',
    backgroundColor: '#163F34',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 150,
    padding: 22,
  },
  panelLabel: {
    color: '#BFE8D8',
    fontSize: 14,
    fontWeight: '700',
  },
  score: {
    color: '#FFFFFF',
    fontSize: 58,
    fontWeight: '800',
  },
  statusPill: {
    backgroundColor: '#F2C94C',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusText: {
    color: '#30270B',
    fontSize: 14,
    fontWeight: '800',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: '#14231E',
    fontSize: 20,
    fontWeight: '800',
  },
  metricRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 82,
    paddingHorizontal: 18,
  },
  metricLabel: {
    color: '#587069',
    fontSize: 14,
    fontWeight: '700',
  },
  metricValue: {
    color: '#14231E',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  metricTrend: {
    color: '#3C7864',
    fontSize: 14,
    fontWeight: '800',
  },
  note: {
    backgroundColor: '#FFF7D6',
    borderColor: '#E8D47A',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  noteTitle: {
    color: '#4C3F10',
    fontSize: 16,
    fontWeight: '800',
  },
  noteBody: {
    color: '#695B22',
    fontSize: 15,
    lineHeight: 22,
  },
});
