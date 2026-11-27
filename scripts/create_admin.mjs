#!/usr/bin/env node
/**
 * Bootstrap or reset an admin/moderator account in local or remote D1.
 * Uses identical PBKDF2-SHA256 (100,000 iterations) parameters as apps/worker/src/services/crypto.ts.
 *
 * Usage:
 *   node scripts/create_admin.mjs --local --email admin@example.org --name "Lead Moderator"
 *   node scripts/create_admin.mjs --remote --email admin@example.org --name "Lead Moderator" --password "..."
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

function parseArgs(argv) {
  const result = {
    remote: false,
    email: process.env.OPAE_ADMIN_EMAIL || '',
    name: process.env.OPAE_ADMIN_NAME || 'Lead Moderator',
    role: 'admin',
    password: process.env.OPAE_ADMIN_PASSWORD || '',
    mustChange: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--remote') result.remote = true;
    else if (arg === '--local') result.remote = false;
    else if (arg === '--email') result.email = argv[++i] || '';
    else if (arg === '--name') result.name = argv[++i] || result.name;
    else if (arg === '--role') result.role = argv[++i] || 'admin';
    else if (arg === '--password') result.password = argv[++i] || '';
    else if (arg === '--must-change') result.mustChange = true;
  }
  return result;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.email || !opts.email.includes('@')) {
  console.error('Usage: node scripts/create_admin.mjs [--local|--remote] --email <email> --name "<name>" [--password "<pw>"]');
  process.exit(1);
}
if (!['admin', 'moderator'].includes(opts.role)) {
  console.error('Role must be "admin" or "moderator".');
  process.exit(1);
}

let generatedPassword = false;
if (!opts.password) {
  opts.password = crypto.randomBytes(15).toString('base64url');
  opts.mustChange = true;
  generatedPassword = true;
}

if (opts.password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

const saltBytes = crypto.randomBytes(16);
const saltHex = saltBytes.toString('hex');
const derived = crypto.pbkdf2Sync(opts.password, saltBytes, 100_000, 32, 'sha256');
const hashHex = derived.toString('hex');

const userId = `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const now = new Date().toISOString();
const sqlStr = (v) => `'${String(v).replace(/'/g, "''")}'`;

const sql = `
INSERT INTO users (id, email, display_name, role, password_hash, password_salt, is_active, must_change_password, created_at, created_by)
VALUES (${sqlStr(userId)}, ${sqlStr(opts.email.trim().toLowerCase())}, ${sqlStr(opts.name.trim())}, ${sqlStr(opts.role)}, ${sqlStr(hashHex)}, ${sqlStr(saltHex)}, 1, ${opts.mustChange ? 1 : 0}, ${sqlStr(now)}, 'cli_bootstrap')
ON CONFLICT(email) DO UPDATE SET
  display_name = excluded.display_name,
  role = excluded.role,
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  is_active = 1,
  must_change_password = excluded.must_change_password;
`;

const workerDir = path.join(process.cwd(), 'apps', 'worker');
const tempFile = path.join(workerDir, `seed_admin_${Date.now()}.sql`);
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

try {
  fs.writeFileSync(tempFile, sql, 'utf8');
  execFileSync(
    npxBin,
    ['wrangler', 'd1', 'execute', 'opae-db', opts.remote ? '--remote' : '--local', `--file=${path.basename(tempFile)}`, '--yes'],
    {
      cwd: workerDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  );
  console.log(`\n[create_admin] Account ready (${opts.remote ? 'remote' : 'local'}):`);
  console.log(`  Email: ${opts.email.trim().toLowerCase()}`);
  console.log(`  Name:  ${opts.name.trim()}`);
  console.log(`  Role:  ${opts.role}`);
  if (generatedPassword) {
    console.log(`  Initial password (save now, change on first login): ${opts.password}`);
  }
} finally {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
}
