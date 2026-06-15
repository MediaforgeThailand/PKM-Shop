import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { PdpaActions } from '@/components/admin/PdpaActions';
import { Pill } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { invokeFunction } from '@/lib/api/client';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { supabase, supabaseConfigStatus } from '@/lib/supabase';
import type { AdminOrderActionRequest, AdminSlipUrlResponse, ChatMessageRow, OrderRow, OrderStatus, TenantSummary } from '@/lib/types/api';
import { defaultTenantSlug } from '@/lib/marketplace/hospitalProducts';
import { showcaseDemoAdminOrders, showcaseDemoTenant, showcaseDemoTranscript } from '@/lib/showcase/demoFixtures';

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

type BranchJoin = {
  address: string | null;
  district: string | null;
  name: string;
};

type OrderQueueRow = OrderRow & {
  branches?: BranchJoin | BranchJoin[] | null;
  customers?: CustomerJoin | CustomerJoin[] | null;
  products?: ProductJoin | ProductJoin[] | null;
  referrers?: ReferrerJoin | ReferrerJoin[] | null;
};

type TenantContext = TenantSummary & {
  role: string;
};

type TranscriptRow = Pick<ChatMessageRow, 'content' | 'created_at' | 'id' | 'role'>;
type OrderMutationAction = Extract<AdminOrderActionRequest, { action: 'book' | 'cancel' | 'confirm' | 'done' }>['action'];

const activeStatuses: OrderStatus[] = ['selecting_branch', 'collecting_info', 'awaiting_payment', 'submitted', 'confirmed', 'booked'];
const notePresets = ['โทรแล้ว-ไม่รับ', 'โทรแล้ว-เลื่อน'] as const;
const actionLabels: Record<OrderMutationAction, string> = {
  book: 'บันทึกนัดหมาย',
  cancel: 'ยกเลิก',
  confirm: 'ยืนยันชำระเงิน',
  done: 'ปิดงาน',
};

const calendarWeekdays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;
const bookingHourOptions = Array.from({ length: 11 }, (_, index) => String(index + 8).padStart(2, '0'));
const bookingMinuteOptions = ['00', '10', '20', '30', '40', '50'] as const;
const defaultBookingHour = bookingHourOptions[0] ?? '08';
const defaultBookingMinute = bookingMinuteOptions[0] ?? '00';

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

function bangkokDateTimeParts(value: string | null) {
  if (!value) {
    return {
      date: '',
      time: '',
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: '',
      time: '',
    };
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    date: `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`,
    time: `${byType.get('hour')}:${byType.get('minute')}`,
  };
}

function bangkokTodayDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return new Date(Number(byType.get('year')), Number(byType.get('month')) - 1, Number(byType.get('day')));
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }

  return date;
}

function fullDateLabel(value: string) {
  const date = parseDateValue(value);

  if (!date) {
    return value || 'ยังไม่ได้เลือกวันที่';
  }

  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  }).format(date);
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthDateFromValue(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);

  if (!match) {
    return monthStart(bangkokTodayDate());
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function calendarMonthForDate(value: string) {
  return monthValue(monthStart(parseDateValue(value) ?? bangkokTodayDate()));
}

function calendarMonthLabel(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
  }).format(monthDateFromValue(value));
}

function calendarCells(month: string, selectedValue: string) {
  const visibleMonth = monthDateFromValue(month);
  const today = bangkokTodayDate();
  const selectedDate = parseDateValue(selectedValue);
  const firstCell = new Date(visibleMonth);
  firstCell.setDate(1 - visibleMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    const value = formatDateValue(date);
    const isSelected = selectedDate ? value === formatDateValue(selectedDate) : false;

    return {
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
      isDisabled: date < today && !isSelected,
      isSelected,
      isToday: value === formatDateValue(today),
      value,
    };
  });
}

function parseTimeValue(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const hourNumber = Number(match[1]);
  const minuteNumber = Number(match[2]);

  if (hourNumber > 23 || minuteNumber > 59) {
    return null;
  }

  return {
    hour: String(hourNumber).padStart(2, '0'),
    minute: String(minuteNumber).padStart(2, '0'),
  };
}

function mergeTimeOption(options: readonly string[], selected: string | undefined) {
  if (!selected || options.includes(selected)) {
    return [...options];
  }

  return [...options, selected].sort((first, second) => Number(first) - Number(second));
}

function composeTimeValue(hour: string, minute: string) {
  return `${hour}:${minute}`;
}

function composeBangkokIso(dateValue: string, timeValue: string) {
  const date = dateValue.trim();
  const time = timeValue.trim();
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (hour > 23 || minute > 59) {
    return null;
  }

  const normalizedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const iso = `${date}T${normalizedTime}:00+07:00`;
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return iso;
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

function statusLabel(status: OrderStatus) {
  if (status === 'selecting_branch') {
    return 'เลือกสาขา';
  }

  if (status === 'collecting_info') {
    return 'เก็บข้อมูล';
  }

  if (status === 'awaiting_payment') {
    return 'รอชำระ';
  }

  if (status === 'submitted') {
    return 'รอตรวจ';
  }

  if (status === 'confirmed') {
    return 'ยืนยันแล้ว';
  }

  if (status === 'booked') {
    return 'นัดแล้ว';
  }

  if (status === 'done') {
    return 'เสร็จสิ้น';
  }

  return 'ยกเลิก';
}

function formatPayment(order: Pick<OrderQueueRow, 'payment_provider' | 'stripe_payment_status'>) {
  if (!order.payment_provider) {
    return 'not set';
  }

  return order.stripe_payment_status ? `${order.payment_provider}: ${order.stripe_payment_status}` : order.payment_provider;
}

function formatPreferredDateRange(order: Pick<OrderQueueRow, 'preferred_date' | 'preferred_date_end'>) {
  const start = order.preferred_date;
  const end = order.preferred_date_end && order.preferred_date_end !== start ? order.preferred_date_end : null;

  return start ? (end ? `${start} - ${end}` : start) : '-';
}

function formatPreferredTimeWindow(order: Pick<OrderQueueRow, 'preferred_time_window'>) {
  return order.preferred_time_window?.trim() || '-';
}

function canAct(order: OrderQueueRow, action: OrderMutationAction) {
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

export function OrdersQueue({ title = 'คิวคำสั่งซื้อ' }: { title?: string }) {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [orders, setOrders] = useState<OrderQueueRow[]>([]);
  const [signedSlipUrls, setSignedSlipUrls] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRow[]>([]);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<OrderMutationAction | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isWide = width >= 1080;
  const isDemoMode = !auth.session || !supabaseConfigStatus.isConfigured;

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedId) ?? orders[0] ?? null, [orders, selectedId]);

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return orders.filter((order) => {
      const product = fromJoin(order.products);
      const customer = fromJoin(order.customers);
      const referrer = fromJoin(order.referrers);
      const branch = fromJoin(order.branches);
      const haystack = [
        order.id,
        order.buyer_name,
        order.buyer_phone,
        order.buyer_age,
        order.channel,
        order.status,
        order.preferred_date,
        order.preferred_date_end,
        order.preferred_time_window,
        product?.catalog_key,
        product?.name,
        customer?.nickname,
        customer?.phone,
        referrer?.name,
        referrer?.ref_code,
        branch?.name,
        branch?.address,
        branch?.district,
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
            'preferred_date_end',
            'preferred_time_window',
            'channel',
            'referrer_id',
            'commission_scheme_snapshot',
            'status',
            'slip_url',
            'booking_at',
            'branch_id',
            'buyer_age',
            'admin_note',
            'payment_provider',
            'stripe_checkout_session_id',
            'stripe_payment_intent_id',
            'stripe_payment_status',
            'paid_at',
            'created_at',
            'updated_at',
            'branches(name,address,district)',
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
          if (!order.slip_url) {
            return;
          }

          try {
            const signed = await invokeFunction<Extract<AdminOrderActionRequest, { action: 'slip_url' }>, AdminSlipUrlResponse>(
              'admin-order-action',
              {
                action: 'slip_url',
                order_id: order.id,
              },
            );

            if (signed.signed_url) {
              nextSignedUrls[order.id] = signed.signed_url;
            }
          } catch {
            // Keep the queue usable even if one thumbnail cannot be signed.
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
      if (isDemoMode) {
        setTenant({ ...showcaseDemoTenant, role: 'demo' });
        setOrders(showcaseDemoAdminOrders);
        setSelectedId((current) => current ?? showcaseDemoAdminOrders[0]?.id ?? null);
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
  }, [auth.session, isDemoMode, loadTenantContext, refreshOrders]);

  useEffect(() => {
    if (!tenant || isDemoMode) {
      return;
    }

    const channel = supabase
      .channel(`orders-queue-${tenant.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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
  }, [isDemoMode, refreshOrders, tenant]);

  useEffect(() => {
    if (isDemoMode) {
      setTranscript(showcaseDemoTranscript);
      return;
    }

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
  }, [isDemoMode, selectedOrder?.session_id]);

  useEffect(() => {
    if (!selectedOrder) {
      setBookingDate('');
      setBookingTime('');
      setNote('');
      return;
    }

    const nextBooking = bangkokDateTimeParts(selectedOrder.booking_at);
    setBookingDate(nextBooking.date);
    setBookingTime(nextBooking.time);
    setNote(selectedOrder.admin_note ?? '');
  }, [selectedOrder?.id]);

  async function runAction(action: OrderMutationAction) {
    if (!selectedOrder || busyAction || !canAct(selectedOrder, action)) {
      return;
    }

    if (isDemoMode) {
      setMessage('โหมดตัวอย่าง — ปุ่มนี้ยังไม่ส่งข้อมูลจริง');
      return;
    }

    const bookingAt = action === 'book' ? composeBangkokIso(bookingDate, bookingTime) : undefined;

    if (action === 'book' && !bookingAt) {
      setError('Booking date and time must be valid Bangkok time.');
      return;
    }

    try {
      setBusyAction(action);
      setError(null);
      setMessage(null);
      const result = await invokeFunction<AdminOrderActionRequest, { order: OrderRow }>('admin-order-action', {
        action,
        booking_at: bookingAt ?? undefined,
        note: note.trim() || undefined,
        order_id: selectedOrder.id,
      });
      setMessage(actionSuccessMessage(action, result.order));
      await refreshOrders(result.order.tenant_id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update order.');
    } finally {
      setBusyAction(null);
    }
  }

  async function saveNote(nextNote = note) {
    if (!selectedOrder || isSavingNote) {
      return;
    }

    if (isDemoMode) {
      setNote(nextNote);
      setMessage('โหมดตัวอย่าง — บันทึก note เฉพาะหน้าจอนี้');
      return;
    }

    const trimmedNote = nextNote.trim();

    if (!trimmedNote) {
      setError('Internal note is required before saving.');
      return;
    }

    try {
      setIsSavingNote(true);
      setError(null);
      setMessage(null);
      const result = await invokeFunction<AdminOrderActionRequest, { order: OrderRow }>('admin-order-action', {
        action: 'note',
        note: trimmedNote,
        order_id: selectedOrder.id,
      });
      setMessage('บันทึกโน้ตภายในแล้ว');
      await refreshOrders(result.order.tenant_id);
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : 'บันทึกโน้ตไม่สำเร็จ');
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.topBar, !isWide ? styles.topBarStack : null]}>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>หลังบ้านโรงพยาบาล</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {tenant ? `${tenant.display_name} · ${tenant.role}` : isLoading ? 'กำลังโหลดสิทธิ์ tenant' : defaultTenantSlug}
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable disabled={isLoading} onPress={() => void refreshOrders()} style={[styles.secondaryButton, isLoading ? styles.disabled : null]}>
              <Text style={styles.secondaryButtonText}>{isLoading ? 'กำลังรีเฟรช' : 'รีเฟรช'}</Text>
            </Pressable>
            <Link href="/admin/catalog" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>แค็ตตาล็อก</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {error ? <Banner tone="error" text={error} /> : null}
        {message ? <Banner tone="success" text={message} /> : null}
        {isDemoMode ? <Banner tone="success" text="โหมดตัวอย่าง: เปิดดูคิวออเดอร์ได้โดยไม่ต้องล็อกอิน และปุ่ม action จะไม่ส่งข้อมูลจริง" /> : null}

        <View style={styles.metrics}>
          <Metric label="ทั้งหมด" value={`${summary.total}`} />
          <Metric label="กำลังดำเนินการ" value={`${summary.active}`} />
          <Metric label="รอตรวจ" value={`${summary.submitted}`} />
        </View>

        <View style={styles.filters}>
          <TextInput
            onChangeText={setQuery}
            placeholder="ค้นหา order, ลูกค้า, เบอร์, แพ็กเกจ หรือสาขา"
            placeholderTextColor={MiraDesign.color.showcaseNavySoft}
            style={styles.searchInput}
            value={query}
          />
          <Pressable onPress={() => setShowActiveOnly((current) => !current)} style={[styles.filterButton, showActiveOnly ? styles.filterButtonActive : null]}>
            <Text style={[styles.filterButtonText, showActiveOnly ? styles.filterButtonTextActive : null]}>
              {showActiveOnly ? 'เฉพาะรายการ active' : 'ทุกคำสั่งซื้อ'}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.queuePane}>
            {filteredOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>{isLoading ? 'กำลังโหลดคำสั่งซื้อ' : 'ไม่พบคำสั่งซื้อ'}</Text>
                <Text style={styles.emptyBody}>คำสั่งซื้อจาก chat checkout จะแสดงที่นี่เมื่อมีข้อมูลเข้าระบบ</Text>
              </View>
            ) : (
              filteredOrders.map((order) => (
                <OrderRowCard
                  key={order.id}
                  order={order}
                  selected={selectedOrder?.id === order.id}
                  onSelect={() => {
                    const nextBooking = bangkokDateTimeParts(order.booking_at);
                    setSelectedId(order.id);
                    setBookingDate(nextBooking.date);
                    setBookingTime(nextBooking.time);
                    setNote(order.admin_note ?? '');
                  }}
                />
              ))
            )}
          </View>

          <View style={styles.detailPane}>
            {selectedOrder ? (
              <OrderDetail
                bookingDate={bookingDate}
                bookingTime={bookingTime}
                busyAction={busyAction}
                canErase={tenant?.role === 'tenant_admin' || tenant?.role === 'superadmin'}
                isSavingNote={isSavingNote}
                note={note}
                onAction={(action) => void runAction(action)}
                onBookingDateChange={setBookingDate}
                onBookingTimeChange={setBookingTime}
                onNoteChange={setNote}
                onSaveNote={(nextNote) => void saveNote(nextNote)}
                order={selectedOrder}
                signedSlipUrl={signedSlipUrls[selectedOrder.id]}
                transcript={transcript}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>เลือกคำสั่งซื้อ</Text>
                <Text style={styles.emptyBody}>เปิดรายการเพื่อดูข้อมูลผู้ซื้อ สถานะชำระเงิน และบทสนทนา</Text>
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
  const branch = fromJoin(order.branches);
  const product = fromJoin(order.products);
  const customer = fromJoin(order.customers);
  const referrer = fromJoin(order.referrers);
  const buyerName = order.buyer_name || customer?.nickname || 'ไม่ระบุชื่อผู้ซื้อ';
  const phone = order.buyer_phone || customer?.phone || '-';

  return (
    <Pressable onPress={onSelect} style={[styles.orderRow, selected ? styles.orderRowSelected : null]}>
      <View style={styles.orderHead}>
        <View style={styles.orderTitleBlock}>
          <Text numberOfLines={1} style={styles.orderTitle}>
            {product?.name ?? 'ไม่พบสินค้า'}
          </Text>
          <Text style={styles.orderMeta}>{formatDateTime(order.created_at)}</Text>
        </View>
        <Pill label={statusLabel(order.status)} tone={statusTone(order.status)} />
      </View>
      <View style={styles.orderMetaGrid}>
        <Meta label="ผู้ซื้อ" value={buyerName} />
        <Meta label="อายุ" value={order.buyer_age ? `${order.buyer_age}` : '-'} />
        <Meta label="เบอร์โทร" value={phone} />
        <Meta label="สาขา" value={branch?.name ?? 'ไม่ระบุสาขา'} />
        <Meta label="ช่องทาง" value={order.channel} />
        <Meta label="ชำระเงิน" value={formatPayment(order)} />
        <Meta label="วันที่ลูกค้าสะดวก" value={formatPreferredDateRange(order)} />
        <Meta label="เวลาที่ลูกค้าสะดวก" value={formatPreferredTimeWindow(order)} />
        <Meta label="ผู้แนะนำ" value={referrer ? `${referrer.name} (${referrer.ref_code})` : '-'} />
        <Meta label="ยอดเงิน" value={formatMoney(order.amount_baht)} />
      </View>
    </Pressable>
  );
}

function OrderDetail({
  bookingDate,
  bookingTime,
  busyAction,
  canErase,
  isSavingNote,
  note,
  onAction,
  onBookingDateChange,
  onBookingTimeChange,
  onNoteChange,
  onSaveNote,
  order,
  signedSlipUrl,
  transcript,
}: {
  bookingDate: string;
  bookingTime: string;
  busyAction: OrderMutationAction | null;
  canErase: boolean;
  isSavingNote: boolean;
  note: string;
  onAction: (action: OrderMutationAction) => void;
  onBookingDateChange: (value: string) => void;
  onBookingTimeChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSaveNote: (nextNote?: string) => void;
  order: OrderQueueRow;
  signedSlipUrl?: string;
  transcript: TranscriptRow[];
}) {
  const branch = fromJoin(order.branches);
  const product = fromJoin(order.products);
  const customer = fromJoin(order.customers);
  const referrer = fromJoin(order.referrers);
  const slipImageUrl = order.slip_url?.startsWith('http') ? order.slip_url : signedSlipUrl ?? null;

  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <View style={styles.detailTitleBlock}>
          <Text style={styles.detailEyebrow}>ออเดอร์ {order.id.slice(0, 8)}</Text>
          <Text style={styles.detailTitle}>{product?.name ?? 'ไม่พบสินค้า'}</Text>
        </View>
        <Pill label={statusLabel(order.status)} tone={statusTone(order.status)} />
      </View>

      <View style={styles.detailGrid}>
        <Meta label="สร้างเมื่อ" value={formatDateTime(order.created_at)} />
        <Meta label="ผู้ซื้อ" value={order.buyer_name || customer?.nickname || '-'} />
        <Meta label="อายุ" value={order.buyer_age ? `${order.buyer_age}` : '-'} />
        <Meta label="เบอร์โทร" value={order.buyer_phone || customer?.phone || '-'} />
        <Meta label="สาขา" value={branch?.name ?? 'ไม่ระบุสาขา'} />
        <Meta label="ช่องทาง" value={order.channel} />
        <Meta label="ชำระเงิน" value={formatPayment(order)} />
        <Meta label="เวลาชำระ" value={formatDateTime(order.paid_at)} />
        <Meta label="ยอดเงิน" value={formatMoney(order.amount_baht)} />
        <Meta label="ผู้แนะนำ" value={referrer ? `${referrer.name} (${referrer.ref_code})` : '-'} />
        <Meta label="วันที่ลูกค้าสะดวก" value={formatPreferredDateRange(order)} />
        <Meta label="เวลาที่ลูกค้าสะดวก" value={formatPreferredTimeWindow(order)} />
        <Meta label="เวลานัดหมาย" value={formatDateTime(order.booking_at)} />
        <Meta label="Stripe session" value={order.stripe_checkout_session_id ? order.stripe_checkout_session_id.slice(-12) : '-'} />
      </View>

      {order.slip_url ? (
        <View style={styles.slipRow}>
          {slipImageUrl ? <Image source={{ uri: slipImageUrl }} style={styles.slipImage} /> : null}
          <View style={styles.slipCopy}>
            <Text style={styles.sectionTitle}>สลิป</Text>
            <Text numberOfLines={2} style={styles.helperText}>
              {slipImageUrl ? 'ลิงก์ดูสลิปใช้ได้ 60 นาที' : order.slip_url}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.formBlock}>
        <Text style={styles.sectionTitle}>นัดหมาย</Text>
        <View style={styles.dateTimeRow}>
          <BookingDatePicker onChange={onBookingDateChange} value={bookingDate} />
          <BookingTimePicker onChange={onBookingTimeChange} value={bookingTime} />
        </View>
        <TextInput
          multiline
          onChangeText={onNoteChange}
          placeholder="โน้ตภายใน"
          placeholderTextColor={MiraDesign.color.showcaseNavySoft}
          style={[styles.input, styles.noteInput]}
          value={note}
        />
        <View style={styles.notePresetRow}>
          {notePresets.map((preset) => (
            <Pressable
              key={preset}
              disabled={isSavingNote}
              onPress={() => {
                onNoteChange(preset);
                onSaveNote(preset);
              }}
              style={[styles.notePresetButton, isSavingNote ? styles.disabled : null]}
            >
              <Text style={styles.notePresetText}>{preset}</Text>
            </Pressable>
          ))}
          <Pressable disabled={isSavingNote} onPress={() => onSaveNote()} style={[styles.noteSaveButton, isSavingNote ? styles.disabled : null]}>
            <Text style={styles.noteSaveText}>{isSavingNote ? 'กำลังบันทึก' : 'บันทึกโน้ต'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actions}>
        <ActionButton action="confirm" busyAction={busyAction} disabled={!canAct(order, 'confirm')} onAction={onAction} />
        <ActionButton action="book" busyAction={busyAction} disabled={!canAct(order, 'book') || !bookingDate || !bookingTime} onAction={onAction} />
        <ActionButton action="done" busyAction={busyAction} disabled={!canAct(order, 'done')} onAction={onAction} />
        <ActionButton action="cancel" busyAction={busyAction} disabled={!canAct(order, 'cancel')} danger onAction={onAction} />
      </View>

      <View style={styles.transcript}>
        <Text style={styles.sectionTitle}>บทสนทนา</Text>
        {transcript.length === 0 ? (
          <Text style={styles.helperText}>ยังไม่มีบทสนทนาที่ผูกกับออเดอร์นี้</Text>
        ) : (
          transcript.map((message) => (
            <View key={message.id} style={styles.transcriptItem}>
              <Text style={styles.transcriptRole}>{message.role}</Text>
              <Text style={styles.transcriptText}>{message.content}</Text>
            </View>
          ))
        )}
      </View>

      <PdpaActions canErase={canErase} customerId={order.customer_id ?? null} />
    </View>
  );
}

function BookingDatePicker({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const [visibleMonth, setVisibleMonth] = useState(() => calendarMonthForDate(value));
  const cells = useMemo(() => calendarCells(visibleMonth, value), [value, visibleMonth]);

  useEffect(() => {
    if (value) {
      setVisibleMonth(calendarMonthForDate(value));
    }
  }, [value]);

  const moveMonth = useCallback((amount: number) => {
    setVisibleMonth((current) => monthValue(addMonths(monthDateFromValue(current), amount)));
  }, []);

  return (
    <View style={styles.pickerField}>
      <View style={styles.pickerLabelRow}>
        <Text style={styles.formLabel}>วันที่</Text>
        <Text numberOfLines={1} style={styles.selectedPickerValue}>
          {value ? fullDateLabel(value) : 'เลือกวันที่'}
        </Text>
      </View>
      <View style={styles.calendarPanel}>
        <View style={styles.calendarHeader}>
          <Pressable accessibilityRole="button" onPress={() => moveMonth(-1)} style={styles.calendarNavButton}>
            <Text style={styles.calendarNavText}>ก่อนหน้า</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.calendarMonthTitle}>
            {calendarMonthLabel(visibleMonth)}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => moveMonth(1)} style={styles.calendarNavButton}>
            <Text style={styles.calendarNavText}>ถัดไป</Text>
          </Pressable>
        </View>
        <View style={styles.calendarWeekRow}>
          {calendarWeekdays.map((day) => (
            <Text key={day} style={styles.calendarWeekday}>
              {day}
            </Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {cells.map((cell) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: cell.isDisabled, selected: cell.isSelected }}
              disabled={cell.isDisabled}
              key={cell.value}
              onPress={() => onChange(cell.value)}
              style={[
                styles.calendarCell,
                !cell.isCurrentMonth ? styles.calendarCellMuted : null,
                cell.isToday ? styles.calendarCellToday : null,
                cell.isSelected ? styles.calendarCellSelected : null,
                cell.isDisabled ? styles.calendarCellDisabled : null,
              ]}
            >
              <Text
                style={[
                  styles.calendarCellText,
                  !cell.isCurrentMonth ? styles.calendarCellTextMuted : null,
                  cell.isSelected ? styles.calendarCellTextSelected : null,
                  cell.isDisabled ? styles.calendarCellTextDisabled : null,
                ]}
              >
                {cell.day}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function BookingTimePicker({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const parsed = parseTimeValue(value);
  const selectedHour = parsed?.hour;
  const selectedMinute = parsed?.minute;
  const hourOptions = useMemo(() => mergeTimeOption(bookingHourOptions, selectedHour), [selectedHour]);
  const minuteOptions = useMemo(() => mergeTimeOption(bookingMinuteOptions, selectedMinute), [selectedMinute]);
  const chooseHour = useCallback(
    (hour: string) => {
      onChange(composeTimeValue(hour, selectedMinute ?? defaultBookingMinute));
    },
    [onChange, selectedMinute],
  );
  const chooseMinute = useCallback(
    (minute: string) => {
      onChange(composeTimeValue(selectedHour ?? defaultBookingHour, minute));
    },
    [onChange, selectedHour],
  );

  return (
    <View style={styles.pickerField}>
      <View style={styles.pickerLabelRow}>
        <Text style={styles.formLabel}>เวลา</Text>
        <Text style={styles.selectedPickerValue}>{value || 'เลือกเวลา'}</Text>
      </View>
      <View style={styles.timePickerPanel}>
        <View style={styles.timePickerColumn}>
          <Text style={styles.timePickerColumnTitle}>ชั่วโมง</Text>
          <View style={styles.timePickerGrid}>
            {hourOptions.map((hour) => {
              const isSelected = hour === selectedHour;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={hour}
                  onPress={() => chooseHour(hour)}
                  style={[styles.timePickerButton, isSelected ? styles.timePickerButtonActive : null]}
                >
                  <Text style={[styles.timePickerButtonText, isSelected ? styles.timePickerButtonTextActive : null]}>{hour}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.timePickerColumn}>
          <Text style={styles.timePickerColumnTitle}>นาที</Text>
          <View style={styles.timePickerGrid}>
            {minuteOptions.map((minute) => {
              const isSelected = minute === selectedMinute;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={minute}
                  onPress={() => chooseMinute(minute)}
                  style={[styles.timePickerButton, isSelected ? styles.timePickerButtonActive : null]}
                >
                  <Text style={[styles.timePickerButtonText, isSelected ? styles.timePickerButtonTextActive : null]}>{minute}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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
  action: OrderMutationAction;
  busyAction: OrderMutationAction | null;
  danger?: boolean;
  disabled?: boolean;
  onAction: (action: OrderMutationAction) => void;
}) {
  const isBusy = busyAction === action;
  const label = actionLabels[action];

  return (
    <Pressable
      disabled={disabled || Boolean(busyAction)}
      onPress={() => onAction(action)}
      style={[styles.actionButton, danger ? styles.dangerActionButton : null, disabled || busyAction ? styles.disabled : null]}
    >
      <Text style={[styles.actionButtonText, danger ? styles.dangerActionButtonText : null]}>{isBusy ? 'กำลังบันทึก' : label}</Text>
    </Pressable>
  );
}

function actionSuccessMessage(action: OrderMutationAction, order: OrderRow) {
  if (action === 'confirm') {
    return 'ยืนยันชำระเงินแล้ว โทรหาลูกค้า เลือกวันเวลา แล้วบันทึกนัดหมาย';
  }

  if (action === 'book') {
    return `บันทึกนัดหมายแล้วสำหรับ ${formatDateTime(order.booking_at)}`;
  }

  if (action === 'done') {
    return 'ปิดงานออเดอร์นี้แล้ว';
  }

  return `อัปเดตออเดอร์เป็น ${statusLabel(order.status)} แล้ว`;
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
    backgroundColor: MiraDesign.color.showcaseCanvas,
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
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: MiraDesign.color.showcaseNavySoft,
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
    backgroundColor: MiraDesign.color.showcaseBlue,
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
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 15,
  },
  secondaryButtonText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  notice: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    margin: 22,
    padding: 18,
    ...softShadow,
  },
  noticeTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 18,
    fontWeight: '900',
  },
  noticeBody: {
    color: MiraDesign.color.showcaseNavySoft,
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
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 130,
    padding: 13,
  },
  metricLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: MiraDesign.color.showcaseNavy,
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
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    color: MiraDesign.color.showcaseNavy,
    flex: 1,
    fontSize: 14,
    minHeight: 44,
    minWidth: 220,
    paddingHorizontal: 12,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  filterButtonActive: {
    backgroundColor: MiraDesign.color.showcaseBlue,
    borderColor: MiraDesign.color.showcaseBlue,
  },
  filterButtonText: {
    color: MiraDesign.color.showcaseNavySoft,
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
    borderColor: MiraDesign.color.showcaseLine,
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
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  orderRowSelected: {
    borderColor: MiraDesign.color.showcaseBlue,
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
    color: MiraDesign.color.showcaseNavy,
    fontSize: 16,
    fontWeight: '900',
  },
  orderMeta: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '800',
  },
  orderMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaCell: {
    backgroundColor: '#F7FBFF',
    borderColor: MiraDesign.color.showcaseLineSoft,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 118,
    padding: 9,
  },
  metaLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: MiraDesign.color.showcaseNavy,
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
    color: MiraDesign.color.showcaseBlue,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailTitle: {
    color: MiraDesign.color.showcaseNavy,
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
    backgroundColor: '#F7FBFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  slipImage: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: 8,
    height: 72,
    width: 72,
  },
  slipCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  helperText: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    lineHeight: 19,
  },
  formBlock: {
    gap: 8,
  },
  dateTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pickerField: {
    flex: 1,
    gap: 8,
    minWidth: 280,
  },
  pickerLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  formLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  selectedPickerValue: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 12,
    fontWeight: '900',
  },
  calendarPanel: {
    backgroundColor: '#F7FBFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  calendarHeader: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: MiraDesign.color.showcaseLine,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  calendarMonthTitle: {
    color: MiraDesign.color.showcaseNavy,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  calendarNavButton: {
    alignItems: 'center',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 54,
    paddingHorizontal: 10,
  },
  calendarNavText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  calendarWeekRow: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  calendarWeekday: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    width: `${100 / 7}%`,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
  },
  calendarCell: {
    alignItems: 'center',
    aspectRatio: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  calendarCellMuted: {
    opacity: 0.55,
  },
  calendarCellToday: {
    borderColor: MiraDesign.color.showcaseBlue,
  },
  calendarCellSelected: {
    backgroundColor: MiraDesign.color.showcaseBlue,
    borderColor: MiraDesign.color.showcaseBlue,
  },
  calendarCellDisabled: {
    opacity: 0.28,
  },
  calendarCellText: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    fontWeight: '900',
  },
  calendarCellTextMuted: {
    color: MiraDesign.color.showcaseNavySoft,
  },
  calendarCellTextSelected: {
    color: '#FFFFFF',
  },
  calendarCellTextDisabled: {
    color: MiraDesign.color.showcaseNavySoft,
  },
  timePickerPanel: {
    backgroundColor: '#F7FBFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  timePickerColumn: {
    flex: 1,
    gap: 8,
  },
  timePickerColumnTitle: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  timePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  timePickerButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 48,
    paddingHorizontal: 8,
  },
  timePickerButtonActive: {
    backgroundColor: MiraDesign.color.showcaseBlue,
    borderColor: MiraDesign.color.showcaseBlue,
  },
  timePickerButtonText: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 12,
    fontWeight: '900',
  },
  timePickerButtonTextActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#F7FBFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderWidth: 1,
    color: MiraDesign.color.showcaseNavy,
    fontSize: 14,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  noteInput: {
    minHeight: 84,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  notePresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notePresetButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 10,
  },
  notePresetText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  noteSaveButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlueDeep,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  noteSaveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlue,
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
    borderTopColor: MiraDesign.color.showcaseLine,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  transcriptItem: {
    backgroundColor: '#F7FBFF',
    borderColor: MiraDesign.color.showcaseLineSoft,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 9,
  },
  transcriptRole: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  transcriptText: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 5,
    padding: 18,
  },
  emptyTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyBody: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    lineHeight: 19,
  },
  disabled: {
    opacity: 0.45,
  },
});
