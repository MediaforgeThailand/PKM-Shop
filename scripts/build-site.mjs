// Combined site build for the single Vercel deployment behind mira.mediaforge.co.
//
// Output layout (dist/):
//   /                -> Astro marketing landing page (website/)
//   /showcase, ...   -> Expo web showcase app (app/), mounted under the
//                       "/showcase" base URL (expo.experiments.baseUrl in app.json)
//
// Steps:
//   1. Export the Expo web app straight into dist/showcase.
//   2. Build the Astro marketing site into website/dist.
//   3. Merge the Astro output into the dist root, leaving dist/showcase intact.
//
// Runs on both Vercel (Linux) and Windows, so everything stays in Node APIs.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repoRoot, 'dist');
const showcaseDist = path.join(dist, 'showcase');
const websiteDir = path.join(repoRoot, 'website');
const websiteDist = path.join(websiteDir, 'dist');

function run(cmd, cwd) {
  console.log(`\n[build-site] $ ${cmd}  (cwd: ${path.relative(repoRoot, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

console.log('[build-site] cleaning dist/');
rmSync(dist, { recursive: true, force: true });

// 1. Expo web export -> dist/showcase (base URL "/showcase" comes from app.json)
run('npx expo export --platform web --output-dir dist/showcase', repoRoot);
if (!existsSync(showcaseDist)) {
  throw new Error('[build-site] expo export did not produce dist/showcase');
}

// 2. Astro marketing site -> website/dist
run('npm ci --no-audit --no-fund', websiteDir);
run('npm run build', websiteDir);
if (!existsSync(websiteDist)) {
  throw new Error('[build-site] astro build did not produce website/dist');
}

// 3. Merge Astro output into the dist root (dist/showcase is preserved)
console.log('[build-site] merging website/dist -> dist/');
cpSync(websiteDist, dist, { recursive: true });

console.log('[build-site] done: landing at /, showcase at /showcase');
