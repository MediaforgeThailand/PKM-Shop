import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import {
  getProductCategories,
  getProductCategoryLabel,
  loadActiveHospitalProducts,
  type HospitalProduct,
  type ProductCategory,
} from '@/lib/marketplace/hospitalProducts';

type CategoryFilter = ProductCategory | 'all';

const categoryFilters: CategoryFilter[] = ['all', ...getProductCategories()];

function formatMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

function categoryLabel(category: CategoryFilter) {
  return category === 'all' ? 'All' : getProductCategoryLabel(category);
}

export default function PackagesScreen() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [products, setProducts] = useState<HospitalProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  const visibleProducts = useMemo(
    () => products.filter((product) => activeCategory === 'all' || product.category === activeCategory),
    [activeCategory, products],
  );

  useEffect(() => {
    let isMounted = true;

    loadActiveHospitalProducts()
      .then((items) => {
        if (isMounted) {
          setProducts(items);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingProducts(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>Health package marketplace</Text>
          <Text style={styles.title}>Active hospital catalog</Text>
          <Text style={styles.subtitle}>Products shown here come from the v2 `products` table for the current tenant.</Text>
        </View>
        <View style={styles.catalogMetric}>
          <Text style={styles.catalogMetricValue}>{products.length}</Text>
          <Text style={styles.catalogMetricLabel}>active</Text>
        </View>
      </View>

      <View style={styles.categoryRow}>
        {categoryFilters.map((category) => (
          <Pressable
            key={category}
            onPress={() => setActiveCategory(category)}
            style={[styles.categoryChip, activeCategory === category ? styles.categoryActive : null]}
          >
            <Text style={[styles.categoryText, activeCategory === category ? styles.categoryTextActive : null]}>{categoryLabel(category)}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader
        title="Available products"
        meta={isLoadingProducts ? 'syncing catalog' : `${visibleProducts.length} shown`}
      />

      {!isLoadingProducts && visibleProducts.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No active products</Text>
          <Text style={styles.emptyBody}>Publish products from the tenant catalog admin to show them here.</Text>
          <Link href="/admin/catalog" asChild>
            <ActionButton label="Open catalog admin" variant="secondary" />
          </Link>
        </Card>
      ) : null}

      {visibleProducts.map((product) => (
        <Card key={product.id} style={styles.packageCard}>
          <View style={styles.cardTop}>
            <View style={styles.hospitalBadge}>
              <Text style={styles.hospitalBadgeText}>{product.hospitalName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.titleWrap}>
              <Text style={styles.packageTitle}>{product.title}</Text>
              <Text style={styles.hospital}>{product.hospitalName}</Text>
            </View>
            <Text style={styles.price}>{formatMoney(product.priceAmount)}</Text>
          </View>

          <Text numberOfLines={3} style={styles.description}>
            {product.description}
          </Text>

          <View style={styles.productMetaGrid}>
            <Meta label="Catalog key" value={product.catalogKey} />
            <Meta label="Category" value={getProductCategoryLabel(product.category)} />
            <Meta label="Booking" value={product.requiresAppointment ? 'Appointment' : 'Walk-in'} />
          </View>

          <View style={styles.tagRow}>
            {(product.tags.length ? product.tags : [getProductCategoryLabel(product.category)]).slice(0, 3).map((tag) => (
              <Pill key={tag} label={tag} tone="blue" />
            ))}
          </View>

          <Link href={`/package-detail?productId=${encodeURIComponent(product.id)}`} asChild>
            <ActionButton label="View product" />
          </Link>
        </Card>
      ))}
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metaValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.lg,
    ...softShadow,
  },
  heroCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  catalogMetric: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: MiraDesign.radius.md,
    justifyContent: 'center',
    minHeight: 82,
    minWidth: 82,
    padding: MiraDesign.space.md,
  },
  catalogMetricValue: {
    color: MiraDesign.color.primary,
    fontSize: 28,
    fontWeight: '900',
  },
  catalogMetricLabel: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  categoryChip: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.pill,
    borderWidth: 1,
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.sm,
  },
  categoryActive: {
    backgroundColor: MiraDesign.color.primary,
    borderColor: MiraDesign.color.primary,
  },
  categoryText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  emptyCard: {
    gap: MiraDesign.space.md,
  },
  emptyTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  emptyBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  packageCard: {
    gap: MiraDesign.space.lg,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  hospitalBadge: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: MiraDesign.radius.lg,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  hospitalBadgeText: {
    color: MiraDesign.color.primary,
    fontSize: 24,
    fontWeight: '900',
  },
  titleWrap: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  packageTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  hospital: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  price: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  description: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  productMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  metaCell: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexBasis: '31%',
    flexGrow: 1,
    gap: 3,
    padding: MiraDesign.space.sm,
  },
  metaLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
});
