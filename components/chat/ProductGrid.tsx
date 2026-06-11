import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';
import type { ChatCard, ChatProduct } from '@/lib/types/api';

type ProductGridCard = Extract<ChatCard, { type: 'product_grid' }>;

function formatMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} บาท`;
}

function productInitial(name: string) {
  return name.trim().charAt(0) || 'M';
}

function ProductImage({ product, recommended }: { product: ChatProduct; recommended: boolean }) {
  const [isLoaded, setIsLoaded] = useState(!product.image_url);
  const [hasError, setHasError] = useState(false);
  const showImage = product.image_url && !hasError;

  return (
    <View style={styles.imageWrap}>
      {showImage ? (
        <Image
          onError={() => {
            setHasError(true);
            setIsLoaded(true);
          }}
          onLoadEnd={() => setIsLoaded(true)}
          resizeMode="cover"
          source={{ uri: product.image_url! }}
          style={styles.image}
        />
      ) : (
        <LinearGradient colors={['#DDF5F3', '#F7FBFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fallbackImage}>
          <Text style={styles.fallbackText}>{productInitial(product.name)}</Text>
        </LinearGradient>
      )}
      {!isLoaded ? (
        <View style={styles.skeleton}>
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonLine} />
        </View>
      ) : null}
      {recommended ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>AI แนะนำ</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ProductGrid({
  card,
  disabled,
  onBrowseCategory,
  onSelectProduct,
}: {
  card: ProductGridCard;
  disabled?: boolean;
  onBrowseCategory?: (payload: { category: string; offset: number }) => void;
  onSelectProduct: (product: ChatProduct) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(Math.min(4, card.products.length));
  const totalAvailable = Math.max(card.total_available, card.products.length);
  const visibleProducts = card.products.slice(0, visibleCount);
  const hasLocalMore = visibleCount < Math.min(12, card.products.length);
  const hasRemoteMore = !hasLocalMore && Boolean(card.category) && totalAvailable > card.products.length;
  const isFullyExpanded = !hasLocalMore && !hasRemoteMore && visibleCount > 4;
  const remaining = Math.max(0, totalAvailable - visibleCount);

  if (card.products.length === 0) {
    return null;
  }

  function handleMore() {
    if (disabled) {
      return;
    }

    if (hasLocalMore) {
      setVisibleCount((current) => Math.min(current + 4, card.products.length, 12));
      return;
    }

    if (hasRemoteMore && card.category) {
      onBrowseCategory?.({
        category: card.category,
        offset: card.products.length,
      });
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {visibleProducts.map((product, index) => {
          const recommended = card.source === 'recommendation' && index === 0;

          return (
            <Pressable
              key={product.catalog_key}
              disabled={disabled}
              onPress={() => onSelectProduct(product)}
              style={({ pressed }) => [
                styles.card,
                recommended ? styles.recommendedCard : null,
                disabled ? styles.disabled : null,
                pressed && !disabled ? styles.pressed : null,
              ]}
            >
              <ProductImage product={product} recommended={recommended} />
              <View style={styles.body}>
                <Text numberOfLines={2} style={styles.name}>
                  {product.name}
                </Text>
                <Text style={styles.price}>{formatMoney(product.price_baht)}</Text>
                <Pressable
                  disabled={disabled}
                  onPress={() => onSelectProduct(product)}
                  style={({ pressed }) => [styles.cta, disabled ? styles.disabled : null, pressed && !disabled ? styles.pressed : null]}
                >
                  <Text style={styles.ctaText}>จองคิว</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })}
      </View>
      {hasLocalMore || hasRemoteMore ? (
        <Pressable disabled={disabled} onPress={handleMore} style={({ pressed }) => [styles.moreButton, pressed && !disabled ? styles.pressed : null]}>
          <Text style={styles.moreText}>ดูเพิ่มเติม (อีก {Math.max(remaining, 1)} รายการ)</Text>
        </Pressable>
      ) : null}
      {isFullyExpanded ? (
        <Pressable disabled={disabled} onPress={() => setVisibleCount(Math.min(4, card.products.length))} style={styles.moreButton}>
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
  card: {
    ...cardShadow,
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 12,
    width: '48%',
  },
  recommendedCard: {
    borderColor: MiraDesign.color.primary,
    borderWidth: 1.5,
  },
  imageWrap: {
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  image: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    height: '100%',
    width: '100%',
  },
  fallbackImage: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  fallbackText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 28,
    fontWeight: '900',
  },
  skeleton: {
    backgroundColor: '#EEF7F7',
    bottom: 0,
    gap: 8,
    justifyContent: 'center',
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  skeletonLineWide: {
    alignSelf: 'stretch',
    backgroundColor: '#DCEDEE',
    borderRadius: 999,
    height: 10,
  },
  skeletonLine: {
    backgroundColor: '#E5F3F4',
    borderRadius: 999,
    height: 10,
    width: '62%',
  },
  badge: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 999,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    top: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  body: {
    gap: 8,
  },
  name: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  price: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 15,
    fontWeight: '900',
  },
  cta: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: '100%',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
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
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  moreText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
});
