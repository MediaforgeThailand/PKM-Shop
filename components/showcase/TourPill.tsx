import { Link, useGlobalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiraDesign } from '@/constants/Design';
import { showcaseModuleIds, type ShowcaseModuleId } from '@/lib/showcase/registry';

function resolveTourModule(value: string | string[] | undefined): ShowcaseModuleId | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || !showcaseModuleIds.includes(raw as ShowcaseModuleId)) {
    return null;
  }

  return raw as ShowcaseModuleId;
}

export function TourPill() {
  const params = useGlobalSearchParams<{ tour?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const moduleId = resolveTourModule(params.tour);

  if (!moduleId) {
    return null;
  }

  return (
    <Link href={{ pathname: '/tour/[module]', params: { module: moduleId } }} asChild>
      <Pressable style={StyleSheet.flatten([styles.pill, { top: Math.max(insets.top + 10, 18) }])}>
        <Text style={styles.arrow}>←</Text>
        <Text style={styles.label}>กลับสู่ทัวร์</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.blueSoft,
    borderRadius: MiraDesign.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    left: 14,
    minHeight: 40,
    paddingHorizontal: 14,
    position: 'absolute',
    zIndex: 999,
  },
  arrow: {
    color: MiraDesign.color.blue,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 20,
  },
  label: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
});
