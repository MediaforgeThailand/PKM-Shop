import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { MiraDesign } from '@/constants/Design';
import type { OrderPanelState } from '@/lib/types/api';

type Order = NonNullable<OrderPanelState>;
type SlipUploadFile = Blob & { name?: string; type?: string };

type TouchedFields = {
  age: boolean;
  firstName: boolean;
  lastName: boolean;
  phone: boolean;
};

const emptyTouched: TouchedFields = {
  age: false,
  firstName: false,
  lastName: false,
  phone: false,
};

function formatMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} บาท`;
}

function firstError(value: string, field: keyof TouchedFields) {
  const trimmed = value.trim();

  if (field === 'firstName' || field === 'lastName') {
    return trimmed.length >= 1 ? null : 'กรอกข้อมูลให้ครบค่ะ';
  }

  if (field === 'phone') {
    return /^0[689]\d{8}$/.test(trimmed) ? null : 'เบอร์โทรต้องขึ้นต้น 06, 08 หรือ 09 และมี 10 หลัก';
  }

  const age = Number(trimmed);

  return Number.isInteger(age) && age >= 1 && age <= 120 ? null : 'อายุต้องอยู่ระหว่าง 1-120';
}

export function BookingSheet({
  disabled,
  onClose,
  onPaymentDone,
  onSlipSelected,
  onStripeCheckout,
  onSubmitForm,
  order,
  stripeEnabled = false,
  visible,
}: {
  disabled?: boolean;
  onClose: () => void;
  onPaymentDone: (orderId: string) => void;
  onSlipSelected?: (payload: { file: SlipUploadFile; order_id: string }) => void;
  onStripeCheckout?: (orderId: string) => void;
  onSubmitForm: (payload: { buyer_age: number; buyer_name: string; buyer_phone: string; order_id: string }) => void;
  order: Order | null;
  stripeEnabled?: boolean;
  visible: boolean;
}) {
  const slide = useRef(new Animated.Value(1)).current;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [touched, setTouched] = useState<TouchedFields>(emptyTouched);
  const isFormStep = order?.step === 'form';
  const isQrStep = order?.step === 'qr';
  const isTrackingStep = order?.step === 'tracking' || order?.step === 'cancelled';
  const errors = useMemo(() => ({
    age: firstError(age, 'age'),
    firstName: firstError(firstName, 'firstName'),
    lastName: firstError(lastName, 'lastName'),
    phone: firstError(phone, 'phone'),
  }), [age, firstName, lastName, phone]);
  const canSubmit = !errors.age && !errors.firstName && !errors.lastName && !errors.phone;

  useEffect(() => {
    Animated.timing(slide, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: visible ? 0 : 1,
      useNativeDriver: true,
    }).start();
  }, [slide, visible]);

  useEffect(() => {
    if (order?.id) {
      setTouched(emptyTouched);
    }
  }, [order?.id]);

  if (!order) {
    return null;
  }

  const orderId = order.id;
  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 420],
  });

  function markTouched(field: keyof TouchedFields) {
    setTouched((current) => ({
      ...current,
      [field]: true,
    }));
  }

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
          order_id: orderId,
        });
      }
    };
    input.click();
  }

  function submitForm() {
    setTouched({
      age: true,
      firstName: true,
      lastName: true,
      phone: true,
    });

    if (!canSubmit || disabled) {
      return;
    }

    onSubmitForm({
      buyer_age: Number(age.trim()),
      buyer_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      buyer_phone: phone.trim(),
      order_id: orderId,
    });
  }

  function payDone() {
    if (disabled) {
      return;
    }

    onPaymentDone(orderId);
    onClose();
  }

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>{order.product_name}</Text>
            <Text style={styles.summaryMeta}>{order.branch_name ?? 'ไม่ระบุสาขา'} · {formatMoney(order.amount_baht)}</Text>
          </View>

          {isFormStep ? (
            <View style={styles.section}>
              <Text style={styles.heading}>กรอกข้อมูลผู้จอง</Text>
              <View style={styles.nameRow}>
                <View style={styles.nameCell}>
                  <TextInput
                    onBlur={() => markTouched('firstName')}
                    onChangeText={setFirstName}
                    placeholder="ชื่อ"
                    placeholderTextColor={MiraDesign.color.muted}
                    style={styles.input}
                    value={firstName}
                  />
                  {touched.firstName && errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}
                </View>
                <View style={styles.nameCell}>
                  <TextInput
                    onBlur={() => markTouched('lastName')}
                    onChangeText={setLastName}
                    placeholder="นามสกุล"
                    placeholderTextColor={MiraDesign.color.muted}
                    style={styles.input}
                    value={lastName}
                  />
                  {touched.lastName && errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}
                </View>
              </View>
              <TextInput
                keyboardType="phone-pad"
                onBlur={() => markTouched('phone')}
                onChangeText={setPhone}
                placeholder="เบอร์โทร"
                placeholderTextColor={MiraDesign.color.muted}
                style={styles.input}
                value={phone}
              />
              {touched.phone && errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
              <TextInput
                keyboardType="numeric"
                onBlur={() => markTouched('age')}
                onChangeText={(value) => setAge(value.replace(/[^\d]/g, '').slice(0, 3))}
                placeholder="อายุ"
                placeholderTextColor={MiraDesign.color.muted}
                style={styles.input}
                value={age}
              />
              {touched.age && errors.age ? <Text style={styles.errorText}>{errors.age}</Text> : null}
              <Pressable disabled={disabled || !canSubmit} onPress={submitForm} style={[styles.primaryButton, disabled || !canSubmit ? styles.disabled : null]}>
                <Text style={styles.primaryText}>ยืนยันข้อมูล</Text>
              </Pressable>
            </View>
          ) : null}

          {isQrStep ? (
            <View style={styles.qrSection}>
              <Text style={styles.heading}>สแกนจ่ายด้วย PromptPay</Text>
              <View style={styles.qrBox}>
                {order.qr_payload ? <QRCode backgroundColor="#FFFFFF" color={MiraDesign.color.ink} size={188} value={order.qr_payload} /> : null}
              </View>
              <Text style={styles.amount}>{formatMoney(order.amount_baht)}</Text>
              <Text style={styles.helper}>สแกนด้วยแอปธนาคารใดก็ได้</Text>
              <View style={styles.actionRow}>
                <Pressable disabled={disabled || !onSlipSelected} onPress={selectSlipFile} style={[styles.secondaryButton, disabled || !onSlipSelected ? styles.disabled : null]}>
                  <Text style={styles.secondaryText}>แนบสลิป</Text>
                </Pressable>
                <Pressable disabled={disabled} onPress={payDone} style={[styles.primaryButton, styles.actionGrow, disabled ? styles.disabled : null]}>
                  <Text style={styles.primaryText}>จ่ายแล้ว</Text>
                </Pressable>
              </View>
              {stripeEnabled && onStripeCheckout ? (
                <Pressable disabled={disabled} onPress={() => onStripeCheckout(order.id)} style={[styles.stripeButton, disabled ? styles.disabled : null]}>
                  <Text style={styles.stripeText}>Pay with Stripe</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {isTrackingStep ? (
            <View style={styles.section}>
              <Text style={styles.heading}>สถานะคิว</Text>
              <Text style={styles.trackingText}>
                {order.booking_at ? `ลงคิวแล้ว ${new Date(order.booking_at).toLocaleString('th-TH')}` : 'ทีมโรงพยาบาลกำลังอัปเดตสถานะคำสั่งซื้อค่ะ'}
              </Text>
              <Pressable onPress={onClose} style={styles.primaryButton}>
                <Text style={styles.primaryText}>ปิด</Text>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const cardShadow = {
  shadowColor: '#12343B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    ...cardShadow,
    backgroundColor: MiraDesign.color.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    gap: 12,
    maxWidth: 480,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    width: '100%',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: MiraDesign.color.line,
    borderRadius: 999,
    height: 5,
    width: 44,
  },
  summary: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderColor: MiraDesign.color.line,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  summaryTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  summaryMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  section: {
    gap: 10,
  },
  qrSection: {
    alignItems: 'center',
    gap: 12,
  },
  heading: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 8,
  },
  nameCell: {
    flex: 1,
    gap: 4,
  },
  input: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 12,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  errorText: {
    color: MiraDesign.color.danger,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  qrBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    padding: 14,
  },
  amount: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 24,
    fontWeight: '900',
  },
  helper: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  actionGrow: {
    flex: 1,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  secondaryText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 14,
    fontWeight: '900',
  },
  stripeButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#635BFF',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
  },
  stripeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  trackingText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  disabled: {
    opacity: 0.45,
  },
});
