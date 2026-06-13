import fs from 'node:fs/promises';
import path from 'node:path';

// R4 coverage gate: every table that carries a customer_id column must be handled
// by the PDPA erasure path (pdpa-delete) — either hard-deleted, anonymized, or on
// an explicit allowlist with a documented reason. A new customer-data table that
// nobody wired into the delete path fails the build (prevents silent drift).

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase/migrations');
const pdpaSourcePath = 'supabase/functions/_shared/pdpa.ts';

// Tables whose customer_id rows are HARD-DELETED by executePdpaErasure.
const DELETE_TABLES = [
  'chat_sessions',
  'consents',
  'lab_reports',
  'user_facts',
  'wearable_imports',
  'wearable_metrics',
];

// Tables ANONYMIZED (customer linkage + personal fields cleared) instead of deleted,
// to preserve financial/commission integrity. orders.status is never touched.
const ANONYMIZE_TABLES = ['orders'];

// Tables that intentionally retain a customer_id reference, with a documented reason.
const ALLOWLIST = {
  pdpa_requests: 'tombstone: customer_id is a non-FK reference that must survive erasure',
};

const violations = [];

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

// Extract every `create table if not exists public.<name> ( ... );` block whose
// body declares a `customer_id` column.
function customerTablesIn(sql) {
  const tables = new Set();
  const re = /create table if not exists public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;

  for (const match of sql.matchAll(re)) {
    const [, name, body] = match;
    if (/\bcustomer_id\b/.test(body)) {
      tables.add(name);
    }
  }

  return tables;
}

const migrationFiles = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
const discovered = new Set();

for (const fileName of migrationFiles) {
  const sql = await read(`supabase/migrations/${fileName}`);
  for (const table of customerTablesIn(sql)) {
    discovered.add(table);
  }
}

const pdpaSource = await read(pdpaSourcePath);

// 1) Every discovered customer_id table must be covered.
for (const table of [...discovered].sort()) {
  if (ALLOWLIST[table]) {
    continue;
  }

  const handled = DELETE_TABLES.includes(table) || ANONYMIZE_TABLES.includes(table);
  if (!handled) {
    violations.push(
      `${table}: has a customer_id column but is not in pdpa-delete's delete/anonymize list or the allowlist (wire it into supabase/functions/_shared/pdpa.ts or add a documented allowlist entry)`,
    );
  }
}

// 2) Guard against stale list entries: every name we claim to handle must actually
//    be a discovered customer_id table.
for (const table of [...DELETE_TABLES, ...ANONYMIZE_TABLES]) {
  if (!discovered.has(table)) {
    violations.push(`${table}: listed in the PDPA coverage audit but no migration defines it with a customer_id column`);
  }
}

// 3) Guard against the erasure code drifting away from the audit lists.
for (const table of DELETE_TABLES) {
  if (!pdpaSource.includes(`'${table}'`)) {
    violations.push(`${pdpaSourcePath}: erasure no longer references delete table '${table}'`);
  }
}
for (const table of ANONYMIZE_TABLES) {
  if (!pdpaSource.includes(`updateRows('${table}'`)) {
    violations.push(`${pdpaSourcePath}: erasure no longer anonymizes '${table}'`);
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(
  `pdpa-coverage-audit: PASS (${discovered.size} customer_id tables: ${DELETE_TABLES.length} deleted, ${ANONYMIZE_TABLES.length} anonymized, ${Object.keys(ALLOWLIST).length} allowlisted)`,
);
