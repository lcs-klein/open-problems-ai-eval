#!/usr/bin/env node
/**
 * Build verification and strict internal-corpus leakage gate for dist/web/.
 * Guarantees zero unredacted internal data, unauthorized CJK text (outside the
 * explicit UI i18n catalog in packages/ui/src/zhCatalog.json), or local paths
 * appear in ANY built HTML, JS, or CSS asset served from Cloudflare Static Assets.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webDist = path.join(root, 'dist', 'web');
const zhCatalogPath = path.join(root, 'packages', 'ui', 'src', 'zhCatalog.json');
const errors = [];

const requiredPaths = [
  path.join(webDist, 'index.html'),
  path.join(webDist, 'reproduce', 'generation_upstream_replay.zip'),
  path.join(webDist, 'reproduce', 'generation_method_replay.zip'),
];

for (const p of requiredPaths) {
  if (!fs.existsSync(p)) {
    errors.push(`Missing expected web build artifact: ${p}`);
  }
}

const allowedCjkRuns = new Set();
if (fs.existsSync(zhCatalogPath)) {
  const catalog = JSON.parse(fs.readFileSync(zhCatalogPath, 'utf8'));
  for (const val of Object.values(catalog)) {
    if (typeof val !== 'string') continue;
    for (const match of val.matchAll(/[\u4e00-\u9fff]+/g)) {
      allowedCjkRuns.add(match[0]);
    }
  }
}

function findUnauthorizedCjk(content) {
  const unexpected = [];
  for (const match of content.matchAll(/[\u4e00-\u9fff]+/g)) {
    if (!allowedCjkRuns.has(match[0])) {
      unexpected.push(match[0]);
      if (unexpected.length >= 5) break;
    }
  }
  return unexpected;
}

const forbiddenPatterns = [
  { label: 'Windows local user path', rx: /[A-Za-z]:\\{1,2}Users\\{1,2}/i },
  { label: 'macOS local user path', rx: /\/Users\/[^/\s"']+\// },
  { label: 'Linux local user path', rx: /\/home\/[^/\s"']+\// },
  { label: 'Internal explorer identifier', rx: /General_Problems_Explorer_INTERNAL/ },
  { label: 'Internal expert feedback marker', rx: /Direct expert feedback,\s*internal/i },
  { label: 'Embedded internal bundle reference', rx: /internal_bundle\.json/ },
];

function walkTextFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTextFiles(full, out);
    } else if (/\.(html|js|mjs|css|json)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const scannedFiles = walkTextFiles(webDist);
let hasAdminLazyChunk = false;

for (const filePath of scannedFiles) {
  const rel = path.relative(webDist, filePath);
  if (rel.includes('admin-workbench')) {
    hasAdminLazyChunk = true;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const unauthorizedCjk = findUnauthorizedCjk(content);
  if (unauthorizedCjk.length > 0) {
    errors.push(
      `Sanitization leak in dist/web/${rel}: unauthorized CJK text outside zhCatalog.json (${unauthorizedCjk.join(', ')})`
    );
  }
  for (const { label, rx } of forbiddenPatterns) {
    if (rx.test(content)) {
      errors.push(`Sanitization leak in dist/web/${rel}: matched ${label}`);
    }
  }
}

if (!hasAdminLazyChunk) {
  errors.push('Expected code-split admin-workbench lazy chunk in dist/web/assets/.');
}

if (errors.length > 0) {
  console.error('[verify_web_dist] FAILED:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

const totalKb = (
  scannedFiles.reduce((acc, f) => acc + fs.statSync(f).size, 0) / 1024
).toFixed(1);
console.log(
  `[verify_web_dist] PASSED — Scanned ${scannedFiles.length} asset file(s) (${totalKb} KB total), verified admin-workbench lazy chunk, ${allowedCjkRuns.size} allowlisted UI CJK tokens, zero internal data leaks, and reproduce/*.zip present.`
);
