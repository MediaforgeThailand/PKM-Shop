import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps, ReactNode } from 'react';
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

type SymbolName = ComponentProps<typeof SymbolView>['name'];

const statusFilters = ['all', 'active', 'draft', 'pending_review', 'rejected', 'archived'] as const;

type StatusFilter = (typeof statusFilters)[number];

function statusFilterLabel(status: StatusFilter) {
  if (status === 'active') {
    return 'เปิดขาย';
  }

  if (status === 'draft') {
    return 'Draft';
  }

  if (status === 'pending_review') {
    return 'รอตรวจ';
  }

  if (status === 'rejected') {
    return 'ไม่ผ่าน';
  }

  if (status === 'archived') {
    return 'เก็บถาวร';
  }

  return 'ทั้งหมด';
}

function productStatusLabel(status: HospitalProductStatus) {
  if (status === 'active') {
    return 'active';
  }

  if (status === 'draft') {
    return 'draft';
  }

  if (status === 'pending_review') {
    return 'pending review';
  }

  if (status === 'rejected') {
    return 'rejected';
  }

  return 'archived';
}

export function CatalogCrud({ title = 'จัดการแค็ตตาล็อก' }: { title?: string }) {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState<HospitalProductDraft>(emptyDraft);
  const [editingProduct, setEditingProduct] = useState<HospitalProduct | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
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
      draft: products.filter((product) => product.status === 'draft' || product.status === 'pending_review' || product.status === 'rejected').length,
      ragLive: products.filter((product) => product.status === 'active' && product.ragEmbeddingStatus === 'embedded').length,
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
    setIsEditorOpen(true);
    setDraft(draftFromProduct(product));
    setMessage(null);
    setError(null);
  }

  function openNewProduct() {
    setEditingProduct(null);
    setIsEditorOpen(true);
    setDraft(emptyDraft);
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setEditingProduct(null);
    setIsEditorOpen(true);
    setDraft(emptyDraft);
    setMessage(null);
    setError(null);
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.topBar, !isWide ? styles.topBarStack : null]}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>จัดการสินค้าโรงพยาบาล</Text>
            <Text style={styles.subtitle}>
              ค้นหา เปิด/ปิดสินค้า และสร้าง referral code ราย product สำหรับพาร์ทเนอร์ hospital portal
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable disabled={isLoading} onPress={refreshProducts} style={[styles.secondaryButton, isLoading ? styles.disabled : null]}>
              <SymbolView name={{ android: 'refresh', ios: 'arrow.clockwise', web: 'refresh' }} size={18} tintColor={MiraDesign.color.showcaseBlue} />
              <Text style={styles.secondaryButtonText}>{isLoading ? 'กำลังรีเฟรช' : 'Refresh'}</Text>
            </Pressable>
            {canEditCatalog ? (
              <Pressable
                disabled={isBulkSyncing || busyProductId !== null || stripeSyncTargets.length === 0}
                onPress={syncMissingStripeProducts}
                style={[styles.secondaryButton, isBulkSyncing || busyProductId !== null || stripeSyncTargets.length === 0 ? styles.disabled : null]}
              >
                <Text style={styles.secondaryButtonText}>
                  {isBulkSyncing ? 'กำลังซิงก์ Stripe' : `ซิงก์ Stripe (${stripeSyncTargets.length})`}
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={openNewProduct} style={styles.primaryButton}>
              <SymbolView name={{ android: 'add', ios: 'plus', web: 'add' }} size={20} tintColor="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Add product</Text>
            </Pressable>
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
            <Text style={styles.noticeTitle}>ต้องมีสิทธิ์ใน tenant</Text>
            <Text style={styles.noticeBody}>บัญชีที่อยู่ใน tenant_members เท่านั้นที่จะใช้หน้าแอดมินนี้ได้</Text>
          </View>
        ) : null}

        {tenantContext && !canEditCatalog ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>สิทธิ์อ่านอย่างเดียว</Text>
            <Text style={styles.noticeBody}>เฉพาะ tenant_admin หรือ superadmin เท่านั้นที่สร้าง อัปโหลด archive หรือ restore สินค้าได้</Text>
          </View>
        ) : null}

        <View style={styles.statsGrid}>
          <StatCard
            detail="รายการทั้งหมด"
            icon={{ android: 'deployed_code', ios: 'cube', web: 'deployed_code' }}
            label="TOTAL PRODUCTS"
            tone="blue"
            value={`${summary.total}`}
          />
          <StatCard
            detail="กำลังใช้งาน"
            icon={{ android: 'check_circle', ios: 'checkmark.circle', web: 'check_circle' }}
            label="ACTIVE PRODUCTS"
            tone="mint"
            value={`${summary.active}`}
          />
          <StatCard
            detail="ถูกเก็บถาวร"
            icon={{ android: 'inventory_2', ios: 'archivebox', web: 'inventory_2' }}
            label="ARCHIVED"
            tone="violet"
            value={`${summary.archived}`}
          />
          <StatCard
            action={
              <Link href={{ pathname: '/package-detail', params: { tour: 'admin' } }} asChild>
                <Pressable style={styles.statAction}>
                  <SymbolView name={{ android: 'phone_iphone', ios: 'iphone', web: 'phone_iphone' }} size={17} tintColor={MiraDesign.color.showcaseBlue} />
                  <Text style={styles.statActionText}>Open mobile catalog</Text>
                </Pressable>
              </Link>
            }
            detail="กำลังเชื่อมต่อ"
            icon={{ android: 'sensors', ios: 'dot.radiowaves.left.and.right', web: 'sensors' }}
            label="RAG LIVE"
            tone="orange"
            value={`${summary.ragLive}`}
          />
        </View>

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.sidePane}>
            <View style={styles.filterPanel}>
              <Text style={styles.sideTitle}>ค้นหาสินค้า</Text>
              <View style={styles.searchBox}>
                <SymbolView name={{ android: 'search', ios: 'magnifyingglass', web: 'search' }} size={19} tintColor={MiraDesign.color.showcaseNavySoft} />
                <TextInput
                  onChangeText={setQuery}
                  placeholder="ชื่อสินค้า โรงพยาบาล หมวดหมู่ หรือ tag"
                  placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                  style={styles.searchInput}
                  value={query}
                />
              </View>
            </View>

            <View style={styles.filterPanel}>
              <FilterChips
                activeCategory={categoryFilter}
                activeStatus={statusFilter}
                categories={categoryOptions}
                onCategoryChange={setCategoryFilter}
                onStatusChange={setStatusFilter}
              />
            </View>

            {isEditorOpen || editingProduct ? (
              <View style={styles.editorPanel}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>{editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</Text>
                <Text style={styles.panelMeta}>{editingProduct ? `Key: ${editingProduct.catalogKey}` : 'สร้าง catalog key ตอนบันทึก'}</Text>
              </View>
              {editingProduct ? (
                <Pressable onPress={resetForm} style={styles.textButton}>
                  <Text style={styles.textButtonLabel}>รายการใหม่</Text>
                </Pressable>
              ) : null}
            </View>

            <Field label="ชื่อสินค้า" onChangeText={(value) => updateDraft('title', value)} value={draft.title} />
            <Field label="รายละเอียด" multiline onChangeText={(value) => updateDraft('description', value)} value={draft.description} />
            <View style={styles.twoColumn}>
              <Field label="ราคา THB" onChangeText={(value) => updateDraft('priceAmount', value)} value={draft.priceAmount} />
              <View style={styles.imageField}>
                <Text style={styles.fieldLabel}>รูปสินค้า</Text>
                <View style={styles.imageInputRow}>
                  <TextInput
                    onChangeText={(value) => updateDraft('imageUrl', value)}
                    placeholder="Public URL หรือรูปสินค้าที่อัปโหลดแล้ว"
                    placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                    style={[styles.input, styles.imageUrlInput]}
                    value={draft.imageUrl ?? ''}
                  />
                  <Pressable
                    disabled={isUploadingImage || !canEditCatalog}
                    onPress={chooseProductImage}
                    style={[styles.uploadButton, isUploadingImage || !canEditCatalog ? styles.disabled : null]}
                  >
                    <Text style={styles.uploadButtonText}>{isUploadingImage ? 'กำลังอัปโหลด' : 'อัปโหลด'}</Text>
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
                <Text style={styles.legacyTitle}>branch_info เดิม</Text>
                <Text style={styles.legacyBody}>{draft.branchInfo}</Text>
                <Text style={styles.helperText}>ใช้การเลือกสาขาด้านล่างสำหรับ v3 ข้อความเดิมยังถูกเก็บไว้แต่ไม่ถูก parse</Text>
              </View>
            ) : null}

            <View style={styles.controlGroup}>
              <Text style={styles.fieldLabel}>หมวดหมู่</Text>
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
                <Text style={styles.fieldLabel}>เพิ่มหมวดหมู่</Text>
                <View style={styles.categoryAdminRow}>
                  <TextInput
                    onChangeText={(value) => setCategoryDraft((current) => ({ ...current, key: value }))}
                    placeholder="key"
                    placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                    style={[styles.input, styles.compactInput]}
                    value={categoryDraft.key}
                  />
                  <TextInput
                    onChangeText={(value) => setCategoryDraft((current) => ({ ...current, labelTh: value }))}
                    placeholder="label_th"
                    placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                    style={[styles.input, styles.compactInput]}
                    value={categoryDraft.labelTh}
                  />
                  <TextInput
                    onChangeText={(value) => setCategoryDraft((current) => ({ ...current, icon: value }))}
                    placeholder="icon"
                    placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                    style={[styles.input, styles.iconInput]}
                    value={categoryDraft.icon ?? ''}
                  />
                  <Pressable disabled={isSaving} onPress={addCategory} style={[styles.inlineButton, isSaving ? styles.disabled : null]}>
                    <Text style={styles.inlineButtonText}>เพิ่ม</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.controlGroup}>
              <Text style={styles.fieldLabel}>สาขาที่ให้บริการ</Text>
              {branches.length === 0 ? (
                <Text style={styles.helperText}>ยังไม่มีสาขา เพิ่มสาขาก่อนผูกสินค้าเข้ากับสาขา</Text>
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
                            {!branch.active ? ' (ปิดใช้งาน)' : ''}
                          </Text>
                          <Text numberOfLines={2} style={styles.branchOptionMeta}>
                            {[branch.address, branch.district, branch.phone].filter(Boolean).join(' · ') || 'ยังไม่มีที่อยู่'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.controlGroup}>
              <Text style={styles.fieldLabel}>การจอง</Text>
              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => updateDraft('requiresAppointment', true)}
                  style={[styles.segment, draft.requiresAppointment !== false ? styles.segmentActive : null]}
                >
                  <Text style={[styles.segmentText, draft.requiresAppointment !== false ? styles.segmentTextActive : null]}>
                    ต้องนัดหมาย
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => updateDraft('requiresAppointment', false)}
                  style={[styles.segment, draft.requiresAppointment === false ? styles.segmentActive : null]}
                >
                  <Text style={[styles.segmentText, draft.requiresAppointment === false ? styles.segmentTextActive : null]}>
                    Walk-in ได้
                  </Text>
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}

            <Pressable disabled={!canSave || isSaving} onPress={saveDraft} style={[styles.saveButton, !canSave || isSaving ? styles.disabled : null]}>
              <Text style={styles.saveButtonText}>{isSaving ? 'กำลังบันทึก' : editingProduct ? 'บันทึกสินค้า' : 'สร้างสินค้า'}</Text>
            </Pressable>
              </View>
            ) : (
              <ReferralWorkspaceCard tenantName={tenantContext?.display_name ?? defaultTenantSlug} />
            )}
          </View>

          <View style={styles.listPane}>
            <View style={[styles.inventoryHeader, !isWide ? styles.inventoryHeaderStack : null]}>
              <View>
                <Text style={styles.inventoryTitle}>Product inventory</Text>
                <Text style={styles.inventoryMeta}>{isLoading ? 'กำลังโหลดสินค้า' : `${filteredProducts.length} demo products`}</Text>
              </View>
              <View style={styles.inventoryActions}>
                <Link href="/admin/referrers" asChild>
                  <Pressable style={styles.secondaryButton}>
                    <SymbolView name={{ android: 'person_add', ios: 'person.badge.plus', web: 'person_add' }} size={18} tintColor={MiraDesign.color.showcaseBlue} />
                    <Text style={styles.secondaryButtonText}>Referral</Text>
                  </Pressable>
                </Link>
                <Pressable onPress={refreshProducts} style={styles.secondaryButton}>
                  <SymbolView name={{ android: 'database', ios: 'cylinder.split.1x2', web: 'database' }} size={18} tintColor={MiraDesign.color.showcaseNavySoft} />
                  <Text style={styles.secondaryButtonText}>Mock data</Text>
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}

            {filteredProducts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>ไม่พบสินค้า</Text>
                <Text style={styles.emptyBody}>สร้างสินค้าแรก หรือปรับตัวกรองใหม่</Text>
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

function StatCard({
  action,
  detail,
  icon,
  label,
  tone,
  value,
}: {
  action?: ReactNode;
  detail: string;
  icon: SymbolName;
  label: string;
  tone: 'blue' | 'mint' | 'orange' | 'violet';
  value: string;
}) {
  const toneStyle = {
    blue: styles.statIconBlue,
    mint: styles.statIconMint,
    orange: styles.statIconOrange,
    violet: styles.statIconViolet,
  }[tone];
  const iconColor = {
    blue: MiraDesign.color.showcaseBlue,
    mint: '#0F9F72',
    orange: '#F97316',
    violet: '#6D28D9',
  }[tone];

  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, toneStyle]}>
        <SymbolView name={icon} size={34} tintColor={iconColor} />
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statDetail}>{detail}</Text>
      </View>
      {action ? <View style={styles.statCardAction}>{action}</View> : null}
    </View>
  );
}

function ReferralWorkspaceCard({ tenantName }: { tenantName: string }) {
  return (
    <View style={styles.referralPanel}>
      <View style={styles.referralHeader}>
        <View>
          <Text style={styles.referralTitle}>REFERRAL WORKSPACE</Text>
          <Text style={styles.referralLink}>staff portal mockup</Text>
        </View>
        <Text style={styles.waitingBadge}>Waiting</Text>
      </View>
      <View style={styles.referralCallout}>
        <SymbolView name={{ android: 'person_add', ios: 'person.badge.plus', web: 'person_add' }} size={26} tintColor={MiraDesign.color.showcaseBlue} />
        <View style={styles.referralCopy}>
          <Text style={styles.referralCalloutTitle}>เลือก product จาก inventory</Text>
          <Text style={styles.referralBody}>นำไปเลือกใช้กับหน้า product จะเป็น code ที่ผูกกับ {tenantName} และพาร์ทเนอร์รายนั้นๆ</Text>
        </View>
      </View>
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
      <Text style={styles.fieldLabel}>สถานะ</Text>
      <View style={styles.chipRow}>
        {statusFilters.map((status) => (
          <Pressable
            key={status}
            onPress={() => onStatusChange(status)}
            style={[styles.filterChip, activeStatus === status ? styles.filterChipActive : null]}
          >
            <Text style={[styles.filterChipText, activeStatus === status ? styles.filterChipTextActive : null]}>{statusFilterLabel(status)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.fieldLabel}>หมวดหมู่</Text>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => onCategoryChange('all')}
          style={[styles.filterChip, activeCategory === 'all' ? styles.filterChipActive : null]}
        >
          <Text style={[styles.filterChipText, activeCategory === 'all' ? styles.filterChipTextActive : null]}>ทุกหมวด</Text>
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
  const ragStatus = getRagStatus(product);
  const tags = (product.tags.length > 0 ? product.tags : product.includes).slice(0, 3);

  return (
    <View style={[styles.productRow, selected ? styles.productRowSelected : null]}>
      <View style={styles.productHero}>
        <ProductVisual product={product} />
        <View style={styles.productMain}>
          <View style={styles.productHead}>
            <View style={styles.productTitleGroup}>
              <Text style={styles.productTitle}>{product.title}</Text>
              <Text style={styles.productKey}>{product.hospitalName || 'Mira Partner Hospital'}</Text>
            </View>
            <View style={styles.rowPills}>
              <Pill label="demo" tone="blue" />
              <Pill label={productStatusLabel(product.status)} tone={isActive ? 'mint' : 'amber'} />
              <Pill label={ragStatus.label} tone={ragStatus.tone} />
            </View>
          </View>
          <Text numberOfLines={2} style={styles.productDescription}>
            {product.description}
          </Text>
          {tags.length > 0 ? (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <Text key={tag} numberOfLines={1} style={styles.tagPill}>
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.productMetaGrid}>
        <Meta icon={{ android: 'category', ios: 'tag', web: 'category' }} label="CATEGORY" value={productCategoryLabel} />
        <Meta icon={{ android: 'sell', ios: 'tag', web: 'sell' }} label="PRICE" value={`${product.priceAmount.toLocaleString('th-TH')} THB`} />
        <Meta icon={{ android: 'percent', ios: 'percent', web: 'percent' }} label="COMMISSION" value={`${Math.round(product.commissionRate * 100)}%`} />
        <Meta icon={{ android: 'calendar_month', ios: 'calendar', web: 'calendar_month' }} label="CREATED" value={formatShortDate(product.createdAt)} />
        <Meta icon={{ android: 'deployed_code', ios: 'cube', web: 'deployed_code' }} label="RAG CHUNK" value={product.ragChunkId ?? 'not published'} />
        <Meta icon={{ android: 'database', ios: 'cylinder.split.1x2', web: 'database' }} label="EMBEDDING" value={product.ragEmbeddingModel ?? stripeStatus.label} />
      </View>
      <View style={styles.productBottom}>
        <Text numberOfLines={1} style={styles.productLocation}>
          {branchNames || product.hospitalAddress || 'ยังไม่ผูกสาขา'}
        </Text>
        <View style={styles.productFooter}>
          <Pressable onPress={onEdit} style={styles.editButton}>
            <SymbolView name={{ android: 'edit', ios: 'pencil', web: 'edit' }} size={17} tintColor={MiraDesign.color.showcaseBlue} />
            <Text style={styles.editButtonText}>แก้ไข</Text>
          </Pressable>
          <Pressable disabled={disabled} onPress={onSyncStripe} style={[styles.stripeButton, disabled ? styles.disabled : null]}>
            <SymbolView name={{ android: 'database', ios: 'cylinder.split.1x2', web: 'database' }} size={17} tintColor={MiraDesign.color.showcaseNavySoft} />
            <Text style={styles.stripeButtonText}>
              {isBusy ? 'กำลังซิงก์' : product.stripeProductId && product.stripePriceId ? 'Mock data' : 'ซิงก์ Stripe'}
            </Text>
          </Pressable>
          {isActive ? (
            <Pressable disabled={disabled} onPress={onArchive} style={[styles.dangerButton, disabled ? styles.disabled : null]}>
              <Text style={styles.dangerButtonText}>{isBusy ? 'กำลังเก็บ' : 'เก็บถาวร'}</Text>
            </Pressable>
          ) : (
            <Pressable disabled={disabled} onPress={onRestore} style={[styles.restoreButton, disabled ? styles.disabled : null]}>
              <Text style={styles.restoreButtonText}>{isBusy ? 'กำลังกู้คืน' : 'กู้คืน'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function ProductVisual({ product }: { product: HospitalProduct }) {
  if (product.imageUrl) {
    return <Image source={{ uri: product.imageUrl }} resizeMode="cover" style={styles.productImage} />;
  }

  return (
    <View style={styles.productIconBox}>
      <SymbolView name={categoryIcon(product.category)} size={58} tintColor={MiraDesign.color.showcaseBlue} />
    </View>
  );
}

function getStripeStatus(product: HospitalProduct): { label: string; tone: 'amber' | 'blue' | 'danger' | 'mint' } {
  if (product.stripeProductId && product.stripePriceId) {
    return {
      label: 'ซิงก์แล้ว',
      tone: 'mint',
    };
  }

  if (product.stripeProductId && !product.stripePriceId) {
    return {
      label: 'ขาดราคา Stripe',
      tone: 'danger',
    };
  }

  return {
    label: 'ยังไม่ซิงก์',
    tone: 'amber',
  };
}

function getRagStatus(product: HospitalProduct): { label: string; tone: 'amber' | 'blue' | 'danger' | 'mint' } {
  if (product.ragEmbeddingStatus === 'embedded' && product.ragStatus === 'published') {
    return { label: 'RAG embedded', tone: 'mint' };
  }

  if (product.ragEmbeddingStatus === 'error' || product.ragStatus === 'error') {
    return { label: 'RAG error', tone: 'danger' };
  }

  if (product.ragEmbeddingStatus === 'pending' || product.ragStatus === 'pending_review') {
    return { label: 'RAG pending', tone: 'amber' };
  }

  return { label: 'No RAG', tone: 'amber' };
}

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function categoryIcon(category: ProductCategory): SymbolName {
  if (category === 'vaccine') {
    return { android: 'vaccines', ios: 'syringe', web: 'vaccines' };
  }

  if (category === 'imaging') {
    return { android: 'monitor_heart', ios: 'waveform.path.ecg', web: 'monitor_heart' };
  }

  if (category === 'consult') {
    return { android: 'stethoscope', ios: 'stethoscope', web: 'stethoscope' };
  }

  return { android: 'water_drop', ios: 'drop', web: 'water_drop' };
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
        placeholderTextColor={MiraDesign.color.showcaseNavySoft}
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

function Meta({ icon, label, value }: { icon: SymbolName; label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <SymbolView name={icon} size={23} tintColor={MiraDesign.color.showcaseBlue} />
      <View style={styles.metaCopy}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.metaValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F6FAFF',
    flex: 1,
  },
  container: {
    gap: 16,
    padding: 30,
    paddingBottom: 56,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'space-between',
  },
  topBarStack: {
    flexDirection: 'column',
  },
  titleGroup: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  subtitle: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 760,
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlue,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: MiraDesign.color.showcaseBlueDeep,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 18,
    minHeight: 124,
    minWidth: 230,
    padding: 20,
    ...softShadow,
  },
  statIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 86,
    justifyContent: 'center',
    width: 86,
  },
  statIconBlue: {
    backgroundColor: '#EAF2FF',
  },
  statIconMint: {
    backgroundColor: '#E7F8F2',
  },
  statIconOrange: {
    backgroundColor: '#FFF1E4',
  },
  statIconViolet: {
    backgroundColor: '#F0EAFE',
  },
  statCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  statLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '900',
  },
  statValue: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  statDetail: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    fontWeight: '800',
  },
  statCardAction: {
    alignSelf: 'flex-start',
  },
  statAction: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  statActionText: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 12,
    fontWeight: '900',
  },
  workspace: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  workspaceStack: {
    flexDirection: 'column',
  },
  sidePane: {
    gap: 12,
    maxWidth: '100%',
    width: 376,
  },
  filterPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    ...softShadow,
  },
  sideTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 16,
    fontWeight: '900',
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  editorPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    ...softShadow,
  },
  referralPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    ...softShadow,
  },
  referralHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  referralTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    fontWeight: '900',
  },
  referralLink: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 8,
  },
  waitingBadge: {
    backgroundColor: '#FFF2D8',
    borderRadius: 8,
    color: '#B7791F',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  referralCallout: {
    alignItems: 'flex-start',
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  referralCopy: {
    flex: 1,
    gap: 8,
  },
  referralCalloutTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 15,
    fontWeight: '900',
  },
  referralBody: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    lineHeight: 20,
  },
  formPane: {
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flex: 0.8,
    gap: 14,
    padding: 18,
    width: '100%',
    ...softShadow,
  },
  listPane: {
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 14,
    padding: 14,
    width: '100%',
    ...softShadow,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 18,
    fontWeight: '900',
  },
  panelMeta: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 3,
  },
  inventoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  inventoryHeaderStack: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  inventoryTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  inventoryMeta: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 6,
  },
  inventoryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
  },
  textButton: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  textButtonLabel: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  field: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  fieldLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    color: MiraDesign.color.showcaseNavy,
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
    flexWrap: 'wrap',
    gap: 12,
  },
  imageField: {
    flex: 1,
    gap: 6,
    minWidth: 220,
  },
  imageInputRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageUrlInput: {
    flex: 1,
    minWidth: 220,
  },
  uploadButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: MiraDesign.color.showcaseBlueDeep,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 112,
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
    borderColor: MiraDesign.color.showcaseLine,
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
    color: MiraDesign.color.showcaseNavySoft,
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
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderWidth: 1,
  },
  segmentText: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: MiraDesign.color.showcaseBlueDeep,
  },
  inlineAdminPanel: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.showcaseLine,
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
    backgroundColor: MiraDesign.color.showcaseBlueDeep,
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
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 10,
  },
  branchOptionActive: {
    backgroundColor: '#E7F4ED',
    borderColor: MiraDesign.color.showcaseBlue,
  },
  branchOptionInactive: {
    opacity: 0.65,
  },
  radioDot: {
    borderColor: MiraDesign.color.showcaseNavySoft,
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    width: 16,
  },
  radioDotActive: {
    backgroundColor: MiraDesign.color.showcaseBlue,
    borderColor: MiraDesign.color.showcaseBlue,
  },
  branchOptionCopy: {
    flex: 1,
    gap: 3,
  },
  branchOptionTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    fontWeight: '900',
  },
  branchOptionMeta: {
    color: MiraDesign.color.showcaseNavySoft,
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
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  helperText: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    lineHeight: 17,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlue,
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
    color: MiraDesign.color.showcaseBlueDeep,
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
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 82,
    padding: 10,
  },
  metricLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  filterBar: {
    gap: 10,
  },
  searchInput: {
    color: MiraDesign.color.showcaseNavy,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 0,
  },
  chipGroup: {
    gap: 11,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: MiraDesign.color.showcaseBlue,
    borderColor: MiraDesign.color.showcaseBlue,
  },
  filterChipText: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  emptyState: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  emptyTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyBody: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    lineHeight: 19,
  },
  productRow: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    padding: 18,
    ...softShadow,
  },
  productRowSelected: {
    borderColor: MiraDesign.color.showcaseBlue,
  },
  productHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  productHero: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 20,
  },
  productMain: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  productImage: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: 8,
    height: 104,
    width: 104,
  },
  productIconBox: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: 8,
    height: 104,
    justifyContent: 'center',
    width: 104,
  },
  productTitleGroup: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  productTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  productKey: {
    color: MiraDesign.color.showcaseBlueDeep,
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
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    lineHeight: 19,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: 8,
    color: MiraDesign.color.showcaseBlue,
    fontSize: 11,
    fontWeight: '900',
    maxWidth: 150,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  productMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaCell: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    minHeight: 58,
    minWidth: 184,
    padding: 10,
  },
  metaCopy: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  productFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  productBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  productLocation: {
    color: MiraDesign.color.showcaseNavySoft,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 220,
  },
  stripePanel: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 10,
  },
  stripeId: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 11,
    fontWeight: '800',
  },
  stripeButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 122,
    paddingHorizontal: 12,
  },
  stripeButtonText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 88,
    paddingHorizontal: 12,
  },
  editButtonText: {
    color: MiraDesign.color.showcaseBlueDeep,
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
    backgroundColor: MiraDesign.color.showcaseBlue,
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
