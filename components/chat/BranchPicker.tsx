import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';
import type { OrderPanelBranch, OrderPanelState } from '@/lib/types/api';

type Order = NonNullable<OrderPanelState>;

function branchDetail(branch: OrderPanelBranch) {
  return [branch.address, branch.district].filter(Boolean).join(' · ');
}

export function BranchPicker({
  disabled,
  onSelectBranch,
  order,
}: {
  disabled?: boolean;
  onSelectBranch: (payload: { branch_id: string; order_id: string }) => void;
  order: Order;
}) {
  const branches = order.branches ?? [];
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id ?? '');
  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  if (order.step !== 'branch' || branches.length <= 1) {
    return null;
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>เลือกสาขาที่สะดวก</Text>
        <Text numberOfLines={2} style={styles.productName}>
          {order.product_name}
        </Text>
      </View>
      <View style={styles.list}>
        {branches.map((branch, index) => {
          const isSelected = branch.id === selectedBranchId;

          return (
            <Pressable
              key={branch.id}
              disabled={disabled}
              onPress={() => setSelectedBranchId(branch.id)}
              style={({ pressed }) => [
                styles.row,
                index < branches.length - 1 ? styles.rowDivider : null,
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
        })}
      </View>
      <View style={styles.footer}>
        <Pressable
          disabled={disabled || !selectedBranch}
          onPress={() => selectedBranch && onSelectBranch({ branch_id: selectedBranch.id, order_id: order.id })}
          style={({ pressed }) => [styles.confirmButton, disabled || !selectedBranch ? styles.disabled : null, pressed && !disabled ? styles.pressed : null]}
        >
          <Text style={styles.confirmText}>ยืนยันสาขา</Text>
        </Pressable>
      </View>
    </View>
  );
}

const cardShadow = {
  shadowColor: '#12343B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  panel: {
    ...cardShadow,
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  productName: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  list: {
    borderColor: MiraDesign.color.line,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
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
  footer: {
    backgroundColor: MiraDesign.color.surface,
    paddingTop: 2,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    width: '100%',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
