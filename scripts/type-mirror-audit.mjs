import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const clientTypesPath = 'lib/types/api.ts';
const edgeTypesPath = 'supabase/functions/_shared/types.ts';

function normalizeType(source) {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function extractExportedTypes(source, relativePath) {
  const normalized = source.replace(/\r\n/g, '\n');
  const matches = [...normalized.matchAll(/^export type\s+([A-Za-z0-9_]+)\b/gm)];
  const types = new Map();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const name = match[1];
    const start = match.index;
    const end = matches[index + 1]?.index ?? normalized.length;
    const definition = normalizeType(normalized.slice(start, end));

    if (types.has(name)) {
      throw new Error(`${relativePath}: duplicate exported type ${name}`);
    }

    types.set(name, definition);
  }

  return types;
}

const [clientSource, edgeSource] = await Promise.all([
  fs.readFile(path.join(repoRoot, clientTypesPath), 'utf8'),
  fs.readFile(path.join(repoRoot, edgeTypesPath), 'utf8'),
]);
const violations = [];

if (!clientSource.startsWith('// Mirrored in supabase/functions/_shared/types.ts. Keep the two files in sync.')) {
  violations.push(`${clientTypesPath}: missing mirror header for edge shared types`);
}

if (!edgeSource.startsWith('// Mirrored in lib/types/api.ts. Keep the two files in sync.')) {
  violations.push(`${edgeTypesPath}: missing mirror header for client API types`);
}

const clientTypes = extractExportedTypes(clientSource, clientTypesPath);
const edgeTypes = extractExportedTypes(edgeSource, edgeTypesPath);

for (const name of new Set([...clientTypes.keys(), ...edgeTypes.keys()].sort())) {
  const clientDefinition = clientTypes.get(name);
  const edgeDefinition = edgeTypes.get(name);

  if (!clientDefinition) {
    violations.push(`${clientTypesPath}: missing exported type ${name}`);
    continue;
  }

  if (!edgeDefinition) {
    violations.push(`${edgeTypesPath}: missing exported type ${name}`);
    continue;
  }

  if (clientDefinition !== edgeDefinition) {
    violations.push(`type mismatch: ${name}`);
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(`type-mirror-audit: PASS (${clientTypes.size} exported types checked)`);
