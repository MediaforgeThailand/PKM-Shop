import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandHeader, Screen, SectionHeader } from '@/components/MiraUI';
import { MiraDesign } from '@/constants/Design';

const menuItems = [
  { title: 'Product overview', body: 'Client-facing tour for the four MiraCare product systems.', href: '/' },
  { title: 'Order and booking', body: 'Post-payment instruction and booking status.', href: '/order-status' },
  { title: 'Partner referral', body: 'Referral links, commission, and payouts.', href: '/partner' },
  { title: 'Hospital admin', body: 'Live orders queue, booking actions, and transcript review.', href: '/admin/orders' },
  { title: 'Referrer admin', body: 'Manage referrers, commission schemes, and payout states.', href: '/admin/referrers' },
  { title: 'Catalog admin', body: 'Create, edit, archive, and restore tenant products.', href: '/admin/catalog' },
  { title: 'User profile', body: 'Identity, consent, goals, and health timeline.', href: '/user-profile' },
] as const;

export default function MoreScreen() {
  return (
    <Screen>
      <BrandHeader
        eyebrow="Operations"
        title="User, partner, and hospital surfaces."
        subtitle="These are the supporting flows around the product showcase and live demo routes."
        compact
      />

      <SectionHeader title="Operations" meta="tap to open" />
      {menuItems.map((item) => (
        <Link key={item.title} href={item.href} asChild>
          <Pressable style={styles.menuRow}>
            <View style={styles.menuCopy}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuBody}>{item.body}</Text>
            </View>
            <Text style={styles.chevron}>Go</Text>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  menuRow: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#E6F1FA',
    borderRadius: MiraDesign.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    minHeight: 86,
    padding: MiraDesign.space.lg,
  },
  menuCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  menuTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  menuBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    color: MiraDesign.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
});
