import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicOnly = process.argv.includes('--public-only');
const zhCatalogPath = path.join(root, 'packages', 'ui', 'src', 'zhCatalog.json');

const pubHtmlPath = path.join(root, 'dist', 'public', 'index.html');
const intHtmlPath = path.join(
  root,
  'dist',
  'internal',
  'General_Problems_Explorer_INTERNAL.html'
);

const errors = [];

const requiredPaths = [
  pubHtmlPath,
  path.join(root, 'dist', 'public', 'reproduce', 'generation_upstream_replay.zip'),
  path.join(root, 'dist', 'public', 'reproduce', 'generation_method_replay.zip'),
];
if (!publicOnly) {
  requiredPaths.push(intHtmlPath);
}

for (const p of requiredPaths) {
  if (!fs.existsSync(p)) {
    errors.push(`Missing expected artifact: ${p}`);
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

if (fs.existsSync(pubHtmlPath)) {
  const pubHtml = fs.readFileSync(pubHtmlPath, 'utf8');
  if (!pubHtml.includes('Content-Security-Policy')) {
    errors.push('Public HTML missing Content-Security-Policy meta tag.');
  }
  if (/<script[^>]+src=["']https?:\/\//i.test(pubHtml)) {
    errors.push('Public HTML contains external <script src="http..."> dependency.');
  }
  if (/<link[^>]+href=["']https?:\/\//i.test(pubHtml)) {
    errors.push('Public HTML contains external <link href="http..."> dependency.');
  }

  const unauthorizedCjk = [];
  for (const match of pubHtml.matchAll(/[\u4e00-\u9fff]+/g)) {
    if (!allowedCjkRuns.has(match[0])) {
      unauthorizedCjk.push(match[0]);
      if (unauthorizedCjk.length >= 5) break;
    }
  }
  if (unauthorizedCjk.length > 0) {
    errors.push(
      `Sanitization leak in dist/public/index.html: unauthorized CJK text outside zhCatalog.json (${unauthorizedCjk.join(', ')})`
    );
  }

  const forbiddenPatterns = [
    { label: 'Windows local user path', rx: /[A-Za-z]:\\{1,2}Users\\{1,2}/i },
    { label: 'macOS local user path', rx: /\/Users\/[^/\s"']+\// },
    { label: 'Linux local user path', rx: /\/home\/[^/\s"']+\// },
    { label: 'Internal explorer identifier', rx: /General_Problems_Explorer_INTERNAL/ },
    { label: 'Internal expert feedback marker', rx: /Direct expert feedback,\s*internal/i },
  ];

  for (const { label, rx } of forbiddenPatterns) {
    if (rx.test(pubHtml)) {
      errors.push(`Sanitization leak in dist/public/index.html: matched ${label}`);
    }
  }
}

if (!publicOnly && fs.existsSync(intHtmlPath)) {
  const intHtml = fs.readFileSync(intHtmlPath, 'utf8');
  if (!intHtml.includes('Content-Security-Policy')) {
    errors.push('Internal HTML missing Content-Security-Policy meta tag.');
  }
}

if (errors.length > 0) {
  console.error('[verify_dist] FAILED:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

const pubKb = (fs.statSync(pubHtmlPath).size / 1024).toFixed(1);
if (publicOnly) {
  console.log(
    `[verify_dist] PASSED (public-only) — Public standalone HTML (${pubKb} KB) + reproduce/*.zip verified (${allowedCjkRuns.size} allowlisted UI CJK tokens).`
  );
} else {
  const intKb = (fs.statSync(intHtmlPath).size / 1024).toFixed(1);
  console.log(
    `[verify_dist] PASSED — Public standalone HTML (${pubKb} KB) + Internal standalone HTML (${intKb} KB) + reproduce/*.zip verified (${allowedCjkRuns.size} allowlisted UI CJK tokens).`
  );
}
