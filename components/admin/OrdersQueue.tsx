import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Pill } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { invokeFunction } from '@/lib/api/client';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { supabase, supabaseConfigStatus } from '@/lib/supabase';
import type { AdminOrderActionRequest, ChatMessageRow, OrderRow, OrderStatus, TenantSummary } from '@/lib/types/api';
import { defaultTenantSlug } from '@/lib/marketplace/hospitalProducts';

type ProductJoin = {
  catalog_key: string;
  category: string;
  image_url: string | null;
  name: string;
  price_baht: number;
};

type CustomerJoin = {
  nickname: string | null;
  phone: string | null;
};

type ReferrerJoin = {
  name: string;
  ref_code: string;
};

type OrderQueueRow = OrderRow & {
  customers?: CustomerJoin | CustomerJoin[] | null;
  products?: ProductJoin | ProductJoin[] | null;
  referrers?: ReferrerJoin | ReferrerJoin[] | null;
};

type TenantContext = TenantSummary & {
  role: string;
};

type TranscriptRow = Pick<ChatMessageRow, 'content' | 'created_at' | 'id' | 'role'>;

const activeStatuses: OrderStatus[] = ['collecting_info', 'awaiting_payment', 'submitted', 'confirmed', 'booked'];

function fromJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function slipStoragePath(value: string | null) {
  if (!value || value.startsWith('http')) {
    return null;
  }

  return value.replace(/^payment-slips\//, '').replace(/^\/+/, '');
}

function statusTone(status: OrderStatus): 'amber' | 'blue' | 'danger' | 'mint' {
  if (status === 'cancelled') {
    return 'danger';
  }

  if (status === 'submitted' || status === 'confirmed' || status === 'booked' || status === 'done') {
    return 'mint';
  }

  if (status === 'awaiting_payment') {
    return 'blue';
  }

  return 'amber';
}

function canAct(order: OrderQueueRow, action: AdminOrderActionRequest['action']) {
  if (action === 'confirm') {
    return order.status === 'submitted';
  }

  if (action === 'book') {
    return order.status === 'confirmed';
  }

  if (action === 'done') {
    return order.status === 'booked';
  }

  return order.status !== 'done' && order.status !== 'cancelled';
}

export function OrdersQueue({ title = 'Orders Queue' }: { title?: string }) {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [orders, setOrders] = useState<OrderQueueRow[]>([]);
  const [signedSlipUrls, setSignedSlipUrls] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRow[]>([]);
  const [bookingAt, setBookingAt] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<AdminOrderActionRequest['action'] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isWide = width >= 1080;

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedId) ?? orders[0] ?? null, [orders, selectedId]);

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return orders.filter((order) => {
      const product = fromJoin(order.products);
      const customer = fromJoin(order.customers);
      const referrer = fromJoin(order.referrers);
      const haystack = [
        order.id,
        order.buyer_name,
        order.buyer_phone,
        order.channel,
        order.status,
        product?.catalog_key,
        product?.name,
        customer?.nickname,
        customer?.phone,
        referrer?.name,
        referrer?.ref_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (!showActiveOnly || activeStatuses.includes(order.status)) && (!needle || haystack.includes(needle));
    });
  }, [orders, query, showActiveOnly]);

  const summary = useMemo(
    () => ({
      active: orders.filter((order) => activeStatuses.includes(order.status)).length,
      submitted: orders.filter((order) => order.status === 'submitted').length,
      total: orders.length,
    }),
    [orders],
  );

  const loadTenantContext = useCallback(async () => {
    if (!auth.user) {
      return null;
    }

    const { data: tenantRow, error: tenantError } = await supabase
      .from('tenants')
      .select('id,slug,display_name,logo_url')
      .eq('slug', defaultTenantSlug)
      .maybeSingle();

    if (tenantError || !tenantRow) {
      throw new Error(tenantError?.message ?? `Tenant "${defaultTenantSlug}" is not available.`);
    }

    const { data: member, error: memberError } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantRow.id)
      .eq('auth_user_id', auth.user.id)
      .maybeSingle();

    if (memberError || !member) {
      throw new Error(memberError?.message ?? 'Your account is not a member of this tenant.');
    }

    return {
      ...(tenantRow as TenantSummary),
      role: String((member as { role: string }).role),
    };
  }, [auth.user]);

  const refreshOrders = useCallback(
    async (tenantId = tenant?.id) => {
      if (!tenantId) {
        return;
      }

      const { data, error: loadError } = await supabase
        .from('orders')
        .select(
          [
            'id',
            'tenant_id',
            'customer_id',
            'session_id',
            'product_id',
            'qty',
            'amount_baht',
            'buyer_name',
            'buyer_phone',
            'preferred_branch',
            'preferred_date',
            'channel',
            'referrer_id',
            'status',
            'slip_url',
            'booking_at',
            'admin_note',
            'created_at',
            'updated_at',
            'products(name,catalog_key,category,price_baht,image_url)',
            'customers(nickname,phone)',
            'referrers(name,ref_code)',
          ].join(','),
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (loadError) {
        throw new Error(loadError.message);
      }

      const rows = (data ?? []) as unknown as OrderQueueRow[];
      const nextSignedUrls: Record<string, string> = {};

      await Promise.all(
        rows.map(async (order) => {
          const path = slipStoragePath(order.slip_url);

          if (!path) {
            return;
          }

          const { data: signed, error: signedError } = await supabase.storage.from('payment-slips').createSignedUrl(path, 60 * 60);

          if (!signedError && signed?.signedUrl) {
            nextSignedUrls[order.id] = signed.signedUrl;
          }
        }),
      );

      setSignedSlipUrls(nextSignedUrls);
      setOrders(rows);
    },
    [tenant?.id],
  );

  useEffect(() => {
    let isMounted = true;

    async function boot() {
      if (!supabaseConfigStatus.isConfigured || !auth.session) {
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        const tenantContext = await loadTenantContext();

        if (!isMounted || !tenantContext) {
          return;
        }

        setTenant(tenantContext);
        await refreshOrders(tenantContext.id);
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load order queue.');
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
  }, [auth.session, loadTenantContext, refreshOrders]);

  useEffect(() => {
    if (!tenant) {
      return;
    }

    const channel = supabase
      .channel(`orders-queue-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `tenant_id=eq.${tenant.id}`,
          schema: 'public',
          table: 'orders',
        },
        () => {
          void refreshOrders(tenant.id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshOrders, tenant]);

  useEffect(() => {
    if (!selectedOrder?.session_id) {
      setTranscript([]);
      return;
    }

    let isMounted = true;

    async function loadTranscript() {
      const { data, error: transcriptError } = await supabase
        .from('chat_messages')
        .select('id,role,content,created_at')
        .eq('session_id', selectedOrder.session_id)
        .order('created_at', { ascending: true })
        .limit(80);

      if (isMounted) {
        setTranscript(transcriptError ? [] : ((data ?? []) as unknown as TranscriptRow[]));
      }
    }

    void loadTranscript();

    return () => {
      isMounted = false;
    };
  }, [selectedOrder?.session_id]);

  async function runAction(action: AdminOrderActionRequest['action']) {
    if (!selectedOrder || busyAction || !canAct(selectedOrder, action)) {
      return;
    }

    if (action === 'book' && !bookingAt.trim()) {
      setError('booking_at is required before booking an order.');
      return;
    }

    try {
      setBusyAction(action);
      setError(null);
      setMessage(null);
      const result = await invokeFunction<AdminOrderActionRequest, { order: OrderRow }>('admin-order-action', {
        action,
        booking_at: action === 'book' ? bookingAt.trim() : undefined,
        note: note.trim() || undefined,
        order_id: selectedOrder.id,
      });
      setMessage(`Order moved to ${result.order.status}.`);
      await refreshOrders(result.order.tenant_id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update order.');
    } finally {
      setBusyAction(null);
    }
  }

  if (!supabaseConfigStatus.isConfigured || !auth.session) {
    return (
      <View style={styles.screen}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Tenant admin sign-in required</Text>
          <Text style={styles.noticeBody}>Connect Supabase and sign in before opening the live orders queue.</Text>
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
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>MiraCare v2 Phase 3</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {tenant ? `${tenant.display_name} · ${tenant.role}` : isLoading ? 'Loading tenant access' : defaultTenantSlug}
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable disabled={isLoading} onPress={() => void refreshOrders()} style={[styles.secondaryButton, isLoading ? styles.disabled : null]}>
              <Text style={styles.secondaryButtonText}>{isLoading ? 'Refreshing' : 'Refresh'}</Text>
            </Pressable>
            <Link href="/admin/catalog" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Catalog</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {error ? <Banner tone="error" text={error} /> : null}
        {message ? <Banner tone="success" text={message} /> : null}

        <View style={styles.metrics}>
          <Metric label="Total" value={`${summary.total}`} />
          <Metric label="Active" value={`${summary.active}`} />
          <Metric label="Submitted" value={`${summary.submitted}`} />
        </View>

        <View style={styles.filters}>
          <TextInput
            onChangeText={setQuery}
            placeholder="Search order, buyer, phone, product"
            placeholderTextColor={MiraDesign.color.muted}
            style={styles.searchInput}
            value={query}
          />
          <Pressable onPress={() => setShowActiveOnly((current) => !current)} style={[styles.filterButton, showActiveOnly ? styles.filterButtonActive : null]}>
            <Text style={[styles.filterButtonText, showActiveOnly ? styles.filterButtonTextActive : null]}>
              {showActiveOnly ? 'Active only' : 'All orders'}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.queuePane}>
            {filteredOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>{isLoading ? 'Loading orders' : 'No orders found'}</Text>
                <Text style={styles.emptyBody}>Orders from chat checkout will appear here in realtime.</Text>
              </View>
            ) : (
              filteredOrders.map((order) => (
                <OrderRowCard
                  key={order.id}
                  order={order}
                  selected={selectedOrder?.id === order.id}
                  onSelect={() => {
                    setSelectedId(order.id);
                    setBookingAt(order.booking_at ?? '');
                    setNote(order.admin_note ?? '');
                  }}
                />
              ))
            )}
          </View>

          <View style={styles.detailPane}>
            {selectedOrder ? (
              <OrderDetail
                bookingAt={bookingAt}
                busyAction={busyAction}
                note={note}
                onAction={(action) => void runAction(action)}
                onBookingAtChange={setBookingAt}
                onNoteChange={setNote}
                order={selectedOrder}
                signedSlipUrl={signedSlipUrls[selectedOrder.id]}
                transcript={transcript}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Select an order</Text>
                <Text style={styles.emptyBody}>Open an order to inspect buyer details, payment state, and transcript.</Text>
              </View>
            )}
          </View>
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

function OrderRowCard({ onSelect, order, selected }: { onSelect: () => void; order: OrderQueueRow; selected: boolean }) {
  const product = fromJoin(order.products);
  const customer = fromJoin(order.customers);
  const referrer = fromJoin(order.referrers);
  const buyerName = order.buyer_name || customer?.nickname || 'Unnamed buyer';
  const phone = order.buyer_phone || customer?.phone || '-';

  return (
    <Pressable onPress={onSelect} style={[styles.orderRow, selected ? styles.orderRowSelected : null]}>
      <View style={styles.orderHead}>
        <View style={styles.orderTitleBlock}>
          <Text numberOfLines={1} style={styles.orderTitle}>
            {product?.name ?? 'Unknown product'}
          </Text>
          <Text style={styles.orderMeta}>{formatDateTime(order.created_at)}</Text>
        </View>
        <Pill label={order.status} tone={statusTone(order.status)} />
      </View>
      <View style={styles.orderMetaGrid}>
        <Meta label="Buyer" value={buyerName} />
        <Meta label="Phone" value={phone} />
        <Meta label="Channel" value={order.channel} />
        <Meta label="Referrer" value={referrer ? `${referrer.name} (${referrer.ref_code})` : '-'} />
        <Meta label="Amount" value={formatMoney(order.amount_baht)} />
      </View>
    </Pressable>
  );
}

function OrderDetail({
  bookingAt,
  busyAction,
  note,
  onAction,
  onBookingAtChange,
  onNoteChange,
  order,
  signedSlipUrl,
  transcript,
}: {
  bookingAt: string;
  busyAction: AdminOrderActionRequest['action'] | null;
  note: string;
  onAction: (action: AdminOrderActionRequest['action']) => void;
  onBookingAtChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  order: OrderQueueRow;
  signedSlipUrl?: string;
  transcript: TranscriptRow[];
}) {
  const product = fromJoin(order.products);
  const customer = fromJoin(order.customers);
  const referrer = fromJoin(order.referrers);
  const slipImageUrl = order.slip_url?.startsWith('http') ? order.slip_url : signedSlipUrl ?? null;

  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <View style={styles.detailTitleBlock}>
          <Text style={styles.detailEyebrow}>Order {order.id.slice(0, 8)}</Text>
          <Text style={styles.detailTitle}>{product?.name ?? 'Unknown product'}</Text>
        </View>
        <Pill label={order.status} tone={statusTone(order.status)} />
      </View>

      <View style={styles.detailGrid}>
        <Meta label="Created" value={formatDateTime(order.created_at)} />
        <Meta label="Buyer" value={order.buyer_name || customer?.nickname || '-'} />
        <Meta label="Phone" value={order.buyer_phone || customer?.phone || '-'} />
        <Meta label="Amount" value={formatMoney(order.amount_baht)} />
        <Meta label="Referrer" value={referrer ? `${referrer.name} (${referrer.ref_code})` : '-'} />
        <Meta label="Preferred date" value={order.preferred_date ?? '-'} />
        <Meta label="Booked at" value={formatDateTime(order.booking_at)} />
      </View>

      {order.slip_url ? (
        <View style={styles.slipRow}>
          {slipImageUrl ? <Image source={{ uri: slipImageUrl }} style={styles.slipImage} /> : null}
          <View style={styles.slipCopy}>
            <Text style={styles.sectionTitle}>Slip</Text>
            <Text numberOfLines={2} style={styles.helperText}>
              {slipImageUrl ? 'Signed URL valid for 60 minutes.' : order.slip_url}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.formBlock}>
        <Text style={styles.sectionTitle}>Booking</Text>
        <TextInput
          onChangeText={onBookingAtChange}
          placeholder="2026-06-20T10:00:00+07:00"
          placeholderTextColor={MiraDesign.color.muted}
          style={styles.input}
          value={bookingAt}
        />
        <TextInput
          multiline
          onChangeText={onNoteChange}
          placeholder="Internal note"
          placeholderTextColor={MiraDesign.color.muted}
          style={[styles.input, styles.noteInput]}
          value={note}
        />
      </View>

      <View style={styles.actions}>
        <ActionButton action="confirm" busyAction={busyAction} disabled={!canAct(order, 'confirm')} onAction={onAction} />
        <ActionButton action="book" busyAction={busyAction} disabled={!canAct(order, 'book')} onAction={onAction} />
        <ActionButton action="done" busyAction={busyAction} disabled={!canAct(order, 'done')} onAction={onAction} />
        <ActionButton action="cancel" busyAction={busyAction} disabled={!canAct(order, 'cancel')} danger onAction={onAction} />
      </View>

      <View style={styles.transcript}>
        <Text style={styles.sectionTitle}>Transcript</Text>
        {transcript.length === 0 ? (
          <Text style={styles.helperText}>No chat transcript attached.</Text>
        ) : (
          transcript.map((message) => (
            <View key={message.id} style={styles.transcriptItem}>
              <Text style={styles.transcriptRole}>{message.role}</Text>
              <Text style={styles.transcriptText}>{message.content}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function ActionButton({
  action,
  busyAction,
  danger,
  disabled,
  onAction,
}: {
  action: AdminOrderActionRequest['action'];
  busyAction: AdminOrderActionRequest['action'] | null;
  danger?: boolean;
  disabled?: boolean;
  onAction: (action: AdminOrderActionRequest['action']) => void;
}) {
  const isBusy = busyAction === action;

  return (
    <Pressable
      disabled={disabled || Boolean(busyAction)}
      onPress={() => onAction(action)}
      style={[styles.actionButton, danger ? styles.dangerActionButton : null, disabled || busyAction ? styles.disabled : null]}
    >
      <Text style={[styles.actionButtonText, danger ? styles.dangerActionButtonText : null]}>{isBusy ? 'Saving' : action}</Text>
    </Pressable>
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
    gap: 16,
    padding: 22,
    paddingBottom: 54,
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
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
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
    minHeight: 42,
    paddingHorizontal: 15,
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
    minHeight: 42,
    paddingHorizontal: 15,
  },
  secondaryButtonText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
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
  noticeTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
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
    minWidth: 130,
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
    fontSize: 22,
    fontWeight: '900',
    marginTop: 5,
  },
  filters: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    flex: 1,
    fontSize: 14,
    minHeight: 44,
    minWidth: 220,
    paddingHorizontal: 12,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  filterButtonActive: {
    backgroundColor: MiraDesign.color.primary,
    borderColor: MiraDesign.color.primary,
  },
  filterButtonText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '900',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  workspace: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
  },
  workspaceStack: {
    flexDirection: 'column',
  },
  queuePane: {
    flex: 1,
    gap: 10,
    minWidth: 0,
    width: '100%',
  },
  detailPane: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 0.95,
    minWidth: 360,
    padding: 16,
    width: '100%',
    ...softShadow,
  },
  orderRow: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  orderRowSelected: {
    borderColor: MiraDesign.color.primary,
    borderWidth: 2,
  },
  orderHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  orderTitleBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  orderTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  orderMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  orderMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaCell: {
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 118,
    padding: 9,
  },
  metaLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  detail: {
    gap: 14,
  },
  detailHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  detailTitleBlock: {
    flex: 1,
    gap: 4,
  },
  detailEyebrow: {
    color: MiraDesign.color.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailTitle: {
    color: MiraDesign.color.ink,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 24,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slipRow: {
    alignItems: 'center',
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  slipImage: {
    backgroundColor: '#EAF3F2',
    borderRadius: 8,
    height: 72,
    width: 72,
  },
  slipCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  helperText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  formBlock: {
    gap: 8,
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
  noteInput: {
    minHeight: 84,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 92,
    paddingHorizontal: 12,
  },
  dangerActionButton: {
    backgroundColor: '#FFE8E8',
    borderColor: '#F7B9BA',
    borderWidth: 1,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  dangerActionButtonText: {
    color: '#A23538',
  },
  transcript: {
    borderTopColor: MiraDesign.color.line,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  transcriptItem: {
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 9,
  },
  transcriptRole: {
    color: MiraDesign.color.primary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  transcriptText: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 5,
    padding: 18,
  },
  emptyTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
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
