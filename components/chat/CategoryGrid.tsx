import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';
import type { ChatCard } from '@/lib/types/api';

type CategoryGridCard = Extract<ChatCard, { type: 'category_grid' }>;

export function CategoryGrid({
  card,
  disabled,
  onBrowseCategory,
}: {
  card: CategoryGridCard;
  disabled?: boolean;
  onBrowseCategory: (payload: { category: string; label: string }) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(Math.min(4, card.categories.length));
  const visibleCategories = card.categories.slice(0, visibleCount);
  const hasMore = visibleCount < card.categories.length;
  const isExpanded = visibleCount > 4 && !hasMore;

  if (card.categories.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {visibleCategories.map((category) => (
          <Pressable
            key={category.key}
            disabled={disabled}
            onPress={() => onBrowseCategory({ category: category.key, label: category.label_th })}
            style={({ pressed }) => [styles.box, disabled ? styles.disabled : null, pressed && !disabled ? styles.pressed : null]}
          >
            {category.image_url ? <Image resizeMode="cover" source={{ uri: category.image_url }} style={styles.illustration} /> : null}
            <Text style={styles.icon}>{category.icon ?? '✨'}</Text>
            <Text numberOfLines={1} style={styles.label}>
              {category.label_th}
            </Text>
            <Text style={styles.count}>{category.product_count.toLocaleString('th-TH')} รายการ</Text>
          </Pressable>
        ))}
      </View>
      {hasMore ? (
        <Pressable disabled={disabled} onPress={() => setVisibleCount((current) => Math.min(current + 4, card.categories.length))} style={styles.moreButton}>
          <Text style={styles.moreText}>ดูเพิ่มเติม</Text>
        </Pressable>
      ) : null}
      {isExpanded ? (
        <Pressable disabled={disabled} onPress={() => setVisibleCount(Math.min(4, card.categories.length))} style={styles.moreButton}>
          <Text style={styles.moreText}>ย่อรายการ</Text>
        </Pressable>
      ) : null}
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
  wrap: {
    gap: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  box: {
    ...cardShadow,
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 16,
    borderWidth: 1,
    height: 92,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 12,
    width: '48%',
  },
  illustration: {
    bottom: -8,
    height: 82,
    opacity: 0.16,
    position: 'absolute',
    right: -10,
    width: 82,
  },
  icon: {
    fontSize: 22,
    lineHeight: 26,
  },
  label: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 6,
  },
  count: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  moreButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  moreText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
});
