import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const roots = ['app', 'components', 'lib', 'scripts', 'supabase/functions', 'supabase/migrations'];
const allowedExtensions = new Set(['.js', '.mjs', '.sql', '.ts', '.tsx']);
const skippedNames = new Set(['.expo', '.git', 'node_modules']);
const selfPath = path.join(repoRoot, 'scripts', 'order-status-write-audit.mjs');

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!skippedNames.has(entry.name)) {
        files.push(...await collectFiles(fullPath));
      }
      continue;
    }

    if (entry.isFile() && allowedExtensions.has(path.extname(entry.name)) && fullPath !== selfPath) {
      files.push(fullPath);
    }
  }

  return files;
}

function transitionOrderRanges(source) {
  const ranges = [];
  const startPattern = /create\s+or\s+replace\s+function\s+public\.transition_order\s*\(/gi;
  let match;

  while ((match = startPattern.exec(source)) !== null) {
    const endIndex = source.indexOf('\n$$;', match.index);
    ranges.push({
      end: endIndex === -1 ? source.length : endIndex + 4,
      start: match.index,
    });
  }

  return ranges;
}

function inRange(index, ranges) {
  return ranges.some((range) => index >= range.start && index <= range.end);
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function findViolations(filePath, source) {
  const violations = [];
  const ranges = transitionOrderRanges(source);
  const sqlStatusWrite = /update\s+(?:public\.)?orders\s+set\s+status\b/gi;
  const clientStatusWrite = /\.from\(\s*['"]orders['"]\s*\)[\s\S]{0,700}?\.update\(\s*\{[\s\S]{0,300}?\bstatus\s*:/gi;
  let match;

  while ((match = sqlStatusWrite.exec(source)) !== null) {
    if (!inRange(match.index, ranges)) {
      violations.push({
        filePath,
        line: lineNumberAt(source, match.index),
        message: 'SQL writes orders.status outside public.transition_order().',
      });
    }
  }

  while ((match = clientStatusWrite.exec(source)) !== null) {
    violations.push({
      filePath,
      line: lineNumberAt(source, match.index),
      message: 'Client/server code updates orders.status directly instead of calling transition_order().',
    });
  }

  return violations;
}

const files = (await Promise.all(roots.map((root) => collectFiles(path.join(repoRoot, root))))).flat();
const violations = [];

for (const filePath of files) {
  const source = await fs.readFile(filePath, 'utf8');
  violations.push(...findViolations(filePath, source));
}

if (violations.length > 0) {
  for (const violation of violations) {
    const relativePath = path.relative(repoRoot, violation.filePath);
    console.error(`${relativePath}:${violation.line} ${violation.message}`);
  }
  process.exit(1);
}

console.log(`order-status-write-audit: PASS (${files.length} files scanned)`);
