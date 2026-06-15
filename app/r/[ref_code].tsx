import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Pill, Screen } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';
import { normalizeRefCode, storeReferralCode } from '@/lib/referrals/attribution';

export function generateStaticParams(): { ref_code: string }[] {
  return [{ ref_code: 'DRNOK2' }];
}

export default function ReferralLandingScreen() {
  const params = useLocalSearchParams<{ ref_code?: string }>();
  const refCode = useMemo(() => normalizeRefCode(String(params.ref_code ?? '')), [params.ref_code]);
  const [storedCode, setStoredCode] = useState<string | null>(null);

  useEffect(() => {
    const stored = storeReferralCode(refCode);
    setStoredCode(stored?.ref_code ?? null);
  }, [refCode]);

  return (
    <Screen>
      <BrandHeader
        compact
        eyebrow="Referral entry"
        title={storedCode ? 'บันทึกลิงก์แนะนำแล้ว' : 'ลิงก์แนะนำไม่ถูกต้อง'}
        subtitle={storedCode ? 'ลูกค้าสามารถไปต่อเพื่อดูแพ็กเกจ โดยระบบจะผูก attribution ตามช่วงเวลาที่กำหนด' : 'เปิดลิงก์ referral ที่ถูกต้องก่อนพาลูกค้าเข้าสู่ flow ซื้อสินค้า'}
      />

      <Card style={styles.panel}>
        <View style={styles.statusRow}>
          <Pill label={storedCode ? 'พร้อมใช้งาน' : 'ต้องตรวจลิงก์'} tone={storedCode ? 'mint' : 'amber'} />
          {storedCode ? <Text style={styles.refCode}>{storedCode}</Text> : null}
        </View>
        <Text style={styles.body}>
          {storedCode
            ? `Referral code ${storedCode} จะถูกแนบกับคำสั่งซื้อที่เข้าเงื่อนไขใน attribution window`
            : 'ระบบยังไม่พบ referral code ที่ใช้งานได้จาก URL นี้'}
        </Text>
        <Link href="/" asChild>
          <ActionButton label="ไปหน้าเลือกโมดูล" />
        </Link>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'center',
    gap: 12,
    maxWidth: 520,
    width: '100%',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  refCode: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 22,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 14,
    lineHeight: 21,
  },
});
