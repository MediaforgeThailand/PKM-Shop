import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, BrandHeader, Card, Screen } from '@/components/MiraUI';
import { MiraDesign, shadow } from '@/constants/Design';

export default function LoginScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Mobile health marketplace"
        title="Find the right checkup, then let AI keep the context."
        subtitle="Login with phone or LINE to see hospital packages, AI recommendations, referral links, and your health dashboard."
      />

      <Card style={styles.loginCard}>
        <Text style={styles.cardTitle}>Start with your phone</Text>
        <TextInput keyboardType="phone-pad" placeholder="+66 mobile number" placeholderTextColor={MiraDesign.color.muted} style={styles.input} />
        <Link href="/home" asChild>
          <ActionButton label="Send OTP and continue" />
        </Link>
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>
        <Link href="/home" asChild>
          <Pressable style={styles.lineButton}>
            <Text style={styles.lineButtonText}>Continue with LINE</Text>
          </Pressable>
        </Link>
      </Card>

      <View style={styles.promiseGrid}>
        <View style={styles.promiseItem}>
          <Text style={styles.promiseValue}>AI</Text>
          <Text style={styles.promiseLabel}>Advisor</Text>
        </View>
        <View style={styles.promiseItem}>
          <Text style={styles.promiseValue}>10%</Text>
          <Text style={styles.promiseLabel}>GP + referral logic</Text>
        </View>
        <View style={styles.promiseItem}>
          <Text style={styles.promiseValue}>PHR</Text>
          <Text style={styles.promiseLabel}>Timed health records</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loginCard: {
    marginTop: MiraDesign.space.md,
  },
  cardTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#EEF6FC',
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    color: MiraDesign.color.ink,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: MiraDesign.space.lg,
  },
  dividerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
  },
  divider: {
    backgroundColor: MiraDesign.color.line,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: MiraDesign.color.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  lineButton: {
    alignItems: 'center',
    backgroundColor: '#06C755',
    borderRadius: MiraDesign.radius.md,
    minHeight: 54,
    justifyContent: 'center',
    ...shadow,
  },
  lineButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  promiseGrid: {
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  promiseItem: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: MiraDesign.space.xs,
    minHeight: 92,
    padding: MiraDesign.space.md,
  },
  promiseValue: {
    color: MiraDesign.color.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  promiseLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
});
