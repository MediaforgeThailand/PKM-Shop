import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { HealthFigure, StatusRing } from '@/components/HealthVisuals';
import { ActionButton, Card, Screen } from '@/components/MiraUI';
import { MiraDesign, softShadow } from '@/constants/Design';
import { signInWithEmailPassword, signUpWithEmailPassword, useAuthSession, useSignOut } from '@/lib/auth/useAuthSession';
import { supabaseConfigStatus } from '@/lib/supabase';

type AuthMode = 'sign-in' | 'sign-up';

export default function LoginScreen() {
  const auth = useAuthSession();
  const signOut = useSignOut();
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleAuthSubmit() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail || password.length < 6) {
      setMessage('ใส่อีเมลและรหัสผ่านอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const data =
        authMode === 'sign-in'
          ? await signInWithEmailPassword(normalizedEmail, password)
          : await signUpWithEmailPassword(normalizedEmail, password, displayName);

      if (data.session) {
        router.replace('/home');
        return;
      }

      setMessage('สร้างบัญชีแล้ว กรุณายืนยันอีเมลถ้า Supabase project เปิด email confirmation อยู่');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setIsSubmitting(true);
    setMessage(null);

    try {
      await signOut();
      setMessage('ออกจากระบบแล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ออกจากระบบไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
      <Screen>
        <View style={styles.heroCard}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark} />
            <Text style={styles.brand}>Mira</Text>
            <Text style={styles.brandSoft}>Health</Text>
          </View>
          <View style={styles.visualRow}>
            <View style={styles.figureWrap}>
              <HealthFigure />
            </View>
            <StatusRing value={82} label="Match" size={112} />
          </View>
          <Text style={styles.title}>ตรวจสุขภาพที่ใช่ พร้อม AI ช่วยจำบริบทสุขภาพของคุณ</Text>
          <Text style={styles.subtitle}>เข้าสู่ระบบก่อนใช้ OpenAI chatbot และบันทึก Health Profile จากแชทอย่างปลอดภัย</Text>
        </View>

        <Card style={styles.loginCard}>
          <View style={styles.cardTop}>
            <View>
              <Text style={styles.cardTitle}>{authMode === 'sign-in' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</Text>
              <Text style={styles.cardSubtitle}>ใช้ Supabase Auth เพื่อออก JWT ให้ Edge Function และ RLS</Text>
            </View>
            {auth.user ? <Text style={styles.sessionBadge}>Signed in</Text> : null}
          </View>

          {!supabaseConfigStatus.isConfigured ? (
            <Text style={styles.warningText}>ยังไม่ได้ตั้งค่า Supabase public env จึงเข้าสู่ระบบไม่ได้</Text>
          ) : null}

          {auth.user ? (
            <>
              <Text style={styles.signedInText}>{auth.user.email}</Text>
              <Link href="/home" asChild>
                <ActionButton label="เข้าแอป" />
              </Link>
              <ActionButton disabled={isSubmitting} label="ออกจากระบบ" onPress={handleSignOut} variant="secondary" />
            </>
          ) : (
            <>
              {authMode === 'sign-up' ? (
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setDisplayName}
                  placeholder="ชื่อที่จะแสดง"
                  placeholderTextColor={MiraDesign.color.muted}
                  style={styles.input}
                  value={displayName}
                />
              ) : null}
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="อีเมล"
                placeholderTextColor={MiraDesign.color.muted}
                style={styles.input}
                value={email}
              />
              <TextInput
                autoCapitalize="none"
                onChangeText={setPassword}
                placeholder="รหัสผ่าน"
                placeholderTextColor={MiraDesign.color.muted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
              <ActionButton
                disabled={isSubmitting || !supabaseConfigStatus.isConfigured}
                label={isSubmitting ? 'กำลังดำเนินการ' : authMode === 'sign-in' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}
                onPress={handleAuthSubmit}
              />
              <Pressable
                onPress={() => {
                  setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in');
                  setMessage(null);
                }}
                style={styles.modeSwitch}
              >
                <Text style={styles.modeSwitchText}>{authMode === 'sign-in' ? 'ยังไม่มีบัญชี? สร้างบัญชี' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}</Text>
              </Pressable>
            </>
          )}

          {message ? <Text style={styles.messageText}>{message}</Text> : null}
        </Card>

        <View style={styles.marketStrip}>
          <View style={styles.marketItem}>
            <Text style={styles.marketValue}>JWT</Text>
            <Text style={styles.marketLabel}>AI proxy</Text>
          </View>
          <View style={styles.marketItem}>
            <Text style={styles.marketValue}>RLS</Text>
            <Text style={styles.marketLabel}>Health data</Text>
          </View>
          <View style={styles.marketItem}>
            <Text style={styles.marketValue}>Consent</Text>
            <Text style={styles.marketLabel}>Memory</Text>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  heroCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    gap: MiraDesign.space.lg,
    overflow: 'hidden',
    padding: MiraDesign.space.xl,
    ...softShadow,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
  },
  brandMark: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: MiraDesign.radius.pill,
    height: 18,
    width: 36,
  },
  brand: {
    color: MiraDesign.color.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  brandSoft: {
    color: MiraDesign.color.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  visualRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  figureWrap: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: MiraDesign.radius.lg,
    flex: 1,
    minHeight: 180,
    paddingTop: MiraDesign.space.sm,
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 15,
    lineHeight: 23,
  },
  loginCard: {
    gap: MiraDesign.space.md,
  },
  cardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: MiraDesign.color.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: MiraDesign.space.xs,
  },
  sessionBadge: {
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: MiraDesign.radius.pill,
    color: MiraDesign.color.primaryDeep,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.xs,
  },
  input: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: MiraDesign.space.lg,
  },
  warningText: {
    color: MiraDesign.color.danger,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 19,
  },
  signedInText: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  modeSwitch: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
  },
  modeSwitchText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 14,
    fontWeight: '900',
  },
  messageText: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 19,
  },
  marketStrip: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  marketItem: {
    backgroundColor: MiraDesign.color.surface,
    borderRadius: MiraDesign.radius.md,
    flex: 1,
    gap: MiraDesign.space.xs,
    padding: MiraDesign.space.md,
  },
  marketValue: {
    color: MiraDesign.color.primary,
    fontSize: 21,
    fontWeight: '900',
  },
  marketLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
  },
});
