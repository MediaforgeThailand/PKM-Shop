import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BranchOptionRow } from '@/components/chat/BranchOptionRow';
import { MiraDesign } from '@/constants/Design';
import type { OrderPanelState } from '@/lib/types/api';

type Order = NonNullable<OrderPanelState>;

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
            <BranchOptionRow
              key={branch.id}
              branch={branch}
              disabled={disabled}
              isSelected={isSelected}
              onPress={() => setSelectedBranchId(branch.id)}
              showDivider={index < branches.length - 1}
            />
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
