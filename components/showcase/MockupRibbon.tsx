import { StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';

export const SHOWCASE_MOCKUP_RIBBON = 'MOCKUP';

export function MockupRibbon({ detail = 'รอดีไซน์จริง', label = SHOWCASE_MOCKUP_RIBBON }: { detail?: string; label?: string }) {
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.ribbon}>
        <Text style={styles.label}>{label}</Text>
        <Text numberOfLines={1} style={styles.detail}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: -46,
    top: 22,
    transform: [{ rotate: '34deg' }],
    width: 190,
    zIndex: 20,
  },
  ribbon: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.amber,
    borderColor: 'rgba(18, 52, 59, 0.12)',
    borderWidth: 1,
    paddingVertical: 5,
  },
  label: {
    color: MiraDesign.color.ink,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
  },
  detail: {
    color: MiraDesign.color.ink,
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
});
