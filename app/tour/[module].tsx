import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AuthChip, LinkButton, Panel, ShowcaseHeader, ShowcaseScreen, StatusChip, withTourHref } from '@/components/showcase/ShowcaseUI';
import { MiraDesign } from '@/constants/Design';
import {
  findShowcaseModule,
  getShowcaseEntriesForModule,
  type ShowcaseEntry,
  type ShowcaseModuleId,
} from '@/lib/showcase/registry';

const moduleNumbers: Record<ShowcaseModuleId, string> = {
  admin: '02',
  'ai-chat': '03',
  health: '04',
  referral: '01',
};

export default function ShowcaseDirectoryScreen() {
  const params = useLocalSearchParams<{ module?: string }>();
  const module = findShowcaseModule(params.module);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= 920;

  if (!module) {
    return <Redirect href="/" />;
  }

  const moduleId = module.id;
  const entries = getShowcaseEntriesForModule(moduleId, true);
  const availableCount = entries.filter((entry) => entry.href).length;

  async function copyUrl(entry: ShowcaseEntry) {
    const url = buildTourUrl(entry.path, moduleId);

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }

    setCopiedId(entry.id);
    setTimeout(() => setCopiedId((current) => (current === entry.id ? null : current)), 1600);
  }

  return (
    <ShowcaseScreen>
      <ShowcaseHeader
        actions={<LinkButton href="/" label="กลับหน้าแรก" />}
        eyebrow={module.eyebrow}
        subtitle={module.body}
        title={module.title}
      />

      <View style={[styles.heroRow, !isWide ? styles.heroRowStack : null]}>
        <Panel style={[styles.modulePanel, { borderColor: module.accent }]}>
          <Text style={[styles.moduleNumber, { color: module.accent }]}>{moduleNumbers[module.id]}</Text>
          <View style={styles.moduleSummary}>
            <Text style={styles.summaryValue}>{entries.length}</Text>
            <Text style={styles.summaryLabel}>หน้าในหมวดนี้</Text>
          </View>
          <View style={styles.moduleSummary}>
            <Text style={styles.summaryValue}>{availableCount}</Text>
            <Text style={styles.summaryLabel}>กดเปิดได้</Text>
          </View>
        </Panel>

        <Panel style={styles.scriptPanel}>
          <Text style={styles.panelTitle}>ลำดับพรีเซนต์</Text>
          <View style={styles.scriptList}>
            {module.script_th.map((line, index) => (
              <View key={line} style={styles.scriptRow}>
                <Text style={styles.scriptIndex}>{index + 1}</Text>
                <Text style={styles.scriptText}>{line}</Text>
              </View>
            ))}
          </View>
        </Panel>
      </View>

      <View style={styles.routeGrid}>
        {entries.map((entry) => (
          <RouteCard key={entry.id} copied={copiedId === entry.id} entry={entry} moduleId={moduleId} onCopy={() => void copyUrl(entry)} />
        ))}
      </View>
    </ShowcaseScreen>
  );
}

function RouteCard({
  copied,
  entry,
  moduleId,
  onCopy,
}: {
  copied: boolean;
  entry: ShowcaseEntry;
  moduleId: ShowcaseModuleId;
  onCopy: () => void;
}) {
  const isPlanned = entry.status === 'planned' || !entry.href;

  return (
    <Panel style={[styles.routeCard, isPlanned ? styles.routeCardPlanned : null]}>
      <View style={styles.routeHead}>
        <View style={styles.routeTitleGroup}>
          <Text style={styles.routePath}>{entry.path}</Text>
          <Text style={styles.routeTitle}>{entry.label_th}</Text>
        </View>
        <View style={styles.badgeRow}>
          <StatusChip status={entry.status} />
          <AuthChip auth={entry.auth} />
        </View>
      </View>

      <Text style={styles.routeBody}>{entry.description_th}</Text>

      {entry.sharedWithModule ? <Text style={styles.sharedNote}>ใช้ร่วมกับหมวด {entry.sharedWithModule}</Text> : null}

      <View style={styles.routeActions}>
        {entry.href ? <LinkButton href={withTourHref(entry.href, moduleId)} label="เปิดหน้า" /> : <View style={styles.disabledButton}><Text style={styles.disabledButtonText}>ยังไม่เปิด</Text></View>}
        <Pressable disabled={isPlanned} onPress={onCopy} style={[styles.copyButton, isPlanned ? styles.copyButtonDisabled : null]}>
          <Text style={styles.copyButtonText}>{copied ? 'คัดลอกแล้ว' : 'Copy URL'}</Text>
        </Pressable>
      </View>
    </Panel>
  );
}

function buildTourUrl(path: string, moduleId: ShowcaseModuleId) {
  const tourPath = `${path}${path.includes('?') ? '&' : '?'}tour=${moduleId}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${tourPath}`;
  }

  return tourPath;
}

const styles = StyleSheet.create({
  heroRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: MiraDesign.space.lg,
  },
  heroRowStack: {
    flexDirection: 'column',
  },
  modulePanel: {
    flex: 0.45,
    justifyContent: 'space-between',
    minHeight: 230,
  },
  moduleNumber: {
    fontSize: 62,
    fontWeight: '900',
    lineHeight: 68,
  },
  moduleSummary: {
    gap: 2,
  },
  summaryValue: {
    color: MiraDesign.color.ink,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  summaryLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '900',
  },
  scriptPanel: {
    flex: 1,
  },
  panelTitle: {
    color: MiraDesign.color.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  scriptList: {
    gap: MiraDesign.space.sm,
  },
  scriptRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: MiraDesign.space.sm,
  },
  scriptIndex: {
    backgroundColor: MiraDesign.color.blueSoft,
    borderRadius: MiraDesign.radius.sm,
    color: MiraDesign.color.blue,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scriptText: {
    color: MiraDesign.color.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 21,
  },
  routeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.lg,
  },
  routeCard: {
    flexGrow: 1,
    minHeight: 214,
    minWidth: 280,
    width: '31.7%',
  },
  routeCardPlanned: {
    opacity: 0.68,
  },
  routeHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: MiraDesign.space.md,
    justifyContent: 'space-between',
  },
  routeTitleGroup: {
    flex: 1,
    gap: 5,
  },
  routePath: {
    color: MiraDesign.color.blue,
    fontSize: 12,
    fontWeight: '900',
  },
  routeTitle: {
    color: MiraDesign.color.ink,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 24,
  },
  badgeRow: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 6,
  },
  routeBody: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  sharedNote: {
    color: MiraDesign.color.blue,
    fontSize: 12,
    fontWeight: '900',
  },
  routeActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MiraDesign.space.sm,
    marginTop: 'auto',
  },
  copyButton: {
    alignItems: 'center',
    backgroundColor: MiraDesign.color.surface,
    borderColor: '#BBD5EF',
    borderRadius: MiraDesign.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: MiraDesign.space.lg,
  },
  copyButtonDisabled: {
    opacity: 0.55,
  },
  copyButtonText: {
    color: MiraDesign.color.blue,
    fontSize: 13,
    fontWeight: '900',
  },
  disabledButton: {
    alignItems: 'center',
    backgroundColor: '#E9EFF5',
    borderRadius: MiraDesign.radius.sm,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: MiraDesign.space.lg,
  },
  disabledButtonText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '900',
  },
});
