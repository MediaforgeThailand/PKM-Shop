import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, Card, Pill, Screen } from '@/components/MiraUI';
import { MiraDesign, shadow } from '@/constants/Design';
import { signInWithEmailPassword, signUpWithEmailPassword, useAuthSession, useSignOut } from '@/lib/auth/useAuthSession';
import { supabaseConfigStatus } from '@/lib/supabase';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeRedirect(value: string | undefined, fallback: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  return value;
}

export default function LoginScreen() {
  const auth = useAuthSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; redirect?: string }>();
  const signOut = useSignOut();
  const mode = firstParam(params.mode);
  const redirect = safeRedirect(firstParam(params.redirect), mode === 'admin' ? '/admin-panel' : '/prototype');
  const isAdminMode = mode === 'admin' || redirect.startsWith('/admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const copy = useMemo(
    () =>
      isAdminMode
        ? {
            eyebrow: 'Admin access',
            hint: 'ใช้บัญชีที่ถูกเพิ่มไว้ใน tenant_members แล้วเท่านั้น จึงจะเห็นข้อมูลจริงและแก้ไขหลังบ้านได้',
            title: 'เข้าสู่ระบบแอดมิน',
          }
        : {
            eyebrow: 'Mira AI chat',
            hint: 'ใช้บัญชีลูกค้าเพื่อเปิด live AI chat, ประวัติแชต และคำสั่งซื้อจาก backend จริง',
            title: 'เข้าสู่ระบบแชต AI',
          },
    [isAdminMode],
  );

  async function submit() {
    if (!supabaseConfigStatus.isConfigured) {
      setMessage('ยังไม่ได้ตั้งค่า Supabase สำหรับระบบ login');
      return;
    }

    if (!email.trim() || password.length < 6) {
      setMessage('กรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัวอักษร');
      return;
    }

    try {
      setIsBusy(true);
      setMessage(null);

      if (isSignUp) {
        const result = await signUpWithEmailPassword(email, password, displayName);

        if (!result.session) {
          setMessage('สมัครบัญชีแล้ว กรุณาตรวจอีเมลเพื่อยืนยันก่อนเข้าสู่ระบบ');
          return;
        }
      } else {
        await signInWithEmailPassword(email, password);
      }

      router.replace(redirect as Href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  async function logout() {
    try {
      setIsBusy(true);
      setMessage(null);
      await signOut();
      setMessage('ออกจากระบบแล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ออกจากระบบไม่สำเร็จ');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.shell}>
        <View style={styles.hero}>
          <Pill label={copy.eyebrow} tone={isAdminMode ? 'blue' : 'mint'} />
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.hint}</Text>
        </View>

        <Card style={styles.formCard}>
          {auth.session ? (
            <>
              <View style={styles.sessionBox}>
                <Text style={styles.sessionLabel}>กำลัง login อยู่</Text>
                <Text style={styles.sessionEmail}>{auth.user?.email ?? 'ไม่พบอีเมล'}</Text>
              </View>
              <View style={styles.actionRow}>
                <ActionButton disabled={isBusy} label="ไปหน้าที่ต้องการ" onPress={() => router.replace(redirect as Href)} />
                <ActionButton disabled={isBusy} label="ออกจากระบบ" onPress={() => void logout()} variant="secondary" />
              </View>
            </>
          ) : (
            <>
              <View style={styles.modeSwitch}>
                <Pressable onPress={() => setIsSignUp(false)} style={[styles.modeButton, !isSignUp ? styles.modeButtonActive : null]}>
                  <Text style={[styles.modeText, !isSignUp ? styles.modeTextActive : null]}>Login</Text>
                </Pressable>
                <Pressable onPress={() => setIsSignUp(true)} style={[styles.modeButton, isSignUp ? styles.modeButtonActive : null]}>
                  <Text style={[styles.modeText, isSignUp ? styles.modeTextActive : null]}>Sign up</Text>
                </Pressable>
              </View>

              {isSignUp ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>ชื่อที่แสดง</Text>
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setDisplayName}
                    placeholder="เช่น Admin User"
                    placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                    style={styles.input}
                    value={displayName}
                  />
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>อีเมล</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="admin@hospital.com"
                  placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                  style={styles.input}
                  value={email}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>รหัสผ่าน</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setPassword}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  placeholderTextColor={MiraDesign.color.showcaseNavySoft}
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />
              </View>

              <ActionButton
                disabled={isBusy || !supabaseConfigStatus.isConfigured}
                label={isBusy ? 'กำลังทำรายการ' : isSignUp ? 'สมัครและเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}
                onPress={() => void submit()}
              />
            </>
          )}

          {message ? <Text style={styles.message}>{message}</Text> : null}
          {!supabaseConfigStatus.isConfigured ? <Text style={styles.message}>ยังไม่ได้ตั้งค่า Supabase URL / publishable key</Text> : null}
        </Card>

        <View style={styles.footerLinks}>
          <Link href="/prototype" asChild>
            <Pressable style={styles.footerLink}>
              <Text style={styles.footerLinkText}>เปิด Chat AI</Text>
            </Pressable>
          </Link>
          <Link href="/admin-panel" asChild>
            <Pressable style={styles.footerLink}>
              <Text style={styles.footerLinkText}>เปิด Admin Panel</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
  },
  fieldGroup: {
    gap: 6,
  },
  footerLink: {
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.sm,
  },
  footerLinkText: {
    color: MiraDesign.color.showcaseBlueDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
    justifyContent: 'center',
  },
  formCard: {
    alignSelf: 'center',
    maxWidth: 460,
    width: '100%',
    ...shadow,
  },
  hero: {
    alignSelf: 'center',
    gap: MiraDesign.space.sm,
    maxWidth: 560,
  },
  input: {
    backgroundColor: '#F7FBFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    color: MiraDesign.color.showcaseNavy,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: MiraDesign.space.md,
  },
  label: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    fontWeight: '900',
  },
  message: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: MiraDesign.radius.sm,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: MiraDesign.color.showcaseBlue,
  },
  modeSwitch: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: MiraDesign.radius.sm,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  modeText: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    fontWeight: '900',
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  sessionBox: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: MiraDesign.radius.sm,
    gap: 4,
    padding: MiraDesign.space.md,
  },
  sessionEmail: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 16,
    fontWeight: '900',
  },
  sessionLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  shell: {
    gap: MiraDesign.space.xl,
    justifyContent: 'center',
    minHeight: 560,
  },
  subtitle: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  title: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
    textAlign: 'center',
  },
});
