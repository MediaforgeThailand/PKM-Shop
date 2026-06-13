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
  hasStripeCatalogMapping,
  loadBranches,
  loadTenantMemberContext,
  loadManagedHospitalProducts,
  loadProductCategories,
  saveCatalogProduct,
  saveProductCategory,
  shouldSyncCatalogStatusToStripe,
  syncHospitalProductToStripe,
  updateHospitalProductStatus,
  uploadProductImage,
  type BranchSummary,
  type HospitalProduct,
  type HospitalProductDraft,
  type HospitalProductStatus,
  type ProductCategory,
  type ProductCategoryDraft,
  type ProductCategoryOption,
  type TenantMemberContext,
} from '@/lib/marketplace/hospitalProducts';
import { showcaseDemoBranches, showcaseDemoCategories, showcaseDemoProducts, showcaseDemoTenantContext } from '@/lib/showcase/demoFixtures';

const emptyDraft: HospitalProductDraft = {
  branchInfo: '',
  branchIds: [],
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
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [categories, setCategories] = useState<ProductCategoryOption[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<ProductCategoryDraft>({
    active: true,
    icon: '',
    key: '',
    labelTh: '',
    sort: '',
  });
  const [products, setProducts] = useState<HospitalProduct[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [tenantContext, setTenantContext] = useState<TenantMemberContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isWide = width >= 1080;
  const isDemoMode = !auth.session;
  const canEditCatalog = Boolean(auth.session) && canWriteTenantCatalog(tenantContext);
  const canSave =
    canEditCatalog &&
    draft.title.trim().length > 1 &&
    draft.description.trim().length > 3 &&
    Number(draft.priceAmount.replace(/,/g, '')) >= 0;
  const categoryOptions = useMemo<ProductCategoryOption[]>(
    () =>
      categories.length > 0
        ? categories
        : getProductCategories().map((category, index) => ({
            active: true,
            icon: null,
            imageUrl: null,
            key: category,
            labelTh: getProductCategoryLabel(category),
            sort: index,
          })),
    [categories],
  );
  const activeCategoryOptions = useMemo(() => categoryOptions.filter((category) => category.active), [categoryOptions]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      const categoryLabel = categoryOptions.find((category) => category.key === product.category)?.labelTh ?? getProductCategoryLabel(product.category);
      const searchText = [
        product.title,
        product.catalogKey,
        product.description,
        product.hospitalName,
        product.hospitalAddress,
        product.category,
        categoryLabel,
        ...product.branches.flatMap((branch) => [branch.name, branch.address, branch.district]),
      ]
        .join(' ')
        .toLowerCase();

      return matchesStatus && matchesCategory && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [categoryFilter, categoryOptions, products, query, statusFilter]);

  const summary = useMemo(
    () => ({
      active: products.filter((product) => product.status === 'active').length,
      archived: products.filter((product) => product.status === 'archived').length,
      stripeMissing: products.filter((product) => product.status === 'active' && !hasStripeCatalogMapping(product)).length,
      total: products.length,
    }),
    [products],
  );
  const stripeSyncTargets = useMemo(
    () => products.filter((product) => product.status === 'active' && !hasStripeCatalogMapping(product)),
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
        setTenantContext(showcaseDemoTenantContext);
        setProducts(showcaseDemoProducts);
        setBranches(showcaseDemoBranches);
        setCategories(showcaseDemoCategories);
        return;
      }

      const context = await loadTenantMemberContext();
      setTenantContext(context);

      if (!context) {
        setProducts([]);
        setBranches([]);
        setCategories([]);
        return;
      }

      const [items, branchList, categoryList] = await Promise.all([
        loadManagedHospitalProducts(),
        loadBranches(),
        loadProductCategories(),
      ]);
      setProducts(items);
      setBranches(branchList);
      setCategories(categoryList);
    } catch (loadError) {
      setTenantContext(null);
      setProducts([]);
      setBranches([]);
      setCategories([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load catalog.');
    }
  }

  function updateDraft<K extends keyof HospitalProductDraft>(field: K, value: HospitalProductDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleDraftBranch(branchId: string) {
    setDraft((current) => {
      const currentIds = current.branchIds ?? [];
      const nextIds = currentIds.includes(branchId) ? currentIds.filter((id) => id !== branchId) : [...currentIds, branchId];

      return {
        ...current,
        branchIds: nextIds,
      };
    });
  }

  async function refreshProducts() {
    try {
      setError(null);

      if (isDemoMode) {
        setTenantContext(showcaseDemoTenantContext);
        setProducts(showcaseDemoProducts);
        setBranches(showcaseDemoBranches);
        setCategories(showcaseDemoCategories);
        setMessage('กำลังแสดงข้อมูลตัวอย่างอยู่');
        return;
      }

      if (!tenantContext) {
        await loadCatalog();
        return;
      }

      const [items, branchList, categoryList] = await Promise.all([
        loadManagedHospitalProducts(),
        loadBranches(),
        loadProductCategories(),
      ]);
      setProducts(items);
      setBranches(branchList);
      setCategories(categoryList);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load catalog.');
    }
  }

  async function addCategory() {
    if (!canEditCatalog) {
      setError('Only tenant admins can add product categories.');
      return;
    }

    if (!categoryDraft.key.trim() || !categoryDraft.labelTh.trim()) {
      setError('Category key and Thai label are required.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setMessage(null);
      const saved = await saveProductCategory(categoryDraft);
      setCategories((current) => [saved, ...current.filter((category) => category.key !== saved.key)].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key)));
      updateDraft('category', saved.key);
      setCategoryDraft({
        active: true,
        icon: '',
        key: '',
        labelTh: '',
        sort: '',
      });
      setMessage(`Added category ${saved.labelTh}.`);
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : 'Unable to add category.');
    } finally {
      setIsSaving(false);
    }
  }

  function mergeProduct(updatedProduct: HospitalProduct, selectProduct = false) {
    setProducts((current) =>
      current.some((product) => product.id === updatedProduct.id)
        ? current.map((product) => (product.id === updatedProduct.id ? updatedProduct : product))
        : [updatedProduct, ...current],
    );

    if (selectProduct || editingProduct?.id === updatedProduct.id) {
      setEditingProduct(updatedProduct);
      setDraft(draftFromProduct(updatedProduct));
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
      mergeProduct(result.product, true);

      try {
        const syncResult = await syncHospitalProductToStripe(result.product);

        mergeProduct(syncResult.product, true);
        setMessage(`Saved ${syncResult.product.title} as ${result.catalogKey}. Auto-synced Stripe: ${syncResult.summary}.`);
      } catch (syncError) {
        setMessage(`Saved ${result.product.title} as ${result.catalogKey}.`);
        setError(syncError instanceof Error ? `Saved product, but Stripe auto-sync failed: ${syncError.message}` : 'Saved product, but Stripe auto-sync failed.');
      }
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
      mergeProduct(updatedProduct);

      if (shouldSyncCatalogStatusToStripe(updatedProduct, nextStatus)) {
        try {
          const syncResult = await syncHospitalProductToStripe(updatedProduct);

          mergeProduct(syncResult.product);
          setMessage(`${syncResult.product.title} is now ${nextStatus}. Auto-synced Stripe: ${syncResult.summary}.`);
        } catch (syncError) {
          setMessage(`${updatedProduct.title} is now ${nextStatus}.`);
          setError(syncError instanceof Error ? `Status saved, but Stripe auto-sync failed: ${syncError.message}` : 'Status saved, but Stripe auto-sync failed.');
        }
      } else {
        setMessage(`${updatedProduct.title} is now ${nextStatus}.`);
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update product status.');
    } finally {
      setBusyProductId(null);
    }
  }

  async function syncStripeProduct(product: HospitalProduct) {
    if (busyProductId || !canEditCatalog) {
      return;
    }

    try {
      setBusyProductId(product.id);
      setError(null);
      setMessage(null);
      const result = await syncHospitalProductToStripe(product);
      mergeProduct(result.product);
      setMessage(`Stripe synced for ${result.product.title}: ${result.summary}.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync product to Stripe.');
    } finally {
      setBusyProductId(null);
    }
  }

  async function syncMissingStripeProducts() {
    if (isBulkSyncing || busyProductId || !canEditCatalog || stripeSyncTargets.length === 0) {
      return;
    }

    try {
      setIsBulkSyncing(true);
      setError(null);
      setMessage(null);
      const syncedProducts: HospitalProduct[] = [];
      const failures: string[] = [];

      for (const product of stripeSyncTargets) {
        try {
          const result = await syncHospitalProductToStripe(product);

          syncedProducts.push(result.product);
        } catch (syncError) {
          const detail = syncError instanceof Error ? syncError.message : 'unknown error';

          failures.push(`${product.title}: ${detail}`);
        }
      }

      if (syncedProducts.length > 0) {
        setProducts((current) =>
          current.map((product) => syncedProducts.find((syncedProduct) => syncedProduct.id === product.id) ?? product),
        );

        const syncedEditingProduct = editingProduct ? syncedProducts.find((product) => product.id === editingProduct.id) : null;

        if (syncedEditingProduct) {
          setEditingProduct(syncedEditingProduct);
          setDraft(draftFromProduct(syncedEditingProduct));
        }
      }

      setMessage(`Stripe auto-sync completed for ${syncedProducts.length}/${stripeSyncTargets.length} active products.`);

      if (failures.length > 0) {
        setError(`Stripe auto-sync failed for ${failures.length} products: ${failures.slice(0, 2).join('; ')}`);
      }
    } finally {
      setIsBulkSyncing(false);
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
            {canEditCatalog ? (
              <Pressable
                disabled={isBulkSyncing || busyProductId !== null || stripeSyncTargets.length === 0}
                onPress={syncMissingStripeProducts}
                style={[styles.secondaryButton, isBulkSyncing || busyProductId !== null || stripeSyncTargets.length === 0 ? styles.disabled : null]}
              >
                <Text style={styles.secondaryButtonText}>
                  {isBulkSyncing ? 'Syncing Stripe' : `Sync missing Stripe (${stripeSyncTargets.length})`}
                </Text>
              </Pressable>
            ) : null}
            <Link href="/admin/branches" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Branches</Text>
              </Pressable>
            </Link>
            <Link href="/" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Product Overview</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {isDemoMode ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>โหมดตัวอย่าง</Text>
            <Text style={styles.noticeBody}>เปิดดู catalog ได้ทันทีโดยไม่ต้องล็อกอิน ปุ่มบันทึก อัปโหลด และ archive จะถูกปิดไว้</Text>
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

            {draft.branchInfo ? (
              <View style={styles.legacyNotice}>
                <Text style={styles.legacyTitle}>Legacy branch_info TODO</Text>
                <Text style={styles.legacyBody}>{draft.branchInfo}</Text>
                <Text style={styles.helperText}>Use branch availability below for v3. Legacy text is preserved but not parsed.</Text>
              </View>
            ) : null}

            <View style={styles.controlGroup}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.segmentRow}>
                {activeCategoryOptions.map((category) => (
                  <Pressable
                    key={category.key}
                    onPress={() => updateDraft('category', category.key)}
                    style={[styles.segment, draft.category === category.key ? styles.segmentActive : null]}
                  >
                    <Text style={[styles.segmentText, draft.category === category.key ? styles.segmentTextActive : null]}>
                      {category.icon ? `${category.icon} ` : ''}
                      {category.labelTh}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {canEditCatalog ? (
              <View style={styles.inlineAdminPanel}>
                <Text style={styles.fieldLabel}>Add Category</Text>
                <View style={styles.categoryAdminRow}>
                  <TextInput
                    onChangeText={(value) => setCategoryDraft((current) => ({ ...current, key: value }))}
                    placeholder="key"
                    placeholderTextColor={MiraDesign.color.muted}
                    style={[styles.input, styles.compactInput]}
                    value={categoryDraft.key}
                  />
                  <TextInput
                    onChangeText={(value) => setCategoryDraft((current) => ({ ...current, labelTh: value }))}
                    placeholder="label_th"
                    placeholderTextColor={MiraDesign.color.muted}
                    style={[styles.input, styles.compactInput]}
                    value={categoryDraft.labelTh}
                  />
                  <TextInput
                    onChangeText={(value) => setCategoryDraft((current) => ({ ...current, icon: value }))}
                    placeholder="icon"
                    placeholderTextColor={MiraDesign.color.muted}
                    style={[styles.input, styles.iconInput]}
                    value={categoryDraft.icon ?? ''}
                  />
                  <Pressable disabled={isSaving} onPress={addCategory} style={[styles.inlineButton, isSaving ? styles.disabled : null]}>
                    <Text style={styles.inlineButtonText}>Add</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.controlGroup}>
              <Text style={styles.fieldLabel}>Branch Availability</Text>
              {branches.length === 0 ? (
                <Text style={styles.helperText}>No branches yet. Add a branch before assigning availability.</Text>
              ) : (
                <View style={styles.branchOptionList}>
                  {branches.map((branch) => {
                    const selected = (draft.branchIds ?? []).includes(branch.id);

                    return (
                      <Pressable
                        key={branch.id}
                        disabled={!canEditCatalog}
                        onPress={() => toggleDraftBranch(branch.id)}
                        style={[styles.branchOption, selected ? styles.branchOptionActive : null, !branch.active ? styles.branchOptionInactive : null]}
                      >
                        <View style={[styles.radioDot, selected ? styles.radioDotActive : null]} />
                        <View style={styles.branchOptionCopy}>
                          <Text style={styles.branchOptionTitle}>
                            {branch.name}
                            {!branch.active ? ' (inactive)' : ''}
                          </Text>
                          <Text numberOfLines={2} style={styles.branchOptionMeta}>
                            {[branch.address, branch.district, branch.phone].filter(Boolean).join(' · ') || 'No address'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
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
                <Metric label="Stripe missing" value={`${summary.stripeMissing}`} />
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
                categories={categoryOptions}
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
                  disabled={Boolean(busyProductId) || isBulkSyncing || !canEditCatalog}
                  isBusy={busyProductId === product.id}
                  onArchive={() => changeStatus(product, 'archived')}
                  onEdit={() => editProduct(product)}
                  onRestore={() => changeStatus(product, 'active')}
                  onSyncStripe={() => syncStripeProduct(product)}
                  product={product}
                  productCategoryLabel={categoryOptions.find((category) => category.key === product.category)?.labelTh ?? getProductCategoryLabel(product.category)}
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
    branchIds: product.branchIds,
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
  categories,
  onCategoryChange,
  onStatusChange,
}: {
  activeCategory: ProductCategory | 'all';
  activeStatus: StatusFilter;
  categories: ProductCategoryOption[];
  onCategoryChange: (category: ProductCategory | 'all') => void;
  onStatusChange: (status: StatusFilter) => void;
}) {
  const activeCategories = categories.filter((category) => category.active);

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
        {activeCategories.map((category) => (
          <Pressable
            key={category.key}
            onPress={() => onCategoryChange(category.key)}
            style={[styles.filterChip, activeCategory === category.key ? styles.filterChipActive : null]}
          >
            <Text style={[styles.filterChipText, activeCategory === category.key ? styles.filterChipTextActive : null]}>
              {category.icon ? `${category.icon} ` : ''}
              {category.labelTh}
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
  onSyncStripe,
  product,
  productCategoryLabel,
  selected,
}: {
  disabled: boolean;
  isBusy: boolean;
  onArchive: () => void;
  onEdit: () => void;
  onRestore: () => void;
  onSyncStripe: () => void;
  product: HospitalProduct;
  productCategoryLabel: string;
  selected: boolean;
}) {
  const isActive = product.status === 'active';
  const branchNames = product.branches.map((branch) => branch.name).join(', ');
  const stripeStatus = getStripeStatus(product);

  return (
    <View style={[styles.productRow, selected ? styles.productRowSelected : null]}>
      <View style={styles.productHead}>
        <View style={styles.productTitleGroup}>
          <Text style={styles.productTitle}>{product.title}</Text>
          <Text style={styles.productKey}>{product.catalogKey}</Text>
        </View>
        <View style={styles.rowPills}>
          <Pill label={product.status} tone={isActive ? 'mint' : 'amber'} />
          <Pill label={productCategoryLabel} tone="blue" />
        </View>
      </View>
      <Text numberOfLines={2} style={styles.productDescription}>
        {product.description}
      </Text>
      <View style={styles.productMetaGrid}>
        <Meta label="Price" value={`${product.priceAmount.toLocaleString('th-TH')} THB`} />
        <Meta label="Booking" value={product.requiresAppointment ? 'Appointment' : 'Walk-in'} />
        <Meta label="Branches" value={branchNames || 'Not assigned'} />
        <Meta label="Stripe" value={stripeStatus.label} />
      </View>
      <View style={styles.stripePanel}>
        <Pill label={stripeStatus.label} tone={stripeStatus.tone} />
        <Text numberOfLines={1} style={styles.stripeId}>
          Product: {product.stripeProductId ?? 'not synced'}
        </Text>
        <Text numberOfLines={1} style={styles.stripeId}>
          Price: {product.stripePriceId ?? 'not synced'}
        </Text>
      </View>
      {product.hospitalAddress ? <Text style={styles.helperText}>Legacy branch_info TODO: {product.hospitalAddress}</Text> : null}
      <View style={styles.productFooter}>
        <Pressable onPress={onEdit} style={styles.editButton}>
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={onSyncStripe} style={[styles.stripeButton, disabled ? styles.disabled : null]}>
          <Text style={styles.stripeButtonText}>
            {isBusy ? 'Syncing' : product.stripeProductId && product.stripePriceId ? 'Re-sync Stripe' : 'Sync Stripe'}
          </Text>
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

function getStripeStatus(product: HospitalProduct): { label: string; tone: 'amber' | 'blue' | 'danger' | 'mint' } {
  if (product.stripeProductId && product.stripePriceId) {
    return {
      label: 'Synced',
      tone: 'mint',
    };
  }

  if (product.stripeProductId && !product.stripePriceId) {
    return {
      label: 'Stripe price missing',
      tone: 'danger',
    };
  }

  return {
    label: 'Not synced',
    tone: 'amber',
  };
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
  inlineAdminPanel: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  categoryAdminRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  compactInput: {
    flex: 1,
    minWidth: 120,
  },
  iconInput: {
    width: 70,
  },
  inlineButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primaryDeep,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  inlineButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  branchOptionList: {
    gap: 8,
  },
  branchOption: {
    alignItems: 'center',
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 10,
  },
  branchOptionActive: {
    backgroundColor: '#E7F4ED',
    borderColor: MiraDesign.color.primary,
  },
  branchOptionInactive: {
    opacity: 0.65,
  },
  radioDot: {
    borderColor: MiraDesign.color.inkSoft,
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    width: 16,
  },
  radioDotActive: {
    backgroundColor: MiraDesign.color.primary,
    borderColor: MiraDesign.color.primary,
  },
  branchOptionCopy: {
    flex: 1,
    gap: 3,
  },
  branchOptionTitle: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  branchOptionMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  legacyNotice: {
    backgroundColor: '#FFF7DD',
    borderColor: '#F3D17B',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  legacyTitle: {
    color: '#6F5100',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  legacyBody: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  helperText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    lineHeight: 17,
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
  stripePanel: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 10,
  },
  stripeId: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  stripeButton: {
    alignItems: 'center',
    backgroundColor: '#EAF3F2',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 122,
    paddingHorizontal: 12,
  },
  stripeButtonText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
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
