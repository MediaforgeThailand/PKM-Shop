import { Link, type Href, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps, ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiraDesign, softShadow } from '@/constants/Design';

const brandLogo = require('@/assets/images/mira-care-logo.png');

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type AdminNavItem = {
  href: Href;
  icon: SymbolName;
  key: string;
  label: string;
  match: string[];
};

const adminNavItems: AdminNavItem[] = [
  {
    href: '/admin-panel',
    icon: { android: 'home', ios: 'house', web: 'home' },
    key: 'home',
    label: 'หน้าหลัก',
    match: ['/admin-panel'],
  },
  {
    href: '/admin/catalog',
    icon: { android: 'inventory_2', ios: 'cube', web: 'inventory_2' },
    key: 'catalog',
    label: 'สินค้าคงคลัง',
    match: ['/admin/catalog'],
  },
  {
    href: '/admin/orders',
    icon: { android: 'receipt_long', ios: 'list.bullet.rectangle', web: 'receipt_long' },
    key: 'orders',
    label: 'คำสั่งซื้อ',
    match: ['/admin/orders'],
  },
  {
    href: '/admin/branches',
    icon: { android: 'database', ios: 'building.2', web: 'database' },
    key: 'branches',
    label: 'คลังข้อมูล',
    match: ['/admin/branches'],
  },
  {
    href: '/admin/referrers',
    icon: { android: 'person_add', ios: 'person.badge.plus', web: 'person_add' },
    key: 'referral',
    label: 'Referral',
    match: ['/admin/referrers'],
  },
  {
    href: '/admin/dashboard',
    icon: { android: 'bar_chart', ios: 'chart.bar', web: 'bar_chart' },
    key: 'reports',
    label: 'รายงาน',
    match: ['/admin/dashboard'],
  },
];

function normalizePath(pathname: string) {
  return pathname.replace(/^\/showcase/, '') || '/';
}

function isActiveItem(pathname: string, item: AdminNavItem) {
  const normalized = normalizePath(pathname);

  return item.match.some((path) => normalized === path || normalized.startsWith(`${path}/`));
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isCompact = width < 880;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.shell, isCompact ? styles.shellCompact : null]}>
        <View style={[styles.sidebar, isCompact ? styles.sidebarCompact : null]}>
          <Link href="/admin-panel" asChild>
            <Pressable style={styles.brandLink}>
              <Image resizeMode="contain" source={brandLogo} style={styles.logo} />
            </Pressable>
          </Link>

          <ScrollView
            horizontal={isCompact}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.navList, isCompact ? styles.navListCompact : null]}
          >
            {adminNavItems.map((item) => {
              const isActive = isActiveItem(pathname, item);
              const navItemStyle = StyleSheet.flatten([styles.navItem, isActive ? styles.navItemActive : null]);
              const navLabelStyle = StyleSheet.flatten([styles.navLabel, isActive ? styles.navLabelActive : null]);

              return (
                <Link key={item.key} href={item.href} asChild>
                  <Pressable style={navItemStyle}>
                    <SymbolView
                      name={item.icon}
                      size={22}
                      tintColor={isActive ? MiraDesign.color.showcaseBlue : MiraDesign.color.showcaseNavySoft}
                    />
                    <Text numberOfLines={1} style={navLabelStyle}>
                      {item.label}
                    </Text>
                  </Pressable>
                </Link>
              );
            })}
          </ScrollView>

          {!isCompact ? (
            <View style={styles.profile}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>AD</Text>
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.profileName}>Admin User</Text>
                <Text style={styles.profileRole}>Owner</Text>
              </View>
              <Text style={styles.profileCaret}>^</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.content}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F6FAFF',
    flex: 1,
  },
  shell: {
    backgroundColor: '#F6FAFF',
    flex: 1,
    flexDirection: 'row',
  },
  shellCompact: {
    flexDirection: 'column',
  },
  sidebar: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.showcaseLine,
    borderRightWidth: 1,
    gap: 24,
    justifyContent: 'space-between',
    padding: 24,
    width: 250,
  },
  sidebarCompact: {
    borderBottomWidth: 1,
    borderRightWidth: 0,
    gap: 12,
    padding: 14,
    width: '100%',
  },
  brandLink: {
    alignSelf: 'flex-start',
    borderRadius: MiraDesign.radius.sm,
  },
  logo: {
    height: 58,
    width: 166,
  },
  navList: {
    flexGrow: 1,
    gap: 14,
    paddingTop: 24,
  },
  navListCompact: {
    flexGrow: 0,
    gap: 8,
    paddingTop: 0,
  },
  navItem: {
    alignItems: 'center',
    borderRadius: MiraDesign.radius.sm,
    flexDirection: 'row',
    gap: 14,
    minHeight: 66,
    paddingHorizontal: 18,
  },
  navItemActive: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    ...softShadow,
  },
  navLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  navLabelActive: {
    color: MiraDesign.color.showcaseBlue,
  },
  profile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: 22,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  avatarText: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 15,
    fontWeight: '900',
  },
  profileCopy: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 13,
    fontWeight: '900',
  },
  profileRole: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '700',
  },
  profileCaret: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 14,
    fontWeight: '900',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
});
