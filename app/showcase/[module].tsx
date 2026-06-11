import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { findShowcaseModule, type ShowcasePage } from '@/lib/showcase/modules';

const logo = require('@/assets/images/mira-care-logo.png');

const moduleNotes = {
  admin: 'Start with product setup, then move to orders so the client sees the operational handoff.',
  'ai-chat': 'Start with the chat page, then open product detail, checkout, and status as the customer journey expands.',
  'health-dashboard': 'Start with the dashboard, then open labs, wearables, and profile memory depending on the customer use case.',
  referral: 'Start with the referral link entry, then show the partner workspace and commission admin.',
} as const;

export default function ShowcaseDirectoryScreen() {
  const params = useLocalSearchParams<{ module?: string }>();
  const module = findShowcaseModule(params.module);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  if (!module) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Link href="/" asChild>
            <Pressable style={styles.backButton}>
              <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={18} tintColor="#12343B" />
              <Text style={styles.backText}>Categories</Text>
            </Pressable>
          </Link>
          <Image resizeMode="contain" source={logo} style={styles.logo} />
        </View>

        <View style={[styles.headerPanel, { borderColor: module.accent }]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: module.accent }]}>{module.eyebrow}</Text>
            <Text style={[styles.title, !isWide ? styles.titleCompact : null]}>{module.title}</Text>
            <Text style={styles.subtitle}>{module.body}</Text>
          </View>
          <View style={[styles.routeCount, { backgroundColor: module.accent }]}>
            <Text style={styles.routeCountValue}>{module.pages.length}</Text>
            <Text style={styles.routeCountLabel}>URLs</Text>
          </View>
        </View>

        <View style={styles.notePanel}>
          <Text style={styles.noteLabel}>Presenter cue</Text>
          <Text style={styles.noteText}>{moduleNotes[module.id]}</Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Available pages</Text>
          <Text style={styles.listMeta}>real routes</Text>
        </View>

        <View style={styles.routeList}>
          {module.pages.map((page, index) => (
            <RouteRow key={page.path} accent={module.accent} index={index} isWide={isWide} page={page} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function RouteRow({ accent, index, isWide, page }: { accent: string; index: number; isWide: boolean; page: ShowcasePage }) {
  return (
    <View style={[styles.routeRow, !isWide ? styles.routeRowStack : null]}>
      <View style={[styles.routeIndex, { backgroundColor: accent }]}>
        <Text style={styles.routeIndexText}>{String(index + 1).padStart(2, '0')}</Text>
      </View>

      <View style={styles.routeCopy}>
        <View style={styles.routeTitleLine}>
          <Text style={styles.routeTitle}>{page.label}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{page.badge}</Text>
          </View>
        </View>
        <Text style={styles.routePath}>{page.path}</Text>
        <Text style={styles.routeDescription}>{page.description}</Text>
      </View>

      <Link href={page.href} asChild>
        <Pressable style={StyleSheet.flatten([styles.openButton, { borderColor: accent }])}>
          <Text style={[styles.openButtonText, { color: accent }]}>Open</Text>
          <SymbolView name={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }} size={18} tintColor={accent} />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F5F8F7',
    flex: 1,
  },
  container: {
    gap: 18,
    padding: 20,
    paddingBottom: 42,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E8EA',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  backText: {
    color: '#12343B',
    fontSize: 13,
    fontWeight: '900',
  },
  logo: {
    height: 42,
    width: 160,
  },
  headerPanel: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 8,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    padding: 18,
  },
  headerCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#12343B',
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 46,
  },
  titleCompact: {
    fontSize: 32,
    lineHeight: 38,
  },
  subtitle: {
    color: '#587177',
    fontSize: 15,
    lineHeight: 22,
  },
  routeCount: {
    alignItems: 'center',
    borderRadius: 8,
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  routeCountValue: {
    color: '#07110F',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 29,
  },
  routeCountLabel: {
    color: '#07110F',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  notePanel: {
    backgroundColor: '#0D2A2E',
    borderRadius: 8,
    gap: 5,
    padding: 14,
  },
  noteLabel: {
    color: '#9EE9D0',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  noteText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 21,
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    paddingTop: 4,
  },
  listTitle: {
    color: '#12343B',
    fontSize: 20,
    fontWeight: '900',
  },
  listMeta: {
    color: '#087B7A',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  routeList: {
    gap: 12,
  },
  routeRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E8EA',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 118,
    padding: 14,
  },
  routeRowStack: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  routeIndex: {
    alignItems: 'center',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  routeIndexText: {
    color: '#07110F',
    fontSize: 13,
    fontWeight: '900',
  },
  routeCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  routeTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  routeTitle: {
    color: '#12343B',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  badge: {
    backgroundColor: '#EAF3F4',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeText: {
    color: '#587177',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  routePath: {
    color: '#087B7A',
    fontSize: 13,
    fontWeight: '900',
  },
  routeDescription: {
    color: '#587177',
    fontSize: 14,
    lineHeight: 20,
  },
  openButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 112,
    paddingHorizontal: 12,
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
