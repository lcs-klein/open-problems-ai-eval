#!/usr/bin/env node
/**
 * Idempotent D1 database seeder for Open Problems in AI Evaluation.
 * Reads data/public/public_bundle.json and (if present) data/internal/internal_bundle.json,
 * splits public vs internal fields strictly, writes chunked SQL files, and applies via Wrangler.
 *
 * Usage:
 *   node scripts/seed_d1.mjs --local
 *   node scripts/seed_d1.mjs --remote
 *   node scripts/seed_d1.mjs --local --public-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const isRemote = args.has('--remote');
const publicOnly = args.has('--public-only');
const dryRun = args.has('--dry-run');

const root = process.cwd();
const workerDir = path.join(root, 'apps', 'worker');
const pubPath = path.join(root, 'data', 'public', 'public_bundle.json');
const intlPath = path.join(root, 'data', 'internal', 'internal_bundle.json');

if (!fs.existsSync(pubPath)) {
  console.error(`[seed_d1] Missing ${pubPath}. Run "npm run pipeline" first.`);
  process.exit(1);
}

const pub = JSON.parse(fs.readFileSync(pubPath, 'utf8'));
const hasInternal = !publicOnly && fs.existsSync(intlPath);
const intl = hasInternal ? JSON.parse(fs.readFileSync(intlPath, 'utf8')) : null;

function sqlStr(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sqlJson(val) {
  return sqlStr(JSON.stringify(val ?? null));
}

const now = new Date().toISOString();
const statements = [];

// 1. agenda_meta (public configuration & static audit blobs)
const metaKeys = [
  'schema_version',
  'taxonomy',
  'project',
  'categories',
  'rubric',
  'terminology_rules',
  'source_audit',
  'generation_method',
  'provenance_audit',
  'editorial_audit',
  'screening_alternatives',
  'screening_candidates',
  'screening_frontier',
  'manuscript_review',
  'generation_upstream',
  'openness_review',
  'reproduce_packages',
];

for (const key of metaKeys) {
  if (pub[key] !== undefined) {
    statements.push(
      `INSERT OR REPLACE INTO agenda_meta (key, value_json, updated_at) VALUES (${sqlStr(key)}, ${sqlJson(pub[key])}, ${sqlStr(now)});`
    );
  }
}

const currentVersion = pub.participation?.current_version || 'screening-2026-11-11-v1';
statements.push(
  `INSERT OR REPLACE INTO agenda_meta (key, value_json, updated_at) VALUES ('current_version', ${sqlJson(currentVersion)}, ${sqlStr(now)});`
);

// 2. open_problems (strict split of public_extra_json vs internal_extra_json)
const PUBLIC_CORE_KEYS = new Set([
  'id',
  'category',
  'title',
  'description',
  'scores',
  'paper_section_id',
  'manuscript_alignment',
  'lineage',
  'provenance',
  'governance',
  'terminology_alerts',
]);

const INTERNAL_PROBLEM_MAP = new Map();
if (intl?.open_problems) {
  for (const item of intl.open_problems) {
    INTERNAL_PROBLEM_MAP.set(item.id, item);
  }
}

pub.open_problems.forEach((p, idx) => {
  const pubExtra = {};
  for (const [k, v] of Object.entries(p)) {
    if (!PUBLIC_CORE_KEYS.has(k)) {
      pubExtra[k] = v;
    }
  }

  const intlItem = INTERNAL_PROBLEM_MAP.get(p.id);
  const intlExtra = {};
  if (intlItem) {
    const pubKeys = new Set(Object.keys(p));
    for (const [k, v] of Object.entries(intlItem)) {
      if (!PUBLIC_CORE_KEYS.has(k) && !pubKeys.has(k)) {
        intlExtra[k] = v;
      }
    }
  }

  statements.push(
    `INSERT OR REPLACE INTO open_problems (id, category, title, description, scores_json, paper_section_id, manuscript_alignment, status, lineage_json, provenance_json, governance_json, terminology_alerts_json, public_extra_json, internal_extra_json, sort_order, updated_at, updated_by) VALUES (` +
      `${sqlStr(p.id)}, ${sqlStr(p.category)}, ${sqlStr(p.title)}, ${sqlStr(p.description)}, ` +
      `${sqlJson(p.scores ?? [])}, ${sqlStr(p.paper_section_id ?? '')}, ${sqlStr(p.manuscript_alignment ?? 'aligned')}, 'active', ` +
      `${sqlJson(p.lineage ?? {})}, ${sqlJson(p.provenance ?? {})}, ${sqlJson(p.governance ?? {})}, ${sqlJson(p.terminology_alerts ?? [])}, ` +
      `${sqlJson(pubExtra)}, ${sqlJson(intlExtra)}, ${idx}, ${sqlStr(now)}, 'seed');`
  );
});

// 3. specific_challenges
const CHALLENGE_CORE_KEYS = new Set([
  'id',
  'title',
  'kind',
  'problem_ids',
  'status',
  'tractability',
  'first_milestone',
  'owners',
  'evidence',
]);

(pub.specific_challenges ?? []).forEach((c, idx) => {
  const extra = {};
  for (const [k, v] of Object.entries(c)) {
    if (!CHALLENGE_CORE_KEYS.has(k)) extra[k] = v;
  }
  statements.push(
    `INSERT OR REPLACE INTO specific_challenges (id, title, kind, problem_ids_json, status, tractability, first_milestone, owners_json, evidence_json, extra_json, is_active, sort_order, updated_at, updated_by) VALUES (` +
      `${sqlStr(c.id)}, ${sqlStr(c.title)}, ${sqlStr(c.kind ?? 'Challenge')}, ${sqlJson(c.problem_ids ?? [])}, ` +
      `${sqlStr(c.status ?? null)}, ${sqlStr(c.tractability ?? null)}, ${sqlStr(c.first_milestone ?? null)}, ` +
      `${sqlJson(c.owners ?? [])}, ${sqlJson(c.evidence ?? [])}, ${sqlJson(extra)}, 1, ${idx}, ${sqlStr(now)}, 'seed');`
  );
});

// 4. public_references
(pub.references ?? []).forEach((ref, idx) => {
  statements.push(
    `INSERT OR REPLACE INTO public_references (id, title, url, type, table2, extraction_counts_json, sort_order) VALUES (` +
      `${sqlStr(ref.id)}, ${sqlStr(ref.title)}, ${sqlStr(ref.url ?? null)}, ${sqlStr(ref.type ?? null)}, ${ref.table2 ? 1 : 0}, ${sqlJson(ref.extraction_counts ?? {})}, ${idx});`
  );
});

// 5. agenda_releases (initial frozen screening snapshot)
const releases = pub.participation?.releases ?? [];
const snapshots = pub.version_snapshots ?? {};
for (const rel of releases) {
  const snap = snapshots[rel.id] ?? { open_problems: pub.open_problems, specific_challenges: pub.specific_challenges };
  const problemIds = rel.problem_ids ?? pub.open_problems.map((p) => p.id);
  const isCurrent = rel.id === currentVersion ? 1 : 0;
  const pubAt = rel.date ? `${rel.date}T00:00:00.000Z` : now;
  statements.push(
    `INSERT OR REPLACE INTO agenda_releases (id, title, kind, summary, problem_ids_json, snapshot_json, is_current, published_by, published_by_name, published_at) VALUES (` +
      `${sqlStr(rel.id)}, ${sqlStr(rel.title ?? rel.id)}, ${sqlStr(rel.kind ?? 'screening')}, ${sqlStr(rel.summary ?? '')}, ` +
      `${sqlJson(problemIds)}, ${sqlJson(snap)}, ${isCurrent}, 'seed', 'Initial Pipeline Seed', ${sqlStr(pubAt)});`
  );
}

// 6. Unredacted internal corpus (strictly /api/internal/* only)
if (intl) {
  (intl.candidates ?? []).forEach((item, idx) => {
    statements.push(
      `INSERT OR REPLACE INTO internal_candidates (id, category, title, payload_json, sort_order) VALUES (` +
        `${sqlStr(item.id)}, ${sqlStr(item.category ?? 'F')}, ${sqlStr(item.title ?? '')}, ${sqlJson(item)}, ${idx});`
    );
  });

  (intl.originals ?? []).forEach((item, idx) => {
    statements.push(
      `INSERT OR REPLACE INTO internal_originals (id, legacy_id, title, payload_json, sort_order) VALUES (` +
        `${sqlStr(item.id)}, ${sqlStr(item.legacy_id ?? item.id)}, ${sqlStr(item.title ?? '')}, ${sqlJson(item)}, ${idx});`
    );
  });

  (intl.programme ?? []).forEach((item, idx) => {
    statements.push(
      `INSERT OR REPLACE INTO internal_programme (id, module, question, payload_json, sort_order) VALUES (` +
        `${sqlStr(item.id)}, ${sqlStr(item.module ?? null)}, ${sqlStr(item.question ?? '')}, ${sqlJson(item)}, ${idx});`
    );
  });

  (intl.literature ?? []).forEach((item, idx) => {
    statements.push(
      `INSERT OR REPLACE INTO internal_literature (id, source_id, title, question_zh, payload_json, sort_order) VALUES (` +
        `${sqlStr(item.id)}, ${sqlStr(item.source_id ?? null)}, ${sqlStr(item.title ?? null)}, ${sqlStr(item.question_zh ?? null)}, ${sqlJson(item)}, ${idx});`
    );
  });

  (intl.experts ?? []).forEach((item, idx) => {
    statements.push(
      `INSERT OR REPLACE INTO internal_experts (id, expert, wording, wording_en, payload_json, sort_order) VALUES (` +
        `${sqlStr(item.id)}, ${sqlStr(item.expert ?? '')}, ${sqlStr(item.wording ?? '')}, ${sqlStr(item.wording_en ?? null)}, ${sqlJson(item)}, ${idx});`
    );
  });

  if (intl.meta) {
    statements.push(
      `INSERT OR REPLACE INTO internal_meta (key, value_json) VALUES ('meta', ${sqlJson(intl.meta)});`
    );
  }
  if (intl.method) {
    statements.push(
      `INSERT OR REPLACE INTO internal_meta (key, value_json) VALUES ('method', ${sqlJson(intl.method)});`
    );
  }
}

// Split statements into ~200 KB chunks (no manual BEGIN/COMMIT for D1 compatibility)
const MAX_CHUNK_BYTES = 200_000;
const chunks = [];
let currentChunk = [];
let currentSize = 0;

for (const stmt of statements) {
  const bytes = Buffer.byteLength(stmt, 'utf8') + 1;
  if (currentChunk.length > 0 && currentSize + bytes > MAX_CHUNK_BYTES) {
    chunks.push(currentChunk.join('\n'));
    currentChunk = [];
    currentSize = 0;
  }
  currentChunk.push(stmt);
  currentSize += bytes;
}
if (currentChunk.length > 0) {
  chunks.push(currentChunk.join('\n'));
}

console.log(
  `[seed_d1] Prepared ${statements.length} SQL statements in ${chunks.length} chunk(s) ` +
    `(mode=${isRemote ? 'remote' : 'local'}, internal_corpus=${hasInternal ? 'included' : 'skipped'}).`
);

if (dryRun) {
  console.log('[seed_d1] Dry run complete.');
  process.exit(0);
}

const tempFiles = [];
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const wranglerFlag = isRemote ? '--remote' : '--local';

try {
  for (let i = 0; i < chunks.length; i++) {
    const tempFile = path.join(workerDir, `seed_chunk_${i + 1}.sql`);
    fs.writeFileSync(tempFile, chunks[i], 'utf8');
    tempFiles.push(tempFile);
    console.log(`[seed_d1] Executing chunk ${i + 1}/${chunks.length} (${(Buffer.byteLength(chunks[i]) / 1024).toFixed(1)} KB)...`);
    execFileSync(
      npxBin,
      ['wrangler', 'd1', 'execute', 'opae-db', wranglerFlag, `--file=${path.basename(tempFile)}`, '--yes'],
      {
        cwd: workerDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      }
    );
  }
  console.log('[seed_d1] Seed completed successfully.');
} finally {
  for (const f of tempFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}
