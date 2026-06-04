import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiraDesign, shadow } from '@/constants/Design';

type ScreenProps = {
  children: ReactNode;
  padded?: boolean;
};

export function Screen({ children, padded = true }: ScreenProps) {
  return (
    <SafeAreaView style={uiStyles.safeArea}>
      <ScrollView
        contentContainerStyle={[uiStyles.screenContent, padded ? uiStyles.screenPadding : null]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function BrandHeader({
  eyebrow,
  title,
  subtitle,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <View style={[uiStyles.header, compact ? uiStyles.compactHeader : null]}>
      <View style={uiStyles.brandRow}>
        <View style={uiStyles.brandMark} />
        <Text style={uiStyles.brandText}>mira health</Text>
      </View>
      <Text style={uiStyles.eyebrow}>{eyebrow}</Text>
      <Text style={[uiStyles.title, compact ? uiStyles.compactTitle : null]}>{title}</Text>
      {subtitle ? <Text style={uiStyles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[uiStyles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <View style={uiStyles.sectionHeader}>
      <Text style={uiStyles.sectionTitle}>{title}</Text>
      {meta ? <Text style={uiStyles.sectionMeta}>{meta}</Text> : null}
    </View>
  );
}

export function Pill({ label, tone = 'blue' }: { label: string; tone?: 'blue' | 'mint' | 'amber' | 'danger' }) {
  const toneStyle = {
    blue: uiStyles.bluePill,
    mint: uiStyles.mintPill,
    amber: uiStyles.amberPill,
    danger: uiStyles.dangerPill,
  }[tone];

  return <Text style={[uiStyles.pill, toneStyle]}>{label}</Text>;
}

export function ActionButton({
  label,
  variant = 'primary',
  onPress,
  style,
  ...pressableProps
}: {
  label: string;
  variant?: 'primary' | 'secondary';
  onPress?: () => void;
} & PressableProps) {
  return (
    <Pressable
      {...pressableProps}
      style={(state) => [
        uiStyles.button,
        variant === 'secondary' ? uiStyles.secondaryButton : uiStyles.primaryButton,
        typeof style === 'function' ? style(state) : style,
      ]}
      onPress={onPress}>
      <Text style={[uiStyles.buttonText, variant === 'secondary' ? uiStyles.secondaryButtonText : null]}>{label}</Text>
    </Pressable>
  );
}

export function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={uiStyles.statTile}>
      <Text style={uiStyles.statValue}>{value}</Text>
      <Text style={uiStyles.statLabel}>{label}</Text>
      <Text style={uiStyles.statDetail}>{detail}</Text>
    </View>
  );
}

export const uiStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: MiraDesign.color.canvas,
  },
  screenContent: {
    gap: MiraDesign.space.lg,
    paddingBottom: 112,
  },
  screenPadding: {
    padding: MiraDesign.space.lg,
  },
  header: {
    gap: MiraDesign.space.sm,
    paddingTop: MiraDesign.space.sm,
  },
  compactHeader: {
    gap: MiraDesign.space.xs,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
    marginBottom: MiraDesign.space.sm,
  },
  brandMark: {
    backgroundColor: MiraDesign.color.primary,
    borderColor: '#B8DAFF',
    borderRadius: MiraDesign.radius.pill,
    borderWidth: 5,
    height: 20,
    transform: [{ rotate: '-24deg' }],
    width: 34,
  },
  brandText: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 36,
  },
  compactTitle: {
    fontSize: 26,
    lineHeight: 31,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: MiraDesign.space.xs,
  },
  sectionTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionMeta: {
    color: MiraDesign.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: MiraDesign.radius.pill,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.xs,
  },
  bluePill: {
    backgroundColor: MiraDesign.color.primarySoft,
    color: MiraDesign.color.primaryDeep,
  },
  mintPill: {
    backgroundColor: '#E1F8EF',
    color: '#16805C',
  },
  amberPill: {
    backgroundColor: '#FFF2C8',
    color: '#7A5A05',
  },
  dangerPill: {
    backgroundColor: '#FFE2E2',
    color: MiraDesign.color.danger,
  },
  button: {
    alignItems: 'center',
    borderRadius: MiraDesign.radius.md,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: MiraDesign.space.lg,
  },
  primaryButton: {
    backgroundColor: MiraDesign.color.primary,
    ...shadow,
  },
  secondaryButton: {
    backgroundColor: MiraDesign.color.surfaceStrong,
    borderColor: MiraDesign.color.line,
    borderWidth: 1,
  },
  buttonText: {
    color: MiraDesign.color.surfaceStrong,
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButtonText: {
    color: MiraDesign.color.primaryDeep,
  },
  statTile: {
    backgroundColor: MiraDesign.color.surfaceStrong,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: MiraDesign.space.xs,
    minHeight: 98,
    padding: MiraDesign.space.md,
  },
  statValue: {
    color: MiraDesign.color.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  statDetail: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    lineHeight: 16,
  },
});
