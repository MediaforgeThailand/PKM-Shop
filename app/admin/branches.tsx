import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { MiraDesign, softShadow } from '@/constants/Design';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import {
  canWriteTenantCatalog,
  defaultTenantSlug,
  loadBranches,
  loadTenantMemberContext,
  saveBranch,
  type BranchDraft,
  type BranchSummary,
  type TenantMemberContext,
} from '@/lib/marketplace/hospitalProducts';

const emptyDraft: BranchDraft = {
  active: true,
  address: '',
  district: '',
  imageUrl: '',
  mapUrl: '',
  name: '',
  phone: '',
  sort: '',
};

export default function AdminBranchesScreen() {
  const auth = useAuthSession();
  const { width } = useWindowDimensions();
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [draft, setDraft] = useState<BranchDraft>(emptyDraft);
  const [editingBranch, setEditingBranch] = useState<BranchSummary | null>(null);
  const [tenantContext, setTenantContext] = useState<TenantMemberContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyBranchId, setBusyBranchId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isWide = width >= 980;
  const canEditBranches = canWriteTenantCatalog(tenantContext);
  const canSave = canEditBranches && draft.name.trim().length > 1;

  const summary = useMemo(
    () => ({
      active: branches.filter((branch) => branch.active).length,
      inactive: branches.filter((branch) => !branch.active).length,
      total: branches.length,
    }),
    [branches],
  );

  useEffect(() => {
    let isMounted = true;

    loadBranchAdmin().finally(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [auth.user]);

  async function loadBranchAdmin() {
    try {
      setError(null);

      if (!auth.user) {
        setTenantContext(null);
        setBranches([]);
        return;
      }

      const context = await loadTenantMemberContext();
      setTenantContext(context);

      if (!context) {
        setBranches([]);
        return;
      }

      setBranches(await loadBranches());
    } catch (loadError) {
      setTenantContext(null);
      setBranches([]);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load branches.');
    }
  }

  function updateDraft<K extends keyof BranchDraft>(field: K, value: BranchDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function editBranch(branch: BranchSummary) {
    setEditingBranch(branch);
    setDraft(draftFromBranch(branch));
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setEditingBranch(null);
    setDraft(emptyDraft);
    setMessage(null);
    setError(null);
  }

  async function refreshBranches() {
    try {
      setError(null);
      setBranches(await loadBranches());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh branches.');
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
      const saved = await saveBranch(draft, editingBranch?.id);
      setBranches((current) => [saved, ...current.filter((branch) => branch.id !== saved.id)].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)));
      setEditingBranch(saved);
      setDraft(draftFromBranch(saved));
      setMessage(`Saved ${saved.name}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save branch.');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleBranch(branch: BranchSummary) {
    if (!canEditBranches || busyBranchId) {
      return;
    }

    try {
      setBusyBranchId(branch.id);
      setError(null);
      setMessage(null);
      const saved = await saveBranch({ ...draftFromBranch(branch), active: !branch.active }, branch.id);
      setBranches((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      if (editingBranch?.id === saved.id) {
        setEditingBranch(saved);
        setDraft(draftFromBranch(saved));
      }
      setMessage(`${saved.name} is now ${saved.active ? 'active' : 'inactive'}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to update branch.');
    } finally {
      setBusyBranchId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.topBar, !isWide ? styles.topBarStack : null]}>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>MiraCare v3 Phase 1</Text>
            <Text style={styles.title}>Branches</Text>
            <Text style={styles.subtitle}>
              Tenant: {tenantContext?.display_name ?? defaultTenantSlug}
              {tenantContext ? ` (${tenantContext.role})` : ''}
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable disabled={isLoading} onPress={refreshBranches} style={[styles.secondaryButton, isLoading ? styles.disabled : null]}>
              <Text style={styles.secondaryButtonText}>{isLoading ? 'Refreshing' : 'Refresh'}</Text>
            </Pressable>
            <Link href="/admin/catalog" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Catalog</Text>
              </Pressable>
            </Link>
          </View>
        </View>

        {!auth.session ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Signed-in tenant admin required</Text>
            <Text style={styles.noticeBody}>Use a tenant admin account for branch changes.</Text>
            <Link href="/" asChild>
              <Pressable style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>Sign In</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}

        {tenantContext && !canEditBranches ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Read-only branch access</Text>
            <Text style={styles.noticeBody}>Only tenant_admin or superadmin roles can create or update branches.</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.successText}>{message}</Text> : null}

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <View style={styles.formPane}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>{editingBranch ? 'Edit Branch' : 'New Branch'}</Text>
                <Text style={styles.panelMeta}>{editingBranch ? editingBranch.id.slice(0, 8) : 'Created for this tenant'}</Text>
              </View>
              {editingBranch ? (
                <Pressable onPress={resetForm} style={styles.textButton}>
                  <Text style={styles.textButtonLabel}>New</Text>
                </Pressable>
              ) : null}
            </View>

            <Field label="Name" onChangeText={(value) => updateDraft('name', value)} value={draft.name} />
            <Field label="Address" multiline onChangeText={(value) => updateDraft('address', value)} value={draft.address ?? ''} />
            <View style={styles.twoColumn}>
              <Field label="District" onChangeText={(value) => updateDraft('district', value)} value={draft.district ?? ''} />
              <Field label="Phone" onChangeText={(value) => updateDraft('phone', value)} value={draft.phone ?? ''} />
            </View>
            <Field label="Map URL" onChangeText={(value) => updateDraft('mapUrl', value)} value={draft.mapUrl ?? ''} />
            <Field label="Image URL" onChangeText={(value) => updateDraft('imageUrl', value)} value={draft.imageUrl ?? ''} />
            <View style={styles.twoColumn}>
              <Field label="Sort" onChangeText={(value) => updateDraft('sort', value)} value={draft.sort ?? ''} />
              <View style={styles.controlGroup}>
                <Text style={styles.fieldLabel}>Status</Text>
                <View style={styles.segmentRow}>
                  <Pressable onPress={() => updateDraft('active', true)} style={[styles.segment, draft.active !== false ? styles.segmentActive : null]}>
                    <Text style={[styles.segmentText, draft.active !== false ? styles.segmentTextActive : null]}>Active</Text>
                  </Pressable>
                  <Pressable onPress={() => updateDraft('active', false)} style={[styles.segment, draft.active === false ? styles.segmentActive : null]}>
                    <Text style={[styles.segmentText, draft.active === false ? styles.segmentTextActive : null]}>Inactive</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <Pressable disabled={!canSave || isSaving} onPress={saveDraft} style={[styles.saveButton, !canSave || isSaving ? styles.disabled : null]}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving' : editingBranch ? 'Save Changes' : 'Create Branch'}</Text>
            </Pressable>
          </View>

          <View style={styles.listPane}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelTitle}>Branch List</Text>
                <Text style={styles.panelMeta}>{isLoading ? 'Loading' : `${summary.total} total`}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Metric label="Active" value={`${summary.active}`} />
                <Metric label="Inactive" value={`${summary.inactive}`} />
              </View>
            </View>

            {branches.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No branches found</Text>
                <Text style={styles.emptyBody}>Create the default branch before assigning products.</Text>
              </View>
            ) : (
              branches.map((branch) => (
                <View key={branch.id} style={[styles.branchRow, editingBranch?.id === branch.id ? styles.branchRowSelected : null]}>
                  <View style={styles.branchHead}>
                    <View style={styles.branchTitleGroup}>
                      <Text style={styles.branchTitle}>{branch.name}</Text>
                      <Text style={styles.branchMeta}>{[branch.address, branch.district].filter(Boolean).join(' · ') || 'No address'}</Text>
                    </View>
                    <Text style={[styles.statusPill, branch.active ? styles.statusPillActive : styles.statusPillInactive]}>
                      {branch.active ? 'active' : 'inactive'}
                    </Text>
                  </View>
                  <View style={styles.branchMetaGrid}>
                    <Meta label="Phone" value={branch.phone ?? '-'} />
                    <Meta label="Sort" value={`${branch.sort}`} />
                    <Meta label="Map" value={branch.mapUrl ?? '-'} />
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable onPress={() => editBranch(branch)} style={styles.textButton}>
                      <Text style={styles.textButtonLabel}>Edit</Text>
                    </Pressable>
                    <Pressable
                      disabled={!canEditBranches || Boolean(busyBranchId)}
                      onPress={() => void toggleBranch(branch)}
                      style={[branch.active ? styles.dangerButton : styles.restoreButton, !canEditBranches || busyBranchId ? styles.disabled : null]}
                    >
                      <Text style={branch.active ? styles.dangerButtonText : styles.restoreButtonText}>
                        {busyBranchId === branch.id ? 'Saving' : branch.active ? 'Deactivate' : 'Activate'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function draftFromBranch(branch: BranchSummary): BranchDraft {
  return {
    active: branch.active,
    address: branch.address ?? '',
    district: branch.district ?? '',
    imageUrl: branch.imageUrl ?? '',
    mapUrl: branch.mapUrl ?? '',
    name: branch.name,
    phone: branch.phone ?? '',
    sort: `${branch.sort}`,
  };
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
    gap: 18,
    padding: 22,
    paddingBottom: 48,
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
    gap: 7,
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
    minHeight: 44,
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
    justifyContent: 'center',
    minHeight: 44,
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
    justifyContent: 'center',
    minHeight: 38,
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
    flex: 0.8,
    gap: 14,
    padding: 18,
    width: '100%',
    ...softShadow,
  },
  listPane: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1.2,
    gap: 14,
    padding: 18,
    width: '100%',
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: MiraDesign.color.surfaceSoft,
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
    minHeight: 92,
    paddingTop: 12,
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 12,
  },
  controlGroup: {
    flex: 1,
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
    backgroundColor: MiraDesign.color.surface,
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
  saveButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
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
    color: MiraDesign.color.primaryDeep,
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
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 82,
    padding: 10,
  },
  metricLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  emptyState: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
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
  branchRow: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  branchRowSelected: {
    borderColor: MiraDesign.color.primary,
  },
  branchHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  branchTitleGroup: {
    flex: 1,
    gap: 4,
  },
  branchTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  branchMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  statusPill: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
  statusPillActive: {
    backgroundColor: '#E7F4ED',
    color: MiraDesign.color.primaryDeep,
  },
  statusPillInactive: {
    backgroundColor: '#FFE8E8',
    color: '#A23538',
  },
  branchMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaCell: {
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 130,
    padding: 10,
  },
  metaLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  rowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#FFE8E8',
    borderColor: '#F7B9BA',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 112,
    paddingHorizontal: 12,
  },
  dangerButtonText: {
    color: '#A23538',
    fontSize: 12,
    fontWeight: '900',
  },
  restoreButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 112,
    paddingHorizontal: 12,
  },
  restoreButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});
