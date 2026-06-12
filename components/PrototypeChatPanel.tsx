import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { aiChatConfigStatus, askAiWithRag, DEFAULT_USER_NICKNAME, type ChatMessage } from '@/lib/ai/miraChat';
import type { ChatProductCard, ChatUiCard } from '@/lib/ai/healthChatTypes';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import type { OrderPanelState } from '@/lib/types/api';

const logo = require('@/assets/images/mira-care-logo.png');
const logoMark = require('@/assets/images/mira-care-mark.png');
const iconInk = '#536491';
const prototypeUserNickname = DEFAULT_USER_NICKNAME;
const VOICE_INPUT_DISABLED_MESSAGE = 'Voice input is paused until openai-transcribe is deployed.';

type PrototypeChatMessage = ChatMessage & {
  order?: OrderPanelState;
  uiCards?: ChatUiCard[];
};

type OrderInfoFormSubmit = {
  buyerAge: number;
  buyerName: string;
  buyerPhone: string;
  orderId: string;
  preferredDate?: string;
};

function createMessage(
  role: ChatMessage['role'],
  content: string,
  sources?: ChatMessage['sources'],
  uiCards?: ChatUiCard[],
  order?: OrderPanelState,
): PrototypeChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    order,
    sources,
    uiCards,
  };
}

function formatProductMoney(amount: number) {
  return `${amount.toLocaleString('th-TH')} THB`;
}

function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { friction: 7, tension: 220, toValue: 0.94, useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.spring(scale, { friction: 7, tension: 220, toValue: 1, useNativeDriver: true }).start();
  }

  return { pressIn, pressOut, scale };
}

function useFloatMotion() {
  const float = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { duration: 1800, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: true }),
        Animated.timing(float, { duration: 1800, easing: Easing.inOut(Easing.sin), toValue: 0, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(Animated.timing(orbit, { duration: 9000, easing: Easing.linear, toValue: 1, useNativeDriver: true })).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 1450, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 1450, easing: Easing.in(Easing.quad), toValue: 0, useNativeDriver: true }),
      ]),
    ).start();
  }, [float, orbit, pulse]);

  return {
    haloOpacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.58] }),
    haloScale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }),
    logoScale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.025] }),
    orbitRotate: orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    rootTransform: [
      {
        translateY: float.interpolate({ inputRange: [0, 1], outputRange: [2, -8] }),
      },
    ],
  };
}

function StatusGlyphs() {
  return (
    <View style={styles.statusRight}>
      <View style={styles.signalBars}>
        <View style={[styles.signalBar, { height: 4 }]} />
        <View style={[styles.signalBar, { height: 6 }]} />
        <View style={[styles.signalBar, { height: 8 }]} />
      </View>
      <View style={styles.wifiGlyph}>
        <View style={styles.wifiArcWide} />
        <View style={styles.wifiArcSmall} />
      </View>
      <View style={styles.batteryShell}>
        <View style={styles.batteryFill} />
      </View>
    </View>
  );
}

function BellIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Path d="M5.2 13.7h9.6l-1.08-1.5V8.55c0-2.08-1.33-3.75-3.72-3.75S6.28 6.47 6.28 8.55v3.65L5.2 13.7Z" fill="none" stroke="#FFFFFF" strokeLinejoin="round" strokeWidth={1.35} />
      <Path d="M8.25 14.2c.18.9.78 1.38 1.75 1.38s1.57-.48 1.75-1.38" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={1.35} />
    </Svg>
  );
}

function BackIcon() {
  return (
    <Svg height={18} viewBox="0 0 18 18" width={18}>
      <Path d="M11.2 3.7 6 9l5.2 5.3" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} />
    </Svg>
  );
}

function DotsIcon() {
  return (
    <View style={styles.dotsIcon}>
      <View style={styles.dotsIconDot} />
      <View style={styles.dotsIconDot} />
      <View style={styles.dotsIconDot} />
    </View>
  );
}

function MicIcon({ color = iconInk }: { color?: string }) {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Rect fill="none" height={8.2} rx={3.1} stroke={color} strokeWidth={1.3} width={5.5} x={7.25} y={3.2} />
      <Path d="M5.2 9.5c.2 2.7 2.03 4.48 4.8 4.48s4.6-1.78 4.8-4.48M10 13.98v2.42M7.5 16.4h5" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.3} />
    </Svg>
  );
}

function ChatIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Path d="M5.1 5.35h9.8c1.15 0 2.08.93 2.08 2.08v4.25c0 1.15-.93 2.08-2.08 2.08H9.55l-3.32 2.1c-.48.3-1.1-.05-1.1-.62v-1.48h-.03A2.08 2.08 0 0 1 3 11.68V7.43c0-1.15.93-2.08 2.1-2.08Z" fill="none" stroke={iconInk} strokeLinejoin="round" strokeWidth={1.3} />
      <Path d="M7.1 9.6h.02M10 9.6h.02M12.9 9.6h.02" stroke={iconInk} strokeLinecap="round" strokeWidth={2.1} />
    </Svg>
  );
}

function ImageIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Rect fill="none" height={11.2} rx={2.2} stroke={iconInk} strokeWidth={1.3} width={12.2} x={3.9} y={4.4} />
      <Circle cx={8} cy={8} fill="none" r={1.3} stroke={iconInk} strokeWidth={1.2} />
      <Path d="m4.7 13.9 3.2-3.1 2.25 2.05 1.42-1.32 3.7 3.3" fill="none" stroke={iconInk} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} />
    </Svg>
  );
}

function ScanIcon() {
  return (
    <Svg height={19} viewBox="0 0 20 20" width={19}>
      <Path d="M6.3 3.8H4.8c-.62 0-1 .38-1 1v1.5M13.7 3.8h1.5c.62 0 1 .38 1 1v1.5M3.8 13.7v1.5c0 .62.38 1 1 1h1.5M16.2 13.7v1.5c0 .62-.38 1-1 1h-1.5" fill="none" stroke={iconInk} strokeLinecap="round" strokeWidth={1.35} />
      <Circle cx={10} cy={10} fill="none" r={3.05} stroke={iconInk} strokeWidth={1.25} />
      <Path d="M8.55 10.1h2.9M10 8.65v2.9" stroke={iconInk} strokeLinecap="round" strokeWidth={1.15} />
    </Svg>
  );
}

function SparkleIcon() {
  return (
    <Svg height={21} viewBox="0 0 22 22" width={21}>
      <Path d="M13.4 3.4 14.8 7l3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4L12 7l1.4-3.6Z" fill="#FFFFFF" />
      <Path d="M6.2 11.8 7 13.9l2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z" fill="#FFFFFF" opacity={0.9} />
      <Path d="M17.2 13.9 17.7 15l1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1Z" fill="#FFFFFF" opacity={0.76} />
    </Svg>
  );
}

function GlassCircleButton({ children, size = 47, onPress }: { children: ReactNode; size?: number; onPress?: () => void }) {
  const { pressIn, pressOut, scale } = usePressScale();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.glassCircleShadow, { borderRadius: size / 2, height: size, transform: [{ scale }], width: size }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.36)', 'rgba(255,255,255,0.1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.glassCircle, { borderRadius: size / 2, height: size, width: size }]}>
          <View style={styles.glassCircleHighlight} />
          {children}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function Avatar() {
  return (
    <View style={styles.avatarOuter}>
      <Svg height={34} viewBox="0 0 40 40" width={34}>
        <Defs>
          <SvgGradient id="avatarBg" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#FFE7D1" />
            <Stop offset="0.48" stopColor="#F7B1C9" />
            <Stop offset="1" stopColor="#9DC0FF" />
          </SvgGradient>
          <SvgGradient id="hair" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#4B241F" />
            <Stop offset="1" stopColor="#160F19" />
          </SvgGradient>
        </Defs>
        <Circle cx={20} cy={20} fill="url(#avatarBg)" r={20} />
        <Path d="M8.5 22.5C6.8 13.5 12.9 6.2 20.5 6.2c8.2 0 13.2 7.1 11 16.6-1 4.4-4 8.7-8.2 10.2h-6.6c-4-1.4-7.3-5.9-8.2-10.5Z" fill="url(#hair)" />
        <Circle cx={20} cy={19.5} fill="#FFD9C7" r={10.4} />
        <Path d="M10.3 19.1c4.4-.8 8.1-3.1 11.1-6.6 2.7 3.6 5.5 5.7 8.4 6.3-1.3-7.1-5.1-10.6-9.8-10.6-4.9 0-8.7 3.7-9.7 10.9Z" fill="url(#hair)" />
        <Circle cx={16.4} cy={20.1} fill="#3B2731" r={1.25} />
        <Circle cx={23.6} cy={20.1} fill="#3B2731" r={1.25} />
        <Path d="M17.1 25.2c1.55 1.35 4.25 1.35 5.8 0" fill="none" stroke="#8C4A53" strokeLinecap="round" strokeWidth={1.15} />
        <Circle cx={13.6} cy={23.2} fill="#F0A2AB" opacity={0.55} r={2.1} />
        <Circle cx={26.4} cy={23.2} fill="#F0A2AB" opacity={0.55} r={2.1} />
        <Path d="M7.3 31.8c4.5-4.4 21.1-4.4 25.4 0A19.9 19.9 0 0 1 20 40 19.9 19.9 0 0 1 7.3 31.8Z" fill="#FFFFFF" opacity={0.78} />
      </Svg>
    </View>
  );
}

function HeroLogo() {
  const motion = useFloatMotion();

  return (
    <Animated.View style={[styles.orbWrap, { transform: motion.rootTransform }]}>
      <Animated.View style={[styles.logoCard, { transform: [{ scale: motion.logoScale }] }]}>
        <Image source={logo} resizeMode="contain" style={styles.heroLogoImage} />
      </Animated.View>
      <Animated.View style={[styles.logoSparkOne, { opacity: motion.haloOpacity, transform: [{ rotate: motion.orbitRotate }] }]}>
        <SparkleIcon />
      </Animated.View>
      <Animated.View style={[styles.logoSparkTwo, { opacity: motion.haloOpacity, transform: [{ scale: motion.logoScale }] }]}>
        <SparkleIcon />
      </Animated.View>
    </Animated.View>
  );
}

function FeatureTile({ icon, label, onPress }: { icon: ReactNode; label: string; onPress?: () => void }) {
  const { pressIn, pressOut, scale } = usePressScale();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={styles.tilePressable}>
      <Animated.View style={[styles.tileShadow, { transform: [{ scale }] }]}>
        <BlurView intensity={34} tint="light" style={styles.featureTile}>
          <View style={styles.tileIconCircle}>{icon}</View>
          <Text style={styles.tileLabel}>{label}</Text>
        </BlurView>
      </Animated.View>
    </Pressable>
  );
}

function ChatAvatar() {
  return (
    <LinearGradient colors={['#E9F8FF', '#CFE2FF']} style={styles.chatAvatar}>
      <Image source={logoMark} resizeMode="contain" style={styles.chatAvatarLogo} />
    </LinearGradient>
  );
}

function ProductPreviewImage({ product }: { product: ChatProductCard }) {
  const initial = product.title.trim().slice(0, 1).toUpperCase() || 'M';

  if (product.productImagePreviewUri) {
    return (
      <View style={styles.productPreviewFrame}>
        <Image source={{ uri: product.productImagePreviewUri }} resizeMode="cover" style={styles.productPreviewImage} />
      </View>
    );
  }

  return (
    <View style={styles.productPreviewFrame}>
      <LinearGradient colors={['rgba(255,255,255,0.74)', 'rgba(196,219,255,0.42)']} style={styles.productPreviewFallback}>
        <Text style={styles.productPreviewInitial}>{initial}</Text>
      </LinearGradient>
    </View>
  );
}

function useWideChatCardWidth() {
  const { width } = useWindowDimensions();
  const shellWidth = width > 0 && width < 390 ? width : 292;
  return Math.max(220, shellWidth - 26);
}

type PreferredDateOption = {
  dayNumber: string;
  key: string;
  monthLabel: string;
  shortLabel: string;
  weekdayLabel: string;
};

type PreferredTimeSlot = {
  detail: string;
  key: 'morning' | 'afternoon';
  label: string;
};

const preferredDateWeekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const preferredDateMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const preferredDateMonthTitles = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const preferredTimeSlots: PreferredTimeSlot[] = [
  { detail: '09:00 - 12:00', key: 'morning', label: 'ช่วงเช้า' },
  { detail: '13:00 - 17:00', key: 'afternoon', label: 'ช่วงบ่าย' },
];

function preferredDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addPreferredDateDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addPreferredMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function createPreferredDateOption(date: Date): PreferredDateOption {
  const dayNumber = `${date.getDate()}`;
  const monthLabel = preferredDateMonths[date.getMonth()] ?? '';

  return {
    dayNumber,
    key: preferredDateKey(date),
    monthLabel,
    shortLabel: `${dayNumber} ${monthLabel}`,
    weekdayLabel: preferredDateWeekdays[(date.getDay() + 6) % 7] ?? '',
  };
}

function preferredDateOptionFromKey(key: string) {
  const [year, month, day] = key.split('-').map((part) => Number.parseInt(part, 10));

  if (!year || !month || !day) {
    return undefined;
  }

  return createPreferredDateOption(new Date(year, month - 1, day));
}

function createPreferredDateOptions(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<PreferredDateOption | null> = Array.from({ length: leadingBlanks }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(createPreferredDateOption(new Date(year, month, day)));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function preferredMonthTitle(date: Date) {
  return `${preferredDateMonthTitles[date.getMonth()] ?? ''} ${date.getFullYear()}`;
}

function formatPreferredDateRange(start: PreferredDateOption | undefined, end: PreferredDateOption | undefined, timeSlot: PreferredTimeSlot | undefined) {
  if (!start || !end) {
    return '';
  }

  return `${start.shortLabel} - ${end.shortLabel} · ${timeSlot?.label ?? ''} ${timeSlot?.detail ?? ''}`.trim();
}

function ProductGridCard({ card, onSelectProduct }: { card: Extract<ChatUiCard, { type: 'product_grid' }>; onSelectProduct: (productId: string, productTitle: string) => void }) {
  const gridWidth = useWideChatCardWidth();
  const tileWidth = (gridWidth - 8) / 2;

  return (
    <View style={[styles.productGridSurface, { width: gridWidth }]}>
      <View style={styles.productGrid}>
        {card.products.map((product) => (
          <Pressable
            key={product.id}
            onPress={() => onSelectProduct(product.id, product.title)}
            style={({ pressed }) => [styles.productTile, { width: tileWidth }, pressed ? styles.productTilePressed : null]}
          >
            <ProductPreviewImage product={product} />
            <View style={styles.productTileCopy}>
              <Text numberOfLines={2} style={styles.productTileName}>
                {product.title}
              </Text>
              <Text numberOfLines={1} style={styles.productTilePrice}>
                {formatProductMoney(product.priceAmount)}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CategoryGridCard({ card, onBrowseCategory }: { card: Extract<ChatUiCard, { type: 'category_grid' }>; onBrowseCategory: (category: string, label: string) => void }) {
  return (
    <View style={styles.commerceCard}>
      <View style={styles.commerceHeader}>
        <Text style={styles.commerceEyebrow}>Category browse</Text>
        <Text style={styles.commerceTitle}>{card.title}</Text>
      </View>
      <View style={styles.categoryGrid}>
        {card.categories.slice(0, 4).map((category) => (
          <Pressable
            key={category.key}
            onPress={() => onBrowseCategory(category.key, category.label_th)}
            style={({ pressed }) => [styles.categoryTile, pressed ? styles.categoryTilePressed : null]}
          >
            <LinearGradient colors={['rgba(255,255,255,0.68)', 'rgba(232,244,255,0.34)']} style={styles.categoryTileGlass}>
              <Text style={styles.categoryIcon}>{category.icon ?? '+'}</Text>
              <Text numberOfLines={2} style={styles.categoryTitle}>
                {category.label_th}
              </Text>
              <Text style={styles.categoryDescription}>{category.product_count.toLocaleString('th-TH')} รายการ</Text>
            </LinearGradient>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function LocationMapCard({ card, onSelectBranch }: { card: Extract<ChatUiCard, { type: 'branch_location' }>; onSelectBranch: (productId: string, branchId: string) => void }) {
  return (
    <View style={styles.commerceCard}>
      <View style={styles.commerceHeader}>
        <Text style={styles.commerceEyebrow}>Available locations</Text>
        <Text style={styles.commerceTitle}>{card.product.title}</Text>
      </View>

      <View style={styles.mapPreview}>
        <View style={styles.mapRouteOne} />
        <View style={styles.mapRouteTwo} />
        {card.branches.slice(0, 4).map((branch, index) => (
          <View
            key={branch.id}
            style={[
              styles.mapPin,
              index === 0 ? styles.mapPinOne : index === 1 ? styles.mapPinTwo : index === 2 ? styles.mapPinThree : styles.mapPinFour,
            ]}>
            <Text style={styles.mapPinText}>{index + 1}</Text>
          </View>
        ))}
        <Text style={styles.mapLabel}>{card.branches.length} branch available</Text>
      </View>

      <View style={styles.branchList}>
        {card.branches.map((branch, index) => (
          <Pressable key={branch.id} onPress={() => onSelectBranch(card.product.id, branch.id)} style={({ pressed }) => [styles.branchRow, pressed ? styles.branchRowPressed : null]}>
            <View style={styles.branchNumber}>
              <Text style={styles.branchNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.branchCopy}>
              <Text numberOfLines={1} style={styles.branchName}>
                {branch.name}
              </Text>
              <Text numberOfLines={1} style={styles.branchMeta}>
                {branch.address ?? branch.distanceLabel} · {branch.nextSlot}
              </Text>
            </View>
            <Text style={styles.branchAction}>เลือก</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CheckoutDraftCard({ card }: { card: Extract<ChatUiCard, { type: 'checkout_draft' }> }) {
  return (
    <View style={styles.commerceCard}>
      <View style={styles.commerceHeader}>
        <Text style={styles.commerceEyebrow}>Checkout draft</Text>
        <Text style={styles.commerceTitle}>{card.product.title}</Text>
      </View>
      <View style={styles.branchRow}>
        <View style={styles.branchCopy}>
          <Text style={styles.branchName}>{card.branch?.name ?? card.product.hospitalName}</Text>
          <Text style={styles.branchMeta}>{formatProductMoney(card.product.priceAmount)}</Text>
        </View>
        <Text style={styles.branchAction}>Ready</Text>
      </View>
    </View>
  );
}

function orderStepLabel(step: NonNullable<OrderPanelState>['step']) {
  if (step === 'branch') {
    return 'เลือกสาขา';
  }

  if (step === 'form') {
    return 'กรอกข้อมูล';
  }

  if (step === 'qr') {
    return 'ชำระเงิน';
  }

  if (step === 'tracking') {
    return 'ติดตามคิว';
  }

  return 'ยกเลิก';
}

function orderHint(order: NonNullable<OrderPanelState>) {
  if (order.step === 'branch') {
    return order.branches?.length ? 'เลือกสาขาที่สะดวกจากขั้นตอนถัดไป' : 'รอเจ้าหน้าที่ช่วยยืนยันสาขา';
  }

  if (order.step === 'form') {
    return 'กรอกชื่อ เบอร์โทร และอายุเพื่อออก QR';
  }

  if (order.step === 'qr') {
    return 'สแกน PromptPay แล้วแจ้งชำระเงิน';
  }

  if (order.step === 'tracking') {
    return order.booking_at ? `ลงคิวแล้ว ${new Date(order.booking_at).toLocaleString('th-TH')}` : 'รอเจ้าหน้าที่โทรยืนยันคิว';
  }

  return 'รายการนี้ถูกยกเลิกแล้ว';
}

function PrototypeOrderFormCard({
  isSending,
  onSubmitOrderInfo,
  order,
}: {
  isSending: boolean;
  onSubmitOrderInfo: (payload: OrderInfoFormSubmit) => Promise<void>;
  order: NonNullable<OrderPanelState>;
}) {
  const cardWidth = useWideChatCardWidth();
  const initialRangeStart = useMemo(() => addPreferredDateDays(new Date(), 1), []);
  const initialRangeEnd = useMemo(() => addPreferredDateDays(new Date(), 3), []);
  const [visibleMonthDate, setVisibleMonthDate] = useState(() => new Date(initialRangeStart.getFullYear(), initialRangeStart.getMonth(), 1));
  const preferredDayOptions = useMemo(() => createPreferredDateOptions(visibleMonthDate), [visibleMonthDate]);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerAge, setBuyerAge] = useState('');
  const [rangeStartKey, setRangeStartKey] = useState(() => preferredDateKey(initialRangeStart));
  const [rangeEndKey, setRangeEndKey] = useState(() => preferredDateKey(initialRangeEnd));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedTimeSlotKey, setSelectedTimeSlotKey] = useState<PreferredTimeSlot['key']>('morning');
  const [formError, setFormError] = useState<string | null>(null);
  const [didSubmit, setDidSubmit] = useState(false);
  const ageDigits = buyerAge.replace(/[^\d]/g, '');
  const ageValue = Number.parseInt(ageDigits, 10);
  const phoneDigits = buyerPhone.replace(/[^\d]/g, '');
  const rangeStart = preferredDateOptionFromKey(rangeStartKey);
  const rangeEnd = preferredDateOptionFromKey(rangeEndKey);
  const selectedTimeSlot = preferredTimeSlots.find((slot) => slot.key === selectedTimeSlotKey) ?? preferredTimeSlots[0];
  const preferredDateRange = formatPreferredDateRange(rangeStart, rangeEnd, selectedTimeSlot);
  const rangeSummary = rangeStart && rangeEnd ? `${rangeStart.shortLabel} - ${rangeEnd.shortLabel}` : rangeStart ? `${rangeStart.shortLabel} - เลือกวันสุดท้าย` : 'เลือกช่วงวันที่';
  const canSubmit = buyerName.trim().length > 0 && /^0[689]\d{8}$/.test(phoneDigits) && Number.isFinite(ageValue) && ageValue > 0 && ageValue <= 120 && Boolean(preferredDateRange);
  const isSubmitLocked = isSending || didSubmit;
  const isButtonMuted = isSubmitLocked || !canSubmit;

  function selectRangeDay(dayKey: string) {
    if (isSubmitLocked) {
      return;
    }

    setFormError(null);

    if (!rangeStartKey || rangeEndKey) {
      setRangeStartKey(dayKey);
      setRangeEndKey('');
      return;
    }

    if (dayKey < rangeStartKey) {
      setRangeStartKey(dayKey);
      setRangeEndKey(rangeStartKey);
      return;
    }

    if (dayKey === rangeStartKey) {
      setRangeEndKey('');
      return;
    }

    setRangeEndKey(dayKey);
    setIsCalendarOpen(false);
  }

  async function submitOrderForm() {
    if (!canSubmit) {
      setFormError('กรอกชื่อ เบอร์โทร อายุ และเลือกช่วงวันที่/เวลาให้ครบก่อนค่ะ');
      return;
    }

    setFormError(null);

    try {
      await onSubmitOrderInfo({
        buyerAge: ageValue,
        buyerName: buyerName.trim(),
        buyerPhone: phoneDigits,
        orderId: order.id,
        preferredDate: rangeStartKey || undefined,
      });
      setDidSubmit(true);
    } catch {
      setDidSubmit(false);
    }
  }

  return (
    <View style={[styles.orderFormCard, { width: cardWidth }]}>
      <View style={styles.orderFormHeader}>
        <View style={styles.orderFormHeaderCopy}>
          <Text style={styles.orderFormEyebrow}>ข้อมูลผู้จอง</Text>
          <Text numberOfLines={2} style={styles.orderFormTitle}>
            {order.product_name}
          </Text>
          <Text numberOfLines={1} style={styles.orderFormMeta}>
            {order.branch_name ?? 'Demo Hospital'} · {order.amount_baht.toLocaleString('th-TH')} THB
          </Text>
        </View>
        <View style={styles.orderFormBadge}>
          <Text style={styles.orderFormBadgeText}>ออก QR</Text>
        </View>
      </View>

      <View style={styles.orderFormFields}>
        <View style={styles.orderFieldFull}>
          <Text style={styles.orderInputLabel}>ชื่อผู้จอง</Text>
          <TextInput
            autoCapitalize="words"
            editable={!didSubmit && !isSending}
            onChangeText={setBuyerName}
            placeholder="เช่น คุณมิรา"
            placeholderTextColor="rgba(78,92,132,0.48)"
            style={styles.orderTextInput}
            value={buyerName}
          />
        </View>

        <View style={styles.orderFormRow}>
          <View style={styles.orderFieldPhone}>
            <Text style={styles.orderInputLabel}>เบอร์โทร</Text>
            <TextInput
              editable={!didSubmit && !isSending}
              keyboardType="phone-pad"
              onChangeText={setBuyerPhone}
              placeholder="08x-xxx-xxxx"
              placeholderTextColor="rgba(78,92,132,0.48)"
              style={styles.orderTextInput}
              value={buyerPhone}
            />
          </View>
          <View style={styles.orderFieldAge}>
            <Text style={styles.orderInputLabel}>อายุ</Text>
            <TextInput
              editable={!didSubmit && !isSending}
              keyboardType="number-pad"
              maxLength={3}
              onChangeText={(text) => setBuyerAge(text.replace(/[^\d]/g, ''))}
              placeholder="35"
              placeholderTextColor="rgba(78,92,132,0.48)"
              style={styles.orderTextInput}
              value={buyerAge}
            />
          </View>
        </View>

        <View style={styles.orderDatePickerBlock}>
          <Text style={styles.orderInputLabel}>ช่วงวันที่สะดวก</Text>
          <Pressable
            disabled={isSubmitLocked}
            onPress={() => setIsCalendarOpen((current) => !current)}
            style={({ pressed }) => [styles.orderDatePickerButton, pressed && !isSubmitLocked ? styles.orderDatePickerButtonPressed : null]}
          >
            <View style={styles.orderDatePickerCopy}>
              <Text numberOfLines={1} style={styles.orderDatePickerTitle}>
                {rangeSummary}
              </Text>
              <Text numberOfLines={1} style={styles.orderDatePickerMeta}>
                {selectedTimeSlot?.label} · {selectedTimeSlot?.detail}
              </Text>
            </View>
            <Text style={styles.orderDatePickerChevron}>{isCalendarOpen ? '×' : '›'}</Text>
          </Pressable>

          {isCalendarOpen ? (
            <View style={styles.orderCalendarPanel}>
              <View style={styles.orderCalendarHeader}>
                <Text style={styles.orderCalendarTitle}>{preferredMonthTitle(visibleMonthDate)}</Text>
                <View style={styles.orderCalendarNav}>
                  <Pressable onPress={() => setVisibleMonthDate((current) => addPreferredMonths(current, -1))} style={({ pressed }) => [styles.orderCalendarNavButton, pressed ? styles.orderCalendarNavButtonPressed : null]}>
                    <Text style={styles.orderCalendarNavText}>‹</Text>
                  </Pressable>
                  <Pressable onPress={() => setVisibleMonthDate((current) => addPreferredMonths(current, 1))} style={({ pressed }) => [styles.orderCalendarNavButton, pressed ? styles.orderCalendarNavButtonPressed : null]}>
                    <Text style={styles.orderCalendarNavText}>›</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.orderCalendarDivider} />

              <View style={styles.orderCalendarWeekRow}>
                {preferredDateWeekdays.map((weekday) => (
                  <Text key={weekday} style={styles.orderCalendarWeekday}>
                    {weekday}
                  </Text>
                ))}
              </View>

              <View style={styles.orderCalendarGrid}>
                {preferredDayOptions.map((day, index) => {
                  if (!day) {
                    return <View key={`blank-${index}`} style={styles.orderCalendarCell} />;
                  }

                  const isStart = day.key === rangeStartKey;
                  const isEnd = day.key === rangeEndKey;
                  const isInside = Boolean(rangeStartKey && rangeEndKey && day.key > rangeStartKey && day.key < rangeEndKey);
                  const isSelected = isStart || isEnd;

                  return (
                    <Pressable
                      disabled={isSubmitLocked}
                      key={day.key}
                      onPress={() => selectRangeDay(day.key)}
                      style={({ pressed }) => [
                        styles.orderCalendarCell,
                        isInside ? styles.orderCalendarCellInRange : null,
                        isSelected ? styles.orderCalendarCellSelected : null,
                        pressed && !isSubmitLocked ? styles.orderCalendarCellPressed : null,
                      ]}
                    >
                      <Text style={[styles.orderCalendarDateText, isInside ? styles.orderCalendarDateTextInRange : null, isSelected ? styles.orderCalendarDateTextSelected : null]}>{day.dayNumber}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.orderTimeRangeBlock}>
          <Text style={styles.orderInputLabel}>เวลาที่สะดวก</Text>
          <View style={styles.orderTimeSlotRow}>
            {preferredTimeSlots.map((slot) => {
              const isSelected = slot.key === selectedTimeSlotKey;

              return (
                <Pressable
                  disabled={isSubmitLocked}
                  key={slot.key}
                  onPress={() => setSelectedTimeSlotKey(slot.key)}
                  style={({ pressed }) => [styles.orderTimeSlotButton, isSelected ? styles.orderTimeSlotButtonSelected : null, pressed && !isSubmitLocked ? styles.orderTimeSlotButtonPressed : null]}
                >
                  <Text style={[styles.orderTimeSlotLabel, isSelected ? styles.orderTimeSlotTextSelected : null]}>{slot.label}</Text>
                  <Text style={[styles.orderTimeSlotDetail, isSelected ? styles.orderTimeSlotTextSelected : null]}>{slot.detail}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {formError ? <Text style={styles.orderFormError}>{formError}</Text> : null}

      <Pressable disabled={isSubmitLocked} onPress={submitOrderForm} style={({ pressed }) => [styles.orderFormSubmit, isButtonMuted ? styles.orderFormSubmitDisabled : null, pressed && !isButtonMuted ? styles.orderFormSubmitPressed : null]}>
        <Text style={styles.orderFormSubmitText}>{didSubmit ? 'ส่งข้อมูลแล้ว' : isSending ? 'กำลังส่ง...' : 'ยืนยันและออก QR'}</Text>
      </Pressable>
    </View>
  );
}

function PrototypeOrderCard({
  isSending,
  onSubmitOrderInfo,
  order,
}: {
  isSending: boolean;
  onSubmitOrderInfo: (payload: OrderInfoFormSubmit) => Promise<void>;
  order: NonNullable<OrderPanelState>;
}) {
  if (order.step === 'form' || order.show_form) {
    return <PrototypeOrderFormCard isSending={isSending} onSubmitOrderInfo={onSubmitOrderInfo} order={order} />;
  }

  const steps: Array<NonNullable<OrderPanelState>['step']> = ['branch', 'form', 'qr', 'tracking'];
  const activeIndex = order.step === 'cancelled' ? -1 : Math.max(0, steps.indexOf(order.step));

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderCopy}>
          <Text style={styles.orderEyebrow}>ขั้นตอนการจอง</Text>
          <Text numberOfLines={2} style={styles.orderTitle}>
            {order.product_name}
          </Text>
          <Text numberOfLines={1} style={styles.orderMeta}>
            {order.branch_name ?? 'ยังไม่ระบุสาขา'} · {order.amount_baht.toLocaleString('th-TH')} THB
          </Text>
        </View>
        <View style={styles.orderStatusPill}>
          <Text style={styles.orderStatusText}>{orderStepLabel(order.step)}</Text>
        </View>
      </View>

      <View style={styles.orderSteps}>
        {steps.map((step, index) => {
          const isActive = index <= activeIndex;

          return (
            <View key={step} style={[styles.orderStepDot, isActive ? styles.orderStepDotActive : null]}>
              <Text style={[styles.orderStepText, isActive ? styles.orderStepTextActive : null]}>{index + 1}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.orderHint}>{orderHint(order)}</Text>
    </View>
  );
}

function orderStatusText(status: Extract<ChatUiCard, { type: 'order_status' }>['orders'][number]['status']) {
  if (status === 'submitted') {
    return 'รอตรวจสอบชำระเงิน';
  }

  if (status === 'confirmed') {
    return 'รอโทรนัดวันเวลา';
  }

  if (status === 'booked') {
    return 'ลงคิวแล้ว';
  }

  if (status === 'done') {
    return 'ใช้บริการแล้ว';
  }

  if (status === 'cancelled') {
    return 'ยกเลิกแล้ว';
  }

  return 'กำลังดำเนินการ';
}

function OrderStatusUiCard({ card }: { card: Extract<ChatUiCard, { type: 'order_status' }> }) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.commerceHeader}>
        <Text style={styles.commerceEyebrow}>Order tracking</Text>
        <Text style={styles.commerceTitle}>{card.title}</Text>
      </View>
      {card.orders.length === 0 ? (
        <Text style={styles.orderHint}>ยังไม่มีคำสั่งซื้อที่ต้องติดตามค่ะ</Text>
      ) : (
        card.orders.slice(0, 2).map((order) => (
          <View key={order.id} style={styles.orderStatusRow}>
            <View style={styles.orderCopy}>
              <Text numberOfLines={2} style={styles.orderTitle}>
                {order.product_name}
              </Text>
              <Text numberOfLines={1} style={styles.orderMeta}>
                {order.branch_name ?? 'ไม่ระบุสาขา'} · {order.amount_baht.toLocaleString('th-TH')} THB
              </Text>
            </View>
            <View style={styles.orderStatusPill}>
              <Text style={styles.orderStatusText}>{orderStatusText(order.status)}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function MemorySavedCard({ card }: { card: Extract<ChatUiCard, { type: 'memory_saved' }> }) {
  return (
    <View style={styles.memorySavedCard}>
      <Text style={styles.memorySavedTitle}>จำข้อมูลสำคัญไว้แล้ว</Text>
      <Text numberOfLines={2} style={styles.memorySavedText}>
        {card.summaries.slice(0, 2).join(' · ') || `${card.count} items`}
      </Text>
    </View>
  );
}

function ChatUiCardRenderer({
  card,
  onBrowseCategory,
  onSelectBranch,
  onSelectProduct,
}: {
  card: ChatUiCard;
  onBrowseCategory: (category: string, label: string) => void;
  onSelectBranch: (productId: string, branchId: string) => void;
  onSelectProduct: (productId: string, productTitle: string) => void;
}) {
  if (card.type === 'product_grid') {
    return <ProductGridCard card={card} onSelectProduct={onSelectProduct} />;
  }

  if (card.type === 'category_grid') {
    return <CategoryGridCard card={card} onBrowseCategory={onBrowseCategory} />;
  }

  if (card.type === 'order_status') {
    return <OrderStatusUiCard card={card} />;
  }

  if (card.type === 'branch_location') {
    return <LocationMapCard card={card} onSelectBranch={onSelectBranch} />;
  }

  if (card.type === 'checkout_draft') {
    return <CheckoutDraftCard card={card} />;
  }

  return <MemorySavedCard card={card} />;
}

function ChatMessageBubble({
  index,
  isSending,
  message,
  onBrowseCategory,
  onSelectBranch,
  onSelectProduct,
  onSubmitOrderInfo,
}: {
  index: number;
  isSending: boolean;
  message: PrototypeChatMessage;
  onBrowseCategory: (category: string, label: string) => void;
  onSelectBranch: (productId: string, branchId: string) => void;
  onSelectProduct: (productId: string, productTitle: string) => void;
  onSubmitOrderInfo: (payload: OrderInfoFormSubmit) => Promise<void>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { delay: Math.min(index * 55, 240), duration: 260, toValue: 1, useNativeDriver: true }),
      Animated.spring(translate, { delay: Math.min(index * 55, 240), friction: 8, tension: 120, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [index, opacity, translate]);

  if (message.role === 'user') {
    return (
      <Animated.View style={[styles.userChatRow, { opacity, transform: [{ translateY: translate }] }]}>
        <LinearGradient colors={['rgba(80,147,255,0.94)', 'rgba(103,178,255,0.82)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userChatBubble}>
          <Text style={styles.userChatText}>{message.content}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.assistantChatRow, { opacity, transform: [{ translateY: translate }] }]}>
      <ChatAvatar />
      <View style={styles.assistantStack}>
        <BlurView intensity={30} tint="light" style={styles.assistantChatBubble}>
          <Text style={styles.assistantChatText}>{message.content}</Text>
        </BlurView>
        {message.uiCards?.map((card) => (
          <ChatUiCardRenderer key={card.id} card={card} onBrowseCategory={onBrowseCategory} onSelectBranch={onSelectBranch} onSelectProduct={onSelectProduct} />
        ))}
        {message.order ? <PrototypeOrderCard isSending={isSending} onSubmitOrderInfo={onSubmitOrderInfo} order={message.order} /> : null}
      </View>
    </Animated.View>
  );
}

function EmptyChatHint() {
  return (
    <View style={styles.emptyChatWrap}>
      <ChatAvatar />
      <BlurView intensity={28} tint="light" style={styles.emptyChatBubble}>
        <Text style={styles.emptyChatText}>พร้อมคุยแล้วค่ะ พิมพ์หรือกดไมค์เพื่อให้ฉันช่วยวางแผนตรวจสุขภาพ</Text>
      </BlurView>
    </View>
  );
}

function Composer({
  input,
  isSending,
  sendMessage,
  setInput,
  toggleVoiceRecording,
  voiceStatus,
}: {
  input: string;
  isSending: boolean;
  sendMessage: () => void;
  setInput: (value: string) => void;
  toggleVoiceRecording: () => void;
  voiceStatus: string | null;
}) {
  const { pressIn, pressOut, scale } = usePressScale();
  const placeholder = 'Ask anything';

  return (
    <View>
      {voiceStatus ? (
        <View style={styles.voiceStatusPill}>
          <View style={styles.voiceStatusDot} />
          <Text numberOfLines={1} style={styles.voiceStatusText}>
            {voiceStatus}
          </Text>
        </View>
      ) : null}

      <BlurView intensity={36} tint="light" style={styles.composerGlass}>
        <Pressable disabled={isSending} onPress={toggleVoiceRecording} style={({ pressed }) => [styles.voiceButtonPress, pressed ? styles.voiceButtonPressed : null]}>
          <LinearGradient
            colors={['rgba(255,255,255,0.52)', 'rgba(255,255,255,0.24)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.voiceButton, styles.voiceButtonUnavailable]}>
            <MicIcon color="#8A98B8" />
          </LinearGradient>
        </Pressable>

        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          placeholder={placeholder}
          placeholderTextColor="#6677A3"
          returnKeyType="send"
          style={styles.input}
        />

        <Pressable disabled={isSending} onPress={sendMessage} onPressIn={pressIn} onPressOut={pressOut}>
          <Animated.View style={[styles.sendShadow, { transform: [{ scale }] }]}>
            <LinearGradient colors={['#C4ECFF', '#8FA6FF', '#6176F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendButton}>
              {isSending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <SparkleIcon />}
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </BlurView>
    </View>
  );
}

function BackgroundSheen() {
  return (
    <Svg height="100%" pointerEvents="none" style={styles.sheenLayer} viewBox="0 0 320 646" width="100%">
      <Defs>
        <SvgGradient id="topGlow" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.38} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgGradient>
        <SvgGradient id="midGlow" x1="1" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.24} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgGradient>
        <SvgGradient id="bottomGlow" x1="0" x2="1" y1="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.32} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Path d="M-34 95C42 24 128 33 196 5c50-21 92-15 158 12v198C237 174 126 166-34 244Z" fill="url(#topGlow)" />
      <Path d="M-42 370c78-57 166-49 247-92 44-24 88-27 149-2v158c-116-40-221-18-396 44Z" fill="url(#midGlow)" />
      <Path d="M-33 543c92-48 174-33 248-88 47-34 92-40 146-25v252H-33Z" fill="url(#bottomGlow)" />
    </Svg>
  );
}

export function PrototypeChatPanel() {
  const auth = useAuthSession();
  const { height, width } = useWindowDimensions();
  const browserWidth = Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : 390;
  const browserHeight = Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerHeight : 640;
  const viewportWidth = width > 0 ? width : browserWidth;
  const viewportHeight = height > 0 ? height : browserHeight;
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<PrototypeChatMessage[]>([]);
  const [viewMode, setViewMode] = useState<'chat' | 'home'>('home');
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  const canUseLiveAi = Boolean(auth.session && aiChatConfigStatus.hasSupabaseProxy);
  const isCompact = viewportWidth < 390;
  const frameSize = useMemo(
    () => ({
      height: isCompact ? viewportHeight : Math.min(604, Math.max(590, viewportHeight - 36)),
      width: isCompact ? viewportWidth : 292,
    }),
    [isCompact, viewportHeight, viewportWidth],
  );

  useEffect(() => {
    if (viewMode === 'chat') {
      const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isSending, messages, viewMode]);

  function toggleVoiceRecording() {
    setVoiceStatus(VOICE_INPUT_DISABLED_MESSAGE);
  }

  function liveUnavailableMessage() {
    if (auth.isLoading) {
      return 'กำลังตรวจสอบ session สำหรับ live chat กรุณาลองอีกครั้งค่ะ';
    }

    if (!auth.session) {
      return 'ต้องเข้าสู่ระบบก่อนใช้ live AI chat ค่ะ';
    }

    if (!aiChatConfigStatus.hasSupabaseProxy) {
      return 'ยังไม่ได้ตั้งค่า Supabase live chat สำหรับหน้านี้ค่ะ';
    }

    return 'live AI chat ยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้งค่ะ';
  }

  function appendSystemNotice(content: string) {
    setMessages((current) => [...current, createMessage('system_notice', content)]);
  }

  async function browseCategory(category: string, label: string) {
    if (isSending) {
      return;
    }

    if (!canUseLiveAi) {
      appendSystemNotice(liveUnavailableMessage());
      return;
    }

    const userText = `ดูหมวด ${label || category}`;
    const userMessage = createMessage('user', userText);
    const nextMessages = [...messages, userMessage];
    setViewMode('chat');
    setMessages(nextMessages);
    setIsSending(true);

    try {
      const result = await askAiWithRag({
        action: {
          category,
          type: 'browse_category',
        },
        messages: nextMessages,
        question: userText,
      });
      const answer = createMessage(result.responseRole ?? 'assistant', result.text, result.ragMatches, result.uiCards, result.order);
      setMessages((current) => [...current, answer]);
    } catch (error) {
      appendSystemNotice(error instanceof Error ? `live AI chat error: ${error.message}` : 'live AI chat error');
    } finally {
      setIsSending(false);
    }
  }

  async function selectProduct(productId: string, productTitle: string) {
    if (isSending) {
      return;
    }

    if (!canUseLiveAi) {
      appendSystemNotice(liveUnavailableMessage());
      return;
    }

    const userText = `สนใจ ${productTitle || productId}`;
    const userMessage = createMessage('user', userText);
    const nextMessages = [...messages, userMessage];
    setViewMode('chat');
    setMessages(nextMessages);
    setIsSending(true);

    try {
      const result = await askAiWithRag({
        action: {
          catalog_key: productId,
          type: 'select_product',
        },
        messages: nextMessages,
        question: userText,
      });
      const answer = createMessage(result.responseRole ?? 'assistant', result.text, result.ragMatches, result.uiCards, result.order);
      setMessages((current) => [...current, answer]);
    } catch (error) {
      appendSystemNotice(error instanceof Error ? `live AI chat error: ${error.message}` : 'live AI chat error');
    } finally {
      setIsSending(false);
    }
  }

  function selectBranch(_productId: string, _branchId: string) {
    appendSystemNotice('การเลือกสาขาต้องมาจาก order step ของ backend จริงค่ะ');
  }

  async function submitOrderInfo({ buyerAge, buyerName, buyerPhone, orderId, preferredDate }: OrderInfoFormSubmit) {
    if (isSending) {
      return;
    }

    if (!canUseLiveAi) {
      appendSystemNotice(liveUnavailableMessage());
      throw new Error('Live AI chat is unavailable.');
    }

    const userText = 'ส่งข้อมูลผู้จองแล้ว';
    const userMessage = createMessage('user', userText);
    const nextMessages = [...messages, userMessage];
    setViewMode('chat');
    setMessages(nextMessages);
    setIsSending(true);

    try {
      const result = await askAiWithRag({
        action: {
          buyer_age: buyerAge,
          buyer_name: buyerName,
          buyer_phone: buyerPhone,
          order_id: orderId,
          preferred_date: preferredDate,
          type: 'order_form_submit',
        },
        messages: nextMessages,
        question: userText,
      });
      const answer = createMessage(result.responseRole ?? 'system_notice', result.text, result.ragMatches, result.uiCards, result.order);
      setMessages((current) => [...current, answer]);
    } catch (error) {
      appendSystemNotice(error instanceof Error ? `live AI chat error: ${error.message}` : 'live AI chat error');
      throw error;
    } finally {
      setIsSending(false);
    }
  }

  async function sendMessage() {
    const question = input.trim();

    if (!question || isSending) {
      return;
    }

    const userMessage = createMessage('user', question);
    const nextMessages = [...messages, userMessage];
    setViewMode('chat');
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);
    setVoiceStatus(null);

    try {
      if (!canUseLiveAi) {
        appendSystemNotice(liveUnavailableMessage());
        return;
      }

      const result = await askAiWithRag({ messages: nextMessages, question });
      const answer = createMessage(result.responseRole ?? 'assistant', result.text, result.ragMatches, result.uiCards, result.order);
      setMessages((current) => [...current, answer]);
    } catch (error) {
      appendSystemNotice(error instanceof Error ? `live AI chat error: ${error.message}` : 'live AI chat error');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.stage}>
          <View style={[styles.phoneShell, isCompact ? styles.phoneShellCompact : null, frameSize]}>
            <LinearGradient colors={['#A8C8FF', '#D8E9FF', '#F5FBFF']} start={{ x: 0.1, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
              <BackgroundSheen />

              <View style={styles.statusBar}>
                <Text style={styles.statusTime}>9:40 PM</Text>
                <StatusGlyphs />
              </View>

              {viewMode === 'home' ? (
                <>
                  <View style={styles.topActions}>
                    <Avatar />
                    <GlassCircleButton size={36}>
                      <BellIcon />
                    </GlassCircleButton>
                  </View>

                  <View style={styles.heroCopy}>
                    <Text style={styles.heroTitle}>{`Hi ${prototypeUserNickname},`}</Text>
                    <Text style={styles.heroSubtitle}>Ask anything about your health plan — I am listening.</Text>
                  </View>

                  <HeroLogo />

                  <View style={styles.tileGrid}>
                    <FeatureTile icon={<MicIcon color="#8A98B8" />} label={'Voice\nPaused'} onPress={toggleVoiceRecording} />
                    <FeatureTile icon={<ChatIcon />} label={'Health\nChat'} onPress={() => setViewMode('chat')} />
                    <FeatureTile icon={<ImageIcon />} label={'Generate\nImages'} />
                    <FeatureTile icon={<ScanIcon />} label={'Scan and\nSearch'} />
                  </View>

                  <View style={styles.bottomArea}>
                    <Composer
                      input={input}
                      isSending={isSending}
                      sendMessage={sendMessage}
                      setInput={setInput}
                      toggleVoiceRecording={toggleVoiceRecording}
                      voiceStatus={voiceStatus}
                    />
                    <View style={styles.homeIndicator} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.chatHeader}>
                    <GlassCircleButton onPress={() => setViewMode('home')} size={40}>
                      <BackIcon />
                    </GlassCircleButton>
                    <Text style={styles.chatTitle}>Smart Chat</Text>
                    <GlassCircleButton size={44}>
                      <DotsIcon />
                    </GlassCircleButton>
                  </View>

                  <ScrollView ref={scrollRef} contentContainerStyle={styles.chatMessages} showsVerticalScrollIndicator={false}>
                    {messages.length === 0 ? (
                      <EmptyChatHint />
                    ) : (
                      messages.map((message, index) => (
                        <ChatMessageBubble
                          key={message.id}
                          index={index}
                          isSending={isSending}
                          message={message}
                          onBrowseCategory={browseCategory}
                          onSelectBranch={selectBranch}
                          onSelectProduct={selectProduct}
                          onSubmitOrderInfo={submitOrderInfo}
                        />
                      ))
                    )}
                    {isSending ? (
                      <View style={[styles.assistantChatRow, styles.typingChatRow]}>
                        <ChatAvatar />
                        <View style={styles.typingSpinnerOnly}>
                          <ActivityIndicator color="#5E8DFF" size="small" />
                        </View>
                      </View>
                    ) : null}
                  </ScrollView>

                  <View style={styles.bottomArea}>
                    <Composer
                      input={input}
                      isSending={isSending}
                      sendMessage={sendMessage}
                      setInput={setInput}
                      toggleVoiceRecording={toggleVoiceRecording}
                      voiceStatus={voiceStatus}
                    />
                    <View style={styles.homeIndicator} />
                  </View>
                </>
              )}
            </LinearGradient>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  stage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-start',
    padding: 12,
    paddingTop: 34,
  },
  phoneShell: {
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 36,
    borderWidth: 1.4,
    overflow: 'hidden',
    shadowColor: '#796BE0',
    shadowOffset: { height: 25, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 34,
  },
  phoneShellCompact: {
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingTop: 9,
  },
  sheenLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  statusBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 24,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  statusTime: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  statusRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  signalBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 1.3,
    height: 9,
  },
  signalBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    width: 2,
  },
  wifiGlyph: {
    height: 9,
    width: 12,
  },
  wifiArcWide: {
    borderColor: '#FFFFFF',
    borderLeftWidth: 1.25,
    borderRadius: 999,
    borderRightWidth: 1.25,
    borderTopWidth: 1.25,
    height: 9,
    opacity: 0.95,
    position: 'absolute',
    top: 1,
    width: 12,
  },
  wifiArcSmall: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    bottom: 0,
    height: 3,
    left: 4.5,
    position: 'absolute',
    width: 3,
  },
  batteryShell: {
    borderColor: '#FFFFFF',
    borderRadius: 3,
    borderWidth: 1,
    height: 7.5,
    padding: 1,
    width: 16,
  },
  batteryFill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    flex: 1,
    width: '78%',
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 11,
  },
  avatarOuter: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    borderWidth: 1.2,
    padding: 1.8,
    shadowColor: '#584992',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  avatarInner: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  avatarLogo: {
    height: 30,
    width: 30,
  },
  glassCircleShadow: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#6F60C7',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  glassCircle: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.56)',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  glassCircleHighlight: {
    backgroundColor: 'rgba(255,255,255,0.36)',
    borderRadius: 999,
    height: '52%',
    left: 7,
    opacity: 0.58,
    position: 'absolute',
    top: 5,
    width: '52%',
  },
  dotsIcon: {
    alignItems: 'center',
    gap: 3,
  },
  dotsIconDot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 3,
    width: 3,
  },
  heroCopy: {
    alignItems: 'center',
    marginTop: 7,
    paddingHorizontal: 26,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 23.5,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 28,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 9.7,
    fontWeight: '600',
    lineHeight: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  orbWrap: {
    alignItems: 'center',
    height: 132,
    justifyContent: 'center',
    marginTop: 0,
  },
  logoCard: {
    alignItems: 'center',
    height: 82,
    justifyContent: 'center',
    width: 190,
  },
  heroLogoImage: {
    height: 78,
    width: 190,
  },
  logoSparkOne: {
    position: 'absolute',
    right: 56,
    top: 14,
  },
  logoSparkTwo: {
    bottom: 18,
    left: 58,
    opacity: 0.5,
    position: 'absolute',
    transform: [{ scale: 0.58 }],
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 0,
    rowGap: 7,
  },
  tilePressable: {
    width: 126,
  },
  tileShadow: {
    shadowColor: '#7062C4',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  featureTile: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.38)',
    borderRadius: 16,
    borderWidth: 1,
    height: 84,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingBottom: 10,
    paddingLeft: 12,
    paddingTop: 12,
  },
  tileIconCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(255,255,255,0.84)',
    borderRadius: 999,
    borderWidth: 0.9,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  tileLabel: {
    color: '#43547E',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 14.8,
  },
  chatHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-between',
  },
  chatTitle: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0,
  },
  chatMessages: {
    flexGrow: 1,
    gap: 12,
    paddingBottom: 96,
    paddingTop: 16,
  },
  chatAvatar: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 30,
  },
  chatAvatarLogo: {
    height: 23,
    width: 23,
  },
  assistantChatRow: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    maxWidth: '92%',
  },
  assistantChatBubble: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 205,
  },
  assistantStack: {
    alignItems: 'flex-start',
    gap: 8,
  },
  assistantChatText: {
    color: '#40527B',
    fontSize: 11.6,
    fontWeight: '600',
    lineHeight: 16.6,
  },
  commerceCard: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 10,
    shadowColor: '#718DFF',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    width: 205,
  },
  productGridSurface: {
    marginLeft: -39,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  productTile: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 15,
    borderWidth: 1,
    minHeight: 154,
    overflow: 'hidden',
    shadowColor: '#718DFF',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  productTilePressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  productPreviewFrame: {
    aspectRatio: 1.12,
    backgroundColor: 'rgba(226,241,255,0.54)',
    overflow: 'hidden',
    width: '100%',
  },
  productPreviewImage: {
    height: '100%',
    width: '100%',
  },
  productPreviewFallback: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  productPreviewInitial: {
    color: '#5778EF',
    fontSize: 27,
    fontWeight: '900',
  },
  productTileCopy: {
    gap: 5,
    paddingBottom: 10,
    paddingHorizontal: 9,
    paddingTop: 8,
  },
  productTileName: {
    color: '#31446F',
    fontSize: 10.6,
    fontWeight: '900',
    lineHeight: 13.4,
  },
  productTilePrice: {
    color: '#4F79F5',
    fontSize: 10.2,
    fontWeight: '900',
    lineHeight: 12.8,
  },
  commerceHeader: {
    gap: 2,
    marginBottom: 8,
  },
  commerceEyebrow: {
    color: 'rgba(63,82,125,0.72)',
    fontSize: 8.4,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  commerceTitle: {
    color: '#334675',
    fontSize: 12.4,
    fontWeight: '900',
    lineHeight: 16,
  },
  orderFormCard: {
    backgroundColor: 'rgba(255,255,255,0.38)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    marginLeft: -39,
    padding: 12,
    shadowColor: '#718DFF',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
  },
  orderFormHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  orderFormHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  orderFormEyebrow: {
    color: 'rgba(63,82,125,0.72)',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0,
  },
  orderFormTitle: {
    color: '#31446F',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
    marginTop: 2,
  },
  orderFormMeta: {
    color: '#607099',
    fontSize: 9.2,
    fontWeight: '800',
    lineHeight: 12,
    marginTop: 4,
  },
  orderFormBadge: {
    backgroundColor: 'rgba(92,140,255,0.16)',
    borderColor: 'rgba(255,255,255,0.68)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  orderFormBadgeText: {
    color: '#4F70EE',
    fontSize: 8.5,
    fontWeight: '900',
  },
  orderFormFields: {
    gap: 8,
  },
  orderFormRow: {
    flexDirection: 'row',
    gap: 8,
  },
  orderFieldFull: {
    width: '100%',
  },
  orderFieldPhone: {
    flex: 1,
    minWidth: 0,
  },
  orderFieldAge: {
    width: 70,
  },
  orderInputLabel: {
    color: '#4E5C84',
    fontSize: 8.8,
    fontWeight: '900',
    marginBottom: 4,
  },
  orderTextInput: {
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: 13,
    borderWidth: 1,
    color: '#31446F',
    fontSize: 11.4,
    fontWeight: '800',
    height: 38,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  orderDatePickerBlock: {
    gap: 6,
  },
  orderDatePickerButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  orderDatePickerButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  orderDatePickerCopy: {
    flex: 1,
    minWidth: 0,
  },
  orderDatePickerTitle: {
    color: '#262A34',
    fontSize: 11.4,
    fontWeight: '900',
    lineHeight: 14,
  },
  orderDatePickerMeta: {
    color: '#6B7287',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
    marginTop: 2,
  },
  orderDatePickerChevron: {
    color: '#5B7CFF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  orderCalendarPanel: {
    backgroundColor: '#F3F2FB',
    borderColor: 'rgba(40,40,64,0.09)',
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 12,
    shadowColor: '#77718E',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  orderCalendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingLeft: 16,
    paddingRight: 8,
  },
  orderCalendarTitle: {
    color: '#11131B',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  orderCalendarNav: {
    flexDirection: 'row',
    gap: 8,
  },
  orderCalendarNavButton: {
    alignItems: 'center',
    backgroundColor: '#5B91FF',
    borderRadius: 4,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  orderCalendarNavButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }],
  },
  orderCalendarNavText: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 28,
  },
  orderCalendarDivider: {
    backgroundColor: 'rgba(51,52,72,0.14)',
    height: 1,
  },
  orderCalendarWeekRow: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingTop: 13,
  },
  orderCalendarWeekday: {
    color: '#11131B',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
    textAlign: 'center',
    width: '14.285%',
  },
  orderCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    paddingTop: 10,
    rowGap: 3,
  },
  orderCalendarCell: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: '14.285%',
  },
  orderCalendarCellInRange: {
    backgroundColor: 'rgba(91,124,255,0.16)',
  },
  orderCalendarCellSelected: {
    backgroundColor: '#5B7CFF',
    borderRadius: 4,
  },
  orderCalendarCellPressed: {
    opacity: 0.78,
  },
  orderCalendarDateText: {
    color: '#373846',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  orderCalendarDateTextInRange: {
    color: '#2B2D38',
    fontWeight: '800',
  },
  orderCalendarDateTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  orderTimeRangeBlock: {
    gap: 9,
  },
  orderTimeSlotRow: {
    flexDirection: 'row',
    gap: 8,
  },
  orderTimeSlotButton: {
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderColor: 'rgba(255,255,255,0.74)',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 55,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  orderTimeSlotButtonSelected: {
    backgroundColor: '#5B7CFF',
    borderColor: 'rgba(255,255,255,0.84)',
    shadowColor: '#5B7CFF',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  orderTimeSlotButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  orderTimeSlotLabel: {
    color: '#40527B',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 15,
  },
  orderTimeSlotDetail: {
    color: '#6B7FAA',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
    marginTop: 3,
  },
  orderTimeSlotTextSelected: {
    color: '#FFFFFF',
  },
  orderFormError: {
    color: '#E15B72',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
  orderFormSubmit: {
    alignItems: 'center',
    backgroundColor: '#5B91FF',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    shadowColor: '#5B7CFF',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  orderFormSubmitPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  orderFormSubmitDisabled: {
    backgroundColor: 'rgba(112,135,184,0.34)',
    shadowOpacity: 0,
  },
  orderFormSubmitText: {
    color: '#FFFFFF',
    fontSize: 11.2,
    fontWeight: '900',
  },
  orderCard: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 9,
    padding: 10,
    shadowColor: '#718DFF',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    width: 205,
  },
  orderHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  orderCopy: {
    flex: 1,
    minWidth: 0,
  },
  orderEyebrow: {
    color: 'rgba(63,82,125,0.72)',
    fontSize: 8.4,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  orderTitle: {
    color: '#334675',
    fontSize: 11.8,
    fontWeight: '900',
    lineHeight: 15,
    marginTop: 2,
  },
  orderMeta: {
    color: '#64749B',
    fontSize: 8.7,
    fontWeight: '800',
    lineHeight: 12,
    marginTop: 3,
  },
  orderStatusPill: {
    backgroundColor: 'rgba(92,140,255,0.15)',
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  orderStatusText: {
    color: '#4F70EE',
    fontSize: 8.4,
    fontWeight: '900',
  },
  orderSteps: {
    flexDirection: 'row',
    gap: 7,
  },
  orderStepDot: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.44)',
    borderColor: 'rgba(255,255,255,0.68)',
    borderRadius: 999,
    borderWidth: 1,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  orderStepDotActive: {
    backgroundColor: 'rgba(91,126,255,0.22)',
    borderColor: 'rgba(102,139,255,0.42)',
  },
  orderStepText: {
    color: '#8A99B8',
    fontSize: 8.4,
    fontWeight: '900',
  },
  orderStepTextActive: {
    color: '#4F70EE',
  },
  orderHint: {
    color: '#4B5F8C',
    fontSize: 9.4,
    fontWeight: '800',
    lineHeight: 13,
  },
  orderStatusRow: {
    alignItems: 'flex-start',
    borderColor: 'rgba(255,255,255,0.44)',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 8,
  },
  memorySavedCard: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 205,
  },
  memorySavedTitle: {
    color: '#4F70EE',
    fontSize: 9.5,
    fontWeight: '900',
  },
  memorySavedText: {
    color: '#4B5F8C',
    fontSize: 8.8,
    fontWeight: '700',
    lineHeight: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  categoryTile: {
    borderRadius: 15,
    overflow: 'hidden',
    width: 89,
  },
  categoryTilePressed: {
    opacity: 0.74,
    transform: [{ scale: 0.97 }],
  },
  categoryTileGlass: {
    borderColor: 'rgba(255,255,255,0.64)',
    borderRadius: 15,
    borderWidth: 1,
    minHeight: 108,
    padding: 8,
  },
  categoryTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryCode: {
    backgroundColor: 'rgba(92,140,255,0.18)',
    borderRadius: 999,
    color: '#4D6FEA',
    fontSize: 9.5,
    fontWeight: '900',
    height: 20,
    lineHeight: 20,
    textAlign: 'center',
    width: 20,
  },
  categoryPopularity: {
    color: '#6B7FAA',
    fontSize: 7.8,
    fontWeight: '900',
  },
  categoryIcon: {
    color: '#4D6FEA',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  categoryTitle: {
    color: '#31446F',
    fontSize: 10.6,
    fontWeight: '900',
    lineHeight: 13,
    marginTop: 7,
  },
  categoryDescription: {
    color: '#607099',
    fontSize: 8.4,
    fontWeight: '600',
    lineHeight: 11.4,
    marginTop: 4,
    minHeight: 23,
  },
  categoryPrice: {
    color: '#4F79F5',
    fontSize: 9.4,
    fontWeight: '900',
    marginTop: 6,
  },
  mapPreview: {
    backgroundColor: 'rgba(226,241,255,0.54)',
    borderColor: 'rgba(255,255,255,0.68)',
    borderRadius: 17,
    borderWidth: 1,
    height: 108,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  mapRouteOne: {
    backgroundColor: 'rgba(126,161,255,0.18)',
    borderRadius: 999,
    height: 140,
    left: 46,
    position: 'absolute',
    top: -18,
    transform: [{ rotate: '50deg' }],
    width: 22,
  },
  mapRouteTwo: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 999,
    height: 150,
    left: 106,
    position: 'absolute',
    top: -24,
    transform: [{ rotate: '-42deg' }],
    width: 18,
  },
  mapPin: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(92,124,255,0.72)',
    borderRadius: 999,
    borderWidth: 1,
    height: 23,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#637CFF',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    width: 23,
  },
  mapPinOne: {
    left: 27,
    top: 24,
  },
  mapPinTwo: {
    right: 33,
    top: 22,
  },
  mapPinThree: {
    left: 72,
    top: 61,
  },
  mapPinFour: {
    right: 20,
    top: 68,
  },
  mapPinText: {
    color: '#4F70EE',
    fontSize: 9.8,
    fontWeight: '900',
  },
  mapLabel: {
    bottom: 8,
    color: '#5C6F9B',
    fontSize: 9.2,
    fontWeight: '800',
    left: 10,
    position: 'absolute',
  },
  branchList: {
    gap: 6,
  },
  branchRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 8,
  },
  branchRowPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  branchNumber: {
    alignItems: 'center',
    backgroundColor: 'rgba(85,130,255,0.16)',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  branchNumberText: {
    color: '#4F70EE',
    fontSize: 9.5,
    fontWeight: '900',
  },
  branchCopy: {
    flex: 1,
  },
  branchName: {
    color: '#344875',
    fontSize: 10.8,
    fontWeight: '900',
  },
  branchMeta: {
    color: '#6B7A9F',
    fontSize: 8.5,
    fontWeight: '700',
    marginTop: 2,
  },
  branchAction: {
    color: '#5A7BFF',
    fontSize: 9.4,
    fontWeight: '900',
  },
  userChatRow: {
    alignSelf: 'flex-end',
    maxWidth: '84%',
  },
  userChatBubble: {
    borderColor: 'rgba(255,255,255,0.56)',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  userChatText: {
    color: '#FFFFFF',
    fontSize: 11.8,
    fontWeight: '700',
    lineHeight: 16.8,
  },
  typingChatRow: {
    alignItems: 'center',
  },
  typingSpinnerOnly: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  emptyChatWrap: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    marginTop: 10,
  },
  emptyChatBubble: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderColor: 'rgba(255,255,255,0.66)',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 205,
  },
  emptyChatText: {
    color: '#40527B',
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16.5,
  },
  bottomArea: {
    bottom: 0,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  composerGlass: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.56)',
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    height: 48,
    overflow: 'hidden',
    gap: 7,
    paddingLeft: 7,
    paddingRight: 5,
    shadowColor: '#7265CF',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
  },
  voiceButtonPress: {
    borderRadius: 999,
  },
  voiceButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  voiceButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  voiceButtonUnavailable: {
    opacity: 0.72,
  },
  voiceStatusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 7,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  voiceStatusDot: {
    backgroundColor: '#88A9D8',
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  voiceStatusText: {
    color: '#44547E',
    fontSize: 10.6,
    fontWeight: '700',
    maxWidth: 210,
  },
  input: {
    color: '#36466E',
    flex: 1,
    fontSize: 11.8,
    fontWeight: '600',
    height: 39,
    paddingHorizontal: 0,
  },
  sendShadow: {
    borderRadius: 999,
    shadowColor: '#7566FF',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 13,
  },
  sendButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    borderWidth: 1,
    height: 39,
    justifyContent: 'center',
    width: 39,
  },
  homeIndicator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    height: 3.2,
    marginBottom: 9,
    marginTop: 10,
    width: 73,
  },
});
