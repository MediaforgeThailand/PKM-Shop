import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ChatProduct } from '@/lib/types/api';

function formatProductMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

export function ProductCarousel({
  disabled,
  products,
  onSelectProduct,
}: {
  disabled?: boolean;
  products: ChatProduct[];
  onSelectProduct: (product: ChatProduct) => void;
}) {
  return (
    <View style={styles.productCardGroup}>
      {products.map((product) => (
        <View key={product.catalog_key} style={styles.productCard}>
          {product.image_url ? (
            <Image source={{ uri: product.image_url }} resizeMode="cover" style={styles.productImage} />
          ) : (
            <View style={styles.productImageFallback}>
              <Text style={styles.productImageFallbackText}>M</Text>
            </View>
          )}
          <View style={styles.productCardBody}>
            <Text numberOfLines={2} style={styles.productTitle}>
              {product.name}
            </Text>
            <Text numberOfLines={2} style={styles.productHospital}>
              {product.description}
            </Text>
            <Text style={styles.productPrice}>{formatProductMoney(product.price_baht)}</Text>
            <Pressable disabled={disabled} onPress={() => onSelectProduct(product)} style={[styles.productCta, disabled ? styles.disabledButton : null]}>
              <Text style={styles.productCtaText}>{disabled ? 'Unavailable' : '\u0e08\u0e2d\u0e07'}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  disabledButton: {
    backgroundColor: '#87948F',
  },
  productCard: {
    backgroundColor: '#F7FAF8',
    borderColor: '#DCE8E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    overflow: 'hidden',
    padding: 10,
  },
  productCardBody: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  productCardGroup: {
    gap: 10,
  },
  productCta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#163F34',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 14,
  },
  productCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  productHospital: {
    color: '#587069',
    fontSize: 12,
    fontWeight: '700',
  },
  productImage: {
    backgroundColor: '#E4EEE9',
    borderRadius: 8,
    height: 78,
    width: 78,
  },
  productImageFallback: {
    alignItems: 'center',
    backgroundColor: '#DCE8E2',
    borderRadius: 8,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  productImageFallbackText: {
    color: '#3C7864',
    fontSize: 24,
    fontWeight: '900',
  },
  productPrice: {
    color: '#163F34',
    fontSize: 14,
    fontWeight: '900',
  },
  productTitle: {
    color: '#14231E',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
});
