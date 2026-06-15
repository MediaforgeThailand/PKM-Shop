import { Link } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { MockupRibbon, SHOWCASE_MOCKUP_RIBBON } from '@/components/showcase/MockupRibbon';
import { LinkButton, MetricTile, Panel, ShowcaseHeader, ShowcaseScreen } from '@/components/showcase/ShowcaseUI';
import { MiraDesign } from '@/constants/Design';
import { showcaseDemoAdminOrders, showcaseDemoProducts } from '@/lib/showcase/demoFixtures';

const weekBars = [
  { day: 'จ', orders: 8 },
  { day: 'อ', orders: 12 },
  { day: 'พ', orders: 9 },
  { day: 'พฤ', orders: 15 },
  { day: 'ศ', orders: 18 },
  { day: 'ส', orders: 11 },
  { day: 'อา', orders: 7 },
];

export default function AdminDashboardScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const monthSales = showcaseDemoAdminOrders.reduce((sum, order) => sum + order.amount_baht, 0);
  const topProduct = showcaseDemoProducts[0];

  return (
    <View style={styles.wrap}>
      <MockupRibbon label={SHOWCASE_MOCKUP_RIBBON} />
      <ShowcaseScreen>
        <ShowcaseHeader
          actions={<LinkButton href={{ pathname: '/tour/[module]', params: { module: 'admin' } }} label="กลับทัวร์" />}
          eyebrow="หลังบ้านโรงพยาบาล"
          subtitle="ภาพรวมสำหรับทีมบริหาร ดูยอด ออเดอร์ และแพ็กเกจที่ขายดีจากข้อมูลตัวอย่าง"
          title="ภาพรวมร้าน"
        />

        <View style={styles.metrics}>
          <MetricTile label="ออเดอร์วันนี้" value={`${showcaseDemoAdminOrders.length}`} detail="จากแชท/ผู้แนะนำ" />
          <MetricTile label="ยอดขายเดือนนี้" value={`${monthSales.toLocaleString('th-TH')}฿`} detail="ยืนยัน PromptPay แล้ว" />
          <MetricTile label="ปิดการขายจากแชท" value="28%" detail="conversion ตัวอย่าง" />
          <MetricTile label="ขายดี" value={topProduct.title} detail={`${topProduct.priceAmount.toLocaleString('th-TH')} บาท`} />
        </View>

        <View style={[styles.contentGrid, !isWide ? styles.contentGridStack : null]}>
          <Panel style={styles.chartPanel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>ออเดอร์ 7 วัน</Text>
              <Text style={styles.panelMeta}>ข้อมูลตัวอย่าง</Text>
            </View>
            <View style={styles.chart}>
              {weekBars.map((item) => (
                <View key={item.day} style={styles.barSlot}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${Math.max(18, item.orders * 4)}%` }]} />
                  </View>
                  <Text style={styles.barValue}>{item.orders}</Text>
                  <Text style={styles.barLabel}>{item.day}</Text>
                </View>
              ))}
            </View>
          </Panel>

          <Panel style={styles.tablePanel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>ออเดอร์ล่าสุด</Text>
              <Link href={{ pathname: '/admin/orders', params: { tour: 'admin' } }} asChild>
                <Text style={styles.linkText}>เปิดคิว</Text>
              </Link>
            </View>
            <View style={styles.table}>
              {showcaseDemoAdminOrders.map((order) => (
                <View key={order.id} style={styles.orderRow}>
                  <View style={styles.orderCopy}>
                    <Text numberOfLines={1} style={styles.orderName}>
                      {order.products?.name ?? order.product_id}
                    </Text>
                    <Text style={styles.orderMeta}>{order.customers?.nickname ?? order.buyer_name ?? '-'} · {order.branches?.name ?? '-'}</Text>
                  </View>
                  <View style={styles.orderAmount}>
                    <Text style={styles.amountText}>{order.amount_baht.toLocaleString('th-TH')}฿</Text>
                    <Text style={styles.statusText}>{order.status}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Panel>
        </View>
      </ShowcaseScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#EEF6FF',
    flex: 1,
    overflow: 'hidden',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.md,
  },
  contentGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: MiraDesign.space.lg,
  },
  contentGridStack: {
    flexDirection: 'column',
  },
  chartPanel: {
    flex: 1.1,
    minHeight: 340,
  },
  tablePanel: {
    flex: 0.9,
    minHeight: 340,
  },
  panelHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 18,
    fontWeight: '900',
  },
  panelMeta: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 12,
    fontWeight: '900',
  },
  chart: {
    alignItems: 'flex-end',
    flex: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    paddingTop: MiraDesign.space.lg,
  },
  barSlot: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
  },
  barTrack: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
    borderRadius: MiraDesign.radius.sm,
    height: 210,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    backgroundColor: MiraDesign.color.showcaseBlue,
    borderTopLeftRadius: MiraDesign.radius.sm,
    borderTopRightRadius: MiraDesign.radius.sm,
    minHeight: 28,
    width: '100%',
  },
  barValue: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 12,
    fontWeight: '900',
  },
  barLabel: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '900',
  },
  linkText: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 13,
    fontWeight: '900',
  },
  table: {
    gap: MiraDesign.space.sm,
  },
  orderRow: {
    alignItems: 'center',
    backgroundColor: '#F7FBFF',
    borderColor: '#D8E9F8',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
    padding: MiraDesign.space.md,
  },
  orderCopy: {
    flex: 1,
    gap: 4,
  },
  orderName: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 14,
    fontWeight: '900',
  },
  orderMeta: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 12,
    fontWeight: '800',
  },
  orderAmount: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amountText: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 14,
    fontWeight: '900',
  },
  statusText: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 11,
    fontWeight: '900',
  },
});
