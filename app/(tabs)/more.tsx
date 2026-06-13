import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthChip, Panel, ShowcaseHeader, ShowcaseScreen, StatusChip } from '@/components/showcase/ShowcaseUI';
import { MiraDesign } from '@/constants/Design';
import { getShowcaseEntriesForModule, showcaseModuleIds, showcaseModuleMeta, type ShowcaseEntry } from '@/lib/showcase/registry';

export default function MoreScreen() {
  return (
    <ShowcaseScreen maxWidth={980}>
      <ShowcaseHeader
        eyebrow="MIRACARE ROUTES"
        subtitle="รายการนี้ดึงจาก registry เดียวกับหน้า tour จึงสะท้อน route ที่ใช้งานจริงและ mockup ปัจจุบัน"
        title="เมนูทั้งหมด"
      />

      {showcaseModuleIds.map((moduleId) => {
        const meta = showcaseModuleMeta[moduleId];
        const entries = getShowcaseEntriesForModule(moduleId, false);

        return (
          <Panel key={moduleId}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionEyebrow}>{meta.eyebrow_en}</Text>
                <Text style={styles.sectionTitle}>{meta.title_th}</Text>
              </View>
              <Text style={styles.count}>{entries.length} หน้า</Text>
            </View>

            <View style={styles.rowStack}>
              {entries.map((entry) => (
                <MenuRow key={entry.id} entry={entry} />
              ))}
            </View>
          </Panel>
        );
      })}
    </ShowcaseScreen>
  );
}

function MenuRow({ entry }: { entry: ShowcaseEntry }) {
  if (!entry.href) {
    return null;
  }

  return (
    <Link href={entry.href as Href} asChild>
      <Pressable style={styles.menuRow}>
        <View style={styles.menuCopy}>
          <Text style={styles.menuPath}>{entry.path}</Text>
          <Text style={styles.menuTitle}>{entry.label_th}</Text>
        </View>
        <View style={styles.badges}>
          <StatusChip status={entry.status} />
          <AuthChip auth={entry.auth} />
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  sectionEyebrow: {
    color: MiraDesign.color.blue,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: MiraDesign.color.ink,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  count: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  rowStack: {
    gap: MiraDesign.space.sm,
  },
  menuRow: {
    alignItems: 'center',
    backgroundColor: '#F7FBFF',
    borderColor: '#D8E9F8',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
    minHeight: 74,
    padding: MiraDesign.space.md,
  },
  menuCopy: {
    flex: 1,
    gap: 4,
  },
  menuPath: {
    color: MiraDesign.color.blue,
    fontSize: 11,
    fontWeight: '900',
  },
  menuTitle: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  badges: {
    alignItems: 'flex-end',
    gap: 5,
  },
});
