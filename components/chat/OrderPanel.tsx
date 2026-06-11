import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { MiraDesign } from '@/constants/Design';
import type { OrderPanelState } from '@/lib/types/api';

type Order = NonNullable<OrderPanelState>;
type SlipUploadFile = Blob & { name?: string; type?: string };

const fieldLabels: Record<string, string> = {
  buyer_name: 'ชื่อ-นามสกุล',
  buyer_phone: 'เบอร์โทร',
  preferred_date: 'วันที่สะดวก',
};

const statusLabels: Record<Order['status'], string> = {
  awaiting_payment: 'รอชำระเงิน',
  booked: 'จองแล้ว',
  cancelled: 'ยกเลิก',
  collecting_info: 'รอข้อมูลผู้ซื้อ',
  confirmed: 'ยืนยันคำสั่งซื้อ',
  done: 'เสร็จสิ้น',
  submitted: 'รอตรวจสอบ',
};

function formatMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

function missingLabel(fields: string[]) {
  return fields.map((field) => fieldLabels[field] ?? field).join(', ');
}

export function OrderPanel({
  disabled,
  onPaymentDone,
  onSlipSelected,
  onStripeCheckout,
  onSubmitForm,
  order,
}: {
  disabled?: boolean;
  onPaymentDone?: (orderId: string) => void;
  onSlipSelected?: (payload: { file: SlipUploadFile; order_id: string }) => void;
  onStripeCheckout?: (orderId: string) => void;
  onSubmitForm?: (payload: { buyer_name: string; buyer_phone: string; order_id: string; preferred_date?: string }) => void;
  order: Order;
}) {
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const canSubmitForm = buyerName.trim().length > 1 && /^0[689]\d{8}$/.test(buyerPhone.trim());
  const statusTone = useMemo(() => {
    if (order.status === 'submitted' || order.status === 'confirmed' || order.status === 'booked' || order.status === 'done') {
      return styles.statusGood;
    }

    if (order.status === 'cancelled') {
      return styles.statusDanger;
    }

    return styles.statusWaiting;
  }, [order.status]);

  function selectSlipFile() {
    if (disabled || !onSlipSelected || typeof document === 'undefined') {
      return;
    }

    const input = document.createElement('input');
    input.accept = 'image/jpeg,image/png';
    input.type = 'file';
    input.onchange = () => {
      const file = input.files?.item(0);

      if (file) {
        onSlipSelected({
          file,
          order_id: order.id,
        });
      }
    };
    input.click();
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Order</Text>
          <Text numberOfLines={2} style={styles.title}>
            {order.product_name}
          </Text>
        </View>
        <Text style={[styles.status, statusTone]}>{statusLabels[order.status]}</Text>
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Amount</Text>
          <Text style={styles.metaValue}>{formatMoney(order.amount_baht)}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Missing</Text>
          <Text numberOfLines={2} style={styles.metaValue}>
            {order.missing_fields.length ? missingLabel(order.missing_fields) : 'ครบแล้ว'}
          </Text>
        </View>
      </View>

      {order.show_form ? (
        <View style={styles.form}>
          <Text style={styles.sectionLabel}>ข้อมูลผู้ซื้อ</Text>
          <TextInput
            onChangeText={setBuyerName}
            placeholder="ชื่อ-นามสกุล"
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
            placeholder="วันที่สะดวก เช่น 2026-06-20"
            placeholderTextColor={MiraDesign.color.muted}
            style={styles.input}
            value={preferredDate}
          />
          <Pressable
            disabled={disabled || !canSubmitForm}
            onPress={() =>
              onSubmitForm?.({
                buyer_name: buyerName.trim(),
                buyer_phone: buyerPhone.trim(),
                order_id: order.id,
                preferred_date: preferredDate.trim() || undefined,
              })
            }
            style={[styles.primaryButton, disabled || !canSubmitForm ? styles.disabled : null]}
          >
            <Text style={styles.primaryButtonText}>{disabled ? 'กำลังส่ง' : 'ส่งข้อมูล'}</Text>
          </Pressable>
        </View>
      ) : null}

      {order.qr_payload ? (
        <View style={styles.payment}>
          <View style={styles.qrBox}>
            <QRCode backgroundColor="#FFFFFF" color="#14231E" size={168} value={order.qr_payload} />
          </View>
          <View style={styles.paymentCopy}>
            <Text style={styles.sectionLabel}>PromptPay QR</Text>
            <Text style={styles.helperText}>สแกนจ่ายยอด {formatMoney(order.amount_baht)} แล้วกดปุ่มด้านล่าง</Text>
            <Pressable
              disabled={disabled}
              onPress={() => onPaymentDone?.(order.id)}
              style={[styles.primaryButton, disabled ? styles.disabled : null]}
            >
              <Text style={styles.primaryButtonText}>{disabled ? 'กำลังส่ง' : 'จ่ายแล้ว'}</Text>
            </Pressable>
            {onSlipSelected ? (
              <Pressable
                disabled={disabled}
                onPress={selectSlipFile}
                style={[styles.secondaryButton, disabled ? styles.disabled : null]}
              >
                <Text style={styles.secondaryButtonText}>อัปโหลดสลิป</Text>
              </Pressable>
            ) : null}
            {onStripeCheckout ? (
              <Pressable
                disabled={disabled}
                onPress={() => onStripeCheckout(order.id)}
                style={[styles.stripeButton, disabled ? styles.disabled : null]}
              >
                <Text style={styles.stripeButtonText}>Pay with Stripe</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#F7FBFA',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  eyebrow: {
    color: MiraDesign.color.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  status: {
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusDanger: {
    backgroundColor: '#FDECEC',
    color: '#A23538',
  },
  statusGood: {
    backgroundColor: '#E5F3EC',
    color: '#1E7C63',
  },
  statusWaiting: {
    backgroundColor: '#FFF4D9',
    color: '#8A5B12',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaCell: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1ECE8',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 136,
    padding: 10,
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
    lineHeight: 18,
    marginTop: 4,
  },
  form: {
    gap: 8,
  },
  sectionLabel: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#FFFFFF',
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
    minHeight: 40,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  stripeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#635BFF',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
  },
  stripeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
  payment: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  qrBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    padding: 10,
  },
  paymentCopy: {
    flex: 1,
    gap: 8,
    minWidth: 180,
  },
  helperText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
});
