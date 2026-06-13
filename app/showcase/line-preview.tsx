import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { MockupRibbon } from '@/components/showcase/MockupRibbon';
import { LinkButton, Panel, ShowcaseHeader, ShowcaseScreen, StatusChip } from '@/components/showcase/ShowcaseUI';
import { MiraDesign } from '@/constants/Design';
import { showcaseDemoBranches, showcaseDemoProducts } from '@/lib/showcase/demoFixtures';

export default function LinePreviewScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const product = showcaseDemoProducts[0];

  return (
    <View style={styles.wrap}>
      <MockupRibbon detail="LINE OA preview" label="CONCEPT" />
      <ShowcaseScreen>
        <ShowcaseHeader
          actions={<LinkButton href={{ pathname: '/tour/[module]', params: { module: 'ai-chat' } }} label="กลับทัวร์" />}
          eyebrow="AI CHAT COMMERCE"
          subtitle="ภาพจำลองการนำ flow แชทเดียวกันไปวางใน LINE OA สำหรับการขายอนาคตของช่องทางนี้"
          title="ตัวอย่าง LINE OA"
        />

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <Panel style={styles.storyPanel}>
            <View style={styles.badgeRow}>
              <StatusChip status="concept" />
            </View>
            <Text style={styles.storyTitle}>หนึ่ง backend หลายช่องทาง</Text>
            <Text style={styles.storyBody}>หน้า concept นี้โชว์ mapping ของแพ็กเกจ ปุ่มเลือกสาขา QR และ status bubble ใน LINE โดยยังไม่ผูก production webhook</Text>
          </Panel>

          <View style={styles.phone}>
            <View style={styles.phoneHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>M</Text>
              </View>
              <View>
                <Text style={styles.lineTitle}>MiraCare</Text>
                <Text style={styles.lineMeta}>LINE Official Account</Text>
              </View>
            </View>

            <View style={styles.chatBody}>
              <View style={styles.bubbleLeft}>
                <Text style={styles.bubbleText}>แนะนำแพ็กเกจที่เหมาะกับการตรวจประจำปี</Text>
              </View>

              <View style={styles.flexCard}>
                <Text style={styles.flexBadge}>แนะนำ</Text>
                <Text style={styles.flexTitle}>{product.title}</Text>
                <Text style={styles.flexPrice}>{product.priceAmount.toLocaleString('th-TH')} บาท</Text>
                <View style={styles.branchRow}>
                  {showcaseDemoBranches.map((branch) => (
                    <View key={branch.id} style={styles.branchButton}>
                      <Text style={styles.branchText}>{branch.name}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.qrBubble}>
                <View style={styles.qrGrid}>
                  {Array.from({ length: 16 }).map((_, index) => (
                    <View key={index} style={[styles.qrCell, index % 3 === 0 ? styles.qrCellDark : null]} />
                  ))}
                </View>
                <Text style={styles.qrText}>PromptPay QR</Text>
              </View>

              <View style={styles.bubbleRight}>
                <Text style={styles.bubbleRightText}>ชำระแล้ว ส่งสถานะให้หน่อย</Text>
              </View>

              <View style={styles.statusBubble}>
                <Text style={styles.statusTitle}>สถานะคิว</Text>
                <Text style={styles.statusBody}>รอโรงพยาบาลยืนยันและโทรนัดเวลา</Text>
              </View>
            </View>
          </View>
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
  workspace: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.xl,
    justifyContent: 'center',
  },
  workspaceStack: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  storyPanel: {
    flex: 0.8,
    minWidth: 280,
  },
  badgeRow: {
    alignItems: 'flex-start',
  },
  storyTitle: {
    color: MiraDesign.color.ink,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
  },
  storyBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  phone: {
    backgroundColor: '#101820',
    borderRadius: 32,
    maxWidth: 390,
    minHeight: 720,
    padding: 14,
    width: '100%',
  },
  phoneHeader: {
    alignItems: 'center',
    backgroundColor: '#F7FBFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    padding: MiraDesign.space.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.blue,
    borderRadius: MiraDesign.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarText: {
    color: MiraDesign.color.surface,
    fontSize: 18,
    fontWeight: '900',
  },
  lineTitle: {
    color: MiraDesign.color.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  lineMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  chatBody: {
    backgroundColor: '#DDEEFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: MiraDesign.space.md,
    minHeight: 650,
    padding: MiraDesign.space.md,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    backgroundColor: MiraDesign.color.surface,
    borderRadius: MiraDesign.radius.sm,
    maxWidth: '82%',
    padding: MiraDesign.space.md,
  },
  bubbleText: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: '#B9F4C7',
    borderRadius: MiraDesign.radius.sm,
    maxWidth: '82%',
    padding: MiraDesign.space.md,
  },
  bubbleRightText: {
    color: '#124327',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
  },
  flexCard: {
    backgroundColor: MiraDesign.color.surface,
    borderRadius: MiraDesign.radius.sm,
    gap: MiraDesign.space.sm,
    padding: MiraDesign.space.md,
  },
  flexBadge: {
    alignSelf: 'flex-start',
    backgroundColor: MiraDesign.color.blueSoft,
    borderRadius: MiraDesign.radius.pill,
    color: MiraDesign.color.blue,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  flexTitle: {
    color: MiraDesign.color.ink,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  flexPrice: {
    color: MiraDesign.color.blue,
    fontSize: 16,
    fontWeight: '900',
  },
  branchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  branchButton: {
    backgroundColor: MiraDesign.color.blue,
    borderRadius: MiraDesign.radius.sm,
    paddingHorizontal: MiraDesign.space.md,
    paddingVertical: MiraDesign.space.sm,
  },
  branchText: {
    color: MiraDesign.color.surface,
    fontSize: 12,
    fontWeight: '900',
  },
  qrBubble: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: MiraDesign.color.surface,
    borderRadius: MiraDesign.radius.sm,
    gap: MiraDesign.space.sm,
    padding: MiraDesign.space.md,
  },
  qrGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: 92,
    width: 92,
  },
  qrCell: {
    backgroundColor: '#EDF5FF',
    borderColor: MiraDesign.color.surface,
    borderWidth: 1,
    height: 23,
    width: 23,
  },
  qrCellDark: {
    backgroundColor: MiraDesign.color.ink,
  },
  qrText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  statusBubble: {
    backgroundColor: MiraDesign.color.surface,
    borderLeftColor: MiraDesign.color.blue,
    borderLeftWidth: 4,
    borderRadius: MiraDesign.radius.sm,
    gap: 4,
    padding: MiraDesign.space.md,
  },
  statusTitle: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  statusBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
});
