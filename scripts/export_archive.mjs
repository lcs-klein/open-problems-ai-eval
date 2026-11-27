#!/usr/bin/env node
/**
 * On-demand offline archive exporter for academic supplements / Zenodo / GitHub Releases.
 *
 * Usage:
 *   node scripts/export_archive.mjs --from-api https://open-problems-ai-eval.<subdomain>.workers.dev
 *   node scripts/export_archive.mjs --from-local
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const apiIdx = argv.indexOf('--from-api');
const apiBase = apiIdx >= 0 ? (argv[apiIdx + 1] || '').replace(/\/$/, '') : '';

const outDir = path.join(process.cwd(), 'dist', 'archive');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  let payload;
  if (apiBase) {
    const res = await fetch(`${apiBase}/api/public/bootstrap`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${apiBase}/api/public/bootstrap (HTTP ${res.status})`);
    }
    payload = await res.json();
  } else {
    const pubPath = path.join(process.cwd(), 'data', 'public', 'public_bundle.json');
    if (!fs.existsSync(pubPath)) {
      throw new Error(`Missing ${pubPath}`);
    }
    const bundle = JSON.parse(fs.readFileSync(pubPath, 'utf8'));
    payload = { bundle, releases: bundle.participation?.releases ?? [], updated_at: new Date().toISOString() };
  }

  const version = payload.bundle?.participation?.current_version || 'snapshot';
  const safeVer = String(version).replace(/[^A-Za-z0-9._-]/g, '_');
  const outFile = path.join(outDir, `agenda-archive-${safeVer}.json`);
  const serialized = JSON.stringify(payload, null, 2);
  fs.writeFileSync(outFile, serialized, 'utf8');

  const sha256 = crypto.createHash('sha256').update(serialized).digest('hex');
  fs.writeFileSync(`${outFile}.sha256`, `${sha256}  ${path.basename(outFile)}\n`, 'utf8');

  console.log(`[export_archive] Exported ${outFile} (${(serialized.length / 1024).toFixed(1)} KB)`);
  console.log(`[export_archive] SHA-256: ${sha256}`);
}

main().catch((err) => {
  console.error('[export_archive] ERROR:', err.message);
  process.exit(1);
});
