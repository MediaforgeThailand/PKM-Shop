import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { MockupRibbon, SHOWCASE_MOCKUP_RIBBON } from '@/components/showcase/MockupRibbon';
import { LinkButton, Panel, PrimaryAction, ShowcaseHeader, ShowcaseScreen } from '@/components/showcase/ShowcaseUI';
import { MiraDesign } from '@/constants/Design';
import { showcaseDemoHealthData } from '@/lib/showcase/demoFixtures';

export default function LabUploadScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const report = showcaseDemoHealthData.labReports[0];
  const results = report?.lab_results ?? [];

  return (
    <View style={styles.wrap}>
      <MockupRibbon label={SHOWCASE_MOCKUP_RIBBON} />
      <ShowcaseScreen>
        <ShowcaseHeader
          actions={<LinkButton href={{ pathname: '/tour/[module]', params: { module: 'health' } }} label="กลับทัวร์" />}
          eyebrow="HEALTH DASHBOARD"
          subtitle="หน้าจำลองสำหรับรับไฟล์ผลแลบ อ่านค่าเบื้องต้น และให้ลูกค้ายืนยันก่อนบันทึกเป็น health memory"
          title="อัปโหลดผลแลบ"
        />

        <View style={[styles.workspace, !isWide ? styles.workspaceStack : null]}>
          <Panel style={styles.uploadPanel}>
            <View style={styles.dropzone}>
              <Text style={styles.dropIcon}>+</Text>
              <Text style={styles.dropTitle}>วางไฟล์หรือถ่ายรูปผลแลบ</Text>
              <Text style={styles.dropBody}>PDF, JPG, PNG · mockup เท่านั้น</Text>
            </View>
            <View style={styles.actionRow}>
              <PrimaryAction label="เลือกไฟล์" onPress={() => undefined} />
              <PrimaryAction label="ถ่ายรูป" onPress={() => undefined} />
            </View>
          </Panel>

          <Panel style={styles.progressPanel}>
            <Text style={styles.panelTitle}>AI กำลังอ่านผล</Text>
            <View style={styles.stepList}>
              {['รับไฟล์', 'แยก marker', 'รอผู้ใช้ยืนยัน'].map((step, index) => (
                <View key={step} style={styles.stepRow}>
                  <View style={[styles.stepDot, index < 2 ? styles.stepDotDone : styles.stepDotCurrent]} />
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </Panel>
        </View>

        <Panel>
          <View style={styles.panelHead}>
            <View>
              <Text style={styles.panelTitle}>ตรวจทานค่าที่อ่านได้</Text>
              <Text style={styles.panelMeta}>{report?.collected_date ?? 'วันที่ตัวอย่าง'}</Text>
            </View>
            <PrimaryAction label="ยืนยันผล" onPress={() => undefined} />
          </View>

          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.cell, styles.headerText]}>รายการ</Text>
              <Text style={[styles.cell, styles.headerText]}>ค่า</Text>
              <Text style={[styles.cell, styles.headerText]}>ความมั่นใจ</Text>
              <Text style={[styles.cell, styles.headerText]}>สถานะ</Text>
            </View>
            {results.map((result) => (
              <View key={result.id} style={styles.tableRow}>
                <Text style={styles.cell}>{result.test_code}</Text>
                <Text style={styles.cell}>
                  {result.value} {result.unit ?? ''}
                </Text>
                <Text style={styles.cell}>{Math.round(result.confidence * 100)}%</Text>
                <Text style={[styles.cell, result.confirmed ? styles.confirmedText : styles.reviewText]}>
                  {result.confirmed ? 'ยืนยันแล้ว' : 'ต้องตรวจทาน'}
                </Text>
              </View>
            ))}
          </View>
        </Panel>
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
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: MiraDesign.space.lg,
  },
  workspaceStack: {
    flexDirection: 'column',
  },
  uploadPanel: {
    flex: 1.1,
  },
  progressPanel: {
    flex: 0.9,
  },
  dropzone: {
    alignItems: 'center',
    backgroundColor: '#F7FBFF',
    borderColor: '#BBD5EF',
    borderRadius: MiraDesign.radius.sm,
    borderStyle: 'dashed',
    borderWidth: 2,
    gap: MiraDesign.space.sm,
    justifyContent: 'center',
    minHeight: 240,
    padding: MiraDesign.space.xl,
  },
  dropIcon: {
    color: MiraDesign.color.showcaseBlue,
    fontSize: 46,
    fontWeight: '900',
    lineHeight: 50,
  },
  dropTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  dropBody: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
  },
  panelTitle: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 19,
    fontWeight: '900',
  },
  panelMeta: {
    color: MiraDesign.color.showcaseNavySoft,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  stepList: {
    gap: MiraDesign.space.md,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
  },
  stepDot: {
    borderRadius: MiraDesign.radius.pill,
    height: 14,
    width: 14,
  },
  stepDotDone: {
    backgroundColor: MiraDesign.color.showcaseBlue,
  },
  stepDotCurrent: {
    backgroundColor: MiraDesign.color.amber,
  },
  stepText: {
    color: MiraDesign.color.showcaseNavy,
    fontSize: 15,
    fontWeight: '900',
  },
  panelHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  table: {
    borderColor: '#D8E9F8',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableRow: {
    backgroundColor: MiraDesign.color.showcaseSurface,
    borderBottomColor: '#D8E9F8',
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  tableHeader: {
    backgroundColor: MiraDesign.color.showcaseBlueSoft,
  },
  cell: {
    color: MiraDesign.color.showcaseNavy,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    padding: MiraDesign.space.md,
  },
  headerText: {
    color: MiraDesign.color.showcaseBlue,
    fontWeight: '900',
  },
  confirmedText: {
    color: '#087B5D',
  },
  reviewText: {
    color: '#9A6A00',
  },
});
