import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import type { ImageSourcePropType } from 'react-native';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showcaseModules, type ShowcaseModule, type ShowcaseModuleId } from '@/lib/showcase/registry';

const logo = require('@/assets/images/mira-care-logo.png');

const moduleImages: Record<ShowcaseModuleId, ImageSourcePropType> = {
  admin: require('@/assets/images/product-preview-longevity.png'),
  'ai-chat': require('@/assets/images/product-preview-heart.png'),
  health: require('@/assets/images/mockup-health-check-results.png'),
  referral: require('@/assets/images/mira-care-mark.png'),
};

const moduleIcons = {
  admin: { android: 'admin_panel_settings', ios: 'slider.horizontal.3', web: 'admin_panel_settings' },
  'ai-chat': { android: 'chat', ios: 'message.and.waveform.fill', web: 'chat' },
  health: { android: 'monitor_heart', ios: 'heart.text.square.fill', web: 'monitor_heart' },
  referral: { android: 'link', ios: 'link', web: 'link' },
} as const;

export default function ProductOverviewScreen() {
  const { width } = useWindowDimensions();
  const useTwoColumns = width >= 760;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Image resizeMode="contain" source={logo} style={styles.logo} />
          <View style={styles.topBadge}>
            <Text style={styles.topBadgeText}>Client demo tour</Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>MiraCare product showcase</Text>
          <Text style={[styles.title, !useTwoColumns ? styles.titleCompact : null]}>Choose a system category.</Text>
          <Text style={styles.subtitle}>Each category opens a curated list of the real URL pages available in this build.</Text>
        </View>

        <View style={styles.moduleGrid}>
          {showcaseModules.map((module, index) => (
            <ModuleTile key={module.id} index={index} module={module} useTwoColumns={useTwoColumns} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModuleTile({ index, module, useTwoColumns }: { index: number; module: ShowcaseModule; useTwoColumns: boolean }) {
  const previewPages = module.pages.slice(0, 3);

  return (
    <Link href={{ pathname: '/showcase/[module]', params: { module: module.id } }} asChild>
      <Pressable
        style={StyleSheet.flatten([
          styles.moduleTile,
          useTwoColumns ? styles.moduleTileTwoColumn : styles.moduleTileSingleColumn,
          { borderColor: module.accent },
        ])}>
        <ImageBackground imageStyle={styles.tileImage} resizeMode="cover" source={moduleImages[module.id]} style={styles.tileImageWrap}>
          <LinearGradient colors={['rgba(9, 16, 16, 0.10)', 'rgba(9, 16, 16, 0.82)']} style={styles.tileImageOverlay}>
            <View style={[styles.moduleIcon, { backgroundColor: module.accent }]}>
              <SymbolView name={moduleIcons[module.id]} size={23} tintColor="#07110F" />
            </View>
            <Text style={styles.moduleNumber}>{String(index + 1).padStart(2, '0')}</Text>
          </LinearGradient>
        </ImageBackground>

        <View style={styles.tileBody}>
          <View style={styles.tileHeader}>
            <View style={styles.tileCopy}>
              <Text style={styles.moduleEyebrow}>{module.eyebrow}</Text>
              <Text style={styles.moduleTitle}>{module.title}</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: module.accent }]}>
              <Text style={styles.countBadgeText}>{module.pages.length}</Text>
            </View>
          </View>

          <Text style={styles.moduleBody}>{module.body}</Text>

          <View style={styles.pathList}>
            {previewPages.map((page) => (
              <View key={page.path} style={styles.pathPreviewRow}>
                <View style={[styles.pathDot, { backgroundColor: module.accent }]} />
                <Text numberOfLines={1} style={styles.pathPreviewText}>
                  {page.path}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.tileFooter}>
            <Text style={[styles.openText, { color: module.accent }]}>View URLs</Text>
            <SymbolView name={{ ios: 'chevron.right', android: 'arrow_forward', web: 'arrow_forward' }} size={18} tintColor={module.accent} />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F5F8F7',
    flex: 1,
  },
  container: {
    gap: 22,
    padding: 20,
    paddingBottom: 42,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  logo: {
    height: 44,
    width: 170,
  },
  topBadge: {
    backgroundColor: '#0D2A2E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  titleBlock: {
    gap: 8,
    maxWidth: 760,
    paddingBottom: 2,
  },
  kicker: {
    color: '#087B7A',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#12343B',
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 48,
  },
  titleCompact: {
    fontSize: 34,
    lineHeight: 40,
  },
  subtitle: {
    color: '#587177',
    fontSize: 15,
    lineHeight: 22,
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  moduleTile: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 360,
    overflow: 'hidden',
  },
  moduleTileTwoColumn: {
    width: '48.8%',
  },
  moduleTileSingleColumn: {
    width: '100%',
  },
  tileImageWrap: {
    height: 138,
  },
  tileImage: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tileImageOverlay: {
    alignItems: 'flex-end',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  moduleIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  moduleNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  tileBody: {
    flex: 1,
    gap: 13,
    padding: 16,
  },
  tileHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  tileCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  moduleEyebrow: {
    color: '#587177',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  moduleTitle: {
    color: '#12343B',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 30,
  },
  countBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  countBadgeText: {
    color: '#07110F',
    fontSize: 14,
    fontWeight: '900',
  },
  moduleBody: {
    color: '#587177',
    fontSize: 14,
    lineHeight: 21,
  },
  pathList: {
    gap: 8,
  },
  pathPreviewRow: {
    alignItems: 'center',
    backgroundColor: '#F1F6F6',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  pathDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  pathPreviewText: {
    color: '#12343B',
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  tileFooter: {
    alignItems: 'center',
    borderTopColor: '#D8E8EA',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
    marginTop: 'auto',
    paddingTop: 12,
  },
  openText: {
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
