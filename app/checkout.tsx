import { Link, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiraDesign } from '@/constants/Design';
import { loadActiveHospitalProducts, type HospitalProduct } from '@/lib/marketplace/hospitalProducts';
import { currentUser, featuredPackage, formatMoney, healthPackages, hospitalBranches } from '@/services/mockBackend';
import type { HealthPackage } from '@/domain/health';

const brandLogo = require('@/assets/images/mira-care-logo.png');

const productPreviewImages = {
  blood: require('@/assets/images/product-preview-blood.png'),
  cancer: require('@/assets/images/product-preview-cancer.png'),
  heart: require('@/assets/images/product-preview-heart.png'),
  longevity: require('@/assets/images/product-preview-longevity.png'),
} satisfies Record<NonNullable<HealthPackage['previewImageKey']>, ImageSourcePropType>;

function resolveParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatProductMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

function inferPreviewKey(product: HospitalProduct | null, fallbackPackage: HealthPackage): NonNullable<HealthPackage['previewImageKey']> {
  if (product?.productImagePreviewUri) {
    return fallbackPackage.previewImageKey ?? 'blood';
  }

  const text = `${product?.title ?? fallbackPackage.title} ${product?.category ?? fallbackPackage.category} ${(product?.tags ?? fallbackPackage.tags).join(' ')}`.toLowerCase();

  if (text.includes('cancer') || text.includes('tumor') || text.includes('oncology')) {
    return 'cancer';
  }

  if (text.includes('longevity') || text.includes('hormone') || text.includes('inflammation')) {
    return 'longevity';
  }

  if (text.includes('heart') || text.includes('metabolic') || text.includes('cardio')) {
    return 'heart';
  }

  return fallbackPackage.previewImageKey ?? 'blood';
}

function getPreviewSource(product: HospitalProduct | null, fallbackPackage: HealthPackage): ImageSourcePropType {
  if (product?.productImagePreviewUri) {
    return { uri: product.productImagePreviewUri };
  }

  return productPreviewImages[inferPreviewKey(product, fallbackPackage)];
}

function StatusGlyphs() {
  return (
    <View style={styles.statusGlyphs}>
      <View style={styles.signalBars}>
        <View style={[styles.signalBar, { height: 4 }]} />
        <View style={[styles.signalBar, { height: 6 }]} />
        <View style={[styles.signalBar, { height: 8 }]} />
      </View>
      <View style={styles.wifiDot} />
      <View style={styles.battery}>
        <View style={styles.batteryFill} />
      </View>
    </View>
  );
}

function BackgroundSheen() {
  return (
    <>
      <View style={[styles.wave, styles.waveTop]} />
      <View style={[styles.wave, styles.waveMid]} />
      <View style={[styles.wave, styles.waveBottom]} />
      <View style={styles.softGlowOne} />
      <View style={styles.softGlowTwo} />
    </>
  );
}

function CheckoutStep({ active, label, value }: { active?: boolean; label: string; value: string }) {
  return (
    <View style={[styles.stepPill, active ? styles.stepPillActive : null]}>
      <Text style={[styles.stepValue, active ? styles.stepValueActive : null]}>{value}</Text>
      <Text style={[styles.stepLabel, active ? styles.stepLabelActive : null]}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

export default function CheckoutScreen() {
  const params = useLocalSearchParams();
  const { height, width } = useWindowDimensions();
  const productId = resolveParam(params.productId);
  const packageId = resolveParam(params.packageId);
  const branchId = resolveParam(params.branchId);
  const [hospitalProduct, setHospitalProduct] = useState<HospitalProduct | null>(null);
  const [hasLoadedProduct, setHasLoadedProduct] = useState(!productId);
  const selectedPackage = healthPackages.find((item) => item.id === packageId) ?? featuredPackage;
  const selectedBranch = hospitalBranches.find((branch) => branch.id === branchId && branch.supportedPackageIds.includes(selectedPackage.id));
  const shouldShowProductLoading = Boolean(productId) && !hasLoadedProduct;
  const checkoutTitle = shouldShowProductLoading ? 'กำลังเตรียมแพ็กเกจ...' : hospitalProduct?.title ?? selectedPackage.title;
  const checkoutHospital = shouldShowProductLoading ? 'Loading hospital details' : hospitalProduct?.hospitalName ?? selectedPackage.hospital;
  const checkoutPrice = shouldShowProductLoading ? '--' : hospitalProduct ? formatProductMoney(hospitalProduct.priceAmount) : formatMoney(selectedPackage.price);
  const checkoutIncludes = hospitalProduct?.includes.length ? hospitalProduct.includes : selectedPackage.includes;
  const checkoutDescription = hospitalProduct?.description ?? selectedPackage.bestFor;
  const checkoutLocation = shouldShowProductLoading
    ? null
    : hospitalProduct
      ? {
          address: hospitalProduct.hospitalAddress ?? hospitalProduct.location ?? 'Confirm with hospital',
          name: hospitalProduct.hospitalName,
          nextSlot: hospitalProduct.bookingNote ?? 'Confirm by call center',
        }
      : selectedBranch
        ? {
            address: selectedBranch.address,
            name: selectedBranch.name,
            nextSlot: selectedBranch.nextSlot,
          }
        : null;
  const previewSource = useMemo(() => getPreviewSource(hospitalProduct, selectedPackage), [hospitalProduct, selectedPackage]);
  const frameSize = {
    minHeight: Math.min(Math.max(height - 68, 720), 812),
    width: Math.min(width - 16, 390),
  };

  useEffect(() => {
    let isMounted = true;

    if (!productId) {
      setHospitalProduct(null);
      setHasLoadedProduct(true);
      return () => {
        isMounted = false;
      };
    }

    setHasLoadedProduct(false);

    loadActiveHospitalProducts(80)
      .then((products) => {
        if (isMounted) {
          setHospitalProduct(products.find((product) => product.id === productId) ?? null);
          setHasLoadedProduct(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setHospitalProduct(null);
          setHasLoadedProduct(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [productId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.stage}>
          <View style={[styles.phoneShell, frameSize]}>
            <LinearGradient colors={['#A8C8FF', '#D8E9FF', '#F6FBFF']} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
              <BackgroundSheen />

              <View style={styles.statusBar}>
                <Text style={styles.statusTime}>9:40 PM</Text>
                <StatusGlyphs />
              </View>

              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                  <Image source={brandLogo} resizeMode="contain" style={styles.logo} />
                  <Text style={styles.headerTitle}>Checkout</Text>
                  <Text style={styles.headerSubtitle}>Review package, location, and payment split.</Text>
                </View>

                <BlurView intensity={34} tint="light" style={styles.productCard}>
                  <Image source={previewSource} resizeMode="cover" style={styles.productImage} />
                  <View style={styles.productOverlay}>
                    <Text style={styles.productKicker}>Package preview</Text>
                    <Text numberOfLines={2} style={styles.productTitle}>
                      {checkoutTitle}
                    </Text>
                  </View>
                </BlurView>

                <View style={styles.stepRow}>
                  <CheckoutStep active label="Package" value="01" />
                  <CheckoutStep active label="Details" value="02" />
                  <CheckoutStep label="Pay" value="03" />
                </View>

                <BlurView intensity={30} tint="light" style={styles.glassCard}>
                  <View style={styles.cardTop}>
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardEyebrow}>Selected offer</Text>
                      <Text numberOfLines={2} style={styles.cardTitle}>
                        {checkoutTitle}
                      </Text>
                      <Text numberOfLines={1} style={styles.cardSubtitle}>
                        {checkoutHospital}
                      </Text>
                    </View>
                    <View style={styles.pricePill}>
                      <Text style={styles.priceText}>{checkoutPrice}</Text>
                    </View>
                  </View>

                  <Text numberOfLines={3} style={styles.description}>
                    {checkoutDescription}
                  </Text>

                  <View style={styles.includeGrid}>
                    {checkoutIncludes.slice(0, 4).map((item) => (
                      <View key={item} style={styles.includeChip}>
                        <Text numberOfLines={1} style={styles.includeText}>
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>
                </BlurView>

                <BlurView intensity={28} tint="light" style={styles.glassCard}>
                  <Text style={styles.sectionTitle}>Visit detail</Text>
                  <DetailRow label="Location" value={checkoutLocation?.name ?? 'Confirm with hospital'} />
                  <DetailRow label="Address" value={checkoutLocation?.address ?? 'Confirm after payment'} />
                  <DetailRow label="Booking" value={checkoutLocation?.nextSlot ?? 'Call center will confirm the best slot'} />
                  <DetailRow label="Referral" value="DRNOK-2026" />
                </BlurView>

                <BlurView intensity={28} tint="light" style={styles.glassCard}>
                  <Text style={styles.sectionTitle}>Customer details</Text>
                  <TextInput placeholder={currentUser.phone} placeholderTextColor="#768AB8" style={styles.input} />
                  <TextInput placeholder="National ID or passport number" placeholderTextColor="#768AB8" style={styles.input} />
                  <TextInput placeholder="Preferred hospital call time" placeholderTextColor="#768AB8" style={styles.input} />
                </BlurView>

                <BlurView intensity={28} tint="light" style={styles.glassCard}>
                  <Text style={styles.sectionTitle}>Payment split preview</Text>
                  <View style={styles.splitRow}>
                    <DetailRow label="Mira GP" value="5%" />
                    <DetailRow label="Referral" value="5%" />
                  </View>
                  <Text style={styles.finePrint}>Hospital receives net settlement. Mira records GP, referral commission, and payout schedule.</Text>
                </BlurView>
              </ScrollView>

              <View style={styles.checkoutBar}>
                <BlurView intensity={38} tint="light" style={styles.checkoutBarGlass}>
                  <View>
                    <Text style={styles.checkoutLabel}>Total</Text>
                    <Text style={styles.checkoutAmount}>{checkoutPrice}</Text>
                  </View>
                  <Link href="/order-status" asChild>
                    <Pressable style={({ pressed }) => [styles.payButton, pressed ? styles.payButtonPressed : null]}>
                      <Text style={styles.payButtonText}>Pay now</Text>
                    </Pressable>
                  </Link>
                </BlurView>
                <View style={styles.homeIndicator} />
              </View>
            </LinearGradient>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  stage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-start',
    padding: 8,
    paddingTop: 24,
  },
  phoneShell: {
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 38,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#6D86D8',
    shadowOffset: { height: 24, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 38,
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  wave: {
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderRadius: 999,
    position: 'absolute',
    transform: [{ rotate: '-12deg' }],
  },
  waveTop: {
    height: 170,
    left: -80,
    top: -28,
    width: 520,
  },
  waveMid: {
    height: 210,
    left: -150,
    top: 176,
    width: 620,
  },
  waveBottom: {
    bottom: 60,
    height: 220,
    right: -210,
    width: 620,
  },
  softGlowOne: {
    backgroundColor: 'rgba(80,129,255,0.14)',
    borderRadius: 999,
    height: 180,
    position: 'absolute',
    right: -70,
    top: 70,
    width: 180,
  },
  softGlowTwo: {
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderRadius: 999,
    bottom: 100,
    height: 160,
    left: -80,
    position: 'absolute',
    width: 160,
  },
  statusBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 28,
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    zIndex: 2,
  },
  statusTime: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  statusGlyphs: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  signalBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 1.5,
  },
  signalBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    width: 2,
  },
  wifiDot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 6,
    opacity: 0.88,
    width: 6,
  },
  battery: {
    borderColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    height: 8,
    padding: 1,
    width: 17,
  },
  batteryFill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 118,
    paddingTop: 4,
  },
  header: {
    alignItems: 'center',
    gap: 3,
    paddingTop: 2,
  },
  logo: {
    height: 32,
    width: 118,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  productCard: {
    borderColor: 'rgba(255,255,255,0.64)',
    borderRadius: 24,
    borderWidth: 1,
    height: 172,
    overflow: 'hidden',
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productOverlay: {
    backgroundColor: 'rgba(24,47,99,0.2)',
    bottom: 0,
    gap: 3,
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
  },
  productKicker: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  productTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepPill: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: 'rgba(255,255,255,0.46)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  stepPillActive: {
    backgroundColor: 'rgba(255,255,255,0.46)',
  },
  stepValue: {
    color: '#7285B8',
    fontSize: 10,
    fontWeight: '900',
  },
  stepValueActive: {
    color: '#397DFF',
  },
  stepLabel: {
    color: '#6E7FAE',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  stepLabelActive: {
    color: '#384D83',
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.56)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 11,
    overflow: 'hidden',
    padding: 14,
  },
  cardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  cardEyebrow: {
    color: '#4F70EE',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#203969',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 21,
  },
  cardSubtitle: {
    color: '#6377A7',
    fontSize: 12,
    fontWeight: '800',
  },
  pricePill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  priceText: {
    color: '#397DFF',
    fontSize: 12,
    fontWeight: '900',
  },
  description: {
    color: '#50658F',
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  includeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  includeChip: {
    backgroundColor: 'rgba(255,255,255,0.48)',
    borderRadius: 999,
    maxWidth: '48%',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  includeText: {
    color: '#536CA4',
    fontSize: 10.5,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#203969',
    fontSize: 14,
    fontWeight: '900',
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    color: '#4F70EE',
    fontSize: 9.5,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: '#43547E',
    fontSize: 12.5,
    fontWeight: '800',
    lineHeight: 16,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.44)',
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 16,
    borderWidth: 1,
    color: '#203969',
    fontSize: 13,
    fontWeight: '700',
    minHeight: 44,
    paddingHorizontal: 13,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 28,
  },
  finePrint: {
    color: '#6377A7',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  checkoutBar: {
    bottom: 0,
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 0,
  },
  checkoutBarGlass: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: 10,
  },
  checkoutLabel: {
    color: '#7084B3',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  checkoutAmount: {
    color: '#203969',
    fontSize: 15,
    fontWeight: '900',
  },
  payButton: {
    backgroundColor: '#4F8BFF',
    borderRadius: 18,
    paddingHorizontal: 21,
    paddingVertical: 13,
    shadowColor: '#397DFF',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  payButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  homeIndicator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    height: 3,
    marginTop: 10,
    width: 92,
  },
});
