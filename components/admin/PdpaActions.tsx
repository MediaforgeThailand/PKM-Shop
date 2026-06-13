import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { invokeFunction } from '@/lib/api/client';
import { MiraDesign } from '@/constants/Design';

// R4 admin trigger: per-customer PDPA export / hard-delete. Rendered only for
// tenant_admin (the backend re-enforces this); delete requires the typed
// confirmation "ลบถาวร". The edge functions own all data handling.
type PdpaExportRequest = { customer_id?: string };
type PdpaExportResponse = { exported_at: string; request_id: string };
type PdpaDeleteRequest = { confirm: string; customer_id?: string };
type PdpaDeleteResponse = { completed_at: string | null; deleted: boolean; noop: boolean; request_id: string | null };

const DELETE_CONFIRM_WORD = 'ลบถาวร';

export function PdpaActions({ canErase, customerId }: { canErase: boolean; customerId: string | null }) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  if (!canErase) {
    return null;
  }

  const disabled = !customerId || busy !== null;

  async function runExport() {
    if (!customerId) {
      return;
    }

    setBusy('export');
    setMessage(null);

    try {
      const result = await invokeFunction<PdpaExportRequest, PdpaExportResponse>('pdpa-export', { customer_id: customerId });
      setMessage({ text: `ส่งออกข้อมูลแล้ว (อ้างอิง ${result.request_id.slice(0, 8)})`, tone: 'success' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'ส่งออกข้อมูลไม่สำเร็จ', tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function runDelete() {
    if (!customerId || confirmText !== DELETE_CONFIRM_WORD) {
      return;
    }

    setBusy('delete');
    setMessage(null);

    try {
      const result = await invokeFunction<PdpaDeleteRequest, PdpaDeleteResponse>('pdpa-delete', {
        confirm: DELETE_CONFIRM_WORD,
        customer_id: customerId,
      });
      setConfirmText('');
      setMessage({
        text: result.noop ? 'ข้อมูลถูกลบไปก่อนหน้านี้แล้ว' : 'ลบข้อมูลส่วนบุคคลถาวรแล้ว (ออเดอร์ถูกปิดบังชื่อ)',
        tone: 'success',
      });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'ลบข้อมูลไม่สำเร็จ', tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PDPA — ข้อมูลส่วนบุคคล</Text>
      {customerId ? null : <Text style={styles.helper}>ออเดอร์นี้ไม่มีบัญชีลูกค้าผูกอยู่ (ปิดบังแล้ว)</Text>}

      <Pressable disabled={disabled} onPress={() => void runExport()} style={[styles.exportButton, disabled ? styles.disabled : null]}>
        <Text style={styles.exportText}>{busy === 'export' ? 'กำลังส่งออก…' : 'ส่งออกข้อมูล (PDPA)'}</Text>
      </Pressable>

      <Text style={styles.deleteLabel}>ลบข้อมูลถาวร — พิมพ์ “{DELETE_CONFIRM_WORD}” เพื่อยืนยัน</Text>
      <TextInput
        autoCapitalize="none"
        editable={!disabled}
        onChangeText={setConfirmText}
        placeholder={DELETE_CONFIRM_WORD}
        placeholderTextColor={MiraDesign.color.muted}
        style={styles.confirmInput}
        value={confirmText}
      />
      <Pressable
        disabled={disabled || confirmText !== DELETE_CONFIRM_WORD}
        onPress={() => void runDelete()}
        style={[styles.deleteButton, disabled || confirmText !== DELETE_CONFIRM_WORD ? styles.disabled : null]}
      >
        <Text style={styles.deleteText}>{busy === 'delete' ? 'กำลังลบ…' : 'ลบข้อมูลถาวร (PDPA)'}</Text>
      </Pressable>

      {message ? (
        <Text style={[styles.message, message.tone === 'error' ? styles.errorText : styles.successText]}>{message.text}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  confirmInput: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.muted,
    borderRadius: 10,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  container: {
    borderColor: MiraDesign.color.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 16,
    padding: 14,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 10,
    marginTop: 4,
    paddingVertical: 10,
  },
  deleteLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12.5,
    marginTop: 8,
  },
  deleteText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
  errorText: {
    color: '#dc2626',
  },
  exportButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surfaceTint,
    borderRadius: 10,
    paddingVertical: 10,
  },
  exportText: {
    color: MiraDesign.color.ink,
    fontWeight: '700',
  },
  helper: {
    color: MiraDesign.color.muted,
    fontSize: 12.5,
  },
  message: {
    fontSize: 13,
    marginTop: 6,
  },
  successText: {
    color: MiraDesign.color.primary,
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '800',
  },
});
