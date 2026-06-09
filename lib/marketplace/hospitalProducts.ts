import { supabase, supabaseConfigStatus } from '@/lib/supabase';

export type ProductCategory =
  | 'health_checkup'
  | 'imaging'
  | 'lab_test'
  | 'other'
  | 'procedure'
  | 'specialty_consult'
  | 'vaccine'
  | 'wellness';

export type HospitalProductDraft = {
  description: string;
  hospitalAddress: string;
  hospitalLat?: number;
  hospitalLng?: number;
  hospitalMapQuery: string;
  hospitalName: string;
  productImageName?: string;
  productImagePreviewUri?: string;
  priceAmount: string;
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
  location?: string | null;
  preparationNotes?: string | null;
  priceAmount: number;
  productImageName?: string | null;
  productImagePreviewUri?: string | null;
  ragChunkId?: string | null;
  status: 'active' | 'archived' | 'draft';
  tags: string[];
  title: string;
};

export type HospitalProductStatus = HospitalProduct['status'];

export type SaveHospitalProductResult = {
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

type HospitalProductRow = {
  booking_note: string | null;
  category: ProductCategory;
  created_at: string;
  description: string;
  duration: string | null;
  hospital_address: string | null;
  hospital_lat: number | null;
  hospital_lng: number | null;
  hospital_map_query: string | null;
  hospital_name: string;
  id: string;
  includes: string[] | null;
  location: string | null;
  metadata: {
    product_image_name?: string | null;
    product_image_preview_uri?: string | null;
  } | null;
  preparation_notes: string | null;
  price_amount: number;
  rag_chunk_id: string | null;
  status: HospitalProduct['status'];
  tags: string[] | null;
  title: string;
};

const categoryRules: {
  category: ProductCategory;
  confidence: number;
  tags: string[];
  terms: string[];
}[] = [
  {
    category: 'lab_test',
    confidence: 0.9,
    tags: ['Lab', 'Blood test'],
    terms: ['ตรวจเลือด', 'เจาะเลือด', 'lab', 'blood', 'cbc', 'hba1c', 'ldl', 'ไขมัน', 'น้ำตาล'],
  },
  {
    category: 'imaging',
    confidence: 0.88,
    tags: ['Imaging'],
    terms: ['x-ray', 'xray', 'mri', 'ct', 'ultrasound', 'อัลตราซาวด์', 'เอกซเรย์', 'mammogram'],
  },
  {
    category: 'vaccine',
    confidence: 0.86,
    tags: ['Vaccine'],
    terms: ['vaccine', 'วัคซีน', 'ฉีดวัคซีน', 'influenza', 'hpv', 'flu'],
  },
  {
    category: 'specialty_consult',
    confidence: 0.82,
    tags: ['Consult'],
    terms: ['ปรึกษาแพทย์', 'consult', 'แพทย์เฉพาะทาง', 'doctor', 'clinic'],
  },
  {
    category: 'procedure',
    confidence: 0.8,
    tags: ['Procedure'],
    terms: ['procedure', 'หัตถการ', 'ผ่าตัด', 'ส่องกล้อง', 'endoscopy'],
  },
  {
    category: 'wellness',
    confidence: 0.78,
    tags: ['Wellness'],
    terms: ['wellness', 'วิตามิน', 'nutrition', 'sleep', 'stress', 'longevity', 'ฟื้นฟู'],
  },
  {
    category: 'health_checkup',
    confidence: 0.84,
    tags: ['Checkup'],
    terms: ['ตรวจสุขภาพ', 'checkup', 'screening', 'ตรวจประจำปี', 'executive'],
  },
];

const categoryLabels: Record<ProductCategory, string> = {
  health_checkup: 'ตรวจสุขภาพ',
  imaging: 'เอกซเรย์/ภาพวินิจฉัย',
  lab_test: 'ตรวจแล็บ/ตรวจเลือด',
  other: 'อื่นๆ',
  procedure: 'หัตถการ',
  specialty_consult: 'ปรึกษาแพทย์',
  vaccine: 'วัคซีน',
  wellness: 'Wellness',
};

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function splitList(value: string) {
  return value
    .split(/[\n,;]/)
    .map((item) => compactText(item))
    .filter(Boolean)
    .slice(0, 16);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => compactText(value)).filter(Boolean))];
}

function toSearchText(draft: HospitalProductDraft) {
  return [
    draft.title,
    draft.description,
    draft.hospitalAddress,
  ]
    .join(' ')
    .toLowerCase();
}

function splitSentences(value: string) {
  return value
    .split(/[\n.!?。]+/)
    .map((item) => compactText(item))
    .filter((item) => item.length > 2)
    .slice(0, 12);
}

function extractKeywordHits(text: string, terms: string[]) {
  const normalizedText = text.toLowerCase();

  return terms.filter((term) => normalizedText.includes(term.toLowerCase()));
}

export function analyzeProductDescription(draft: HospitalProductDraft, category: ProductCategory = 'other'): ProductDescriptionAnalysis {
  const description = compactText(draft.description);
  const searchText = `${draft.title} ${description}`.toLowerCase();
  const sentences = splitSentences(draft.description);
  const allRuleTerms = categoryRules.flatMap((rule) => rule.terms);
  const keywordHits = extractKeywordHits(searchText, allRuleTerms);
  const includeTerms = [
    'รวม',
    'ตรวจ',
    'panel',
    'profile',
    'cbc',
    'hba1c',
    'ldl',
    'hdl',
    'ultrasound',
    'x-ray',
    'mri',
    'ct',
    'vaccine',
    'วัคซีน',
    'doctor',
    'report',
  ];
  const preparationTerms = [
    'งดอาหาร',
    'ดื่มน้ำ',
    'fasting',
    'ยา',
    'medication',
    'ตั้งครรภ์',
    'pregnant',
    'แพ้',
    'allergy',
    'ก่อนตรวจ',
    'ก่อนรับบริการ',
  ];
  const extractedIncludes = unique(
    sentences
      .filter((sentence) => includeTerms.some((term) => sentence.toLowerCase().includes(term.toLowerCase())))
      .flatMap((sentence) => splitList(sentence.replace(/^(รวม|includes?)\s*[:：-]?\s*/i, '')))
      .slice(0, 12),
  );
  const extractedPreparationNotes = unique(
    sentences.filter((sentence) => preparationTerms.some((term) => sentence.toLowerCase().includes(term.toLowerCase()))),
  ).slice(0, 6);
  const suggestedTags = unique([
    categoryLabels[category],
    ...keywordHits.slice(0, 8),
    ...extractedIncludes.slice(0, 4),
  ]).slice(0, 12);
  const summary = description.length > 180 ? `${description.slice(0, 177).trim()}...` : description;
  const bookingGuidance =
    'หลังชำระเงิน ให้ลูกค้าใช้ order number ติดต่อ call center ของโรงพยาบาลเพื่อยืนยันวันเวลา ราคา เงื่อนไขล่าสุด และการเตรียมตัวก่อนรับบริการ.';
  const warnings = [
    ...(extractedPreparationNotes.length > 0 ? ['พบข้อความเกี่ยวกับการเตรียมตัว/ข้อควรระวัง ควรให้ hospital reviewer ตรวจทานก่อน production'] : []),
    ...(description.length < 80 ? ['Description สั้นเกินไป อาจทำให้ RAG ตอบรายละเอียดสินค้าได้ไม่ครบ'] : []),
  ];
  const ragSections: DescriptionRagSection[] = [
    {
      confidence: description.length >= 80 ? 0.86 : 0.62,
      content: summary || `${draft.title} ของ ${draft.hospitalName}`,
      key: 'overview',
      label: 'ภาพรวมสินค้า',
    },
    {
      confidence: extractedIncludes.length ? 0.78 : 0.45,
      content: extractedIncludes.length ? extractedIncludes.join(', ') : 'ยังไม่พบรายการที่รวมอย่างชัดเจนใน description',
      key: 'included_items',
      label: 'รายการที่รวม',
    },
    {
      confidence: extractedPreparationNotes.length ? 0.74 : 0.42,
      content: extractedPreparationNotes.length
        ? extractedPreparationNotes.join(' ')
        : 'ให้ลูกค้ายืนยันการเตรียมตัวกับ call center ก่อนเข้ารับบริการ',
      key: 'medical_preparation',
      label: 'การเตรียมตัว',
    },
    {
      confidence: 0.82,
      content: bookingGuidance,
      key: 'booking',
      label: 'ขั้นตอนจอง',
    },
  ];

  if (warnings.length > 0) {
    ragSections.push({
      confidence: 0.7,
      content: warnings.join(' '),
      key: 'safety_review',
      label: 'Review flag',
    });
  }

  return {
    bookingGuidance,
    extractedIncludes,
    extractedPreparationNotes,
    keywords: unique([draft.title, draft.hospitalName, ...keywordHits, ...suggestedTags]).slice(0, 24),
    ragSections,
    suggestedTags,
    summary,
    warnings,
  };
}

export function classifyHospitalProduct(draft: HospitalProductDraft): ProductClassification {
  const searchText = toSearchText(draft);
  const matchedRule = categoryRules.find((rule) => rule.terms.some((term) => searchText.includes(term.toLowerCase())));
  const category = matchedRule?.category ?? 'other';
  const analysis = analyzeProductDescription(draft, category);
  const generatedTags = unique([
    ...(matchedRule?.tags ?? []),
    categoryLabels[category],
    ...analysis.suggestedTags,
    ...analysis.extractedIncludes.slice(0, 4),
  ]);
  const keywords = unique([
    draft.title,
    draft.hospitalName,
    categoryLabels[category],
    ...generatedTags,
    ...analysis.keywords,
    ...analysis.extractedIncludes,
    'แพ็กเกจ',
    'package',
    'ราคา',
    'booking',
  ]).slice(0, 24);
  const riskLevel = analysis.extractedPreparationNotes.length > 0 ? 'medium' : 'low';

  return {
    analysis,
    category,
    confidence: matchedRule?.confidence ?? 0.55,
    keywords,
    ragCategory: 'marketplace.product',
    riskLevel,
    tags: generatedTags,
  };
}

export function getProductCategoryLabel(category: ProductCategory) {
  return categoryLabels[category];
}

export function buildProductRagPreview(draft: HospitalProductDraft, classification = classifyHospitalProduct(draft)) {
  const price = Number(draft.priceAmount.replace(/,/g, '')) || 0;
  const { analysis } = classification;
  const parts = [
    `${draft.title} เป็นสินค้า/แพ็กเกจของ ${draft.hospitalName}.`,
    draft.hospitalAddress ? `ที่อยู่โรงพยาบาล: ${compactText(draft.hospitalAddress)}.` : '',
    `หมวดหมู่: ${categoryLabels[classification.category]}.`,
    `ราคา: ${price.toLocaleString('th-TH')} THB.`,
    analysis.summary ? `รายละเอียดหลัก: ${analysis.summary}.` : '',
    analysis.extractedIncludes.length ? `รายการที่ระบบวิเคราะห์ว่าอาจรวมอยู่: ${analysis.extractedIncludes.join(', ')}.` : '',
    analysis.extractedPreparationNotes.length
      ? `การเตรียมตัว/ข้อควรระวังที่พบใน description: ${analysis.extractedPreparationNotes.join(' ')}.`
      : '',
    `การจอง: ${analysis.bookingGuidance}`,
  ];

  return parts.filter(Boolean).join('\n');
}

function toHospitalProduct(row: HospitalProductRow): HospitalProduct {
  return {
    bookingNote: row.booking_note,
    category: row.category,
    createdAt: row.created_at,
    description: row.description,
    duration: row.duration,
    hospitalAddress: row.hospital_address,
    hospitalLat: row.hospital_lat,
    hospitalLng: row.hospital_lng,
    hospitalMapQuery: row.hospital_map_query,
    hospitalName: row.hospital_name,
    id: row.id,
    includes: row.includes ?? [],
    location: row.location,
    preparationNotes: row.preparation_notes,
    priceAmount: row.price_amount,
    productImageName: row.metadata?.product_image_name ?? null,
    productImagePreviewUri: row.metadata?.product_image_preview_uri ?? null,
    ragChunkId: row.rag_chunk_id,
    status: row.status,
    tags: row.tags ?? [],
    title: row.title,
  };
}

function productSelectColumns() {
  return [
    'id',
    'hospital_name',
    'title',
    'description',
    'category',
    'price_amount',
    'duration',
    'hospital_address',
    'hospital_map_query',
    'hospital_lat',
    'hospital_lng',
    'location',
    'metadata',
    'includes',
    'tags',
    'preparation_notes',
    'booking_note',
    'status',
    'rag_chunk_id',
    'created_at',
  ].join(',');
}

export async function loadActiveHospitalProducts(limit = 20): Promise<HospitalProduct[]> {
  if (!supabaseConfigStatus.isConfigured) {
    return [];
  }

  const { data, error } = await supabase
    .from('hospital_products')
    .select(productSelectColumns())
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as unknown as HospitalProductRow[]).map(toHospitalProduct);
}

export async function loadManagedHospitalProducts(limit = 80): Promise<HospitalProduct[]> {
  if (!supabaseConfigStatus.isConfigured) {
    return [];
  }

  const { data, error } = await supabase
    .from('hospital_products')
    .select(productSelectColumns())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as unknown as HospitalProductRow[]).map(toHospitalProduct);
}

export async function updateHospitalProductStatus(product: HospitalProduct, status: HospitalProductStatus): Promise<HospitalProduct> {
  if (!supabaseConfigStatus.isConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error('ต้อง login ก่อนจัดการสินค้าโรงพยาบาล');
  }

  const { data, error } = await supabase
    .from('hospital_products')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', product.id)
    .select(productSelectColumns())
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update hospital product status.');
  }

  if (product.ragChunkId) {
    const isActive = status === 'active';
    const { error: ragError } = await supabase
      .from('rag_chunks')
      .update({
        is_active: isActive,
        review_status: isActive ? 'approved' : 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', product.ragChunkId);

    if (ragError) {
      throw new Error(ragError.message);
    }
  }

  return toHospitalProduct(data as unknown as HospitalProductRow);
}

async function embedRagChunk(chunkId: string): Promise<RagEmbeddingResult> {
  const { data, error } = await supabase.functions.invoke('rag-embed', {
    body: {
      chunkId,
    },
  });

  if (error) {
    return {
      message: error.message,
      status: 'error',
    };
  }

  const result = data as Partial<RagEmbeddingResult> | null;

  return {
    dimensions: typeof result?.dimensions === 'number' ? result.dimensions : undefined,
    message: result?.message,
    model: result?.model,
    status: result?.status === 'embedded' ? 'embedded' : 'error',
  };
}

export async function saveHospitalProductWithRag(draft: HospitalProductDraft): Promise<SaveHospitalProductResult> {
  if (!supabaseConfigStatus.isConfigured) {
    throw new Error('Supabase is not configured.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error('ต้อง login ก่อนเพิ่มสินค้าโรงพยาบาล');
  }

  const classification = classifyHospitalProduct(draft);
  const priceAmount = Math.max(0, Math.round(Number(draft.priceAmount.replace(/,/g, '')) || 0));
  const includes = classification.analysis.extractedIncludes;
  const tags = classification.tags;
  const { data: productData, error: productError } = await supabase
    .from('hospital_products')
    .insert({
      auto_category_confidence: classification.confidence,
      booking_note: classification.analysis.bookingGuidance,
      category: classification.category,
      created_by: userData.user.id,
      description: compactText(draft.description),
      duration: null,
      hospital_address: compactText(draft.hospitalAddress),
      hospital_lat: draft.hospitalLat ?? null,
      hospital_lng: draft.hospitalLng ?? null,
      hospital_map_query: compactText(draft.hospitalMapQuery || draft.hospitalName),
      hospital_name: compactText(draft.hospitalName),
      includes,
      location: compactText(draft.hospitalAddress),
      metadata: {
        description_analysis: {
          rag_sections: classification.analysis.ragSections,
          warnings: classification.analysis.warnings,
        },
        classifier: 'client-rule-v1',
        product_image_name: draft.productImageName ?? null,
        product_image_preview_uri: draft.productImagePreviewUri ?? null,
        rag_auto_publish: true,
      },
      preparation_notes: classification.analysis.extractedPreparationNotes.join(' '),
      price_amount: priceAmount,
      status: 'active',
      tags,
      title: compactText(draft.title),
    })
    .select(productSelectColumns())
    .single();

  if (productError || !productData) {
    throw new Error(productError?.message ?? 'Unable to save hospital product.');
  }

  const product = toHospitalProduct(productData as unknown as HospitalProductRow);
  const ragChunkId = `hospital-product-${product.id}`;
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const { error: ragError } = await supabase.from('rag_chunks').upsert({
    audience: 'patient',
    category: classification.ragCategory,
    content: buildProductRagPreview(draft, classification),
    expires_at: expiresAt.toISOString(),
    id: ragChunkId,
    is_active: true,
    keywords: classification.keywords,
    language: 'th',
    last_reviewed_at: now.toISOString(),
    priority: 42,
    review_status: 'approved',
    risk_level: classification.riskLevel,
    source: `${product.hospitalName} product portal`,
    source_type: 'hospital_operational',
    source_url: `mira://hospital-products/${product.id}`,
    summary: `${product.title} ของ ${product.hospitalName} ราคา ${product.priceAmount.toLocaleString('th-TH')} THB หมวด ${categoryLabels[product.category]}`,
    title: product.title,
    token_budget: 260,
    topic: product.category,
  });

  if (ragError) {
    throw new Error(ragError.message);
  }

  const { data: updatedProduct, error: updateError } = await supabase
    .from('hospital_products')
    .update({
      rag_chunk_id: ragChunkId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', product.id)
    .select(productSelectColumns())
    .single();

  if (updateError || !updatedProduct) {
    throw new Error(updateError?.message ?? 'Unable to attach RAG chunk to product.');
  }

  let embedding: RagEmbeddingResult = { status: 'skipped' };

  try {
    embedding = await embedRagChunk(ragChunkId);
  } catch (embeddingError) {
    embedding = {
      message: embeddingError instanceof Error ? embeddingError.message : 'Unable to embed RAG chunk.',
      status: 'error',
    };
  }

  return {
    classification,
    embedding,
    product: toHospitalProduct(updatedProduct as unknown as HospitalProductRow),
    ragChunkId,
  };
}
