import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const sourceRoots = ['app', 'components', 'lib', 'services', 'supabase/functions'];
const sourceExtensions = new Set(['.ts', '.tsx']);
const skippedDirs = new Set(['.expo', '.git', 'node_modules', 'dist', 'build', 'coverage']);
const strictFlags = [
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'strictPropertyInitialization',
  'noImplicitThis',
  'useUnknownInCatchVariables',
  'alwaysStrict',
];

const violations = [];

async function exists(absolutePath) {
  return fs
    .access(absolutePath)
    .then(() => true)
    .catch(() => false);
}

async function collectTypeScriptFiles(relativeRoot) {
  const absoluteRoot = path.join(repoRoot, relativeRoot);

  if (!(await exists(absoluteRoot))) {
    return [];
  }

  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(absoluteRoot, entry.name);

    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) {
        files.push(...await collectTypeScriptFiles(path.relative(repoRoot, absolutePath)));
      }
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function scriptKindFor(relativePath) {
  return relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function checkForExplicitAny(sourceFile, relativePath) {
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(
        `${relativePath}:${position.line + 1}:${position.character + 1}: explicit any is forbidden; use unknown plus narrowing`,
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
const tsconfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf8'));
const compilerOptions = tsconfig.compilerOptions ?? {};

if (compilerOptions.strict !== true) {
  violations.push('tsconfig.json: compilerOptions.strict must be true');
}

for (const flag of strictFlags) {
  if (compilerOptions[flag] === false) {
    violations.push(`tsconfig.json: compilerOptions.${flag} must not disable TypeScript strict mode`);
  }
}

const sourceFiles = (await Promise.all(sourceRoots.map(collectTypeScriptFiles))).flat().sort();

for (const absolutePath of sourceFiles) {
  const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
  const source = await fs.readFile(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, scriptKindFor(relativePath));

  checkForExplicitAny(sourceFile, relativePath);
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(`v2-type-safety-audit: PASS (${sourceFiles.length} TypeScript files scanned)`);
