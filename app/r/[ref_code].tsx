import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MiraDesign } from '@/constants/Design';
import { normalizeRefCode, storeReferralCode } from '@/lib/referrals/attribution';

export default function ReferralLandingScreen() {
  const params = useLocalSearchParams<{ ref_code?: string }>();
  const refCode = useMemo(() => normalizeRefCode(String(params.ref_code ?? '')), [params.ref_code]);
  const [storedCode, setStoredCode] = useState<string | null>(null);

  useEffect(() => {
    const stored = storeReferralCode(refCode);
    setStoredCode(stored?.ref_code ?? null);
  }, [refCode]);

  return (
    <View style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Referral</Text>
        <Text style={styles.title}>{storedCode ? 'Referral saved' : 'Referral code unavailable'}</Text>
        <Text style={styles.body}>
          {storedCode
            ? `Code ${storedCode} will be attached to eligible purchases during the attribution window.`
            : 'Open a valid referral link to attach attribution before continuing.'}
        </Text>
        <Link href="/" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Open Overview</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: '#F5F8F7',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    maxWidth: 520,
    padding: 20,
    width: '100%',
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 28,
    fontWeight: '900',
  },
  body: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
