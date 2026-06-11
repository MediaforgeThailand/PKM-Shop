import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Pill } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import {
  canWriteTenantCatalog,
  defaultTenantSlug,
  getProductCategories,
  getProductCategoryLabel,
  loadTenantMemberContext,
  loadManagedHospitalProducts,
  saveCatalogProduct,
  updateHospitalProductStatus,
  uploadProductImage,
  type HospitalProduct,
  type HospitalProductDraft,
  type HospitalProductStatus,
  type ProductCategory,
  type TenantMemberContext,
} from '@/lib/marketplace/hospitalProducts';

const emptyDraft: HospitalProductDraft = {
  branchInfo: '',
  category: 'checkup',
  description: '',
  hospitalAddress: '',
  hospitalMapQuery: '',
  hospitalName: '',
  imageUrl: '',
  priceAmount: '',
  requiresAppointment: true,
  title: '',
};

const statusFilters = ['all', 'active', 'archived'] as const;

type StatusFilter = (typeof statusFilters)[number];

export function CatalogCrud({ title = 'Catalog CRUD' }: { title?: string }) {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState<HospitalProductDraft>(emptyDraft);
  const [editingProduct, setEditingProduct] = useState<HospitalProduct | null>(null);
  const [products, setProducts] = useState<HospitalProduct[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [tenantContext, setTenantContext] = useState<TenantMemberContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isWide = width >= 1080;
  const canEditCatalog = canWriteTenantCatalog(tenantContext);
  const canSave =
    canEditCatalog &&
    draft.title.trim().length > 1 &&
    draft.description.trim().length > 3 &&
    Number(draft.priceAmount.replace(/,/g, '')) >= 0;

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      const searchText = [
        product.title,
        product.catalogKey,
        product.description,
        product.hospitalName,
        product.hospitalAddress,
        product.category,
      ]
        .join(' ')
        .toLowerCase();

      return matchesStatus && matchesCategory && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [categoryFilter, products, query, statusFilter]);

  const summary = useMemo(
    () => ({
      active: products.filter((product) => product.status === 'active').length,
      archived: products.filter((product) => product.status === 'archived').length,
      total: products.length,
    }),
    [products],
  );

  useEffect(() => {
    let isMounted = true;

    loadCatalog().finally(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [auth.user]);

  async function loadCatalog() {
    try {
      setError(null);

      if (!auth.user) {
        setTenantContext(null);
        setProducts([]);
        return;
      }

      const context = await loadTenantMemberContext();
      setTenantContext(context);

      if (!context) {
        setProducts([]);
        return;
      }

      const items = await loadManagedHospitalProducts();
      setProducts(items);
    } catch (loadError) {
      setTenantContext(null);
      setProducts([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load catalog.');
    }
  }

  function updateDraft(field: keyof HospitalProductDraft, value: string | boolean) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function refreshProducts() {
    try {
      setError(null);

      if (!tenantContext) {
        await loadCatalog();
        return;
      }

      const items = await loadManagedHospitalProducts();
      setProducts(items);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load catalog.');
    }
  }

  async function saveDraft() {
    if (!canSave || isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setMessage(null);
      const result = await saveCatalogProduct(draft, editingProduct?.id);
      setProducts((current) => [result.product, ...current.filter((product) => product.id !== result.product.id)]);
      setEditingProduct(result.product);
      setDraft(draftFromProduct(result.product));
      setMessage(`Saved ${result.product.title} as ${result.catalogKey}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save product.');
    } finally {
      setIsSaving(false);
    }
  }

  function chooseProductImage() {
    if (!canEditCatalog) {
      setError('Only tenant admins can upload product images.');
      return;
    }

    if (typeof document === 'undefined') {
      setError('Image upload is available in the web admin. Paste a hosted image URL for this build.');
      return;
    }

    const input = document.createElement('input');
    input.accept = 'image/jpeg,image/png,image/webp';
    input.type = 'file';
    input.onchange = () => {
      void uploadSelectedProductImage(input.files?.item(0) ?? null);
    };
    input.click();
  }

  async function uploadSelectedProductImage(file: (Blob & { name?: string; type?: string }) | null) {
    if (!file || isUploadingImage) {
      return;
    }

    if (!file.type?.startsWith('image/')) {
      setError('Choose a JPEG, PNG, or WebP image.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('Choose an image under 8 MB.');
      return;
    }

    try {
      setIsUploadingImage(true);
      setError(null);
      setMessage(null);
      const result = await uploadProductImage(file, editingProduct?.id);
      updateDraft('imageUrl', result.publicUrl);
      setMessage(`Uploaded product image to ${result.path}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload product image.');
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function changeStatus(product: HospitalProduct, nextStatus: HospitalProductStatus) {
    if (busyProductId || !canEditCatalog) {
      return;
    }

    try {
      setBusyProductId(product.id);
      setError(null);
      setMessage(null);
      const updatedProduct = await updateHospitalProductStatus(product, nextStatus);
      setProducts((current) => current.map((item) => (item.id === updatedProduct.id ? updatedProduct : item)));
      if (editingProduct?.id === updatedProduct.id) {
        setEditingProduct(updatedProduct);
      }
      setMessage(`${updatedProduct.title} is now ${nextStatus}.`);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update product status.');
    } finally {
      setBusyProductId(null);
    }
  }

  function editProduct(product: HospitalProduct) {
    setEditingProduct(product);
    setDraft(draftFromProduct(product));
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setEditingProduct(null);
    setDraft(emptyDraft);
    setMessage(null);
    setError(null);
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.topBar, !isWide ? styles.topBarStack : null]}>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>MiraCare v2 Phase 1</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              Tenant: {tenantContext?.display_name ?? defaultTenantSlug}
              {tenantContext ? ` (${tenantContext.role})` : ''}
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable disabled={isLoading} onPress={refreshProducts} style={[styles.secondaryButton, isLoading ? styles.disabled : null]}>
              <Text style={styles.secondaryButtonText}>{isLoading ? 'Refreshing' : 'Refresh'}</Text>
            </Pressable>
            <Link href="/" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Product Overview</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {!auth.session ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Signed-in tenant admin required</Text>
            <Text style={styles.noticeBody}>Use a tenant admin account for catalog changes.</Text>
            <Link href="/" asChild>
              <Pressable style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>Sign In</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}

        {auth.session && !tenantContext && !isLoading ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Tenant membership required</Text>
            <Text style={styles.noticeBody}>This admin route is available only to accounts listed in tenant_members.</Text>
          </View>
        ) : null}

        {tenantContext && !canEditCatalog ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Read-only catalog access</Text>
            <Text style={styles.noticeBody}>Only tenant_admin or superadmin roles can create, upload, archive, or restore products.</Text>
          </View>
        ) : null}

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.formPane}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>{editingProduct ? 'Edit Product' : 'New Product'}</Text>
                <Text style={styles.panelMeta}>{editingProduct ? `Key: ${editingProduct.catalogKey}` : 'Catalog key generated on save'}</Text>
              </View>
              {editingProduct ? (
                <Pressable onPress={resetForm} style={styles.textButton}>
                  <Text style={styles.textButtonLabel}>New</Text>
                </Pressable>
              ) : null}
            </View>

            <Field label="Name" onChangeText={(value) => updateDraft('title', value)} value={draft.title} />
            <Field label="Description" multiline onChangeText={(value) => updateDraft('description', value)} value={draft.description} />
            <View style={styles.twoColumn}>
              <Field label="Price THB" onChangeText={(value) => updateDraft('priceAmount', value)} value={draft.priceAmount} />
              <View style={styles.imageField}>
                <Text style={styles.fieldLabel}>Image</Text>
                <View style={styles.imageInputRow}>
                  <TextInput
                    onChangeText={(value) => updateDraft('imageUrl', value)}
                    placeholder="Public URL or uploaded product image"
                    placeholderTextColor={MiraDesign.color.muted}
                    style={[styles.input, styles.imageUrlInput]}
                    value={draft.imageUrl ?? ''}
                  />
                  <Pressable
                    disabled={isUploadingImage || !canEditCatalog}
                    onPress={chooseProductImage}
                    style={[styles.uploadButton, isUploadingImage || !canEditCatalog ? styles.disabled : null]}
                  >
                    <Text style={styles.uploadButtonText}>{isUploadingImage ? 'Uploading' : 'Upload'}</Text>
                  </Pressable>
                </View>
                {draft.imageUrl ? (
                  <View style={styles.imagePreviewRow}>
                    <Image source={{ uri: draft.imageUrl }} resizeMode="cover" style={styles.imagePreview} />
                    <Text numberOfLines={2} style={styles.imagePreviewText}>
                      {draft.imageUrl}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Field label="Branch Info" multiline onChangeText={(value) => updateDraft('branchInfo', value)} value={draft.branchInfo ?? ''} />

            <View style={styles.controlGroup}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.segmentRow}>
                {getProductCategories().map((category) => (
                  <Pressable
                    key={category}
                    onPress={() => updateDraft('category', category)}
                    style={[styles.segment, draft.category === category ? styles.segmentActive : null]}
                  >
                    <Text style={[styles.segmentText, draft.category === category ? styles.segmentTextActive : null]}>
                      {getProductCategoryLabel(category)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.controlGroup}>
              <Text style={styles.fieldLabel}>Booking</Text>
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => updateDraft('requiresAppointment', true)}
                  style={[styles.segment, draft.requiresAppointment !== false ? styles.segmentActive : null]}
                >
                  <Text style={[styles.segmentText, draft.requiresAppointment !== false ? styles.segmentTextActive : null]}>
                    Appointment
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => updateDraft('requiresAppointment', false)}
                  style={[styles.segment, draft.requiresAppointment === false ? styles.segmentActive : null]}
                >
                  <Text style={[styles.segmentText, draft.requiresAppointment === false ? styles.segmentTextActive : null]}>
                    Walk-in
                  </Text>
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}

            <Pressable disabled={!canSave || isSaving} onPress={saveDraft} style={[styles.saveButton, !canSave || isSaving ? styles.disabled : null]}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving' : editingProduct ? 'Save Changes' : 'Create Product'}</Text>
            </Pressable>
          </View>

          <View style={styles.listPane}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Products</Text>
                <Text style={styles.panelMeta}>{isLoading ? 'Loading' : `${filteredProducts.length} shown`}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Metric label="Total" value={`${summary.total}`} />
                <Metric label="Active" value={`${summary.active}`} />
                <Metric label="Archived" value={`${summary.archived}`} />
              </View>
            </View>

            <View style={styles.filterBar}>
              <TextInput
                onChangeText={setQuery}
                placeholder="Search name, key, description, branch"
                placeholderTextColor={MiraDesign.color.muted}
                style={styles.searchInput}
                value={query}
              />
              <FilterChips
                activeCategory={categoryFilter}
                activeStatus={statusFilter}
                onCategoryChange={setCategoryFilter}
                onStatusChange={setStatusFilter}
              />
            </View>

            {filteredProducts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No products found</Text>
                <Text style={styles.emptyBody}>Create the first v2 product or adjust the filters.</Text>
              </View>
            ) : (
              filteredProducts.map((product) => (
                <ProductRow
                  key={product.id}
                  disabled={Boolean(busyProductId) || !canEditCatalog}
                  isBusy={busyProductId === product.id}
                  onArchive={() => changeStatus(product, 'archived')}
                  onEdit={() => editProduct(product)}
                  onRestore={() => changeStatus(product, 'active')}
                  product={product}
                  selected={editingProduct?.id === product.id}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function draftFromProduct(product: HospitalProduct): HospitalProductDraft {
  return {
    branchInfo: product.hospitalAddress ?? '',
    category: product.category,
    description: product.description,
    hospitalAddress: product.hospitalAddress ?? '',
    hospitalMapQuery: product.hospitalAddress ?? '',
    hospitalName: product.hospitalName,
    imageUrl: product.imageUrl ?? '',
    priceAmount: `${product.priceAmount}`,
    requiresAppointment: product.requiresAppointment,
    title: product.title,
  };
}

function FilterChips({
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
    <View style={styles.chipGroup}>
      <View style={styles.chipRow}>
        {statusFilters.map((status) => (
          <Pressable
            key={status}
            onPress={() => onStatusChange(status)}
            style={[styles.filterChip, activeStatus === status ? styles.filterChipActive : null]}
          >
            <Text style={[styles.filterChipText, activeStatus === status ? styles.filterChipTextActive : null]}>{status}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => onCategoryChange('all')}
          style={[styles.filterChip, activeCategory === 'all' ? styles.filterChipActive : null]}
        >
          <Text style={[styles.filterChipText, activeCategory === 'all' ? styles.filterChipTextActive : null]}>all</Text>
        </Pressable>
        {getProductCategories().map((category) => (
          <Pressable
            key={category}
            onPress={() => onCategoryChange(category)}
            style={[styles.filterChip, activeCategory === category ? styles.filterChipActive : null]}
          >
            <Text style={[styles.filterChipText, activeCategory === category ? styles.filterChipTextActive : null]}>
              {getProductCategoryLabel(category)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ProductRow({
  disabled,
  isBusy,
  onArchive,
  onEdit,
  onRestore,
  product,
  selected,
}: {
  disabled: boolean;
  isBusy: boolean;
  onArchive: () => void;
  onEdit: () => void;
  onRestore: () => void;
  product: HospitalProduct;
  selected: boolean;
}) {
  const isActive = product.status === 'active';

  return (
    <View style={[styles.productRow, selected ? styles.productRowSelected : null]}>
      <View style={styles.productHead}>
        <View style={styles.productTitleGroup}>
          <Text style={styles.productTitle}>{product.title}</Text>
          <Text style={styles.productKey}>{product.catalogKey}</Text>
        </View>
        <View style={styles.rowPills}>
          <Pill label={product.status} tone={isActive ? 'mint' : 'amber'} />
          <Pill label={getProductCategoryLabel(product.category)} tone="blue" />
        </View>
      </View>
      <Text numberOfLines={2} style={styles.productDescription}>
        {product.description}
      </Text>
      <View style={styles.productMetaGrid}>
        <Meta label="Price" value={`${product.priceAmount.toLocaleString('th-TH')} THB`} />
        <Meta label="Booking" value={product.requiresAppointment ? 'Appointment' : 'Walk-in'} />
        <Meta label="Branch" value={product.hospitalAddress || 'Not set'} />
      </View>
      <View style={styles.productFooter}>
        <Pressable onPress={onEdit} style={styles.editButton}>
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
        {isActive ? (
          <Pressable disabled={disabled} onPress={onArchive} style={[styles.dangerButton, disabled ? styles.disabled : null]}>
            <Text style={styles.dangerButtonText}>{isBusy ? 'Archiving' : 'Archive'}</Text>
          </Pressable>
        ) : (
          <Pressable disabled={disabled} onPress={onRestore} style={[styles.restoreButton, disabled ? styles.disabled : null]}>
            <Text style={styles.restoreButtonText}>{isBusy ? 'Restoring' : 'Restore'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Field({
  label,
  multiline = false,
  onChangeText,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor={MiraDesign.color.muted}
        style={[styles.input, multiline ? styles.multilineInput : null]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
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
      <Text numberOfLines={1} style={styles.metaValue}>
        {value}
      </Text>
    </View>
  );
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
    justifyContent: 'center',
    minHeight: 44,
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
    justifyContent: 'center',
    minHeight: 44,
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
    justifyContent: 'center',
    minHeight: 38,
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
  formPane: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 0.8,
    gap: 14,
    padding: 18,
    width: '100%',
    ...softShadow,
  },
  listPane: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1.2,
    gap: 14,
    padding: 18,
    width: '100%',
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  panelMeta: {
    color: MiraDesign.color.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 3,
  },
  textButton: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  textButtonLabel: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  field: {
    flex: 1,
    gap: 6,
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
  multilineInput: {
    minHeight: 92,
    paddingTop: 12,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 12,
  },
  imageField: {
    flex: 1,
    gap: 6,
  },
  imageInputRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  imageUrlInput: {
    flex: 1,
  },
  uploadButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primaryDeep,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  imagePreviewRow: {
    alignItems: 'center',
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 8,
  },
  imagePreview: {
    backgroundColor: '#EAF3F2',
    borderRadius: 6,
    height: 52,
    width: 70,
  },
  imagePreviewText: {
    color: MiraDesign.color.inkSoft,
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  controlGroup: {
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
    justifyContent: 'center',
    minHeight: 36,
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
  saveButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
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
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  metric: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 82,
    padding: 10,
  },
  metricLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  filterBar: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  chipGroup: {
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: MiraDesign.color.primary,
    borderColor: MiraDesign.color.primary,
  },
  filterChipText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
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
  productRowSelected: {
    borderColor: MiraDesign.color.primary,
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
  productKey: {
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
    minWidth: 130,
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
  productFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 88,
    paddingHorizontal: 12,
  },
  editButtonText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#FFE8E8',
    borderColor: '#F7B9BA',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
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
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 102,
    paddingHorizontal: 12,
  },
  restoreButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});
