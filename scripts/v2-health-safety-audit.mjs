import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();

const files = {
  lab: 'supabase/functions/_shared/lab.ts',
  labFixture: 'supabase/functions/_shared/__tests__/fixtures/lab_vision_results.json',
  labTest: 'supabase/functions/_shared/__tests__/lab_test.ts',
  healthLoader: 'lib/health/v2HealthDashboard.ts',
  healthScreens: 'components/HealthInsightScreens.tsx',
  resultsRoute: 'app/health-check-results.tsx',
  overviewRoute: 'app/body-overview.tsx',
  wearableRoute: 'app/wearable-health.tsx',
  openai: 'supabase/functions/_shared/openai.ts',
  templates: 'supabase/functions/_shared/templates.ts',
  wearable: 'supabase/functions/_shared/wearable.ts',
  wearableFixture: 'supabase/functions/_shared/__tests__/fixtures/apple_health_export.ts',
  wearableIngest: 'supabase/functions/wearable-ingest/index.ts',
  wearableTest: 'supabase/functions/_shared/__tests__/wearable_test.ts',
};

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

const sourceEntries = await Promise.all(
  Object.entries(files).map(async ([key, relativePath]) => [key, await read(relativePath)]),
);
const sources = Object.fromEntries(sourceEntries);
const violations = [];
const expectedLabCodes = ['FBS', 'HBA1C', 'CHOL', 'TG', 'HDL', 'LDL', 'CR', 'ALT', 'AST', 'CBC', 'HB', 'HCT', 'WBC', 'PLT', 'UA'];

function expect(name, condition, detail) {
  if (!condition) {
    violations.push(`${name}: ${detail}`);
  }
}

expect(
  'lab disclaimer template',
  sources.templates.includes('LAB_SUMMARY_DISCLAIMER_TH') &&
    sources.templates.includes('ข้อมูลนี้เป็นข้อมูลประกอบการดูแลสุขภาพ'),
  'fixed lab disclaimer must live in supabase/functions/_shared/templates.ts',
);

expect(
  'lab summary uses shared template',
  sources.lab.includes("from './templates.ts'") &&
    sources.lab.includes('sanitizeLabSummary') &&
    sources.openai.includes('sanitizeLabSummary(extractText(payload))'),
  'lab summary must sanitize model output and append the fixed template before storage',
);

expect(
  'lab summary diagnosis guard',
  sources.lab.includes("replace(/วินิจฉัย/g, 'ประเมิน')") &&
    sources.labTest.includes('sanitizeLabSummary appends disclaimer and removes diagnosis wording'),
  'lab summary sanitizer must remove diagnosis wording with Deno test coverage',
);

expect(
  'lab summary no duplicate disclaimer',
  sources.labTest.includes('sanitizeLabSummary does not duplicate disclaimer'),
  'lab summary sanitizer must test that the fixed disclaimer is not duplicated',
);

expect(
  'lab vision normalization table',
  sources.lab.includes('LAB_CODE_NORMALIZATION_TABLE') &&
    sources.lab.includes('formatLabCodeNormalizationTable') &&
    expectedLabCodes.every((code) => sources.lab.includes(`test_code: '${code}'`)) &&
    sources.openai.includes('formatLabCodeNormalizationTable()') &&
    sources.openai.includes('role: \'system\'') &&
    sources.openai.includes('enum: [...SUPPORTED_LAB_TEST_CODES, null]') &&
    sources.labTest.includes('lab code normalization table covers the 15 supported test codes'),
  'OpenAI lab vision extraction must embed the 15-code normalization table in system text and test the table',
);

expect(
  'health sample fixtures',
  sources.labFixture.includes('"mapped_code": "FBS"') &&
    sources.labFixture.includes('"mapped_code": "HBA1C"') &&
    sources.labTest.includes('normalizeLabRows handles sample lab vision fixture') &&
    sources.wearableFixture.includes('HKQuantityTypeIdentifierStepCount') &&
    sources.wearableFixture.includes('HKCategoryTypeIdentifierSleepAnalysis'),
  'Phase 5 normalizer tests must keep sample lab and wearable fixture files',
);

expect(
  'wearable zip streaming parser',
  sources.wearable.includes("import { Unzip, UnzipInflate } from 'fflate'") &&
    sources.wearable.includes('parseAppleHealthZipStream') &&
    sources.wearable.includes('AppleHealthRecordScanner') &&
    sources.wearableIngest.includes('streamStorageObject') &&
    sources.wearableIngest.includes('parseAppleHealthExportStream') &&
    !sources.wearableIngest.includes('ZIP parsing is not enabled') &&
    sources.wearableTest.includes('parseAppleHealthExportStream reads export.xml from Apple Health zip chunks') &&
    sources.wearableTest.includes('parseAppleHealthExportStream rejects zip archives without export.xml'),
  'wearable-ingest must stream Apple Health zip export.xml chunks instead of rejecting zip uploads',
);

const dashboardSource = [
  sources.healthLoader,
  sources.healthScreens,
  sources.resultsRoute,
  sources.overviewRoute,
  sources.wearableRoute,
].join('\n');
const forbiddenDashboardTerms = [
  'services/mockBackend',
  'mockBackend',
  'mockup',
  'localHealthKnowledge',
  'healthMetrics',
  'healthPackages',
  'callMiraPrompt',
  'invokeFunction<',
  'supabase.functions.invoke',
  'responses.create',
  'OPENAI_API_KEY',
  'prompt_versions',
];

expect(
  'health dashboard live table loader',
  sources.healthLoader.includes(".from('lab_reports')") &&
    sources.healthLoader.includes('lab_results(id,report_id,test_code,test_name_raw,value,unit,ref_low,ref_high,confidence,confirmed)') &&
    sources.healthLoader.includes(".from('wearable_metrics')") &&
    sources.healthLoader.includes(".from('user_facts')"),
  'health dashboard loader must read only the v2 live lab, wearable, and fact tables',
);

expect(
  'health dashboard production routes',
  sources.resultsRoute.includes('HealthInsightScreen screen="results"') &&
    sources.overviewRoute.includes('HealthInsightScreen screen="overview"') &&
    sources.wearableRoute.includes('HealthInsightScreen screen="wearable"'),
  'Phase 5 production health routes must render the shared live dashboard screen',
);

expect(
  'health dashboard no mock or model calls',
  forbiddenDashboardTerms.every((term) => !dashboardSource.includes(term)),
  'dashboard view/loader/routes must not use mock data, prompt versions, function invokes, or OpenAI/model calls at view time',
);

expect(
  'health dashboard rule-based wearable insight',
  sources.healthScreens.includes('const priorWindow = ordered.slice(Math.max(0, ordered.length - 14), Math.max(0, ordered.length - 7))') &&
    sources.healthScreens.includes('const currentWindow = ordered.slice(-7)') &&
    sources.healthScreens.includes('const delta = currentAvg - priorAvg'),
  'wearable trend insight must stay rule-based using recent/prior windows',
);

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(`v2-health-safety-audit: PASS (${Object.keys(files).length} files scanned)`);
