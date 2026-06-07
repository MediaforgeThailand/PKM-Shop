import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Pill } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import {
  getProductCategoryLabel,
  loadManagedHospitalProducts,
  updateHospitalProductStatus,
  type HospitalProduct,
  type HospitalProductStatus,
  type ProductCategory,
} from '@/lib/marketplace/hospitalProducts';

const statusFilters = ['all', 'active', 'archived', 'draft'] as const;

type StatusFilter = (typeof statusFilters)[number];

const categoryFilters: ProductCategory[] = [
  'health_checkup',
  'lab_test',
  'imaging',
  'vaccine',
  'specialty_consult',
  'wellness',
  'procedure',
  'other',
];

export default function HospitalProductsScreen() {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [products, setProducts] = useState<HospitalProduct[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [actionProductId, setActionProductId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isWide = width >= 1040;

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      const searchText = [
        product.title,
        product.hospitalName,
        product.description,
        product.hospitalAddress,
        product.category,
        product.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      const matchesQuery = !normalizedQuery || searchText.includes(normalizedQuery);

      return matchesStatus && matchesCategory && matchesQuery;
    });
  }, [categoryFilter, products, query, statusFilter]);

  const summary = useMemo(() => {
    const active = products.filter((product) => product.status === 'active').length;
    const archived = products.filter((product) => product.status === 'archived').length;
    const ragReady = products.filter((product) => product.ragChunkId && product.status === 'active').length;

    return {
      active,
      archived,
      ragReady,
      total: products.length,
    };
  }, [products]);

  useEffect(() => {
    let isMounted = true;

    loadProducts().finally(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };

    async function loadProducts() {
      const items = await loadManagedHospitalProducts();

      if (isMounted) {
        setProducts(items);
      }
    }
  }, []);

  async function refreshProducts() {
    try {
      setIsLoading(true);
      setError(null);
      setProducts(await loadManagedHospitalProducts());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'โหลดรายการสินค้าไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  }

  async function changeProductStatus(product: HospitalProduct, nextStatus: HospitalProductStatus) {
    if (actionProductId) {
      return;
    }

    try {
      setActionProductId(product.id);
      setError(null);
      setMessage(null);
      const updatedProduct = await updateHospitalProductStatus(product, nextStatus);
      setProducts((current) => current.map((item) => (item.id === updatedProduct.id ? updatedProduct : item)));
      setMessage(
        nextStatus === 'active'
          ? `เปิดขายและเปิด RAG แล้ว: ${updatedProduct.title}`
          : `ปิดสินค้าและปิด RAG แล้ว: ${updatedProduct.title}`,
      );
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'อัปเดตสถานะสินค้าไม่สำเร็จ');
    } finally {
      setActionProductId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.topBar, !isWide ? styles.topBarStack : null]}>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>Hospital Products</Text>
            <Text style={styles.title}>จัดการสินค้าโรงพยาบาล</Text>
            <Text style={styles.subtitle}>
              ค้นหา ตรวจสถานะ RAG และเปิด/ปิดสินค้าจาก hospital portal เพื่อทดสอบ marketplace กับ chatbot ใน prototype
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable disabled={isLoading} onPress={refreshProducts} style={[styles.secondaryButton, isLoading ? styles.disabled : null]}>
              <Text style={styles.secondaryButtonText}>{isLoading ? 'Refreshing...' : 'Refresh'}</Text>
            </Pressable>
            <Link href="/hospital-portal" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Add product</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {!auth.session ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>โหมดดูรายการเท่านั้น</Text>
            <Text style={styles.noticeBody}>
              ถ้ายังไม่ login จะเห็นเฉพาะสินค้า active ตาม public policy. การ archive/restore ต้องใช้ account ที่สร้างสินค้า หรือ admin.
            </Text>
            <Link href="/" asChild>
              <Pressable style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>ไปหน้า login</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.controlPane}>
            <View style={styles.searchPanel}>
              <Text style={styles.fieldLabel}>Search products</Text>
              <TextInput
                onChangeText={setQuery}
                placeholder="ชื่อสินค้า โรงพยาบาล หมวดหมู่ หรือ tag"
                placeholderTextColor={MiraDesign.color.muted}
                style={styles.input}
                value={query}
              />
            </View>

            <View style={styles.summaryGrid}>
              <Metric label="Total" value={`${summary.total}`} />
              <Metric label="Active" value={`${summary.active}`} />
              <Metric label="Archived" value={`${summary.archived}`} />
              <Metric label="RAG live" value={`${summary.ragReady}`} />
            </View>

            <FilterPanel
              activeCategory={categoryFilter}
              activeStatus={statusFilter}
              onCategoryChange={setCategoryFilter}
              onStatusChange={setStatusFilter}
            />
          </View>

          <View style={styles.listPane}>
            <View style={styles.listHeader}>
              <View>
                <Text style={styles.panelTitle}>Product inventory</Text>
                <Text style={styles.panelMeta}>{isLoading ? 'loading products' : `${filteredProducts.length} shown`}</Text>
              </View>
              <Link href="/(tabs)/packages" asChild>
                <Pressable style={styles.catalogButton}>
                  <Text style={styles.catalogButtonText}>Open mobile catalog</Text>
                </Pressable>
              </Link>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}

            {filteredProducts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>ยังไม่พบสินค้าที่ตรงกับตัวกรอง</Text>
                <Text style={styles.emptyBody}>ลองเปลี่ยนคำค้นหา สถานะ หรือเพิ่มสินค้าจากหน้า portal ก่อน</Text>
              </View>
            ) : (
              filteredProducts.map((product) => (
                <ProductRow
                  key={product.id}
                  disabled={Boolean(actionProductId)}
                  isBusy={actionProductId === product.id}
                  onArchive={() => changeProductStatus(product, 'archived')}
                  onRestore={() => changeProductStatus(product, 'active')}
                  product={product}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function FilterPanel({
  activeCategory,
  activeStatus,
  onCategoryChange,
  onStatusChange,
}: {
  activeCategory: ProductCategory | 'all';
  activeStatus: StatusFilter;
  onCategoryChange: (category: ProductCategory | 'all') => void;
  onStatusChange: (status: StatusFilter) => void;
}) {
  return (
    <View style={styles.filterPanel}>
      <Text style={styles.filterTitle}>Filters</Text>

      <View style={styles.filterGroup}>
        <Text style={styles.fieldLabel}>Status</Text>
        <View style={styles.segmentRow}>
          {statusFilters.map((status) => (
            <Pressable
              key={status}
              onPress={() => onStatusChange(status)}
              style={[styles.segment, activeStatus === status ? styles.segmentActive : null]}
            >
              <Text style={[styles.segmentText, activeStatus === status ? styles.segmentTextActive : null]}>{status}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.filterGroup}>
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.categoryWrap}>
          <Pressable
            onPress={() => onCategoryChange('all')}
            style={[styles.categoryChip, activeCategory === 'all' ? styles.categoryChipActive : null]}
          >
            <Text style={[styles.categoryText, activeCategory === 'all' ? styles.categoryTextActive : null]}>ทั้งหมด</Text>
          </Pressable>
          {categoryFilters.map((category) => (
            <Pressable
              key={category}
              onPress={() => onCategoryChange(category)}
              style={[styles.categoryChip, activeCategory === category ? styles.categoryChipActive : null]}
            >
              <Text style={[styles.categoryText, activeCategory === category ? styles.categoryTextActive : null]}>
                {getProductCategoryLabel(category)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function ProductRow({
  disabled,
  isBusy,
  onArchive,
  onRestore,
  product,
}: {
  disabled: boolean;
  isBusy: boolean;
  onArchive: () => void;
  onRestore: () => void;
  product: HospitalProduct;
}) {
  const isActive = product.status === 'active';
  const ragLabel = product.ragChunkId ? (isActive ? 'RAG active' : 'RAG paused') : 'No RAG';

  return (
    <View style={styles.productRow}>
      <View style={styles.productHead}>
        <View style={styles.productTitleGroup}>
          <Text style={styles.productTitle}>{product.title}</Text>
          <Text style={styles.productHospital}>{product.hospitalName}</Text>
        </View>
        <View style={styles.rowPills}>
          <Pill label={product.status} tone={product.status === 'active' ? 'mint' : product.status === 'archived' ? 'amber' : 'blue'} />
          <Pill label={ragLabel} tone={product.ragChunkId && isActive ? 'mint' : 'amber'} />
        </View>
      </View>

      <Text style={styles.productDescription} numberOfLines={2}>
        {product.description}
      </Text>

      <View style={styles.productMetaGrid}>
        <Meta label="Category" value={getProductCategoryLabel(product.category)} />
        <Meta label="Price" value={`${product.priceAmount.toLocaleString('th-TH')} THB`} />
        <Meta label="Created" value={formatDate(product.createdAt)} />
        <Meta label="RAG chunk" value={product.ragChunkId ?? 'not published'} />
      </View>

      {product.hospitalAddress ? <Text style={styles.addressText}>{product.hospitalAddress}</Text> : null}

      <View style={styles.productFooter}>
        <View style={styles.tagWrap}>
          {(product.tags.length ? product.tags : ['Hospital product']).slice(0, 6).map((tag) => (
            <Text key={tag} style={styles.inlineTag}>
              {tag}
            </Text>
          ))}
        </View>
        {isActive ? (
          <Pressable disabled={disabled} onPress={onArchive} style={[styles.dangerButton, disabled ? styles.disabled : null]}>
            <Text style={styles.dangerButtonText}>{isBusy ? 'Archiving...' : 'Archive'}</Text>
          </Pressable>
        ) : (
          <Pressable disabled={disabled} onPress={onRestore} style={[styles.restoreButton, disabled ? styles.disabled : null]}>
            <Text style={styles.restoreButtonText}>{isBusy ? 'Restoring...' : 'Restore'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F5F8F7',
    flex: 1,
  },
  container: {
    gap: 18,
    padding: 22,
    paddingBottom: 48,
  },
  topBar: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'space-between',
  },
  topBarStack: {
    flexDirection: 'column',
  },
  titleGroup: {
    flex: 1,
    gap: 7,
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 760,
  },
  topActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  notice: {
    backgroundColor: '#FFF7DD',
    borderColor: '#F3D17B',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  noticeTitle: {
    color: '#6F5100',
    fontSize: 15,
    fontWeight: '900',
  },
  noticeBody: {
    color: '#806729',
    fontSize: 13,
    lineHeight: 19,
  },
  noticeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#6F5100',
    borderRadius: 8,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  noticeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  workspace: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 18,
  },
  workspaceStack: {
    flexDirection: 'column',
  },
  controlPane: {
    gap: 14,
    width: 340,
  },
  searchPanel: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
    ...softShadow,
  },
  fieldLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metric: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 150,
    padding: 12,
  },
  metricLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: MiraDesign.color.ink,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 4,
  },
  filterPanel: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    padding: 14,
  },
  filterTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  filterGroup: {
    gap: 8,
  },
  segmentRow: {
    backgroundColor: '#EAF3F2',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderWidth: 1,
  },
  segmentText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: MiraDesign.color.primaryDeep,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  categoryChipActive: {
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
  listPane: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    padding: 16,
    width: '100%',
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: MiraDesign.color.ink,
    fontSize: 19,
    fontWeight: '900',
  },
  panelMeta: {
    color: MiraDesign.color.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 3,
  },
  catalogButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  catalogButtonText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  emptyState: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  emptyTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  productRow: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  productHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  productTitleGroup: {
    flex: 1,
    gap: 4,
  },
  productTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  productHospital: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  rowPills: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  productDescription: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  productMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaCell: {
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 150,
    padding: 10,
  },
  metaLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  addressText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  productFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  tagWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  inlineTag: {
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: 8,
    color: MiraDesign.color.primaryDeep,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#FFE8E8',
    borderColor: '#F7B9BA',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    minWidth: 102,
    paddingHorizontal: 12,
  },
  dangerButtonText: {
    color: '#A23538',
    fontSize: 12,
    fontWeight: '900',
  },
  restoreButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    minHeight: 38,
    justifyContent: 'center',
    minWidth: 102,
    paddingHorizontal: 12,
  },
  restoreButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
  errorText: {
    color: MiraDesign.color.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  successText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
  },
});
