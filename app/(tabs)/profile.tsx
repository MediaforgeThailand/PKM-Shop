import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { supabaseConfigStatus } from '@/lib/supabase';

const setupItems = [
  'Connect Supabase project URL and publishable key',
  'Apply the first health schema migration',
  'Define consent, privacy, and data retention rules before storing real health data',
];

export default function ProfileScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Workspace setup</Text>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Authentication and personal health records will live behind this area.</Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.cardLabel}>Supabase</Text>
        <Text style={styles.cardTitle}>{supabaseConfigStatus.isConfigured ? 'Configured' : 'Waiting for .env'}</Text>
        <Text style={styles.cardBody}>
          {supabaseConfigStatus.message}
        </Text>
      </View>

      <View style={styles.checklist}>
        <Text style={styles.sectionTitle}>Team checklist</Text>
        {setupItems.map((item, index) => (
          <View key={item} style={styles.checklistRow}>
            <Text style={styles.checklistNumber}>{index + 1}</Text>
            <Text style={styles.checklistText}>{item}</Text>
          </View>
        ))}
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
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  cardLabel: {
    color: '#3C7864',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#14231E',
    fontSize: 24,
    fontWeight: '800',
  },
  cardBody: {
    color: '#587069',
    fontSize: 15,
    lineHeight: 22,
  },
  checklist: {
    gap: 12,
  },
  sectionTitle: {
    color: '#14231E',
    fontSize: 20,
    fontWeight: '800',
  },
  checklistRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 16,
  },
  checklistNumber: {
    backgroundColor: '#DDEFE6',
    borderRadius: 999,
    color: '#163F34',
    fontSize: 14,
    fontWeight: '900',
    height: 32,
    lineHeight: 32,
    textAlign: 'center',
    width: 32,
  },
  checklistText: {
    color: '#243B34',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
});
