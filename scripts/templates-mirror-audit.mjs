import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const canonicalPath = 'supabase/functions/_shared/templates.ts';
const mirrorPath = 'lib/templates.ts';

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

function extractExportedConstants(source, relativePath) {
  const normalized = source.replace(/\r\n/g, '\n');
  const matches = [...normalized.matchAll(/^export const\s+([A-Z0-9_]+)\s*=\s*([\s\S]*?);$/gm)];
  const constants = new Map();

  for (const match of matches) {
    const [, name, value] = match;
    const normalizedValue = value.replace(/[ \t]+$/gm, '').trim();

    if (constants.has(name)) {
      throw new Error(`${relativePath}: duplicate exported constant ${name}`);
    }

    constants.set(name, normalizedValue);
  }

  return constants;
}

const [canonicalSource, mirrorSource] = await Promise.all([read(canonicalPath), read(mirrorPath)]);
const violations = [];

if (!mirrorSource.startsWith('// Mirror of supabase/functions/_shared/templates.ts.')) {
  violations.push(`${mirrorPath}: missing mirror header pointing to canonical edge templates`);
}

const canonicalConstants = extractExportedConstants(canonicalSource, canonicalPath);
const mirrorConstants = extractExportedConstants(mirrorSource, mirrorPath);

for (const name of new Set([...canonicalConstants.keys(), ...mirrorConstants.keys()].sort())) {
  const canonicalValue = canonicalConstants.get(name);
  const mirrorValue = mirrorConstants.get(name);

  if (canonicalValue === undefined) {
    violations.push(`${canonicalPath}: missing exported constant ${name}`);
    continue;
  }

  if (mirrorValue === undefined) {
    violations.push(`${mirrorPath}: missing exported constant ${name}`);
    continue;
  }

  if (canonicalValue !== mirrorValue) {
    violations.push(`template constant mismatch: ${name}`);
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(`templates-mirror-audit: PASS (${canonicalConstants.size} exported constants checked)`);
