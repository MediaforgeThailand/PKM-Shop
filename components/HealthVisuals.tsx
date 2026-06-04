import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polyline, Rect, Stop } from 'react-native-svg';

import { MiraDesign } from '@/constants/Design';

export function StatusRing({
  value,
  label,
  color = MiraDesign.color.primary,
  size = 132,
}: {
  value: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(value, 100));
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <View style={[visualStyles.ringWrap, { height: size, width: size }]}>
      <Svg height={size} width={size}>
        <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke="#DDECEF" strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth={stroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={visualStyles.ringCenter}>
        <Text style={visualStyles.ringValue}>{clamped}</Text>
        <Text style={visualStyles.ringLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function MiniTrend({ color = MiraDesign.color.primary }: { color?: string }) {
  return (
    <Svg height={74} width="100%" viewBox="0 0 220 74">
      <Defs>
        <LinearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.26" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Line stroke="#DDECEF" strokeWidth="1" x1="0" x2="220" y1="58" y2="58" />
      <Path d="M0 58 L0 42 L36 48 L72 30 L110 36 L146 18 L184 26 L220 14 L220 74 L0 74 Z" fill="url(#trendFill)" />
      <Polyline fill="none" points="0,42 36,48 72,30 110,36 146,18 184,26 220,14" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
    </Svg>
  );
}

export function BiomarkerBar({
  label,
  value,
  percent,
  tone = MiraDesign.color.primary,
}: {
  label: string;
  value: string;
  percent: number;
  tone?: string;
}) {
  return (
    <View style={visualStyles.barRow}>
      <View style={visualStyles.barHeader}>
        <Text style={visualStyles.barLabel}>{label}</Text>
        <Text style={visualStyles.barValue}>{value}</Text>
      </View>
      <View style={visualStyles.barTrack}>
        <View style={[visualStyles.barFill, { backgroundColor: tone, width: `${Math.max(8, Math.min(percent, 100))}%` }]} />
      </View>
    </View>
  );
}

export function FreshnessDots({ active = 3 }: { active?: number }) {
  return (
    <View style={visualStyles.dotRow}>
      {[0, 1, 2, 3, 4].map((dot) => (
        <View key={dot} style={[visualStyles.freshDot, dot < active ? visualStyles.freshDotActive : null]} />
      ))}
    </View>
  );
}

export function HealthFigure() {
  return (
    <Svg height={170} width="100%" viewBox="0 0 180 170">
      <Circle cx="90" cy="32" fill="#DDF5F3" r="22" />
      <Rect fill="#DDF5F3" height="82" rx="30" width="78" x="51" y="58" />
      <Circle cx="70" cy="92" fill={MiraDesign.color.primary} opacity="0.24" r="12" />
      <Circle cx="104" cy="84" fill={MiraDesign.color.blue} opacity="0.22" r="17" />
      <Circle cx="92" cy="116" fill={MiraDesign.color.coral} opacity="0.22" r="14" />
      <G stroke={MiraDesign.color.primary} strokeLinecap="round" strokeWidth="5">
        <Path d="M75 90 C82 78 98 78 105 90" fill="none" />
        <Path d="M78 109 C86 118 98 118 106 109" fill="none" />
      </G>
      <Rect fill="#FFFFFF" height="34" rx="17" width="112" x="34" y="132" />
      <Circle cx="58" cy="149" fill={MiraDesign.color.mint} r="7" />
      <Circle cx="90" cy="149" fill={MiraDesign.color.amber} r="7" />
      <Circle cx="122" cy="149" fill={MiraDesign.color.blue} r="7" />
    </Svg>
  );
}

export const visualStyles = StyleSheet.create({
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  ringValue: {
    color: MiraDesign.color.ink,
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 36,
  },
  ringLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  barRow: {
    gap: MiraDesign.space.sm,
  },
  barHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  barValue: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  barTrack: {
    backgroundColor: '#DDECEF',
    borderRadius: MiraDesign.radius.pill,
    height: 9,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: MiraDesign.radius.pill,
    height: 9,
  },
  dotRow: {
    flexDirection: 'row',
    gap: MiraDesign.space.xs,
  },
  freshDot: {
    backgroundColor: '#D7E8EA',
    borderRadius: MiraDesign.radius.pill,
    height: 9,
    width: 9,
  },
  freshDotActive: {
    backgroundColor: MiraDesign.color.primary,
  },
});
