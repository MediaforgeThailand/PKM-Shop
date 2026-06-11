import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Pill } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { defaultTenantSlug } from '@/lib/marketplace/hospitalProducts';
import { supabase, supabaseConfigStatus } from '@/lib/supabase';
import type { CommissionEntryRow, ReferrerRow, ReferrerType, TenantSummary } from '@/lib/types/api';

type TenantContext = TenantSummary & {
  role: string;
};

type ReferrerDraft = {
  active: boolean;
  authUserId: string;
  byCategory: string;
  defaultValue: string;
  mode: 'flat_baht' | 'percent';
  name: string;
  phone: string;
  refCode: string;
  type: ReferrerType;
};

type CommissionWithJoins = CommissionEntryRow & {
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
  referrers?: {
    name: string;
    ref_code: string;
  } | {
    name: string;
    ref_code: string;
  }[] | null;
};

const emptyDraft: ReferrerDraft = {
  active: true,
  authUserId: '',
  byCategory: '{}',
  defaultValue: '10',
  mode: 'percent',
  name: '',
  phone: '',
  refCode: '',
  type: 'doctor',
};
const allowedReferrerTypes: ReferrerType[] = ['doctor', 'nurse', 'creator', 'staff'];

function fromJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

function parseByCategory(value: string) {
  const parsed = JSON.parse(value || '{}') as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('by_category must be a JSON object.');
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([key, amount]) => [key, amount]),
  );
}

export function ReferrersAdmin({ title = 'Referrers And Commissions' }: { title?: string }) {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [referrers, setReferrers] = useState<ReferrerRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionWithJoins[]>([]);
  const [draft, setDraft] = useState<ReferrerDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyCommissionId, setBusyCommissionId] = useState<string | null>(null);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isWide = width >= 1080;
  const canEdit = tenant?.role === 'tenant_admin' || tenant?.role === 'superadmin';
  const canSave =
    canEdit &&
    draft.name.trim().length > 1 &&
    allowedReferrerTypes.includes(draft.type);
  const selectedCommissions = useMemo(
    () => commissions.filter((entry) => selectedCommissionIds.has(entry.id)),
    [commissions, selectedCommissionIds],
  );
  const allCommissionsSelected = commissions.length > 0 && selectedCommissions.length === commissions.length;

  const totals = useMemo(
    () => ({
      approved: commissions.filter((entry) => entry.status === 'approved').reduce((sum, entry) => sum + entry.amount_baht, 0),
      paid: commissions.filter((entry) => entry.status === 'paid').reduce((sum, entry) => sum + entry.amount_baht, 0),
      pending: commissions.filter((entry) => entry.status === 'pending').reduce((sum, entry) => sum + entry.amount_baht, 0),
    }),
    [commissions],
  );

  const loadData = useCallback(async () => {
    if (!auth.user) {
      return;
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
      .eq('tenant_id', (tenantRow as TenantSummary).id)
      .eq('auth_user_id', auth.user.id)
      .maybeSingle();

    if (memberError || !member) {
      throw new Error(memberError?.message ?? 'Your account is not a member of this tenant.');
    }

    const tenantContext = {
      ...(tenantRow as TenantSummary),
      role: String((member as { role: string }).role),
    };
    setTenant(tenantContext);

    const { data: referrerRows, error: referrerError } = await supabase
      .from('referrers')
      .select('id,tenant_id,ref_code,name,type,phone,auth_user_id,commission_scheme,active,created_at')
      .eq('tenant_id', tenantContext.id)
      .order('created_at', { ascending: false });

    if (referrerError) {
      throw new Error(referrerError.message);
    }

    const { data: commissionRows, error: commissionError } = await supabase
      .from('commission_entries')
      .select('id,tenant_id,referrer_id,order_id,scheme_snapshot,amount_baht,status,created_at,referrers(name,ref_code),orders(amount_baht,products(name))')
      .eq('tenant_id', tenantContext.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (commissionError) {
      throw new Error(commissionError.message);
    }

    const nextCommissions = (commissionRows ?? []) as unknown as CommissionWithJoins[];
    setReferrers((referrerRows ?? []) as unknown as ReferrerRow[]);
    setCommissions(nextCommissions);
    setSelectedCommissionIds((current) => {
      const visibleIds = new Set(nextCommissions.map((entry) => entry.id));

      return new Set([...current].filter((id) => visibleIds.has(id)));
    });
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
        await loadData();
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load referrer admin.');
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
  }, [auth.session, loadData]);

  function editReferrer(referrer: ReferrerRow) {
    setEditingId(referrer.id);
    setDraft({
      active: referrer.active,
      authUserId: referrer.auth_user_id ?? '',
      byCategory: JSON.stringify(referrer.commission_scheme.by_category ?? {}),
      defaultValue: String(referrer.commission_scheme.default),
      mode: referrer.commission_scheme.mode,
      name: referrer.name,
      phone: referrer.phone ?? '',
      refCode: referrer.ref_code,
      type: referrer.type,
    });
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
    setMessage(null);
    setError(null);
  }

  async function saveReferrer() {
    if (!tenant || !canSave || isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setMessage(null);
      const byCategory = parseByCategory(draft.byCategory);
      const payload = {
        active: draft.active,
        auth_user_id: draft.authUserId.trim() || null,
        commission_scheme: {
          by_category: byCategory,
          default: Math.max(0, Number(draft.defaultValue) || 0),
          mode: draft.mode,
        },
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        tenant_id: tenant.id,
        type: draft.type,
      };
      const query = editingId
        ? supabase.from('referrers').update(payload).eq('id', editingId).eq('tenant_id', tenant.id)
        : supabase.from('referrers').insert(payload);
      const { error: saveError } = await query;

      if (saveError) {
        throw new Error(saveError.message);
      }

      setMessage(editingId ? 'Referrer updated.' : 'Referrer created.');
      resetForm();
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save referrer.');
    } finally {
      setIsSaving(false);
    }
  }

  async function updateCommissionStatus(entry: CommissionEntryRow, status: CommissionEntryRow['status']) {
    if (!canEdit || busyCommissionId) {
      return;
    }

    try {
      setBusyCommissionId(entry.id);
      setError(null);
      setMessage(null);
      const { error: updateError } = await supabase
        .from('commission_entries')
        .update({ status })
        .eq('id', entry.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setMessage(`Commission marked ${status}.`);
      await loadData();
    } catch (commissionError) {
      setError(commissionError instanceof Error ? commissionError.message : 'Unable to update commission.');
    } finally {
      setBusyCommissionId(null);
    }
  }

  function toggleCommissionSelection(id: string) {
    setSelectedCommissionIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleAllCommissions() {
    setSelectedCommissionIds(() => {
      if (allCommissionsSelected) {
        return new Set();
      }

      return new Set(commissions.map((entry) => entry.id));
    });
  }

  async function updateSelectedCommissionStatus(status: Extract<CommissionEntryRow['status'], 'approved' | 'paid'>) {
    if (!canEdit || busyCommissionId || !tenant || selectedCommissions.length === 0) {
      return;
    }

    try {
      setBusyCommissionId('bulk');
      setError(null);
      setMessage(null);
      const selectedIds = selectedCommissions.map((entry) => entry.id);
      const { error: updateError } = await supabase
        .from('commission_entries')
        .update({ status })
        .eq('tenant_id', tenant.id)
        .in('id', selectedIds);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setMessage(`${selectedIds.length} commissions marked ${status}.`);
      setSelectedCommissionIds(new Set());
      await loadData();
    } catch (commissionError) {
      setError(commissionError instanceof Error ? commissionError.message : 'Unable to update selected commissions.');
    } finally {
      setBusyCommissionId(null);
    }
  }

  if (!supabaseConfigStatus.isConfigured || !auth.session) {
    return (
      <View style={styles.screen}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Tenant admin sign-in required</Text>
          <Text style={styles.noticeBody}>Connect Supabase and sign in before managing referrers.</Text>
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
            <Text style={styles.eyebrow}>MiraCare v2 Phase 4</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {tenant ? `${tenant.display_name} · ${tenant.role}` : isLoading ? 'Loading tenant access' : defaultTenantSlug}
            </Text>
          </View>
          <Pressable disabled={isLoading} onPress={() => void loadData()} style={[styles.secondaryButton, isLoading ? styles.disabled : null]}>
            <Text style={styles.secondaryButtonText}>{isLoading ? 'Refreshing' : 'Refresh'}</Text>
          </Pressable>
        </View>

        {!canEdit && tenant ? (
          <View style={styles.noticeInline}>
            <Text style={styles.noticeTitle}>Read-only access</Text>
            <Text style={styles.noticeBody}>Only tenant admins can edit referrers or commission statuses.</Text>
          </View>
        ) : null}

        {error ? <Banner tone="error" text={error} /> : null}
        {message ? <Banner tone="success" text={message} /> : null}

        <View style={styles.metrics}>
          <Metric label="Pending" value={formatMoney(totals.pending)} />
          <Metric label="Approved" value={formatMoney(totals.approved)} />
          <Metric label="Paid" value={formatMoney(totals.paid)} />
        </View>

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.formPane}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>{editingId ? 'Edit Referrer' : 'New Referrer'}</Text>
                <Text style={styles.panelMeta}>{editingId ?? 'Admin-created profiles only'}</Text>
              </View>
              {editingId ? (
                <Pressable onPress={resetForm} style={styles.textButton}>
                  <Text style={styles.textButtonLabel}>New</Text>
                </Pressable>
              ) : null}
            </View>

            <Field label="Name" onChangeText={(value) => setDraft((current) => ({ ...current, name: value }))} value={draft.name} />
            <View style={styles.twoColumn}>
              <Field disabled label="Ref Code" onChangeText={() => null} value={editingId ? draft.refCode : 'Generated on save'} />
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Type</Text>
                <View style={styles.typeGrid}>
                  {allowedReferrerTypes.map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setDraft((current) => ({ ...current, type }))}
                      style={[styles.typeOption, draft.type === type ? styles.typeOptionActive : null]}
                    >
                      <Text style={[styles.typeOptionText, draft.type === type ? styles.typeOptionTextActive : null]}>{type}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <Field label="Phone" onChangeText={(value) => setDraft((current) => ({ ...current, phone: value }))} value={draft.phone} />
            <Field label="Auth User ID" onChangeText={(value) => setDraft((current) => ({ ...current, authUserId: value }))} value={draft.authUserId} />

            <View style={styles.segmentRow}>
              <Pressable onPress={() => setDraft((current) => ({ ...current, mode: 'percent' }))} style={[styles.segment, draft.mode === 'percent' ? styles.segmentActive : null]}>
                <Text style={[styles.segmentText, draft.mode === 'percent' ? styles.segmentTextActive : null]}>Percent</Text>
              </Pressable>
              <Pressable onPress={() => setDraft((current) => ({ ...current, mode: 'flat_baht' }))} style={[styles.segment, draft.mode === 'flat_baht' ? styles.segmentActive : null]}>
                <Text style={[styles.segmentText, draft.mode === 'flat_baht' ? styles.segmentTextActive : null]}>Flat THB</Text>
              </Pressable>
            </View>

            <View style={styles.twoColumn}>
              <Field label="Default" onChangeText={(value) => setDraft((current) => ({ ...current, defaultValue: value }))} value={draft.defaultValue} />
              <Field label="By Category JSON" onChangeText={(value) => setDraft((current) => ({ ...current, byCategory: value }))} value={draft.byCategory} />
            </View>

            <View style={styles.segmentRow}>
              <Pressable onPress={() => setDraft((current) => ({ ...current, active: true }))} style={[styles.segment, draft.active ? styles.segmentActive : null]}>
                <Text style={[styles.segmentText, draft.active ? styles.segmentTextActive : null]}>Active</Text>
              </Pressable>
              <Pressable onPress={() => setDraft((current) => ({ ...current, active: false }))} style={[styles.segment, !draft.active ? styles.segmentActive : null]}>
                <Text style={[styles.segmentText, !draft.active ? styles.segmentTextActive : null]}>Inactive</Text>
              </Pressable>
            </View>

            <Pressable disabled={!canSave || isSaving} onPress={saveReferrer} style={[styles.primaryButton, !canSave || isSaving ? styles.disabled : null]}>
              <Text style={styles.primaryButtonText}>{isSaving ? 'Saving' : editingId ? 'Save Referrer' : 'Create Referrer'}</Text>
            </Pressable>
          </View>

          <View style={styles.listPane}>
            <Text style={styles.panelTitle}>Referrers</Text>
            {referrers.length === 0 ? (
              <Empty title="No referrers" body="Create the first referrer to enable assisted purchase." />
            ) : (
              referrers.map((referrer) => (
                <View key={referrer.id} style={styles.referrerRow}>
                  <View style={styles.rowTop}>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{referrer.name}</Text>
                      <Text style={styles.rowMeta}>{referrer.ref_code} · {referrer.type}</Text>
                    </View>
                    <Pill label={referrer.active ? 'active' : 'inactive'} tone={referrer.active ? 'mint' : 'amber'} />
                  </View>
                  <Text style={styles.rowBody}>
                    {referrer.commission_scheme.mode === 'percent' ? `${referrer.commission_scheme.default}%` : `${referrer.commission_scheme.default} THB`} default
                  </Text>
                  <Pressable disabled={!canEdit} onPress={() => editReferrer(referrer)} style={[styles.secondaryButton, !canEdit ? styles.disabled : null]}>
                    <Text style={styles.secondaryButtonText}>Edit</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.commissionsPane}>
          <View style={styles.bulkBar}>
            <View style={styles.rowCopy}>
              <Text style={styles.panelTitle}>Commissions</Text>
              <Text style={styles.panelMeta}>{selectedCommissions.length} selected</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                disabled={!canEdit || commissions.length === 0 || Boolean(busyCommissionId)}
                onPress={toggleAllCommissions}
                style={[styles.secondaryButton, !canEdit || commissions.length === 0 || Boolean(busyCommissionId) ? styles.disabled : null]}
              >
                <Text style={styles.secondaryButtonText}>{allCommissionsSelected ? 'Clear' : 'Select All'}</Text>
              </Pressable>
              <Pressable
                disabled={!canEdit || selectedCommissions.length === 0 || Boolean(busyCommissionId)}
                onPress={() => void updateSelectedCommissionStatus('approved')}
                style={[styles.smallButton, !canEdit || selectedCommissions.length === 0 || Boolean(busyCommissionId) ? styles.disabled : null]}
              >
                <Text style={styles.smallButtonText}>{busyCommissionId === 'bulk' ? 'Saving' : 'Approve Selected'}</Text>
              </Pressable>
              <Pressable
                disabled={!canEdit || selectedCommissions.length === 0 || Boolean(busyCommissionId)}
                onPress={() => void updateSelectedCommissionStatus('paid')}
                style={[styles.smallButton, !canEdit || selectedCommissions.length === 0 || Boolean(busyCommissionId) ? styles.disabled : null]}
              >
                <Text style={styles.smallButtonText}>{busyCommissionId === 'bulk' ? 'Saving' : 'Mark Paid'}</Text>
              </Pressable>
            </View>
          </View>
          {commissions.length === 0 ? (
            <Empty title="No commissions" body="Commission entries are created when admin confirms an attributed order." />
          ) : (
            commissions.map((entry) => (
              <CommissionRow
                key={entry.id}
                busy={busyCommissionId === entry.id}
                canEdit={canEdit}
                entry={entry}
                onStatus={(status) => void updateCommissionStatus(entry, status)}
                onToggleSelected={() => toggleCommissionSelection(entry.id)}
                selected={selectedCommissionIds.has(entry.id)}
              />
            ))
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

function Field({
  disabled,
  label,
  onChangeText,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        editable={!disabled}
        onChangeText={onChangeText}
        placeholderTextColor={MiraDesign.color.muted}
        style={[styles.input, disabled ? styles.inputDisabled : null]}
        value={value}
      />
    </View>
  );
}

function Empty({ body, title }: { body: string; title: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function CommissionRow({
  busy,
  canEdit,
  entry,
  onStatus,
  onToggleSelected,
  selected,
}: {
  busy: boolean;
  canEdit: boolean;
  entry: CommissionWithJoins;
  onStatus: (status: CommissionEntryRow['status']) => void;
  onToggleSelected: () => void;
  selected: boolean;
}) {
  const referrer = fromJoin(entry.referrers);
  const order = fromJoin(entry.orders);
  const product = fromJoin(order?.products);

  return (
    <View style={styles.commissionRow}>
      <View style={styles.rowTop}>
        <Pressable
          accessibilityLabel={selected ? 'Deselect commission' : 'Select commission'}
          disabled={!canEdit || busy}
          onPress={onToggleSelected}
          style={[styles.checkBox, selected ? styles.checkBoxSelected : null, !canEdit || busy ? styles.disabled : null]}
        >
          <Text style={[styles.checkBoxText, selected ? styles.checkBoxTextSelected : null]}>{selected ? 'x' : ''}</Text>
        </Pressable>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{product?.name ?? `Order ${entry.order_id.slice(0, 8)}`}</Text>
          <Text style={styles.rowMeta}>{referrer ? `${referrer.name} · ${referrer.ref_code}` : entry.referrer_id}</Text>
        </View>
        <Pill label={entry.status} tone={entry.status === 'paid' ? 'mint' : entry.status === 'void' ? 'danger' : 'amber'} />
      </View>
      <Text style={styles.rowBody}>{formatMoney(entry.amount_baht)}</Text>
      <View style={styles.actionRow}>
        {(['approved', 'paid', 'void'] as const).map((status) => (
          <Pressable
            key={status}
            disabled={!canEdit || busy || entry.status === status}
            onPress={() => onStatus(status)}
            style={[styles.smallButton, !canEdit || busy || entry.status === status ? styles.disabled : null]}
          >
            <Text style={styles.smallButtonText}>{busy ? 'Saving' : status}</Text>
          </Pressable>
        ))}
      </View>
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
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
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
  formPane: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 0.9,
    gap: 12,
    padding: 16,
    width: '100%',
    ...softShadow,
  },
  listPane: {
    flex: 1.1,
    gap: 10,
    width: '100%',
  },
  commissionsPane: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  bulkBar: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
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
    backgroundColor: '#F0F6F4',
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
    fontSize: 11,
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
    minHeight: 44,
    paddingHorizontal: 12,
  },
  inputDisabled: {
    backgroundColor: '#EDF4F3',
    color: MiraDesign.color.inkSoft,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 10,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeOption: {
    alignItems: 'center',
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 78,
    paddingHorizontal: 10,
  },
  typeOptionActive: {
    backgroundColor: MiraDesign.color.primary,
    borderColor: MiraDesign.color.primary,
  },
  typeOptionText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  typeOptionTextActive: {
    color: '#FFFFFF',
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
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
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
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
  },
  referrerRow: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 13,
  },
  commissionRow: {
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  rowTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  rowCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  rowTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  rowMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  rowBody: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  checkBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 6,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  checkBoxSelected: {
    backgroundColor: MiraDesign.color.primary,
    borderColor: MiraDesign.color.primary,
  },
  checkBoxText: {
    color: MiraDesign.color.muted,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  checkBoxTextSelected: {
    color: '#FFFFFF',
  },
  smallButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 84,
    paddingHorizontal: 10,
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
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
