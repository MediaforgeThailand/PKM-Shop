import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const files = {
  auditReport: 'docs/v2-audit-report-2026-06-11.md',
  gapAnalysis: 'docs/v2-gap-analysis.md',
  openQuestions: 'docs/v2-open-questions.md',
};

const [auditReport, gapAnalysis, openQuestions] = await Promise.all(
  Object.values(files).map((relativePath) => read(relativePath)),
);

const violations = [];
const openQuestionsLower = normalize(openQuestions);

const requiredSections = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6'];
const requiredTopics = [
  ['canonical catalog', ['canonical seven-product catalog']],
  ['legacy consent mapping', ['legacy_consents']],
  ['PDPA export/delete contract', ['pdpa export/delete']],
  ['prototype release policy', ['prototype/mockup']],
  ['action idempotency sequencing', ['client_msg_id']],
  ['fact extractor tenant context', ['fact-extractor']],
  ['payment slip upload contract', ['payment-slips']],
  ['persisted order-panel QR contract', ['qr_payload']],
  ['manual payment verification', ['manual staff verification']],
  ['referral code format', ['6-character base32']],
  ['referral code transport', ['optional `ref_code` request field']],
  ['referrer payment endpoint split', ['action: "payment_done"']],
  ['commission default scheme', ['default commission schemes']],
  ['lab fact keys', ['`fbs`']],
  ['lab alias matrix', ['synonym/alias matrix']],
  ['lab-ingest tenant context', ['`lab-ingest` request schema']],
  ['lab confirmation write contract', ['low-confidence lab rows']],
  ['legal lab wording', ['medical liability wording']],
  ['dashboard tenant resolution', ['defaulttenantslug']],
  ['wearable request context', ['`wearable-ingest` request schema']],
  ['wearable source ref', ['source_ref']],
  ['wearable bucket naming', ['wearable-imports']],
  ['Apple Health upload UX', ['apple health export upload']],
  ['LINE assets bucket policy', ['line-assets']],
  ['LINE sandbox credentials', ['line sandbox channel']],
];

for (const section of requiredSections) {
  expect(
    `section ${section}`,
    openQuestions.includes(`## ${section}`),
    `${files.openQuestions} must keep a section for ${section}`,
  );
}

for (const [label, snippets] of requiredTopics) {
  expect(
    `open question topic ${label}`,
    snippets.some((snippet) => openQuestionsLower.includes(normalize(snippet))),
    `${files.openQuestions} must log the unresolved ${label} decision`,
  );
}

const blockedRows = [...gapAnalysis.matchAll(/^\|\s*([^|]+?)\s*\|\s*Blocked\s*\|\s*([^|]+?)\s*\|/gm)];

expect('blocked rows present', blockedRows.length > 0, `${files.gapAnalysis} should preserve explicit Blocked rows`);

for (const [, requirement, evidence] of blockedRows) {
  expect(
    `blocked row evidence ${requirement.trim()}`,
    evidence.includes(files.openQuestions),
    `Blocked gap-analysis row "${requirement.trim()}" must cite ${files.openQuestions}`,
  );
}

expect(
  'gap blocker summary points to open questions',
  gapAnalysis.includes('See `docs/v2-open-questions.md` for the authoritative list.'),
  `${files.gapAnalysis} must point readers to the authoritative open-question list`,
);

expect(
  'audit report blocker summary points to open questions',
  auditReport.includes('The authoritative blocker list is `docs/v2-open-questions.md`.'),
  `${files.auditReport} must point readers to the authoritative open-question list`,
);

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(
  `v2-open-questions-audit: PASS (${requiredTopics.length} topics, ${blockedRows.length} blocked rows checked)`,
);

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

function normalize(value) {
  return value.toLowerCase();
}

function expect(name, condition, detail) {
  if (!condition) {
    violations.push(`${name}: ${detail}`);
  }
}
