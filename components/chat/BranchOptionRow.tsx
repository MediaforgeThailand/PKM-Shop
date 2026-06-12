import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';
import type { OrderPanelBranch } from '@/lib/types/api';

function branchDetail(branch: OrderPanelBranch) {
  return [branch.address, branch.district].filter(Boolean).join(' · ');
}

export function BranchOptionRow({
  branch,
  disabled,
  isSelected,
  onPress,
  showDivider,
}: {
  branch: OrderPanelBranch;
  disabled?: boolean;
  isSelected: boolean;
  onPress: () => void;
  showDivider?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider ? styles.rowDivider : null,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      <View style={[styles.radio, isSelected ? styles.radioSelected : null]}>
        {isSelected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.branchName}>{branch.name}</Text>
        <Text numberOfLines={2} style={styles.branchDetail}>
          {branchDetail(branch) || 'รายละเอียดสาขาจะอัปเดตในระบบ'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomColor: MiraDesign.color.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  radio: {
    alignItems: 'center',
    borderColor: MiraDesign.color.line,
    borderRadius: 999,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioSelected: {
    borderColor: MiraDesign.color.primary,
  },
  radioDot: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  rowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  branchName: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  branchDetail: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
