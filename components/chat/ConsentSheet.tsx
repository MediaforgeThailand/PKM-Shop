import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';

export function ConsentSheet({
  disabled,
  onGrant,
}: {
  disabled?: boolean;
  onGrant: () => void;
}) {
  return (
    <View style={styles.sheet}>
      <View style={styles.copy}>
        <Text style={styles.title}>Health Data Consent</Text>
        <Text style={styles.body}>เก็บข้อมูลสุขภาพที่คุณเล่าเพื่อแนะนำได้ตรงขึ้น ตกลงไหมคะ</Text>
      </View>
      <Pressable disabled={disabled} onPress={onGrant} style={[styles.button, disabled ? styles.disabled : null]}>
        <Text style={styles.buttonText}>{disabled ? 'Saving' : 'ตกลง'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 82,
    paddingHorizontal: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.5,
  },
});
