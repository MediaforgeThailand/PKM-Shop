import { supabase, supabaseConfigStatus } from '@/lib/supabase';
import type { CatalogCategory, ProductSummary, TenantSummary } from '@/lib/types/api';

export type ProductCategory = CatalogCategory;

export type HospitalProductDraft = {
  branchInfo?: string;
  category?: ProductCategory;
  description: string;
  hospitalAddress: string;
  hospitalLat?: number;
  hospitalLng?: number;
  hospitalMapQuery: string;
  hospitalName: string;
  imageUrl?: string;
  productImageName?: string;
  productImagePreviewUri?: string;
  priceAmount: string;
  requiresAppointment?: boolean;
  title: string;
};

export type DescriptionRagSection = {
  confidence: number;
  content: string;
  key: 'booking' | 'included_items' | 'medical_preparation' | 'overview' | 'safety_review';
  label: string;
};

export type ProductDescriptionAnalysis = {
  bookingGuidance: string;
  extractedIncludes: string[];
  extractedPreparationNotes: string[];
  keywords: string[];
  ragSections: DescriptionRagSection[];
  suggestedTags: string[];
  summary: string;
  warnings: string[];
};

export type ProductClassification = {
  analysis: ProductDescriptionAnalysis;
  category: ProductCategory;
  confidence: number;
  keywords: string[];
  ragCategory: 'marketplace.product';
  riskLevel: 'low' | 'medium';
  tags: string[];
};

export type HospitalProduct = {
  bookingNote?: string | null;
  catalogKey: string;
  category: ProductCategory;
  createdAt: string;
  description: string;
  duration?: string | null;
  hospitalAddress?: string | null;
  hospitalLat?: number | null;
  hospitalLng?: number | null;
  hospitalMapQuery?: string | null;
  hospitalName: string;
  id: string;
  includes: string[];
  imageUrl?: string | null;
  location?: string | null;
  preparationNotes?: string | null;
  priceAmount: number;
  productImageName?: string | null;
  productImagePreviewUri?: string | null;
  ragChunkId?: string | null;
  requiresAppointment: boolean;
  status: 'active' | 'archived';
  tags: string[];
  tenantId: string;
  title: string;
};

export type HospitalProductStatus = HospitalProduct['status'];

export type ProductImageUploadResult = {
  path: string;
  publicUrl: string;
};

export type TenantMemberContext = TenantSummary & {
  role: 'superadmin' | 'tenant_admin' | 'tenant_staff' | string;
};

export type SaveHospitalProductResult = {
  catalogKey: string;
  classification: ProductClassification;
  embedding: RagEmbeddingResult;
  product: HospitalProduct;
  ragChunkId: string;
};

export type RagEmbeddingResult = {
  dimensions?: number;
  message?: string;
  model?: string;
  status: 'embedded' | 'error' | 'skipped';
};

type ProductRow = {
  active: boolean;
  branch_info: string | null;
  catalog_key: string;
  category: string;
  created_at: string;
  description: string;
  id: string;
  image_url: string | null;
  name: string;
  price_baht: number;
  requires_appointment: boolean;
  tenant_id: string;
  tenants?: Pick<TenantSummary, 'display_name'> | Pick<TenantSummary, 'display_name'>[] | null;
  updated_at: string;
};

type TenantRow = TenantSummary;

export const defaultTenantSlug = process.env.EXPO_PUBLIC_MIRA_TENANT_SLUG?.trim() || 'demo-hospital';

const categoryLabels: Record<ProductCategory, string> = {
  checkup: 'Checkup',
  general: 'General',
  vaccine: 'Vaccine',
};

const productCategories = Object.keys(categoryLabels) as ProductCategory[];

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function parsePriceBaht(value: string) {
  return Math.max(0, Math.round(Number(value.replace(/,/g, '')) || 0));
}

function splitList(value: string) {
  return value
    .split(/[\n,;]/)
    .map((item) => compactText(item))
    .filter(Boolean)
    .slice(0, 12);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => compactText(value)).filter(Boolean))];
}

function asCategory(value: string): ProductCategory {
  return productCategories.includes(value as ProductCategory) ? (value as ProductCategory) : 'general';
}

function tenantNameFromJoin(value: ProductRow['tenants']) {
  if (Array.isArray(value)) {
    return value[0]?.display_name ?? 'Tenant catalog';
  }

  return value?.display_name ?? 'Tenant catalog';
}

function sanitizeStorageName(value: string) {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return sanitized || 'product-image';
}

function productSelectColumns() {
  return [
    'id',
    'tenant_id',
    'catalog_key',
    'name',
    'description',
    'price_baht',
    'category',
    'image_url',
    'branch_info',
    'requires_appointment',
    'active',
    'created_at',
    'updated_at',
    'tenants(display_name)',
  ].join(',');
}

function inferCategory(draft: HospitalProductDraft): ProductCategory {
  if (draft.category) {
    return draft.category;
  }

  const searchText = `${draft.title} ${draft.description}`.toLowerCase();

  if (searchText.includes('vaccine') || searchText.includes('vaccination')) {
    return 'vaccine';
  }

  if (searchText.includes('checkup') || searchText.includes('screening') || searchText.includes('blood') || searchText.includes('lab')) {
    return 'checkup';
  }

  return 'general';
}

function deriveIncludes(description: string) {
  return splitList(description)
    .filter((item) => item.length <= 80)
    .slice(0, 6);
}

function toHospitalProduct(row: ProductRow): HospitalProduct {
  const category = asCategory(row.category);
  const tags = unique([categoryLabels[category], row.requires_appointment ? 'Appointment' : 'Walk-in']);

  return {
    bookingNote: row.requires_appointment ? 'Requires appointment' : 'Walk-in allowed',
    catalogKey: row.catalog_key,
    category,
    createdAt: row.created_at,
    description: row.description,
    duration: null,
    hospitalAddress: row.branch_info,
    hospitalLat: null,
    hospitalLng: null,
    hospitalMapQuery: row.branch_info,
    hospitalName: tenantNameFromJoin(row.tenants),
    id: row.id,
    includes: deriveIncludes(row.description),
    imageUrl: row.image_url,
    location: row.branch_info,
    preparationNotes: null,
    priceAmount: row.price_baht,
    productImageName: null,
    productImagePreviewUri: row.image_url,
    ragChunkId: null,
    requiresAppointment: row.requires_appointment,
    status: row.active ? 'active' : 'archived',
    tags,
    tenantId: row.tenant_id,
    title: row.name,
  };
}

async function loadTenant(slug = defaultTenantSlug): Promise<TenantRow | null> {
  if (!supabaseConfigStatus.isConfigured) {
    return null;
  }

  const { data, error } = await supabase
    .from('tenants')
    .select('id,slug,display_name,logo_url')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as TenantRow | null;
}

async function requireTenant(slug = defaultTenantSlug): Promise<TenantRow> {
  const tenant = await loadTenant(slug);

  if (!tenant) {
    throw new Error(`Tenant "${slug}" is not available for this user.`);
  }

  return tenant;
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Sign in with a tenant admin account to manage the catalog.');
  }

  return data.user;
}

export async function loadTenantMemberContext(slug = defaultTenantSlug): Promise<TenantMemberContext | null> {
  if (!supabaseConfigStatus.isConfigured) {
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  const tenant = await loadTenant(slug);

  if (!tenant) {
    throw new Error(`Tenant "${slug}" is not available for this user.`);
  }

  const { data: member, error: memberError } = await supabase
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();

  if (memberError || !member) {
    throw new Error('Your account is not a member of this tenant.');
  }

  return {
    ...tenant,
    role: String((member as { role: string }).role),
  };
}

export function canWriteTenantCatalog(context: TenantMemberContext | null) {
  return context?.role === 'superadmin' || context?.role === 'tenant_admin';
}

export function analyzeProductDescription(draft: HospitalProductDraft, category: ProductCategory = inferCategory(draft)): ProductDescriptionAnalysis {
  const description = compactText(draft.description);
  const extractedIncludes = deriveIncludes(description);
  const extractedPreparationNotes = splitList(description).filter((item) => /fast|prepare|appointment|งด|ยา|แพ้/.test(item.toLowerCase()));
  const summary = description.length > 180 ? `${description.slice(0, 177).trim()}...` : description;
  const suggestedTags = unique([categoryLabels[category], ...extractedIncludes.slice(0, 4)]).slice(0, 8);
  const bookingGuidance = draft.requiresAppointment === false ? 'Walk-in allowed if the tenant confirms availability.' : 'Appointment is required before service.';
  const warnings = description.length < 60 ? ['Description is short; confirm medical and booking details before publishing.'] : [];
  const ragSections: DescriptionRagSection[] = [
    {
      confidence: description.length >= 60 ? 0.82 : 0.55,
      content: summary || draft.title,
      key: 'overview',
      label: 'Overview',
    },
    {
      confidence: extractedIncludes.length > 0 ? 0.72 : 0.4,
      content: extractedIncludes.length ? extractedIncludes.join(', ') : 'No included items were detected from the description.',
      key: 'included_items',
      label: 'Included items',
    },
    {
      confidence: 0.82,
      content: bookingGuidance,
      key: 'booking',
      label: 'Booking',
    },
  ];

  if (warnings.length > 0) {
    ragSections.push({
      confidence: 0.68,
      content: warnings.join(' '),
      key: 'safety_review',
      label: 'Review flag',
    });
  }

  return {
    bookingGuidance,
    extractedIncludes,
    extractedPreparationNotes,
    keywords: unique([draft.title, categoryLabels[category], ...suggestedTags, ...extractedIncludes]).slice(0, 16),
    ragSections,
    suggestedTags,
    summary,
    warnings,
  };
}

export function classifyHospitalProduct(draft: HospitalProductDraft): ProductClassification {
  const category = inferCategory(draft);
  const analysis = analyzeProductDescription(draft, category);

  return {
    analysis,
    category,
    confidence: draft.category ? 0.95 : category === 'general' ? 0.62 : 0.82,
    keywords: analysis.keywords,
    ragCategory: 'marketplace.product',
    riskLevel: analysis.warnings.length > 0 ? 'medium' : 'low',
    tags: analysis.suggestedTags,
  };
}

export function getProductCategoryLabel(category: ProductCategory) {
  return categoryLabels[category];
}

export function getProductCategories() {
  return productCategories;
}

export function buildProductRagPreview(draft: HospitalProductDraft, classification = classifyHospitalProduct(draft)) {
  const price = parsePriceBaht(draft.priceAmount);
  const lines = [
    `${compactText(draft.title)} (${categoryLabels[classification.category]})`,
    `Price: ${price.toLocaleString('th-TH')} THB`,
    draft.branchInfo || draft.hospitalAddress ? `Branch: ${compactText(draft.branchInfo || draft.hospitalAddress)}` : '',
    classification.analysis.summary ? `Description: ${classification.analysis.summary}` : '',
  ];

  return lines.filter(Boolean).join('\n');
}

export async function loadActiveHospitalProducts(limit = 20): Promise<HospitalProduct[]> {
  const tenant = await loadTenant();

  if (!tenant) {
    return [];
  }

  const { data, error } = await supabase
    .from('products')
    .select(productSelectColumns())
    .eq('tenant_id', tenant.id)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as unknown as ProductRow[]).map(toHospitalProduct);
}

export async function loadManagedHospitalProducts(limit = 80): Promise<HospitalProduct[]> {
  const tenant = await loadTenant();

  if (!tenant) {
    return [];
  }

  const { data, error } = await supabase
    .from('products')
    .select(productSelectColumns())
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as unknown as ProductRow[]).map(toHospitalProduct);
}

export async function updateHospitalProductStatus(product: HospitalProduct, status: HospitalProductStatus): Promise<HospitalProduct> {
  await requireAuthenticatedUser();

  const { data, error } = await supabase
    .from('products')
    .update({
      active: status === 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', product.id)
    .select(productSelectColumns())
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update product status.');
  }

  return toHospitalProduct(data as unknown as ProductRow);
}

export async function uploadProductImage(file: Blob & { name?: string; type?: string }, productId?: string): Promise<ProductImageUploadResult> {
  await requireAuthenticatedUser();
  const tenant = await requireTenant();
  const originalName = file.name || 'product-image';
  const extension = originalName.includes('.') ? originalName.split('.').pop() : file.type?.split('/').pop();
  const safeBase = sanitizeStorageName(originalName.replace(/\.[^.]+$/, ''));
  const safeExtension = sanitizeStorageName(extension || 'jpg');
  const path = `${tenant.slug}/${productId ?? 'drafts'}/${Date.now()}-${safeBase}.${safeExtension}`;

  const { error } = await supabase.storage.from('product-images').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || 'Unable to upload product image.');
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);

  if (!data.publicUrl) {
    throw new Error('Product image uploaded but no public URL was returned.');
  }

  return {
    path,
    publicUrl: data.publicUrl,
  };
}

export async function saveHospitalProductWithRag(draft: HospitalProductDraft, productId?: string): Promise<SaveHospitalProductResult> {
  await requireAuthenticatedUser();
  const tenant = await requireTenant();
  const classification = classifyHospitalProduct(draft);
  const branchInfo = compactText(draft.branchInfo || draft.hospitalAddress || draft.hospitalMapQuery || '');
  const imageUrl = compactText(draft.imageUrl || draft.productImagePreviewUri || '');
  const payload = {
    active: true,
    branch_info: branchInfo || null,
    category: classification.category,
    description: compactText(draft.description),
    image_url: imageUrl || null,
    name: compactText(draft.title),
    price_baht: parsePriceBaht(draft.priceAmount),
    requires_appointment: draft.requiresAppointment ?? true,
    tenant_id: tenant.id,
    updated_at: new Date().toISOString(),
  };
  const query = productId
    ? supabase.from('products').update(payload).eq('id', productId)
    : supabase.from('products').insert(payload);
  const { data, error } = await query.select(productSelectColumns()).single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to save product.');
  }

  const product = toHospitalProduct(data as unknown as ProductRow);

  return {
    catalogKey: product.catalogKey,
    classification,
    embedding: {
      message: 'Phase 1 stores catalog rows only; chat/RAG integration moves to Phase 2.',
      status: 'skipped',
    },
    product,
    ragChunkId: product.catalogKey,
  };
}

export async function saveCatalogProduct(draft: HospitalProductDraft, productId?: string) {
  return saveHospitalProductWithRag(draft, productId);
}

export function toProductSummary(product: HospitalProduct): ProductSummary {
  return {
    active: product.status === 'active',
    branch_info: product.hospitalAddress ?? null,
    catalog_key: product.catalogKey,
    category: product.category,
    description: product.description,
    id: product.id,
    image_url: product.imageUrl ?? null,
    name: product.title,
    price_baht: product.priceAmount,
    requires_appointment: product.requiresAppointment,
    tenant_id: product.tenantId,
  };
}
