import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiraDesign } from '@/constants/Design';
import { loadHealthDashboardData, type HealthDashboardData, type LabReportWithResults } from '@/lib/health/v2HealthDashboard';
import type { LabResultRow, UserFactRow, WearableMetricRow } from '@/lib/types/api';

type HealthInsightKind = 'overview' | 'results' | 'wearable';
type InsightRoute = '/ai-body-overview' | '/body-overview' | '/health-check-results' | '/user-profile' | '/wearable-health';

const tabs: Array<{ label: string; route: InsightRoute; screen: HealthInsightKind }> = [
  { label: 'Overview', route: '/body-overview', screen: 'overview' },
  { label: 'Labs', route: '/health-check-results', screen: 'results' },
  { label: 'Wearables', route: '/wearable-health', screen: 'wearable' },
  { label: 'Profile', route: '/user-profile', screen: 'overview' },
];

const metricLabels: Record<WearableMetricRow['metric'], string> = {
  active_energy_kcal: 'Active kcal',
  avg_hr: 'Avg HR',
  resting_hr: 'Resting HR',
  sleep_minutes: 'Sleep',
  steps: 'Steps',
};

const factLabels: Record<string, string> = {
  CHOL: 'Cholesterol',
  FBS: 'Fasting glucose',
  HBA1C: 'HbA1c',
  height_cm: 'Height',
  weight_kg: 'Weight',
};

function emptyData(): HealthDashboardData {
  return {
    customer: null,
    facts: [],
    labReports: [],
    wearableMetrics: [],
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMetric(metric: WearableMetricRow['metric'], value: number) {
  if (metric === 'sleep_minutes') {
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);

    return `${hours}h ${minutes}m`;
  }

  if (metric === 'steps') {
    return value.toLocaleString('th-TH');
  }

  return `${Math.round(value * 10) / 10}`;
}

function resultTone(result: LabResultRow) {
  if (result.value === null) {
    return 'unknown';
  }

  if ((result.ref_low !== null && result.value < result.ref_low) || (result.ref_high !== null && result.value > result.ref_high)) {
    return 'attention';
  }

  return 'ok';
}

function latestByMetric(metrics: WearableMetricRow[]) {
  const latest = new Map<WearableMetricRow['metric'], WearableMetricRow>();

  for (const metric of metrics) {
    const current = latest.get(metric.metric);

    if (!current || metric.day > current.day) {
      latest.set(metric.metric, metric);
    }
  }

  return [...latest.values()].sort((a, b) => a.metric.localeCompare(b.metric));
}

export function HealthInsightScreen({ screen }: { screen: HealthInsightKind }) {
  const [data, setData] = useState<HealthDashboardData>(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    loadHealthDashboardData()
      .then((result) => {
        if (isMounted) {
          setData(result);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load health dashboard.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const latestReport = data.labReports[0] ?? null;
  const latestMetrics = useMemo(() => latestByMetric(data.wearableMetrics), [data.wearableMetrics]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Health Dashboard</Text>
          <Text style={styles.title}>{screen === 'results' ? 'Lab Results' : screen === 'wearable' ? 'Wearable Trends' : 'Body Overview'}</Text>
          <Text style={styles.subtitle}>
            {data.customer ? `Customer ${data.customer.id.slice(0, 8)}` : isLoading ? 'Loading health data' : 'Sign in and import health data to populate this view.'}
          </Text>
        </View>

        <View style={styles.tabs}>
          {tabs.map((tab) => {
            const isActive = tab.screen === screen;

            return (
              <Link key={tab.route} href={tab.route} asChild>
                <Pressable style={StyleSheet.flatten([styles.tab, isActive ? styles.tabActive : null])}>
                  <Text style={[styles.tabText, isActive ? styles.tabTextActive : null]}>{tab.label}</Text>
                </Pressable>
              </Link>
            );
          })}
        </View>

        {isLoading ? (
          <View style={styles.notice}>
            <ActivityIndicator color={MiraDesign.color.primary} />
            <Text style={styles.noticeText}>Loading dashboard data...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {screen === 'overview' ? <Overview data={data} latestMetrics={latestMetrics} latestReport={latestReport} /> : null}
        {screen === 'results' ? <Results reports={data.labReports} /> : null}
        {screen === 'wearable' ? <Wearables metrics={data.wearableMetrics} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Overview({
  data,
  latestMetrics,
  latestReport,
}: {
  data: HealthDashboardData;
  latestMetrics: WearableMetricRow[];
  latestReport: LabReportWithResults | null;
}) {
  const bodyFacts = data.facts.filter((fact) => ['weight_kg', 'height_cm', 'FBS', 'HBA1C', 'CHOL'].includes(fact.key));

  return (
    <View style={styles.sectionStack}>
      <View style={styles.metricGrid}>
        <MetricCard label="Lab reports" value={`${data.labReports.length}`} detail={latestReport ? `Latest ${formatDate(latestReport.collected_date ?? latestReport.created_at)}` : 'No imports yet'} />
        <MetricCard label="Wearable days" value={`${new Set(data.wearableMetrics.map((metric) => metric.day)).size}`} detail="Across imported metrics" />
        <MetricCard label="Active facts" value={`${data.facts.length}`} detail="Confirmed profile signals" />
      </View>

      <Panel title="Key Health Facts">
        {bodyFacts.length === 0 ? (
          <EmptyState text="No body or lab facts have been imported yet." />
        ) : (
          bodyFacts.slice(0, 8).map((fact) => <FactRow fact={fact} key={fact.id} />)
        )}
      </Panel>

      <Panel title="Latest Wearable Snapshot">
        {latestMetrics.length === 0 ? (
          <EmptyState text="No wearable metrics have been imported yet." />
        ) : (
          latestMetrics.map((metric) => (
            <View key={`${metric.metric}-${metric.day}`} style={styles.snapshotRow}>
              <Text style={styles.snapshotLabel}>{metricLabels[metric.metric]}</Text>
              <Text style={styles.snapshotValue}>{formatMetric(metric.metric, metric.value)}</Text>
              <Text style={styles.snapshotDate}>{formatDate(metric.day)}</Text>
            </View>
          ))
        )}
      </Panel>
    </View>
  );
}

function Results({ reports }: { reports: LabReportWithResults[] }) {
  const latest = reports[0] ?? null;
  const results = latest?.lab_results ?? [];
  const lowConfidenceResults = results.filter((result) => !result.confirmed || result.confidence < 0.8);

  return (
    <View style={styles.sectionStack}>
      <Panel title="Latest Report">
        {!latest ? (
          <EmptyState text="No lab report has been imported yet." />
        ) : (
          <>
            <View style={styles.reportHeader}>
              <View>
                <Text style={styles.reportDate}>{formatDate(latest.collected_date ?? latest.created_at)}</Text>
                <Text style={styles.reportMeta}>{latest.status}</Text>
              </View>
              <Text style={[styles.statusChip, latest.status === 'ready' ? styles.statusReady : styles.statusPending]}>{latest.status}</Text>
            </View>
            {latest.ai_summary_th ? <Text style={styles.summary}>{latest.ai_summary_th}</Text> : null}
          </>
        )}
      </Panel>

      {lowConfidenceResults.length > 0 ? (
        <Panel title="Needs Confirmation">
          {lowConfidenceResults.map((result) => <LabResultCard key={`review-${result.id}`} result={result} />)}
        </Panel>
      ) : null}

      <Panel title="Result Rows">
        {results.length === 0 ? (
          <EmptyState text="No extracted result rows are available." />
        ) : (
          results.map((result) => <LabResultCard key={result.id} result={result} />)
        )}
      </Panel>

      <Panel title="Report History">
        {reports.length === 0 ? (
          <EmptyState text="Import a report to build history." />
        ) : (
          reports.map((report) => (
            <View key={report.id} style={styles.historyRow}>
              <Text style={styles.historyTitle}>{formatDate(report.collected_date ?? report.created_at)}</Text>
              <Text style={styles.historyMeta}>{report.status} - {report.lab_results?.length ?? 0} rows</Text>
            </View>
          ))
        )}
      </Panel>
    </View>
  );
}

function Wearables({ metrics }: { metrics: WearableMetricRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<WearableMetricRow['metric'], WearableMetricRow[]>();

    for (const metric of metrics) {
      map.set(metric.metric, [...(map.get(metric.metric) ?? []), metric]);
    }

    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [metrics]);

  return (
    <View style={styles.sectionStack}>
      {groups.length === 0 ? (
        <Panel title="Wearable Trends">
          <EmptyState text="No wearable data has been imported yet." />
        </Panel>
      ) : (
        groups.map(([metric, rows]) => <TrendPanel key={metric} metric={metric} rows={rows} />)
      )}
    </View>
  );
}

function MetricCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Text style={styles.emptyText}>{text}</Text>;
}

function FactRow({ fact }: { fact: UserFactRow }) {
  const value = fact.value_num !== null ? `${Math.round(fact.value_num * 10) / 10}${factLabels[fact.key] === 'Weight' ? ' kg' : factLabels[fact.key] === 'Height' ? ' cm' : ''}` : fact.value_text ?? '-';

  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{factLabels[fact.key] ?? fact.key}</Text>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factSource}>{fact.source}</Text>
    </View>
  );
}

function LabResultCard({ result }: { result: LabResultRow }) {
  const tone = resultTone(result);
  const value = result.value === null ? '-' : `${result.value}${result.unit ? ` ${result.unit}` : ''}`;
  const range = result.ref_low !== null || result.ref_high !== null ? `${result.ref_low ?? '-'} - ${result.ref_high ?? '-'}` : 'No reference range';

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View style={styles.resultTitleBlock}>
          <Text style={styles.resultCode}>{result.test_code}</Text>
          <Text numberOfLines={1} style={styles.resultName}>{result.test_name_raw}</Text>
        </View>
        <Text style={[styles.resultTone, tone === 'ok' ? styles.resultOk : tone === 'attention' ? styles.resultAttention : styles.resultUnknown]}>
          {tone}
        </Text>
      </View>
      <View style={styles.resultMetaGrid}>
        <MetricMini label="Value" value={value} />
        <MetricMini label="Range" value={range} />
        <MetricMini label="Confidence" value={`${Math.round(result.confidence * 100)}%`} />
      </View>
    </View>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricMini}>
      <Text style={styles.metricMiniLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricMiniValue}>{value}</Text>
    </View>
  );
}

function TrendPanel({ metric, rows }: { metric: WearableMetricRow['metric']; rows: WearableMetricRow[] }) {
  const ordered = [...rows].sort((a, b) => a.day.localeCompare(b.day)).slice(-14);
  const maxValue = Math.max(...ordered.map((row) => row.value), 1);
  const latest = ordered[ordered.length - 1];
  const priorWindow = ordered.slice(Math.max(0, ordered.length - 14), Math.max(0, ordered.length - 7));
  const currentWindow = ordered.slice(-7);
  const priorAvg = priorWindow.reduce((sum, row) => sum + row.value, 0) / Math.max(1, priorWindow.length);
  const currentAvg = currentWindow.reduce((sum, row) => sum + row.value, 0) / Math.max(1, currentWindow.length);
  const delta = currentAvg - priorAvg;

  return (
    <Panel title={metricLabels[metric]}>
      <View style={styles.trendHeader}>
        <Text style={styles.trendValue}>{latest ? formatMetric(metric, latest.value) : '-'}</Text>
        <Text style={[styles.trendDelta, delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
          {delta >= 0 ? '+' : ''}{formatMetric(metric, delta)}
        </Text>
      </View>
      <View style={styles.barChart}>
        {ordered.map((row) => (
          <View key={`${row.metric}-${row.day}`} style={styles.barSlot}>
            <View style={[styles.bar, { height: `${Math.max(8, (row.value / maxValue) * 100)}%` }]} />
          </View>
        ))}
      </View>
      <Text style={styles.chartCaption}>Last {ordered.length} imported days</Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F5F8F7',
    flex: 1,
  },
  container: {
    gap: 16,
    padding: 18,
    paddingBottom: 112,
  },
  header: {
    gap: 6,
    paddingTop: 4,
  },
  eyebrow: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: MiraDesign.color.ink,
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  tabs: {
    backgroundColor: '#EAF3F2',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 8,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderWidth: 1,
  },
  tabText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  tabTextActive: {
    color: MiraDesign.color.primaryDeep,
  },
  notice: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  noticeText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderColor: '#F4BBBB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    color: '#8F2424',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionStack: {
    gap: 14,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 150,
    padding: 13,
  },
  metricLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: MiraDesign.color.ink,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  metricDetail: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    marginTop: 4,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  panelTitle: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  emptyText: {
    color: MiraDesign.color.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  factRow: {
    alignItems: 'center',
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  factLabel: {
    color: MiraDesign.color.inkSoft,
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  factValue: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  factSource: {
    color: MiraDesign.color.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  snapshotRow: {
    alignItems: 'center',
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  snapshotLabel: {
    color: MiraDesign.color.inkSoft,
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  snapshotValue: {
    color: MiraDesign.color.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  snapshotDate: {
    color: MiraDesign.color.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  reportHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reportDate: {
    color: MiraDesign.color.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  reportMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  statusChip: {
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusReady: {
    backgroundColor: '#E5F3EC',
    color: '#1E7C63',
  },
  statusPending: {
    backgroundColor: '#FFF4D9',
    color: '#8A5B12',
  },
  summary: {
    color: MiraDesign.color.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  resultCard: {
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  resultHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  resultTitleBlock: {
    flex: 1,
    gap: 3,
  },
  resultCode: {
    color: MiraDesign.color.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  resultName: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  resultTone: {
    borderRadius: 8,
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  resultOk: {
    backgroundColor: '#E5F3EC',
    color: '#1E7C63',
  },
  resultAttention: {
    backgroundColor: '#FFE8E8',
    color: '#A23538',
  },
  resultUnknown: {
    backgroundColor: '#E8EEF2',
    color: '#536873',
  },
  resultMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricMini: {
    backgroundColor: '#FFFFFF',
    borderColor: MiraDesign.color.line,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 96,
    padding: 9,
  },
  metricMiniLabel: {
    color: MiraDesign.color.inkSoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricMiniValue: {
    color: MiraDesign.color.ink,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  historyRow: {
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  historyTitle: {
    color: MiraDesign.color.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  historyMeta: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  trendHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trendValue: {
    color: MiraDesign.color.ink,
    fontSize: 26,
    fontWeight: '900',
  },
  trendDelta: {
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  deltaUp: {
    backgroundColor: '#E5F3EC',
    color: '#1E7C63',
  },
  deltaDown: {
    backgroundColor: '#FFE8E8',
    color: '#A23538',
  },
  barChart: {
    alignItems: 'flex-end',
    backgroundColor: '#F7FBFA',
    borderColor: '#E5EFEE',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 130,
    padding: 10,
  },
  barSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    backgroundColor: MiraDesign.color.primary,
    borderRadius: 5,
    minHeight: 8,
  },
  chartCaption: {
    color: MiraDesign.color.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
});
