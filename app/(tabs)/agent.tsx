import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { loadActiveHospitalProducts, type HospitalProduct } from '@/lib/marketplace/hospitalProducts';

const memoryEvents = [
  { label: 'Lifestyle intake', date: 'Active session', body: 'Context captured through the chat-orchestrator profile flow.' },
  { label: 'Purchase intent', date: 'Active session', body: 'Catalog recommendations are selected from tenant products.' },
  { label: 'Latest lab context', date: 'Imported data', body: 'Lab and wearable signals appear after the v2 ingest functions run.' },
];

export default function AgentScreen() {
  const [products, setProducts] = useState<HospitalProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  useEffect(() => {
    let isMounted = true;

    loadActiveHospitalProducts(3)
      .then((items) => {
        if (isMounted) {
          setProducts(items);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingProducts(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Screen>
      <BrandHeader
        eyebrow="AI agent"
        title="The agent remembers what matters."
        subtitle="Context, health record freshness, product matching, and next-best-action guidance."
        compact
      />

      <Card>
        <Pill label="Context first" tone="amber" />
        <Text style={styles.cardTitle}>Ask Mira</Text>
        <TextInput
          multiline
          placeholder="Tell Mira your goal, symptoms, age, family risk, or budget..."
          placeholderTextColor={MiraDesign.color.muted}
          style={styles.promptBox}
        />
        <Link href="/chatbot" asChild>
          <ActionButton label="Open chat" />
        </Link>
      </Card>

      <SectionHeader title="Catalog matches" meta={isLoadingProducts ? 'syncing catalog' : `${products.length} active`} />
      {products.length === 0 && !isLoadingProducts ? (
        <Card>
          <Text style={styles.cardTitle}>No active products</Text>
          <Text style={styles.body}>Publish tenant products before showing catalog matches.</Text>
          <Link href="/admin/catalog" asChild>
            <ActionButton label="Open catalog admin" variant="secondary" />
          </Link>
        </Card>
      ) : null}
      {products.map((product, index) => (
        <Card key={product.id}>
          <View style={styles.matchTop}>
            <Text style={styles.rank}>#{index + 1}</Text>
            <Text style={styles.matchTitle}>{product.title}</Text>
          </View>
          <Text style={styles.body}>{product.description}</Text>
          <Link href={`/package-detail?productId=${encodeURIComponent(product.id)}`} asChild>
            <ActionButton label="View service" variant="secondary" />
          </Link>
        </Card>
      ))}

      <SectionHeader title="Agent memory" meta="v2 sources" />
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
