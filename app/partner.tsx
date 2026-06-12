import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { OrderPanel } from '@/components/chat/OrderPanel';
import { Pill } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { invokeFunction } from '@/lib/api/client';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import {
  defaultTenantSlug,
  loadActiveHospitalProducts,
  type HospitalProduct,
} from '@/lib/marketplace/hospitalProducts';
import { supabase, supabaseConfigStatus } from '@/lib/supabase';
import type { CommissionEntryRow, OrderPanelState, ReferrerOrderRequest, ReferrerOrderResponse, ReferrerRow } from '@/lib/types/api';

type TenantInfo = {
  display_name: string;
  id: string;
};

type CommissionWithOrder = CommissionEntryRow & {
  orders?: {
    amount_baht: number;
    products?: {
      name: string;
    } | {
      name: string;
    }[] | null;
  } | {
    amount_baht: number;
    products?: {
      name: string;
    } | {
      name: string;
    }[] | null;
  }[] | null;
};

function fromJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

export default function PartnerScreen() {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [referrer, setReferrer] = useState<ReferrerRow | null>(null);
  const [products, setProducts] = useState<HospitalProduct[]>([]);
  const [commissions, setCommissions] = useState<CommissionWithOrder[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<HospitalProduct | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [activeOrder, setActiveOrder] = useState<OrderPanelState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isWide = width >= 1080;
  const canCreateOrder = selectedProduct && buyerName.trim().length > 1 && /^0[689]\d{8}$/.test(buyerPhone.trim()) && !isSubmitting;

  const totals = useMemo(
    () => ({
      approved: commissions.filter((entry) => entry.status === 'approved').reduce((sum, entry) => sum + entry.amount_baht, 0),
      paid: commissions.filter((entry) => entry.status === 'paid').reduce((sum, entry) => sum + entry.amount_baht, 0),
      pending: commissions.filter((entry) => entry.status === 'pending').reduce((sum, entry) => sum + entry.amount_baht, 0),
    }),
    [commissions],
  );

  const loadPartnerData = useCallback(async () => {
    if (!supabaseConfigStatus.isConfigured || !auth.user) {
      return;
    }

    const { data: tenantRow, error: tenantError } = await supabase
      .from('tenants')
      .select('id,display_name')
      .eq('slug', defaultTenantSlug)
      .maybeSingle();

    if (tenantError || !tenantRow) {
      throw new Error(tenantError?.message ?? `Tenant "${defaultTenantSlug}" is not available.`);
    }

    const { data: referrerRow, error: referrerError } = await supabase
      .from('referrers')
      .select('id,tenant_id,ref_code,name,type,phone,auth_user_id,commission_scheme,active,created_at')
      .eq('tenant_id', (tenantRow as TenantInfo).id)
      .eq('auth_user_id', auth.user.id)
      .eq('active', true)
      .maybeSingle();

    if (referrerError) {
      throw new Error(referrerError.message);
    }

    setTenant(tenantRow as TenantInfo);
    setReferrer((referrerRow as ReferrerRow | null) ?? null);
    setProducts(await loadActiveHospitalProducts(40));

    if (referrerRow) {
      const { data: commissionRows, error: commissionError } = await supabase
        .from('commission_entries')
        .select('id,tenant_id,referrer_id,order_id,scheme_snapshot,amount_baht,status,created_at,orders(amount_baht,products(name))')
        .eq('referrer_id', (referrerRow as ReferrerRow).id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (commissionError) {
        throw new Error(commissionError.message);
      }

      setCommissions((commissionRows ?? []) as unknown as CommissionWithOrder[]);
    } else {
      setCommissions([]);
    }
  }, [auth.user]);

  useEffect(() => {
    let isMounted = true;

    async function boot() {
      if (!supabaseConfigStatus.isConfigured || !auth.session) {
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        await loadPartnerData();
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load referrer workspace.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void boot();

    return () => {
      isMounted = false;
    };
  }, [auth.session, loadPartnerData]);

  async function createOrder() {
    if (!selectedProduct || !canCreateOrder) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setMessage(null);
      const result = await invokeFunction<ReferrerOrderRequest, ReferrerOrderResponse>('referrer-order', {
        action: 'create_order',
        buyer_name: buyerName.trim(),
        buyer_phone: buyerPhone.trim(),
        catalog_key: selectedProduct.catalogKey,
        preferred_date: preferredDate.trim() || undefined,
        tenant_slug: defaultTenantSlug,
      });
      setActiveOrder(result.order);
      setMessage(`Created order for ${buyerName.trim()}.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create referrer order.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function markPaymentDone(orderId: string) {
    try {
      setIsSubmitting(true);
      setError(null);
      setMessage(null);
      const result = await invokeFunction<ReferrerOrderRequest, ReferrerOrderResponse>('referrer-order', {
        action: 'payment_done',
        order_id: orderId,
        tenant_slug: defaultTenantSlug,
      });
      setActiveOrder(result.order);
      setMessage('Payment submitted for admin confirmation.');
      await loadPartnerData();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Unable to submit payment confirmation.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!supabaseConfigStatus.isConfigured || !auth.session) {
    return (
      <View style={styles.screen}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Referrer login required</Text>
          <Text style={styles.noticeBody}>Sign in with the account linked to a referrer profile.</Text>
          <Link href="/" asChild>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.topBar, !isWide ? styles.topBarStack : null]}>
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>Referral Program</Text>
            <Text style={styles.title}>Assisted Purchase</Text>
            <Text style={styles.subtitle}>
              {referrer ? `${referrer.name} · ${referrer.ref_code}` : isLoading ? 'Loading referrer access' : 'No active referrer profile linked'}
            </Text>
          </View>
          <View style={styles.shareBox}>
            <Text style={styles.shareLabel}>Share URL</Text>
            <Text selectable style={styles.shareValue}>
              /r/{referrer?.ref_code ?? 'CODE'}
            </Text>
          </View>
        </View>

        {error ? <Banner tone="error" text={error} /> : null}
        {message ? <Banner tone="success" text={message} /> : null}

        {!referrer && !isLoading ? (
          <View style={styles.noticeInline}>
            <Text style={styles.noticeTitle}>No linked referrer</Text>
            <Text style={styles.noticeBody}>Ask a tenant admin to create a referrer profile and set its auth user id to this account.</Text>
          </View>
        ) : null}

        <View style={styles.metrics}>
          <Metric label="Pending" value={formatMoney(totals.pending)} />
          <Metric label="Approved" value={formatMoney(totals.approved)} />
          <Metric label="Paid" value={formatMoney(totals.paid)} />
        </View>

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.productPane}>
            <SectionTitle title="Catalog" subtitle={tenant?.display_name ?? defaultTenantSlug} />
            <View style={styles.productGrid}>
              {products.map((product) => (
                <Pressable
                  key={product.id}
                  onPress={() => {
                    setSelectedProduct(product);
                    setActiveOrder(null);
                  }}
                  style={[styles.productCard, selectedProduct?.id === product.id ? styles.productCardSelected : null]}
                >
                  {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} /> : <View style={styles.productImageFallback} />}
                  <View style={styles.productCopy}>
                    <Text numberOfLines={2} style={styles.productTitle}>
                      {product.title}
                    </Text>
                    <Text style={styles.productMeta}>{product.catalogKey}</Text>
                    <Text style={styles.productPrice}>{formatMoney(product.priceAmount)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.checkoutPane}>
            <SectionTitle title="Buyer Form" subtitle={selectedProduct?.title ?? 'Select a product'} />
            <TextInput
              onChangeText={setBuyerName}
              placeholder="Buyer full name"
              placeholderTextColor={MiraDesign.color.muted}
              style={styles.input}
              value={buyerName}
            />
            <TextInput
              keyboardType="phone-pad"
              onChangeText={setBuyerPhone}
              placeholder="08xxxxxxxx"
              placeholderTextColor={MiraDesign.color.muted}
              style={styles.input}
              value={buyerPhone}
            />
            <TextInput
              onChangeText={setPreferredDate}
              placeholder="Preferred date YYYY-MM-DD"
              placeholderTextColor={MiraDesign.color.muted}
              style={styles.input}
              value={preferredDate}
            />
            <Pressable disabled={!canCreateOrder || !referrer} onPress={createOrder} style={[styles.primaryButton, !canCreateOrder || !referrer ? styles.disabled : null]}>
              <Text style={styles.primaryButtonText}>{isSubmitting ? 'Creating' : 'Create QR Order'}</Text>
            </Pressable>

            {activeOrder ? (
              <View style={styles.partnerOrderStack}>
                <OrderPanel disabled={isSubmitting} onOpenDetails={() => undefined} order={activeOrder} />
                {activeOrder.status === 'awaiting_payment' ? (
                  <Pressable disabled={isSubmitting} onPress={() => void markPaymentDone(activeOrder.id)} style={[styles.primaryButton, isSubmitting ? styles.disabled : null]}>
                    <Text style={styles.primaryButtonText}>{isSubmitting ? 'Submitting' : 'Mark paid'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.earningsPane}>
          <SectionTitle title="Earnings" subtitle={`${commissions.length} commission entries`} />
          {commissions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No commissions yet</Text>
              <Text style={styles.emptyBody}>Commissions appear after an attributed order is confirmed by admin.</Text>
            </View>
          ) : (
            commissions.map((entry) => {
              const order = fromJoin(entry.orders);
              const product = fromJoin(order?.products);

              return (
                <View key={entry.id} style={styles.commissionRow}>
                  <View style={styles.commissionCopy}>
                    <Text style={styles.commissionTitle}>{product?.name ?? `Order ${entry.order_id.slice(0, 8)}`}</Text>
                    <Text style={styles.commissionMeta}>{new Date(entry.created_at).toLocaleDateString('th-TH')}</Text>
                  </View>
                  <Text style={styles.commissionAmount}>{formatMoney(entry.amount_baht)}</Text>
                  <Pill label={entry.status} tone={entry.status === 'paid' ? 'mint' : entry.status === 'void' ? 'danger' : 'amber'} />
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Banner({ text, tone }: { text: string; tone: 'error' | 'success' }) {
  return (
    <View style={[styles.banner, tone === 'error' ? styles.errorBanner : styles.successBanner]}>
      <Text style={[styles.bannerText, tone === 'error' ? styles.errorBannerText : styles.successBannerText]}>{text}</Text>
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

function SectionTitle({ subtitle, title }: { subtitle?: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F5F8F7',
    flex: 1,
  },
  container: {
    gap: 16,
    padding: 22,
    paddingBottom: 54,
  },
  topBar: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  topBarStack: {
    flexDirection: 'column',
  },
  titleBlock: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  shareBox: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 220,
    padding: 12,
  },
  shareLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  shareValue: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  notice: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    margin: 22,
    padding: 18,
    ...softShadow,
  },
  noticeInline: {
    backgroundColor: '#FFF7DD',
    borderColor: '#F3D17B',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  noticeTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  noticeBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  banner: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  errorBanner: {
    backgroundColor: '#FDECEC',
    borderColor: '#F4BBBB',
  },
  successBanner: {
    backgroundColor: '#E7F4ED',
    borderColor: '#B8DCCB',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '800',
  },
  errorBannerText: {
    color: '#8F2424',
  },
  successBannerText: {
    color: '#1E7C63',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metric: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 150,
    padding: 13,
  },
  metricLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: MiraDesign.color.ink,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 5,
  },
  workspace: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
  },
  workspaceStack: {
    flexDirection: 'column',
  },
  productPane: {
    flex: 1.2,
    gap: 12,
    width: '100%',
  },
  checkoutPane: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 0.8,
    gap: 12,
    minWidth: 340,
    padding: 16,
    width: '100%',
    ...softShadow,
  },
  partnerOrderStack: {
    gap: 10,
  },
  sectionHeader: {
    gap: 3,
  },
  sectionTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 260,
    padding: 10,
    width: '48%',
  },
  productCardSelected: {
    borderColor: MiraDesign.color.primary,
    borderWidth: 2,
  },
  productImage: {
    backgroundColor: '#EAF3F2',
    borderRadius: 8,
    height: 74,
    width: 74,
  },
  productImageFallback: {
    backgroundColor: '#EAF3F2',
    borderRadius: 8,
    height: 74,
    width: 74,
  },
  productCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  productTitle: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  productMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  productPrice: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 14,
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  earningsPane: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  commissionRow: {
    alignItems: 'center',
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  commissionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  commissionTitle: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  commissionMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  commissionAmount: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyState: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 5,
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
  disabled: {
    opacity: 0.45,
  },
});
