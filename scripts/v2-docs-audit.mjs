import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const docs = [
  'README.md',
  'docs/changes/phase-1.md',
  'docs/changes/phase-2.md',
  'docs/changes/phase-3.md',
  'docs/changes/phase-5.md',
  'docs/changes/phase-6.md',
  'docs/miracare-v2-product-plan.md',
  'docs/v2-audit-report-2026-06-11.md',
  'docs/v2-gap-analysis.md',
  'docs/v2-local-readiness.md',
  'docs/v2-open-questions.md',
];

const stalePatterns = [
  [/12 edge\/shared files scanned/i, 'edge-security audit now scans 13 edge/shared/template files'],
  [/12 files scanned/i, 'edge-security audit now scans 13 files'],
  [/26 production files scanned/i, 'client audit now scans 28 production files'],
  [/11 health\/lab/i, 'health safety audit now scans 14 health/lab/wearable files'],
  [/60 shared tests/i, 'shared Deno suite now has 68 tests'],
  [/62 shared tests/i, 'shared Deno suite now has 68 tests'],
  [/passed with 60/i, 'shared Deno suite now has 68 tests'],
  [/passed with 62/i, 'shared Deno suite now has 68 tests'],
  [/140 files scanned/i, 'order status audit count drifted after new audit scripts'],
  [/141 files scanned/i, 'order status audit count drifted after new audit scripts'],
  [/142 files scanned/i, 'order status audit count drifted after new audit scripts'],
  [/143 files scanned/i, 'order status audit count drifted after new audit scripts'],
  [/ZIP parsing is not enabled yet/i, 'Apple Health zip export.xml streaming is implemented'],
];

const requiredSnippets = [
  ['README.md', 'npm run v2:verify'],
  ['README.md', 'npm run v2:external-preflight'],
  ['README.md', 'v2:local-readiness-audit'],
  ['README.md', 'v2:open-questions-audit'],
  ['docs/v2-local-readiness.md', '`npm run v2:local-readiness-audit`'],
  ['docs/v2-gap-analysis.md', '`npm run v2:docs-audit`: passing'],
  ['docs/v2-gap-analysis.md', '`npm run v2:open-questions-audit`: passing'],
  ['docs/v2-gap-analysis.md', '`npm run v2:local-readiness-audit`: passing'],
  ['docs/v2-audit-report-2026-06-11.md', '`npm run v2:docs-audit`'],
  ['docs/v2-audit-report-2026-06-11.md', '`npm run v2:local-readiness-audit`'],
  ['docs/changes/phase-6.md', 'passed with 68 shared tests'],
];

const violations = [];
const sources = new Map(
  await Promise.all(docs.map(async (relativePath) => [relativePath, await read(relativePath)])),
);

for (const [relativePath, source] of sources) {
  for (const [pattern, detail] of stalePatterns) {
    if (pattern.test(source)) {
      violations.push(`${relativePath}: stale verification evidence matched ${pattern}; ${detail}`);
    }
  }
}

for (const [relativePath, snippet] of requiredSnippets) {
  const source = sources.get(relativePath) ?? '';

  if (!source.includes(snippet)) {
    violations.push(`${relativePath}: missing required verification evidence "${snippet}"`);
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(`v2-docs-audit: PASS (${docs.length} docs checked)`);

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}
