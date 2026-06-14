import fs from 'node:fs/promises';
import path from 'node:path';

// C1 regression gate (deep-risk-audit-2026-06-14): every state-mutating
// SECURITY DEFINER RPC that must be edge-only has to revoke EXECUTE from the
// PostgREST-exposed roles (public/anon/authenticated) and keep it for
// service_role. Today that set is exactly public.transition_order — the ONLY
// writer of orders.status. If a future migration reintroduces the function
// without re-locking it, this audit fails before it can ship.

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

const lockedFunctions = [
  {
    name: 'public.transition_order',
    // matches `transition_order(uuid, text, text, jsonb)` with flexible spacing
    signature: /transition_order\s*\(\s*uuid\s*,\s*text\s*,\s*text\s*,\s*jsonb\s*\)/i,
  },
];

function hasRevokeFrom(sql, signature, role) {
  const pattern = new RegExp(
    `revoke\\s+execute\\s+on\\s+function\\s+public\\.${signature.source}\\s+from\\s+[^;]*\\b${role}\\b`,
    'i',
  );
  return pattern.test(sql);
}

function hasGrantTo(sql, signature, role) {
  const pattern = new RegExp(
    `grant\\s+execute\\s+on\\s+function\\s+public\\.${signature.source}\\s+to\\s+[^;]*\\b${role}\\b`,
    'i',
  );
  return pattern.test(sql);
}

const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql'));
const sql = (await Promise.all(files.map((name) => fs.readFile(path.join(migrationsDir, name), 'utf8')))).join('\n');

const failures = [];

for (const fn of lockedFunctions) {
  if (!fn.signature.test(sql)) {
    // The function isn't defined anywhere — nothing to lock down. Skip.
    continue;
  }

  for (const role of ['public', 'anon', 'authenticated']) {
    if (!hasRevokeFrom(sql, fn.signature, role)) {
      failures.push(`${fn.name}: missing "revoke execute ... from ${role}" in supabase/migrations.`);
    }
  }

  if (!hasGrantTo(sql, fn.signature, 'service_role')) {
    failures.push(`${fn.name}: missing "grant execute ... to service_role" (edge functions must keep access).`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(`rpc-grant-audit: PASS (${lockedFunctions.length} locked RPC(s) verified across ${files.length} migrations)`);
