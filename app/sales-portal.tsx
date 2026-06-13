import { Link } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type DimensionValue,
  type ImageSourcePropType,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { softShadow } from '@/constants/Design';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { getProductCategoryLabel, loadActiveHospitalProducts, type HospitalProduct } from '@/lib/marketplace/hospitalProducts';
import {
  createAccountReferralLink,
  createAppReferralDeepLink,
  createProductReferralCode,
  createReferralAccountFromUser,
  formatPercent,
  type ReferralAccount,
} from '@/lib/marketplace/referralMock';
import { healthPackages } from '@/services/mockBackend';
import type { HealthPackage } from '@/domain/health';

const logoPalette = {
  blue: '#2060E0',
  blueDeep: '#102A5F',
  blueMid: '#6098FF',
  blueSoft: '#A8C8FF',
  brandWash: '#DDEBFF',
  canvas: '#EAF3FF',
  line: '#CFE0FF',
  mist: '#F5F9FF',
  muted: '#536B88',
  text: '#102A5F',
} as const;

const productPreviewImages = {
  blood: require('@/assets/images/sales-package-blood.png'),
  cancer: require('@/assets/images/sales-package-cancer.png'),
  heart: require('@/assets/images/sales-package-health.png'),
  longevity: require('@/assets/images/sales-package-longevity.png'),
} satisfies Record<NonNullable<HealthPackage['previewImageKey']>, ImageSourcePropType>;

const fallbackCommissionRateByPreviewKey = {
  blood: 0.02,
  cancer: 0.04,
  heart: 0.03,
  longevity: 0.05,
} satisfies Record<NonNullable<HealthPackage['previewImageKey']>, number>;

const salesTabs = [
  { id: 'products', label: 'สินค้า' },
  { id: 'referral', label: 'Referral' },
  { id: 'dashboard', label: 'Dashboard' },
] as const;

type SalesTab = (typeof salesTabs)[number]['id'];

type SalesProduct = {
  categoryLabel: string;
  description: string;
  hospitalName: string;
  id: string;
  imageUri?: string | null;
  previewKey: NonNullable<HealthPackage['previewImageKey']>;
  commissionRate: number;
  priceAmount: number;
  source: 'hospital_portal' | 'demo';
  tags: string[];
  title: string;
};

type CustomerForm = {
  age: string;
  customerEmail: string;
  customerPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  firstName: string;
  gender: string;
  lastName: string;
  medicalNotes: string;
  nationalId: string;
  note: string;
};

type PaymentRequest = {
  backendStatus: 'ready' | 'sent';
  customerName: string;
  id: string;
  product: SalesProduct;
  qrValue: string;
  referralCode: string;
};

type ModalStep = 'form' | 'qr' | 'complete';

const emptyCustomerForm: CustomerForm = {
  age: '',
  customerEmail: '',
  customerPhone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  firstName: '',
  gender: '',
  lastName: '',
  medicalNotes: '',
  nationalId: '',
  note: '',
};

const genderOptions = [
  { label: 'หญิง', value: 'female' },
  { label: 'ชาย', value: 'male' },
  { label: 'อื่นๆ', value: 'other' },
] as const;

type ChartPoint = {
  label: string;
  value: number;
  x: number;
  y: number;
};

export default function SalesPortalScreen() {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<SalesTab>('products');
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isReferralModalVisible, setReferralModalVisible] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm);
  const [modalStep, setModalStep] = useState<ModalStep>('form');
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const referralAccount = useMemo(() => createReferralAccountFromUser(auth.user), [auth.user]);
  const productSource = products.length ? products : isLoadingProducts ? [] : fallbackProducts;
  const filteredProducts = useMemo(() => filterProducts(productSource, query), [productSource, query]);
  const selectedProduct = productSource.find((product) => product.id === selectedProductId) ?? null;
  const isCompact = width < 720;

  useEffect(() => {
    let isMounted = true;

    loadActiveHospitalProducts(80)
      .then((items) => {
        if (isMounted) {
          setProducts(items.map(toSalesProduct));
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

  useEffect(() => {
    if (!isReferralModalVisible || modalStep !== 'qr' || !paymentRequest || paymentRequest.backendStatus !== 'ready') {
      return undefined;
    }

    const timer = setTimeout(() => {
      setPaymentRequest((current) => (current && current.id === paymentRequest.id ? { ...current, backendStatus: 'sent' } : current));
      setModalStep('complete');
      setMessage(`ส่งข้อมูล order ${paymentRequest.id} ไปหลังบ้านแล้ว`);
    }, 3200);

    return () => clearTimeout(timer);
  }, [isReferralModalVisible, modalStep, paymentRequest?.backendStatus, paymentRequest?.id]);

  function chooseProduct(product: SalesProduct) {
    setSelectedProductId(product.id);
    setMessage(null);
  }

  function openReferralOrder(product: SalesProduct) {
    setSelectedProductId(product.id);
    setCustomerForm(emptyCustomerForm);
    setPaymentRequest(null);
    setModalStep('form');
    setReferralModalVisible(true);
  }

  function updateCustomerForm(field: keyof CustomerForm, value: string) {
    const nextValue =
      field === 'nationalId'
        ? digitsOnly(value).slice(0, 13)
        : field === 'age'
          ? digitsOnly(value).slice(0, 3)
          : field === 'customerPhone' || field === 'emergencyContactPhone'
            ? value.replace(/[^\d+\-\s]/g, '').slice(0, 20)
            : value;

    setCustomerForm((current) => ({ ...current, [field]: nextValue }));
  }

  function submitReferralOrder() {
    if (!selectedProduct || !referralAccount) {
      return;
    }

    const referralCode = createProductReferralCode(selectedProduct, referralAccount);
    const requestId = `MIRA-${Date.now().toString(36).toUpperCase()}`;
    const patientName = buildCustomerName(customerForm);
    const qrValue = JSON.stringify({
      amount: selectedProduct.priceAmount,
      patient: {
        age: Number(customerForm.age),
        email: customerForm.customerEmail.trim() || null,
        emergencyContactName: customerForm.emergencyContactName.trim() || null,
        emergencyContactPhone: customerForm.emergencyContactPhone.trim() || null,
        firstName: customerForm.firstName.trim(),
        gender: customerForm.gender || null,
        lastName: customerForm.lastName.trim(),
        medicalNotes: customerForm.medicalNotes.trim() || null,
        nationalId: customerForm.nationalId,
        note: customerForm.note.trim() || null,
        phone: customerForm.customerPhone.trim(),
      },
      productId: selectedProduct.id,
      referralCode,
      requestId,
      type: 'mira_sale_payment_mock',
    });

    setPaymentRequest({
      backendStatus: 'ready',
      customerName: patientName || 'Walk-in patient',
      id: requestId,
      product: selectedProduct,
      qrValue,
      referralCode,
    });
    setModalStep('qr');
  }

  if (auth.isLoading) {
    return (
      <PageShell>
        <CenteredCard title="กำลังตรวจ account" body="กำลังเตรียม portal สำหรับหมอหรือพนักงานขายสินค้า" />
      </PageShell>
    );
  }

  if (!auth.session) {
    return (
      <PageShell>
        <AccessCard
          body="เข้าสู่ระบบด้วย account หมอหรือพนักงานก่อนเปิดสินค้า referral link และ dashboard commission"
          cta="Login sales account"
          href={{ pathname: '/', params: { redirect: '/sales-portal' } }}
          title="Sales portal สำหรับหน้างาน"
        />
      </PageShell>
    );
  }

  if (!referralAccount) {
    return (
      <PageShell>
        <CenteredCard title="Account นี้ยังไม่มีสิทธิ์" body="หน้านี้เปิดให้เฉพาะ account หมอหรือพนักงานเท่านั้น" />
      </PageShell>
    );
  }

  return (
    <PageShell
      activeTab={activeTab}
      onTabChange={(nextTab) => {
        setActiveTab(nextTab);
        setMessage(null);
      }}
      showTabs
    >
      <ReferralBrandHeader />

      {message ? <Text style={styles.messageText}>{message}</Text> : null}

      {activeTab === 'products' && selectedProduct ? (
        <ProductDetail
          onBack={() => setSelectedProductId(null)}
          onCreateReferral={() => openReferralOrder(selectedProduct)}
          product={selectedProduct}
        />
      ) : null}

      {activeTab === 'products' && !selectedProduct ? (
        <ProductCatalog
          isCompact={isCompact}
          isLoading={isLoadingProducts}
          onChooseProduct={chooseProduct}
          products={filteredProducts}
          query={query}
          selectedProductId={selectedProductId}
          setQuery={setQuery}
        />
      ) : null}

      {activeTab === 'referral' ? (
        <ReferralGenerator account={referralAccount} onCopy={(value) => setMessage(`Mock copied: ${value}`)} />
      ) : null}

      {activeTab === 'dashboard' ? <CommissionDashboard isCompact={isCompact} selectedProduct={selectedProduct} /> : null}

      <ReferralOrderModal
        form={customerForm}
        modalStep={modalStep}
        onChangeForm={updateCustomerForm}
        onClose={() => setReferralModalVisible(false)}
        onSubmit={submitReferralOrder}
        paymentRequest={paymentRequest}
        product={selectedProduct}
        visible={isReferralModalVisible}
      />
    </PageShell>
  );
}

function PageShell({
  activeTab,
  children,
  onTabChange,
  showTabs = false,
}: {
  activeTab?: SalesTab;
  children: ReactNode;
  onTabChange?: (tab: SalesTab) => void;
  showTabs?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled" style={styles.pageScroll}>
        {children}
      </ScrollView>
      {showTabs && activeTab && onTabChange ? <BottomTabBar activeTab={activeTab} onTabChange={onTabChange} /> : null}
    </SafeAreaView>
  );
}

function BottomTabBar({ activeTab, onTabChange }: { activeTab: SalesTab; onTabChange: (tab: SalesTab) => void }) {
  return (
    <View style={styles.bottomTabShell}>
      <View style={styles.bottomTabBar}>
        {salesTabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <Pressable key={tab.id} onPress={() => onTabChange(tab.id)} style={[styles.bottomTabButton, isActive ? styles.bottomTabButtonActive : null]}>
              <View style={[styles.bottomTabDot, isActive ? styles.bottomTabDotActive : null]} />
              <Text style={[styles.bottomTabText, isActive ? styles.bottomTabTextActive : null]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AccessCard({ body, cta, href, title }: { body: string; cta: string; href: Parameters<typeof Link>[0]['href']; title: string }) {
  return (
    <View style={styles.accessCard}>
      <Text style={styles.eyebrow}>Restricted</Text>
      <Text style={styles.accessTitle}>{title}</Text>
      <Text style={styles.accessBody}>{body}</Text>
      <Link href={href} asChild>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{cta}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function CenteredCard({ body, title }: { body: string; title: string }) {
  return (
    <View style={styles.accessCard}>
      <Text style={styles.accessTitle}>{title}</Text>
      <Text style={styles.accessBody}>{body}</Text>
    </View>
  );
}

function ReferralBrandHeader() {
  return (
    <View style={styles.brandHero}>
      <Image resizeMode="contain" source={require('@/assets/images/mira-care-logo.png')} style={styles.brandLogo} />
      <Text style={styles.brandProgramText}>referral program</Text>
    </View>
  );
}

function ProductCatalog({
  isCompact,
  isLoading,
  onChooseProduct,
  products,
  query,
  selectedProductId,
  setQuery,
}: {
  isCompact: boolean;
  isLoading: boolean;
  onChooseProduct: (product: SalesProduct) => void;
  products: SalesProduct[];
  query: string;
  selectedProductId: string | null;
  setQuery: (value: string) => void;
}) {
  const cardWidth: DimensionValue = isCompact ? '48%' : 220;

  return (
    <View style={styles.panel}>
      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setQuery}
          placeholder="ค้นหาสินค้า โรงพยาบาล หรือหมวดหมู่"
          placeholderTextColor={logoPalette.muted}
          style={styles.searchInput}
          value={query}
        />
        <Text style={styles.resultCount}>{isLoading ? 'syncing' : `${products.length} items`}</Text>
      </View>

      <View style={styles.productGrid}>
        {products.map((product) => (
          <SalesProductCard
            cardWidth={cardWidth}
            isSelected={selectedProductId === product.id}
            key={product.id}
            onPress={() => onChooseProduct(product)}
            product={product}
          />
        ))}
      </View>

      {!isLoading && products.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>ไม่พบสินค้า</Text>
          <Text style={styles.emptyBody}>ลองเปลี่ยนคำค้นหา หรือกลับมาดูอีกครั้งหลัง sync สินค้าจาก hospital portal</Text>
        </View>
      ) : null}
    </View>
  );
}

function SalesProductCard({
  cardWidth,
  isSelected,
  onPress,
  product,
}: {
  cardWidth: DimensionValue;
  isSelected: boolean;
  onPress: () => void;
  product: SalesProduct;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.productCard, { width: cardWidth }, isSelected ? styles.productCardSelected : null]}>
      <View style={styles.imageWrap}>
        <Image resizeMode="contain" source={product.imageUri ? { uri: product.imageUri } : productPreviewImages[product.previewKey]} style={styles.productImage} />
      </View>
      <View style={styles.productCardBody}>
        <Text numberOfLines={2} style={styles.productTitle}>{product.title}</Text>
        <Text style={styles.productPrice}>{product.priceAmount.toLocaleString('th-TH')} THB</Text>
      </View>
    </Pressable>
  );
}

function ProductDetail({
  onBack,
  onCreateReferral,
  product,
}: {
  onBack: () => void;
  onCreateReferral: () => void;
  product: SalesProduct;
}) {
  const commission = Math.round(product.priceAmount * product.commissionRate);

  return (
    <View style={styles.detailPage}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>กลับไปเลือกสินค้า</Text>
      </Pressable>

      <View style={styles.detailLayout}>
        <View style={styles.detailImagePanel}>
          <Image resizeMode="contain" source={product.imageUri ? { uri: product.imageUri } : productPreviewImages[product.previewKey]} style={styles.detailImage} />
        </View>

        <View style={styles.detailInfoPanel}>
          <Text style={styles.detailTitle}>{product.title}</Text>
          <View style={styles.shopMetaRow}>
            <Text style={styles.shopMetaText}>4.9 rating</Text>
            <Text style={styles.shopMetaDivider}>|</Text>
            <Text style={styles.shopMetaText}>128 sold</Text>
            <Text style={styles.shopMetaDivider}>|</Text>
            <Text style={styles.shopMetaText}>พร้อมขายหน้างาน</Text>
          </View>
          <Text style={styles.detailPrice}>{product.priceAmount.toLocaleString('th-TH')} THB</Text>

          <View style={styles.commissionStrip}>
            <View>
              <Text style={styles.commissionLabel}>Commission estimate</Text>
              <Text style={styles.commissionValue}>{commission.toLocaleString('th-TH')} THB ต่อ order</Text>
            </View>
            <Text style={styles.commissionRate}>{formatPercent(product.commissionRate)}</Text>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>รายละเอียดสินค้า</Text>
            <Text style={styles.detailDescription}>{product.description}</Text>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>ขั้นตอนหลังลูกค้าชำระเงิน</Text>
            <Text style={styles.detailDescription}>ระบบ mock จะส่งข้อมูลสินค้า ลูกค้า และ referral code ไปให้หลังบ้านเพื่อสร้าง order และติดตามสถานะการซื้อ</Text>
          </View>

          <Pressable onPress={onCreateReferral} style={styles.buyReferralButton}>
            <Text style={styles.buyReferralButtonText}>สร้าง referral code</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ReferralOrderModal({
  form,
  modalStep,
  onChangeForm,
  onClose,
  onSubmit,
  paymentRequest,
  product,
  visible,
}: {
  form: CustomerForm;
  modalStep: ModalStep;
  onChangeForm: (field: keyof CustomerForm, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  paymentRequest: PaymentRequest | null;
  product: SalesProduct | null;
  visible: boolean;
}) {
  const canSubmit = Boolean(product && isCustomerFormReady(form));
  const nationalIdHint = form.nationalId.length > 0 && form.nationalId.length < 13 ? `กรอกอีก ${13 - form.nationalId.length} หลัก` : 'ใช้เลข 13 หลักสำหรับส่งหลังบ้านเท่านั้น';
  const ageHint = form.age.length > 0 && !isValidAge(form.age) ? 'กรอกอายุ 1-120 ปี' : 'ข้อมูลนี้ช่วยหลังบ้านเตรียมการจองให้เหมาะกับผู้ป่วย';

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.orderModal}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.eyebrow}>Referral checkout</Text>
                <Text style={styles.modalTitle}>{product?.title ?? 'เลือกสินค้า'}</Text>
                <Text style={styles.modalBody}>สร้าง order mock สำหรับลูกค้า สแกนจ่าย และส่งข้อมูลให้หลังบ้าน</Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>ปิด</Text>
              </Pressable>
            </View>

            {modalStep === 'form' ? (
              <View style={styles.formSection}>
                <View style={styles.formGrid}>
                  <View style={[styles.inputGroup, styles.halfInputGroup]}>
                    <Text style={styles.inputLabel}>ชื่อ</Text>
                    <TextInput
                      onChangeText={(value) => onChangeForm('firstName', value)}
                      placeholder="เช่น ปวีณา"
                      placeholderTextColor={logoPalette.muted}
                      style={styles.formInput}
                      value={form.firstName}
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.halfInputGroup]}>
                    <Text style={styles.inputLabel}>นามสกุล</Text>
                    <TextInput
                      onChangeText={(value) => onChangeForm('lastName', value)}
                      placeholder="เช่น ใจดี"
                      placeholderTextColor={logoPalette.muted}
                      style={styles.formInput}
                      value={form.lastName}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>เบอร์โทร</Text>
                  <TextInput
                    keyboardType="phone-pad"
                    onChangeText={(value) => onChangeForm('customerPhone', value)}
                    placeholder="08x-xxx-xxxx"
                    placeholderTextColor={logoPalette.muted}
                    style={styles.formInput}
                    value={form.customerPhone}
                  />
                </View>

                <View style={styles.formGrid}>
                  <View style={[styles.inputGroup, styles.halfInputGroup]}>
                    <Text style={styles.inputLabel}>อายุ</Text>
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={(value) => onChangeForm('age', value)}
                      placeholder="เช่น 42"
                      placeholderTextColor={logoPalette.muted}
                      style={styles.formInput}
                      value={form.age}
                    />
                    <Text style={[styles.inputHint, form.age.length > 0 && !isValidAge(form.age) ? styles.inputHintError : null]}>{ageHint}</Text>
                  </View>

                  <View style={[styles.inputGroup, styles.halfInputGroup]}>
                    <Text style={styles.inputLabel}>เลขบัตรประชาชน 13 หลัก</Text>
                    <TextInput
                      keyboardType="number-pad"
                      maxLength={13}
                      onChangeText={(value) => onChangeForm('nationalId', value)}
                      placeholder="1234567890123"
                      placeholderTextColor={logoPalette.muted}
                      style={styles.formInput}
                      value={form.nationalId}
                    />
                    <Text style={[styles.inputHint, form.nationalId.length > 0 && form.nationalId.length < 13 ? styles.inputHintError : null]}>{nationalIdHint}</Text>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>เพศ (optional)</Text>
                  <View style={styles.choiceRow}>
                    {genderOptions.map((option) => {
                      const isSelected = form.gender === option.value;

                      return (
                        <Pressable key={option.value} onPress={() => onChangeForm('gender', isSelected ? '' : option.value)} style={[styles.choiceChip, isSelected ? styles.choiceChipActive : null]}>
                          <Text style={[styles.choiceChipText, isSelected ? styles.choiceChipTextActive : null]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email ลูกค้า (optional)</Text>
                  <TextInput
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={(value) => onChangeForm('customerEmail', value)}
                    placeholder="customer@email.com"
                    placeholderTextColor={logoPalette.muted}
                    style={styles.formInput}
                    value={form.customerEmail}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>โรคประจำตัว / แพ้ยา / ยาที่ใช้อยู่ (optional)</Text>
                  <TextInput
                    multiline
                    onChangeText={(value) => onChangeForm('medicalNotes', value)}
                    placeholder="เช่น เบาหวาน แพ้ penicillin หรือทานยาละลายลิ่มเลือด"
                    placeholderTextColor={logoPalette.muted}
                    style={[styles.formInput, styles.noteInput]}
                    value={form.medicalNotes}
                  />
                </View>

                <View style={styles.formGrid}>
                  <View style={[styles.inputGroup, styles.halfInputGroup]}>
                    <Text style={styles.inputLabel}>ผู้ติดต่อฉุกเฉิน (optional)</Text>
                    <TextInput
                      onChangeText={(value) => onChangeForm('emergencyContactName', value)}
                      placeholder="ชื่อผู้ติดต่อ"
                      placeholderTextColor={logoPalette.muted}
                      style={styles.formInput}
                      value={form.emergencyContactName}
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.halfInputGroup]}>
                    <Text style={styles.inputLabel}>เบอร์ผู้ติดต่อ (optional)</Text>
                    <TextInput
                      keyboardType="phone-pad"
                      onChangeText={(value) => onChangeForm('emergencyContactPhone', value)}
                      placeholder="08x-xxx-xxxx"
                      placeholderTextColor={logoPalette.muted}
                      style={styles.formInput}
                      value={form.emergencyContactPhone}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>หมายเหตุเพิ่มเติม</Text>
                  <TextInput
                    multiline
                    onChangeText={(value) => onChangeForm('note', value)}
                    placeholder="เช่น ข้อมูลเอกสาร การติดต่อ หรือคำถามเพิ่มเติม"
                    placeholderTextColor={logoPalette.muted}
                    style={[styles.formInput, styles.noteInput]}
                    value={form.note}
                  />
                </View>

                <Pressable disabled={!canSubmit} onPress={onSubmit} style={[styles.modalPrimaryButton, !canSubmit ? styles.modalPrimaryButtonDisabled : null]}>
                  <Text style={styles.modalPrimaryButtonText}>ตกลงและสร้าง QR จ่ายเงิน</Text>
                </Pressable>
              </View>
            ) : null}

            {modalStep === 'qr' && paymentRequest ? (
              <View style={styles.paymentSection}>
                <View style={styles.paymentQrBox}>
                  <QRCode backgroundColor="#FFFFFF" color={logoPalette.blueDeep} quietZone={10} size={220} value={paymentRequest.qrValue} />
                </View>
                <View style={styles.paymentSummary}>
                  <Text style={styles.paymentTitle}>ให้ลูกค้าสแกนเพื่อจ่าย</Text>
                  <Text style={styles.paymentAmount}>{paymentRequest.product.priceAmount.toLocaleString('th-TH')} THB</Text>
                  <Text style={styles.paymentLine}>Order: {paymentRequest.id}</Text>
                  <Text style={styles.paymentLine}>Referral: {paymentRequest.referralCode}</Text>
                  <Text style={styles.paymentLine}>ลูกค้า: {paymentRequest.customerName}</Text>
                </View>
                <View style={styles.paymentWaitingBox}>
                  <Text style={styles.paymentWaitingTitle}>รอลูกค้าชำระเงิน</Text>
                  <Text style={styles.paymentWaitingBody}>เมื่อ payment gateway หรือ backend ยืนยันยอด ระบบจะเปลี่ยนเป็นหน้าสำเร็จอัตโนมัติ</Text>
                </View>
              </View>
            ) : null}

            {modalStep === 'complete' && paymentRequest ? (
              <View style={styles.completeSection}>
                <Text style={styles.completeTitle}>ชำระเงินสำเร็จ</Text>
                <Text style={styles.completeBody}>ระบบ mock ส่งข้อมูลไปให้หลังบ้านแล้ว เพื่อบันทึกการซื้อสินค้าและ referral attribution</Text>
                <View style={styles.backendStatusBox}>
                  <Text style={styles.paymentLine}>Order: {paymentRequest.id}</Text>
                  <Text style={styles.paymentLine}>Backend sync: {paymentRequest.backendStatus}</Text>
                </View>
                <Pressable onPress={onClose} style={styles.modalPrimaryButton}>
                  <Text style={styles.modalPrimaryButtonText}>ปิด</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ReferralGenerator({ account, onCopy }: { account: ReferralAccount; onCopy: (value: string) => void }) {
  const referralLink = createAccountReferralLink(account);
  const deepLink = createAppReferralDeepLink(account);

  return (
    <View style={styles.referralLayout}>
      <View style={styles.referralCard}>
        <Text style={styles.panelTitle}>Referral link ของคุณ</Text>
        <Text style={styles.panelBody}>ส่งลิงก์นี้ให้ลูกค้า ถ้ามีแอปอยู่แล้วจะเปิดเข้าแอปพร้อมผูก code ถ้ายังไม่มีแอปจะพาไปหน้าโหลดก่อน</Text>
        <View style={styles.qrBox}>
          <QRCode backgroundColor="#FFFFFF" color={logoPalette.blueDeep} quietZone={10} size={220} value={referralLink} />
        </View>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Referral code</Text>
          <Text style={styles.codeText}>{account.code}</Text>
          <Text numberOfLines={2} style={styles.linkText}>{referralLink}</Text>
        </View>
        <View style={styles.actionRow}>
          <Pressable onPress={() => onCopy(account.code)} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Copy code</Text>
          </Pressable>
          <Pressable onPress={() => onCopy(referralLink)} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Copy link</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.flowCard}>
        <Text style={styles.panelTitle}>Customer flow</Text>
        {[
          'ลูกค้ากด referral link หรือสแกน QR',
          'ถ้ามี app แล้ว เปิดเข้า app พร้อมผูก code',
          'ถ้ายังไม่มี app พาไปหน้า download ก่อน',
          'เมื่อลูกค้าซื้อสินค้า commission จะเข้าบัญชีนี้',
        ].map((step, index) => (
          <View key={step} style={styles.flowStep}>
            <Text style={styles.flowNumber}>{index + 1}</Text>
            <Text style={styles.flowText}>{step}</Text>
          </View>
        ))}
        <View style={styles.deepLinkBox}>
          <Text style={styles.deepLinkLabel}>App deep link mock</Text>
          <Text style={styles.deepLinkText}>{deepLink}</Text>
        </View>
      </View>
    </View>
  );
}

function CommissionDashboard({
  isCompact,
  selectedProduct,
}: {
  isCompact: boolean;
  selectedProduct: SalesProduct | null;
}) {
  const projectedCommission = selectedProduct ? Math.round(selectedProduct.priceAmount * selectedProduct.commissionRate) : 0;
  const dashboardPanelStyle = [styles.dashboardPanel, isCompact ? styles.dashboardPanelCompact : null];
  const statCardStyle = [styles.statCard, isCompact ? styles.statCardCompact : null];
  const areaTrendRows = [
    { label: 'Jan', value: 28450 },
    { label: 'Feb', value: 13600 },
    { label: 'Mar', value: 15200 },
    { label: 'Apr', value: 10400 },
    { label: 'May', value: 23100 },
    { label: 'Jun', value: 28450 },
    { label: 'Jul', value: 22100 },
  ];
  const funnelRows = [
    { label: 'ผูก code', value: 42 },
    { label: 'เริ่ม checkout', value: 18 },
    { label: 'จ่ายสำเร็จ', value: 11 },
  ];
  const maxFunnelValue = Math.max(...funnelRows.map((row) => row.value));
  const lineChartWidth = 320;
  const lineChartHeight = 218;
  const lineChartLeft = 38;
  const lineChartRight = 304;
  const lineChartTop = 20;
  const lineChartBottom = 166;
  const minAreaTrendValue = Math.min(...areaTrendRows.map((row) => row.value));
  const maxAreaTrendValue = Math.max(...areaTrendRows.map((row) => row.value));
  const areaTrendRange = Math.max(maxAreaTrendValue - minAreaTrendValue, 1);
  const areaTrendPoints: ChartPoint[] = areaTrendRows.map((row, index) => {
    const x = lineChartLeft + index * ((lineChartRight - lineChartLeft) / Math.max(areaTrendRows.length - 1, 1));
    const y = lineChartTop + (1 - (row.value - minAreaTrendValue) / areaTrendRange) * (lineChartBottom - lineChartTop);

    return { ...row, x, y };
  });
  const areaTrendPath = areaTrendPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaTrendFillPath = `${areaTrendPath} L ${areaTrendPoints[areaTrendPoints.length - 1].x} ${lineChartBottom} L ${areaTrendPoints[0].x} ${lineChartBottom} Z`;
  const areaChartGridRows = [
    { label: '30k', y: lineChartTop },
    { label: '20k', y: lineChartTop + (lineChartBottom - lineChartTop) / 2 },
    { label: '10k', y: lineChartBottom },
  ];
  const stats = [
    { label: 'ยอด commission เดือนนี้', value: '28,450 THB' },
    { label: 'ลูกค้าที่ผูก code', value: '42' },
    { label: 'รอ payout', value: '12,700 THB' },
    { label: 'Conversion', value: '8.4%' },
  ];

  return (
    <View style={styles.dashboardStack}>
      <View style={styles.dashboardGrid}>
        {stats.map((stat) => (
          <View key={stat.label} style={statCardStyle}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={dashboardPanelStyle}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.panelTitle}>Commission trend</Text>
            <Text style={styles.chartSubtitle}>ยอดสะสมรายเดือนจาก referral order</Text>
          </View>
          <Text style={styles.chartTotal}>+18%</Text>
        </View>

        <View style={styles.lineChartCard}>
          <Svg height={lineChartHeight} viewBox={`0 0 ${lineChartWidth} ${lineChartHeight}`} width="100%">
            <Defs>
              <LinearGradient id="commissionAreaFill" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor="#4FB9D5" stopOpacity={0.62} />
                <Stop offset="1" stopColor="#4FB9D5" stopOpacity={0.28} />
              </LinearGradient>
            </Defs>

            <SvgText fill={logoPalette.blueDeep} fontSize={11} fontWeight="900" textAnchor="start" x={lineChartLeft} y={12}>
              COMMISSION
            </SvgText>

            {areaChartGridRows.map((row) => (
              <G key={row.label}>
                <SvgText fill={logoPalette.muted} fontSize={9} fontWeight="700" textAnchor="end" x={lineChartLeft - 8} y={row.y + 3}>
                  {row.label}
                </SvgText>
                <Line stroke={logoPalette.line} strokeWidth={1} x1={lineChartLeft} x2={lineChartRight} y1={row.y} y2={row.y} />
              </G>
            ))}
            <Line stroke={logoPalette.line} strokeWidth={1} x1={lineChartLeft} x2={lineChartLeft} y1={lineChartTop} y2={lineChartBottom} />
            <Line stroke={logoPalette.line} strokeWidth={1.4} x1={lineChartLeft} x2={lineChartRight} y1={lineChartBottom} y2={lineChartBottom} />
            <Path d={areaTrendFillPath} fill="url(#commissionAreaFill)" />
            <Path d={areaTrendPath} fill="none" stroke="#4FB9D5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
            {areaTrendPoints.map((point) => (
              <Circle cx={point.x} cy={point.y} fill="#FFFFFF" key={`area-dot-${point.label}`} r={3.6} stroke="#4FB9D5" strokeWidth={2.4} />
            ))}
            {areaTrendPoints.map((point) => (
              <SvgText fill={logoPalette.muted} fontSize={8.5} fontWeight="800" key={`area-label-${point.label}`} textAnchor="middle" x={point.x} y={lineChartBottom + 18}>
                {point.label}
              </SvgText>
            ))}
          </Svg>
        </View>

        <View style={styles.chartLegendRow}>
          <Text style={styles.chartLegendText}>Jan 28.4k</Text>
          <Text style={styles.chartLegendText}>Jun 28.4k THB</Text>
        </View>
      </View>

      <View style={dashboardPanelStyle}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.panelTitle}>Referral funnel</Text>
            <Text style={styles.chartSubtitle}>ลูกค้าจาก code จนถึงจ่ายสำเร็จ</Text>
          </View>
          <Text style={styles.chartTotal}>26%</Text>
        </View>

        {funnelRows.map((row) => {
          const fillWidth = `${Math.max(10, Math.round((row.value / maxFunnelValue) * 100))}%` as DimensionValue;

          return (
            <View key={row.label} style={styles.funnelRow}>
              <View style={styles.funnelCopy}>
                <Text style={styles.funnelLabel}>{row.label}</Text>
                <Text style={styles.funnelValue}>{row.value.toLocaleString('th-TH')}</Text>
              </View>
              <View style={styles.funnelTrack}>
                <View style={[styles.funnelFill, { width: fillWidth }]} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={dashboardPanelStyle}>
        <Text style={styles.panelTitle}>Selected product estimate</Text>
        {selectedProduct ? (
          <>
            <Text numberOfLines={2} style={styles.dashboardProductName}>{selectedProduct.title}</Text>
            <Text style={[styles.panelBody, styles.dashboardEstimateText]}>
              จะได้ commission ประมาณ {projectedCommission.toLocaleString('th-TH')} THB ต่อ order
            </Text>
          </>
        ) : (
          <Text style={[styles.panelBody, styles.dashboardEstimateText]}>เลือกสินค้าจาก tab สินค้า เพื่อดู commission estimate รายสินค้า</Text>
        )}
      </View>
    </View>
  );
}

function filterProducts(products: SalesProduct[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return products;
  }

  return products.filter((product) =>
    [
      product.title,
      product.hospitalName,
      product.categoryLabel,
      product.description,
      product.tags.join(' '),
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

function buildCustomerName(form: CustomerForm) {
  return [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ');
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function isCustomerFormReady(form: CustomerForm) {
  return Boolean(
    form.firstName.trim() &&
      form.lastName.trim() &&
      form.customerPhone.trim() &&
      isValidAge(form.age) &&
      form.nationalId.length === 13,
  );
}

function isValidAge(value: string) {
  const age = Number(value);

  return Number.isInteger(age) && age >= 1 && age <= 120;
}

function toSalesProduct(product: HospitalProduct): SalesProduct {
  return {
    categoryLabel: getProductCategoryLabel(product.category),
    commissionRate: product.commissionRate,
    description: product.description,
    hospitalName: product.hospitalName,
    id: product.id,
    imageUri: product.productImagePreviewUri,
    previewKey: inferPreviewKey(product.title, product.category, product.tags),
    priceAmount: product.priceAmount,
    source: 'hospital_portal',
    tags: product.tags.length ? product.tags : ['Hospital product'],
    title: product.title,
  };
}

function inferPreviewKey(title: string, category: string, tags: string[]): NonNullable<HealthPackage['previewImageKey']> {
  const text = `${title} ${category} ${tags.join(' ')}`.toLowerCase();

  if (text.includes('cancer') || text.includes('tumor') || text.includes('oncology')) {
    return 'cancer';
  }

  if (text.includes('longevity') || text.includes('hormone') || text.includes('wellness')) {
    return 'longevity';
  }

  if (text.includes('heart') || text.includes('metabolic') || text.includes('cardio')) {
    return 'heart';
  }

  return 'blood';
}

const fallbackProducts: SalesProduct[] = healthPackages.map((product) => ({
  categoryLabel: product.category,
  commissionRate: fallbackCommissionRateByPreviewKey[product.previewImageKey ?? 'blood'],
  description: product.bestFor,
  hospitalName: product.hospital,
  id: product.id,
  imageUri: null,
  previewKey: product.previewImageKey ?? 'blood',
  priceAmount: product.price.amount,
  source: 'demo',
  tags: product.tags,
  title: product.title,
}));

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: logoPalette.canvas,
    flex: 1,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 1180,
    padding: 16,
    paddingBottom: 24,
    width: '100%',
  },
  brandHero: {
    alignItems: 'center',
    backgroundColor: logoPalette.brandWash,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 150,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 20,
    ...softShadow,
  },
  brandLogo: {
    height: 70,
    maxWidth: 330,
    width: '86%',
  },
  brandProgramText: {
    color: logoPalette.blueDeep,
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  eyebrow: {
    color: logoPalette.blue,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  tabBar: {
    backgroundColor: logoPalette.mist,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderWidth: 1,
  },
  tabButtonText: {
    color: logoPalette.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  tabButtonTextActive: {
    color: logoPalette.blue,
  },
  bottomTabShell: {
    alignItems: 'center',
    backgroundColor: logoPalette.canvas,
    borderTopColor: logoPalette.line,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
  },
  bottomTabBar: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    maxWidth: 560,
    padding: 5,
    width: '100%',
    ...softShadow,
  },
  bottomTabButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    gap: 4,
    minHeight: 50,
    justifyContent: 'center',
  },
  bottomTabButtonActive: {
    backgroundColor: logoPalette.mist,
  },
  bottomTabDot: {
    backgroundColor: '#B9CAE8',
    borderRadius: 999,
    height: 5,
    width: 18,
  },
  bottomTabDotActive: {
    backgroundColor: logoPalette.blue,
  },
  bottomTabText: {
    color: logoPalette.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  bottomTabTextActive: {
    color: logoPalette.blue,
  },
  panel: {
    gap: 14,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    color: logoPalette.text,
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    minWidth: 250,
    paddingHorizontal: 13,
  },
  resultCount: {
    color: logoPalette.blue,
    fontSize: 12,
    fontWeight: '900',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  productCardSelected: {
    borderColor: logoPalette.blue,
    borderWidth: 2,
  },
  imageWrap: {
    backgroundColor: '#FFFFFF',
    height: 154,
    overflow: 'hidden',
    padding: 8,
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productCardBody: {
    gap: 6,
    padding: 10,
  },
  productTitle: {
    color: logoPalette.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  productPrice: {
    color: logoPalette.text,
    fontSize: 13,
    fontWeight: '900',
  },
  detailPage: {
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  backButtonText: {
    color: logoPalette.blue,
    fontSize: 13,
    fontWeight: '900',
  },
  detailLayout: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailImagePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 300,
    overflow: 'hidden',
  },
  detailImage: {
    backgroundColor: '#FFFFFF',
    height: 360,
    width: '100%',
  },
  detailInfoPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    minWidth: 300,
    padding: 14,
  },
  detailTitle: {
    color: logoPalette.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  shopMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  shopMetaText: {
    color: logoPalette.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  shopMetaDivider: {
    color: '#B9CAE8',
    fontSize: 12,
    fontWeight: '900',
  },
  detailPrice: {
    color: logoPalette.blue,
    fontSize: 26,
    fontWeight: '900',
  },
  commissionStrip: {
    alignItems: 'center',
    backgroundColor: logoPalette.mist,
    borderColor: '#C8DBFF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
  },
  commissionLabel: {
    color: logoPalette.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  commissionValue: {
    color: logoPalette.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 3,
  },
  commissionRate: {
    color: logoPalette.blue,
    fontSize: 20,
    fontWeight: '900',
  },
  detailSection: {
    borderTopColor: logoPalette.line,
    borderTopWidth: 1,
    gap: 6,
    paddingTop: 12,
  },
  detailSectionTitle: {
    color: logoPalette.text,
    fontSize: 15,
    fontWeight: '900',
  },
  detailDescription: {
    color: logoPalette.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  buyReferralButton: {
    alignItems: 'center',
    backgroundColor: logoPalette.blue,
    borderRadius: 8,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buyReferralButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  referralLayout: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  referralCard: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    minWidth: 300,
    padding: 14,
  },
  flowCard: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 10,
    minWidth: 300,
    padding: 14,
  },
  panelTitle: {
    color: logoPalette.text,
    fontSize: 18,
    fontWeight: '900',
  },
  panelBody: {
    color: logoPalette.muted,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  qrBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    padding: 16,
  },
  codeBox: {
    backgroundColor: '#F7FBFF',
    borderColor: logoPalette.blueSoft,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  codeLabel: {
    color: logoPalette.blue,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  codeText: {
    color: logoPalette.blueDeep,
    fontSize: 22,
    fontWeight: '900',
  },
  linkText: {
    color: logoPalette.blue,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: '#F7FBFF',
    borderColor: logoPalette.line,
    borderWidth: 1,
    borderRadius: 8,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: logoPalette.blue,
    fontSize: 13,
    fontWeight: '900',
  },
  flowStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  flowNumber: {
    backgroundColor: logoPalette.mist,
    borderRadius: 999,
    color: logoPalette.blue,
    fontSize: 12,
    fontWeight: '900',
    height: 28,
    lineHeight: 28,
    textAlign: 'center',
    width: 28,
  },
  flowText: {
    color: logoPalette.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  deepLinkBox: {
    backgroundColor: logoPalette.mist,
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  deepLinkLabel: {
    color: logoPalette.muted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  deepLinkText: {
    color: logoPalette.text,
    fontSize: 12,
    fontWeight: '800',
  },
  dashboardStack: {
    gap: 10,
    width: '100%',
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  statCard: {
    backgroundColor: '#F7FBFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 170,
    padding: 13,
  },
  statCardCompact: {
    flexGrow: 0,
    minWidth: 0,
    width: '48%',
  },
  statValue: {
    color: logoPalette.blueDeep,
    fontSize: 20,
    fontWeight: '900',
  },
  statLabel: {
    color: logoPalette.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  dashboardPanel: {
    backgroundColor: '#F7FBFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    gap: 9,
    minWidth: 300,
    padding: 14,
  },
  dashboardPanelCompact: {
    flexGrow: 0,
    minWidth: 0,
    width: '100%',
  },
  dashboardProductName: {
    color: logoPalette.muted,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    width: '100%',
  },
  dashboardEstimateText: {
    width: '100%',
  },
  chartHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  chartSubtitle: {
    color: logoPalette.muted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 3,
  },
  chartTotal: {
    color: logoPalette.blue,
    fontSize: 15,
    fontWeight: '900',
  },
  lineChartCard: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
  },
  chartLegendRow: {
    borderTopColor: logoPalette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 9,
  },
  chartLegendText: {
    color: logoPalette.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  funnelRow: {
    gap: 7,
  },
  funnelCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  funnelLabel: {
    color: logoPalette.text,
    fontSize: 13,
    fontWeight: '900',
  },
  funnelValue: {
    color: logoPalette.blue,
    fontSize: 13,
    fontWeight: '900',
  },
  funnelTrack: {
    backgroundColor: logoPalette.mist,
    borderRadius: 999,
    height: 11,
    overflow: 'hidden',
  },
  funnelFill: {
    backgroundColor: logoPalette.blueMid,
    borderRadius: 999,
    height: '100%',
  },
  activityRow: {
    alignItems: 'center',
    borderBottomColor: logoPalette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 9,
  },
  activityCopy: {
    flex: 1,
    gap: 3,
  },
  activityOrder: {
    color: logoPalette.text,
    fontSize: 13,
    fontWeight: '900',
  },
  activityProduct: {
    color: logoPalette.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  activityAmount: {
    color: logoPalette.blue,
    fontSize: 13,
    fontWeight: '900',
  },
  messageText: {
    color: logoPalette.blue,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  emptyTitle: {
    color: logoPalette.text,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyBody: {
    color: logoPalette.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,42,95,0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  orderModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    maxHeight: '92%',
    maxWidth: 520,
    overflow: 'hidden',
    width: '100%',
  },
  modalContent: {
    gap: 14,
    padding: 16,
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    color: logoPalette.text,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  modalBody: {
    color: logoPalette.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: logoPalette.mist,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  closeButtonText: {
    color: logoPalette.text,
    fontSize: 12,
    fontWeight: '900',
  },
  formSection: {
    gap: 12,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inputGroup: {
    gap: 6,
  },
  halfInputGroup: {
    flex: 1,
    minWidth: 150,
  },
  inputLabel: {
    color: logoPalette.text,
    fontSize: 13,
    fontWeight: '900',
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    color: logoPalette.text,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputHint: {
    color: logoPalette.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  inputHintError: {
    color: '#B45309',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    backgroundColor: logoPalette.mist,
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  choiceChipActive: {
    backgroundColor: '#E2ECFF',
    borderColor: logoPalette.blue,
  },
  choiceChipText: {
    color: logoPalette.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  choiceChipTextActive: {
    color: logoPalette.blue,
  },
  noteInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  modalPrimaryButton: {
    alignItems: 'center',
    backgroundColor: logoPalette.blue,
    borderRadius: 8,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalPrimaryButtonDisabled: {
    backgroundColor: '#BFD0EF',
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  paymentSection: {
    gap: 13,
  },
  paymentQrBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  paymentSummary: {
    backgroundColor: logoPalette.mist,
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  paymentTitle: {
    color: logoPalette.text,
    fontSize: 16,
    fontWeight: '900',
  },
  paymentAmount: {
    color: logoPalette.blue,
    fontSize: 24,
    fontWeight: '900',
  },
  paymentLine: {
    color: logoPalette.muted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  paymentWaitingBox: {
    backgroundColor: logoPalette.mist,
    borderColor: '#C8DBFF',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  paymentWaitingTitle: {
    color: logoPalette.blue,
    fontSize: 15,
    fontWeight: '900',
  },
  paymentWaitingBody: {
    color: logoPalette.muted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  completeSection: {
    gap: 12,
  },
  completeTitle: {
    color: logoPalette.blue,
    fontSize: 22,
    fontWeight: '900',
  },
  completeBody: {
    color: logoPalette.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  backendStatusBox: {
    backgroundColor: logoPalette.mist,
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  accessCard: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: logoPalette.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    maxWidth: 520,
    padding: 18,
    width: '100%',
    ...softShadow,
  },
  accessTitle: {
    color: logoPalette.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  accessBody: {
    color: logoPalette.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: logoPalette.blue,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
