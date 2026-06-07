import { Link } from 'expo-router';
import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ActionButton, Pill } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import {
  filterHospitals,
  findHospitalByName,
  partnerHospitalDirectory,
  type HospitalDirectoryItem,
} from '@/lib/marketplace/hospitalDirectory';
import {
  buildProductRagPreview,
  classifyHospitalProduct,
  getProductCategoryLabel,
  loadActiveHospitalProducts,
  saveHospitalProductWithRag,
  type HospitalProduct,
  type HospitalProductDraft,
} from '@/lib/marketplace/hospitalProducts';

const emptyDraft: HospitalProductDraft = {
  description:
    'แพ็กเกจตรวจสุขภาพ Basic Blood Checkup สำหรับคัดกรองพื้นฐาน รวม CBC, Lipid profile, Fasting glucose และ Doctor summary ใช้เวลาประมาณ 2-3 ชั่วโมง ควรยืนยันเงื่อนไขงดอาหารกับ call center ก่อนวันตรวจ ดื่มน้ำเปล่าได้ถ้าโรงพยาบาลไม่ห้าม',
  hospitalAddress: partnerHospitalDirectory[8].address,
  hospitalLat: partnerHospitalDirectory[8].lat,
  hospitalLng: partnerHospitalDirectory[8].lng,
  hospitalMapQuery: partnerHospitalDirectory[8].mapQuery,
  hospitalName: partnerHospitalDirectory[8].name,
  priceAmount: '3500',
  title: 'Basic Blood Checkup',
};

const exampleDrafts: { label: string; value: Partial<HospitalProductDraft> }[] = [
  {
    label: 'Lab',
    value: {
      description:
        'Metabolic Blood Panel เป็นแพ็กเกจตรวจเลือดสำหรับดูสุขภาพเมตาบอลิก รวม CBC, HbA1c, Fasting glucose และ Lipid profile เหมาะกับผู้ที่ต้องการคัดกรองน้ำตาลและไขมัน ควรถาม call center เรื่องการงดอาหารก่อนตรวจ',
      priceAmount: '2800',
      title: 'Metabolic Blood Panel',
    },
  },
  {
    label: 'Imaging',
    value: {
      description:
        'บริการ Whole Abdomen Ultrasound สำหรับคัดกรองช่องท้องเบื้องต้น รวม ultrasound whole abdomen และ radiologist report ใช้เวลาประมาณ 45-60 นาที ควรสอบถามเงื่อนไขการงดอาหารกับโรงพยาบาลก่อนวันตรวจ',
      priceAmount: '4200',
      title: 'Whole Abdomen Ultrasound',
    },
  },
  {
    label: 'Vaccine',
    value: {
      description:
        'บริการ Influenza Vaccine สำหรับผู้ใหญ่ รวม doctor screening, influenza vaccine และ observation หลังฉีด ใช้เวลาประมาณ 30 นาที กรุณาแจ้งประวัติแพ้วัคซีนหรืออาการแพ้รุนแรงก่อนรับบริการ',
      priceAmount: '990',
      title: 'Influenza Vaccine',
    },
  },
];

export default function HospitalPortalScreen() {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState<HospitalProductDraft>(emptyDraft);
  const [hospitalSearch, setHospitalSearch] = useState(emptyDraft.hospitalName);
  const [isHospitalPickerOpen, setIsHospitalPickerOpen] = useState(false);
  const [products, setProducts] = useState<HospitalProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classification = useMemo(() => classifyHospitalProduct(draft), [draft]);
  const ragPreview = useMemo(() => buildProductRagPreview(draft, classification), [classification, draft]);
  const selectedHospital = useMemo(() => findHospitalByName(draft.hospitalName), [draft.hospitalName]);
  const filteredHospitals = useMemo(() => filterHospitals(hospitalSearch).slice(0, 8), [hospitalSearch]);
  const isWide = width >= 1080;
  const canSave = Boolean(auth.session) && draft.title.trim().length > 2 && draft.hospitalName.trim().length > 2;

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

  function updateDraft(field: keyof HospitalProductDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function selectHospital(hospital: HospitalDirectoryItem) {
    setDraft((current) => ({
      ...current,
      hospitalAddress: hospital.address,
      hospitalLat: hospital.lat,
      hospitalLng: hospital.lng,
      hospitalMapQuery: hospital.mapQuery,
      hospitalName: hospital.name,
    }));
    setHospitalSearch(hospital.name);
    setIsHospitalPickerOpen(false);
  }

  function updateHospitalSearch(value: string) {
    setHospitalSearch(value);
    setIsHospitalPickerOpen(true);
  }

  async function saveProduct() {
    if (!canSave || isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSaveMessage(null);
      const result = await saveHospitalProductWithRag(draft);
      setProducts((current) => [result.product, ...current.filter((item) => item.id !== result.product.id)].slice(0, 20));
      const embeddingText =
        result.embedding.status === 'embedded'
          ? `พร้อม vector embedding ${result.embedding.dimensions ?? ''}d`
          : `RAG text พร้อมแล้ว แต่ embedding ยังไม่สำเร็จ: ${result.embedding.message ?? result.embedding.status}`;
      setSaveMessage(`บันทึกสินค้าและ publish RAG แล้ว: ${result.ragChunkId} (${embeddingText})`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'บันทึกสินค้าไม่สำเร็จ');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>Hospital Portal</Text>
            <Text style={styles.title}>Product Intake + Auto RAG</Text>
            <Text style={styles.subtitle}>
              พยาบาลหรือทีมโรงพยาบาลเพิ่มสินค้า ระบบจัดหมวดหมู่ บันทึกสินค้า และสร้าง RAG chunk ให้ chatbot รู้จักทันที
            </Text>
          </View>
          <View style={styles.topActions}>
            <Link href="/hospital-products" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Manage products</Text>
              </Pressable>
            </Link>
            <Link href="/(tabs)/packages" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Mobile packages</Text>
              </Pressable>
            </Link>
            <Link href="/(tabs)/chatbot" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Test chatbot</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {!auth.session ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>ต้อง login ก่อนบันทึกสินค้า</Text>
            <Text style={styles.noticeBody}>portal นี้ใช้ Supabase Auth session เพื่อสร้าง product และ RAG chunk ในนามผู้ใช้งาน</Text>
            <Link href="/" asChild>
              <Pressable style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>ไปหน้า login</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.formPane}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>เพิ่มสินค้าโรงพยาบาล</Text>
              <Text style={styles.panelMeta}>prototype form</Text>
            </View>

            <View style={styles.formSection}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionKicker}>Product</Text>
                <Text style={styles.sectionHint}>ข้อมูลสินค้าที่จะเข้า marketplace และ RAG</Text>
              </View>

              <View style={styles.exampleRow}>
                {exampleDrafts.map((example) => (
                  <Pressable
                    key={example.label}
                    onPress={() => setDraft((current) => ({ ...current, ...example.value }))}
                    style={styles.exampleChip}
                  >
                    <Text style={styles.exampleChipText}>{example.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Field label="Product title" value={draft.title} onChangeText={(value) => updateDraft('title', value)} />
              <Field
                label="Description"
                multiline
                value={draft.description}
                onChangeText={(value) => updateDraft('description', value)}
              />
              <Field label="Price THB" value={draft.priceAmount} onChangeText={(value) => updateDraft('priceAmount', value)} />
              <ProductImageInput
                imageName={draft.productImageName}
                imagePreviewUri={draft.productImagePreviewUri}
                onImageSelected={(image) =>
                  setDraft((current) => ({
                    ...current,
                    productImageName: image.name,
                    productImagePreviewUri: image.previewUri,
                  }))
                }
              />
            </View>

            <View style={styles.formSection}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionKicker}>Hospital</Text>
                <Text style={styles.sectionHint}>เลือกโรงพยาบาลและตรวจตำแหน่ง</Text>
              </View>

              <HospitalSearchField
                filteredHospitals={filteredHospitals}
                hospitalSearch={hospitalSearch}
                isOpen={isHospitalPickerOpen}
                onFocus={() => setIsHospitalPickerOpen(true)}
                onSearchChange={updateHospitalSearch}
                onSelect={selectHospital}
                selectedHospitalName={draft.hospitalName}
              />

              <Field
                label="Hospital address"
                multiline
                value={draft.hospitalAddress}
                onChangeText={(value) =>
                  setDraft((current) => ({
                    ...current,
                    hospitalAddress: value,
                    hospitalMapQuery: value || current.hospitalName,
                  }))
                }
              />

              <View style={styles.hospitalInfoRow}>
                <Metric label="Selected" value={selectedHospital ? selectedHospital.serviceArea : 'Custom hospital'} />
                <Metric
                  label="Coordinates"
                  value={
                    draft.hospitalLat && draft.hospitalLng
                      ? `${draft.hospitalLat.toFixed(4)}, ${draft.hospitalLng.toFixed(4)}`
                      : 'Map query only'
                  }
                />
              </View>

              <GoogleMapPreview query={draft.hospitalMapQuery || draft.hospitalAddress || draft.hospitalName} />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {saveMessage ? <Text style={styles.successText}>{saveMessage}</Text> : null}

            <ActionButton
              disabled={!canSave || isSaving}
              label={isSaving ? 'Saving product + RAG...' : 'Save product + publish RAG'}
              onPress={saveProduct}
              style={!canSave || isSaving ? styles.disabledAction : null}
            />
          </View>

          <View style={styles.previewPane}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>System preview</Text>
              <Text style={styles.panelMeta}>auto classify</Text>
            </View>

            <View style={styles.classificationGrid}>
              <Metric label="Product category" value={getProductCategoryLabel(classification.category)} />
              <Metric label="RAG category" value={classification.ragCategory} />
              <Metric label="Confidence" value={`${Math.round(classification.confidence * 100)}%`} />
              <Metric label="Risk" value={classification.riskLevel} />
            </View>

            <View style={styles.tagWrap}>
              {classification.tags.slice(0, 8).map((tag) => (
                <Pill key={tag} label={tag} tone="blue" />
              ))}
            </View>

            <View style={styles.analysisPanel}>
              <View style={styles.panelHeader}>
                <Text style={styles.analysisTitle}>AI วิเคราะห์ Description</Text>
                <Text style={styles.panelMeta}>{classification.analysis.ragSections.length} sections</Text>
              </View>
              {classification.analysis.ragSections.map((section) => (
                <View key={section.key} style={styles.analysisRow}>
                  <View style={styles.analysisRowTop}>
                    <Text style={styles.analysisLabel}>{section.label}</Text>
                    <Text style={styles.analysisConfidence}>{Math.round(section.confidence * 100)}%</Text>
                  </View>
                  <Text style={styles.analysisContent}>{section.content}</Text>
                </View>
              ))}
              {classification.analysis.warnings.length ? (
                <View style={styles.warningBox}>
                  {classification.analysis.warnings.map((warning) => (
                    <Text key={warning} style={styles.warningText}>
                      {warning}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.ragBox}>
              <Text style={styles.ragTitle}>RAG chunk ที่จะถูกสร้าง</Text>
              <Text style={styles.ragBody}>{ragPreview}</Text>
              <Text style={styles.ragFootnote}>
                Prototype publish เป็น approved/active เพื่อทดสอบ chatbot ได้ทันที. ก่อน production ควรเปลี่ยนเป็น review queue สำหรับ medical content.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.productSection}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>สินค้าล่าสุดในระบบ</Text>
            <Text style={styles.panelMeta}>{isLoadingProducts ? 'loading' : `${products.length} items`}</Text>
          </View>

          {products.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>ยังไม่มีสินค้าจาก Supabase</Text>
              <Text style={styles.emptyBody}>เพิ่มสินค้าชิ้นแรกจากฟอร์มด้านบนเพื่อทดสอบ mobile catalog และ chatbot RAG</Text>
            </View>
          ) : (
            products.map((product) => (
              <View key={product.id} style={styles.productRow}>
                <View style={styles.productMain}>
                  <Text style={styles.productTitle}>{product.title}</Text>
                  <Text style={styles.productMeta}>
                    {product.hospitalName} · {getProductCategoryLabel(product.category)} · {product.priceAmount.toLocaleString('th-TH')} THB
                  </Text>
                  <Text style={styles.productTags}>{product.tags.slice(0, 5).join(', ')}</Text>
                </View>
                <View style={styles.productStatus}>
                  <Pill label={product.ragChunkId ? 'RAG active' : 'No RAG'} tone={product.ragChunkId ? 'mint' : 'amber'} />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function HospitalSearchField({
  filteredHospitals,
  hospitalSearch,
  isOpen,
  onFocus,
  onSearchChange,
  onSelect,
  selectedHospitalName,
}: {
  filteredHospitals: HospitalDirectoryItem[];
  hospitalSearch: string;
  isOpen: boolean;
  onFocus: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (hospital: HospitalDirectoryItem) => void;
  selectedHospitalName: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Hospital name</Text>
      <TextInput
        onChangeText={onSearchChange}
        onFocus={onFocus}
        placeholder="Search hospital name, area, or address"
        placeholderTextColor={MiraDesign.color.muted}
        style={styles.input}
        value={hospitalSearch}
      />
      {isOpen ? (
        <View style={styles.dropdown}>
          {filteredHospitals.length === 0 ? (
            <View style={styles.dropdownEmpty}>
              <Text style={styles.dropdownEmptyText}>No hospital found. Type a custom name and edit the address below.</Text>
            </View>
          ) : (
            filteredHospitals.map((hospital) => (
              <Pressable
                key={hospital.id}
                onPress={() => onSelect(hospital)}
                style={[styles.dropdownOption, hospital.name === selectedHospitalName ? styles.dropdownOptionActive : null]}
              >
                <Text style={styles.dropdownOptionTitle}>{hospital.name}</Text>
                <Text style={styles.dropdownOptionMeta}>{hospital.serviceArea}</Text>
                <Text style={styles.dropdownOptionAddress}>{hospital.address}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function GoogleMapPreview({ query }: { query: string }) {
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const openUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  return (
    <View style={styles.mapPanel}>
      <View style={styles.mapHeader}>
        <Text style={styles.mapTitle}>Google Map</Text>
        <Text style={styles.mapQuery} numberOfLines={1}>
          {query}
        </Text>
      </View>
      {Platform.OS === 'web' ? (
        <View style={styles.mapFrameWrap}>
          {React.createElement('iframe', {
            src,
            style: {
              border: 0,
              height: '100%',
              width: '100%',
            },
            loading: 'lazy',
            referrerPolicy: 'no-referrer-when-downgrade',
            title: 'Hospital location map',
          })}
        </View>
      ) : (
        <Pressable onPress={() => Linking.openURL(openUrl)} style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>Open hospital location in Google Maps</Text>
        </Pressable>
      )}
    </View>
  );
}

function ProductImageInput({
  imageName,
  imagePreviewUri,
  onImageSelected,
}: {
  imageName?: string;
  imagePreviewUri?: string;
  onImageSelected: (image: { name: string; previewUri: string }) => void;
}) {
  function handleWebImageChange(event: { target?: { files?: FileList | null } }) {
    const file = event.target?.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImageSelected({
          name: file.name,
          previewUri: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Product image</Text>
      <View style={styles.imageInputPanel}>
        {Platform.OS === 'web'
          ? React.createElement('input', {
              accept: 'image/*',
              onChange: handleWebImageChange,
              style: styles.fileInput,
              type: 'file',
            })
          : (
              <Pressable style={styles.imageNativeButton}>
                <Text style={styles.imageNativeButtonText}>Select product image</Text>
              </Pressable>
            )}
        {imageName ? <Text style={styles.imageFileName}>{imageName}</Text> : <Text style={styles.imageHint}>รองรับรูปภาพสินค้าเพื่อใช้ preview ใน portal prototype</Text>}
        {imagePreviewUri && Platform.OS === 'web' ? (
          <View style={styles.imagePreviewWrap}>
            {React.createElement('img', {
              alt: imageName ?? 'Product preview',
              src: imagePreviewUri,
              style: {
                height: '100%',
                objectFit: 'cover',
                width: '100%',
              },
            })}
          </View>
        ) : null}
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
    gap: 20,
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
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
  formPane: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1.15,
    gap: 14,
    padding: 18,
    width: '100%',
    ...softShadow,
  },
  previewPane: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 0.85,
    gap: 16,
    padding: 18,
    width: '100%',
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
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
  },
  formSection: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionKicker: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionHint: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exampleChip: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  exampleChipText: {
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
    minHeight: 84,
    paddingTop: 12,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 12,
  },
  hospitalInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dropdown: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    maxHeight: 310,
    padding: 8,
  },
  dropdownEmpty: {
    padding: 12,
  },
  dropdownEmptyText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  dropdownOption: {
    borderColor: '#E7F0EF',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    padding: 10,
  },
  dropdownOptionActive: {
    backgroundColor: MiraDesign.color.primarySoft,
    borderColor: MiraDesign.color.primary,
  },
  dropdownOptionTitle: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  dropdownOptionMeta: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  dropdownOptionAddress: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  mapPanel: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mapHeader: {
    gap: 3,
    padding: 12,
  },
  mapTitle: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  mapQuery: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
  },
  mapFrameWrap: {
    backgroundColor: '#E5EFEE',
    height: 260,
    width: '100%',
  },
  mapFallback: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    minHeight: 58,
    justifyContent: 'center',
    margin: 12,
    borderRadius: 8,
  },
  mapFallbackText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  imageInputPanel: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  fileInput: {
    color: MiraDesign.color.ink,
    fontSize: 13,
  },
  imageNativeButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  imageNativeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  imageFileName: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  imageHint: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  imagePreviewWrap: {
    backgroundColor: '#E5EFEE',
    borderRadius: 8,
    height: 180,
    overflow: 'hidden',
    width: '100%',
  },
  classificationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metric: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
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
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  analysisPanel: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  analysisTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  analysisRow: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 10,
  },
  analysisRowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  analysisLabel: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  analysisConfidence: {
    color: MiraDesign.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  analysisContent: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  warningBox: {
    backgroundColor: '#FFF7DD',
    borderColor: '#F3D17B',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  warningText: {
    color: '#715308',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  ragBox: {
    backgroundColor: '#0E2F35',
    borderRadius: 8,
    gap: 10,
    padding: 16,
  },
  ragTitle: {
    color: '#DDF5F3',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ragBody: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 22,
  },
  ragFootnote: {
    color: '#A9D5CD',
    fontSize: 12,
    lineHeight: 18,
  },
  disabledAction: {
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
  productSection: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  emptyState: {
    backgroundColor: '#F7FBFA',
    borderRadius: 8,
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
    alignItems: 'center',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  productMain: {
    flex: 1,
    gap: 4,
  },
  productTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  productMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  productTags: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  productStatus: {
    alignItems: 'flex-end',
  },
});
