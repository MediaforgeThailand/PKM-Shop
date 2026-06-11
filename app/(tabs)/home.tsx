import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Card, Pill, Screen, SectionHeader } from '@/components/MiraUI';
import { BiomarkerBar, FreshnessDots, MiniTrend, StatusRing } from '@/components/HealthVisuals';
import { MiraDesign, softShadow } from '@/constants/Design';
import { DEFAULT_USER_NICKNAME, formatUserDisplayName } from '@/lib/ai/miraChat';
import { loadActiveHospitalProducts, type HospitalProduct } from '@/lib/marketplace/hospitalProducts';

function formatMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

export default function HomeScreen() {
  const [featuredProduct, setFeaturedProduct] = useState<HospitalProduct | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);

  useEffect(() => {
    let isMounted = true;

    loadActiveHospitalProducts(1)
      .then((products) => {
        if (isMounted) {
          setFeaturedProduct(products[0] ?? null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingProduct(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Mira Health</Text>
          <Text style={styles.title}>Hello {formatUserDisplayName(DEFAULT_USER_NICKNAME)}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>M</Text>
        </View>
      </View>

      <View style={styles.statusHero}>
        <View style={styles.statusCopy}>
          <Pill label="AI health status" tone="mint" />
          <Text style={styles.statusTitle}>Ready to compare active hospital products</Text>
          <FreshnessDots active={3} />
        </View>
        <StatusRing value={78} label="Ready" size={128} />
      </View>

      <SectionHeader title="Featured product" meta={isLoadingProduct ? 'syncing catalog' : featuredProduct ? 'live catalog' : 'none active'} />
      <Card style={styles.packageCard}>
        {featuredProduct ? (
          <>
            <View style={styles.packageTop}>
              <View style={styles.iconTile}>
                <Text style={styles.iconText}>+</Text>
              </View>
              <View style={styles.packageCopy}>
                <Text style={styles.packageTitle}>{featuredProduct.title}</Text>
                <Text style={styles.packageMeta}>{featuredProduct.hospitalName}</Text>
              </View>
              <Text style={styles.price}>{formatMoney(featuredProduct.priceAmount)}</Text>
            </View>
            <View style={styles.visualPanel}>
              <BiomarkerBar label="Catalog status" value="Active" percent={100} tone={MiraDesign.color.primary} />
              <BiomarkerBar
                label="Booking"
                value={featuredProduct.requiresAppointment ? 'Appointment' : 'Walk-in'}
                percent={featuredProduct.requiresAppointment ? 72 : 58}
                tone={MiraDesign.color.amber}
              />
              <MiniTrend color={MiraDesign.color.primary} />
            </View>
            <Link href={`/package-detail?productId=${encodeURIComponent(featuredProduct.id)}`} asChild>
              <ActionButton label="View product" />
            </Link>
          </>
        ) : (
          <>
            <Text style={styles.packageTitle}>No active products yet</Text>
            <Text style={styles.emptyBody}>Publish products from the tenant catalog or ask Mira to help with general checkup planning.</Text>
            <Link href="/packages" asChild>
              <ActionButton label="Open marketplace" variant="secondary" />
            </Link>
          </>
        )}
      </Card>

      <SectionHeader title="Shortcuts" meta="marketplace + health" />
      <View style={styles.quickGrid}>
        <Link href="/packages" asChild>
          <Pressable style={styles.quickCard}>
            <View style={[styles.quickIcon, styles.tealIcon]} />
            <Text style={styles.quickTitle}>Marketplace</Text>
            <Text style={styles.quickBody}>Browse active hospital products</Text>
          </Pressable>
        </Link>
        <Link href="/agent" asChild>
          <Pressable style={styles.quickCard}>
            <View style={[styles.quickIcon, styles.blueIcon]} />
            <Text style={styles.quickTitle}>AI Advisor</Text>
            <Text style={styles.quickBody}>Ask Mira for recommendation context</Text>
          </Pressable>
        </Link>
        <Link href="/health" asChild>
          <Pressable style={styles.quickCard}>
            <View style={[styles.quickIcon, styles.coralIcon]} />
            <Text style={styles.quickTitle}>Dashboard</Text>
            <Text style={styles.quickBody}>Review health results visually</Text>
          </Pressable>
        </Link>
        <Link href="/partner" asChild>
          <Pressable style={styles.quickCard}>
            <View style={[styles.quickIcon, styles.amberIcon]} />
            <Text style={styles.quickTitle}>Referral</Text>
            <Text style={styles.quickBody}>Partner-assisted purchase flow</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 27,
    fontWeight: '900',
    marginTop: 3,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primary,
    borderRadius: MiraDesign.radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  statusHero: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.lg,
    ...softShadow,
  },
  statusCopy: {
    flex: 1,
    gap: MiraDesign.space.md,
  },
  statusTitle: {
    color: MiraDesign.color.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  packageCard: {
    gap: MiraDesign.space.lg,
  },
  packageTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  iconTile: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.primarySoft,
    borderRadius: MiraDesign.radius.md,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  iconText: {
    color: MiraDesign.color.primary,
    fontSize: 30,
    fontWeight: '300',
  },
  packageCopy: {
    flex: 1,
    gap: MiraDesign.space.xs,
  },
  packageTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  packageMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  price: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  visualPanel: {
    backgroundColor: MiraDesign.color.surfaceSoft,
    borderRadius: MiraDesign.radius.lg,
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.lg,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
  },
  quickCard: {
    backgroundColor: MiraDesign.color.surface,
    borderColor: MiraDesign.color.line,
    borderRadius: MiraDesign.radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    gap: MiraDesign.space.sm,
    minHeight: 128,
    padding: MiraDesign.space.md,
  },
  quickIcon: {
    borderRadius: MiraDesign.radius.pill,
    height: 28,
    width: 28,
  },
  tealIcon: {
    backgroundColor: MiraDesign.color.primary,
  },
  blueIcon: {
    backgroundColor: MiraDesign.color.blue,
  },
  coralIcon: {
    backgroundColor: MiraDesign.color.coral,
  },
  amberIcon: {
    backgroundColor: MiraDesign.color.amber,
  },
  quickTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  quickBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
});
