import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
import type { PublicBootstrapResponse } from '@opae/core';
import type { AppBindings } from './env';
import { createApp } from './index';
import { hashPassword } from './services/crypto';

/**
 * Lightweight D1Database adapter backed by Node 24's built-in node:sqlite
 * for deterministic, fast API integration testing.
 */
function createSqliteD1(sqlite: DatabaseSyncType): D1Database {
  const makeStatement = (sql: string, boundParams: unknown[] = []): D1PreparedStatement => {
    const stmtObj = {
      bind(...values: unknown[]) {
        return makeStatement(sql, values);
      },
      async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
        const prepared = sqlite.prepare(sql);
        const row = prepared.get(...(boundParams as never[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] ?? null) as T | null;
        return row as T;
      },
      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        const prepared = sqlite.prepare(sql);
        const results = prepared.all(...(boundParams as never[])) as T[];
        return {
          results,
          success: true,
          meta: {
            duration: 0,
            size_after: 0,
            rows_read: results.length,
            rows_written: 0,
            last_row_id: 0,
            changed_db: false,
            changes: 0,
          },
        };
      },
      async run(): Promise<D1Result<Record<string, unknown>>> {
        const prepared = sqlite.prepare(sql);
        const info = prepared.run(...(boundParams as never[]));
        return {
          results: [],
          success: true,
          meta: {
            duration: 0,
            size_after: 0,
            rows_read: 0,
            rows_written: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
            changed_db: Number(info.changes) > 0,
            changes: Number(info.changes),
          },
        };
      },
      async raw<T = unknown[]>(): Promise<T[]> {
        const prepared = sqlite.prepare(sql);
        const rows = prepared.all(...(boundParams as never[])) as Record<string, unknown>[];
        return rows.map((r) => Object.values(r)) as T[];
      },
      _sql: sql,
      _params: boundParams,
    };
    return stmtObj as unknown as D1PreparedStatement;
  };

  const db = {
    prepare(sql: string) {
      return makeStatement(sql, []);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN');
      try {
        const out: D1Result<T>[] = [];
        for (const st of statements) {
          const inner = st as unknown as { _sql: string; _params: unknown[] };
          const trimmed = inner._sql.trim().toUpperCase();
          if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
            out.push((await st.all()) as unknown as D1Result<T>);
          } else {
            out.push((await st.run()) as unknown as D1Result<T>);
          }
        }
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
  };

  return db as unknown as D1Database;
}

function extractCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0] || '';
}

describe('OPAE Worker API integration', () => {
  let sqlite: DatabaseSyncType;
  let env: AppBindings;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'apps/worker/migrations/0001_init.sql'),
      'utf8'
    );
    sqlite.exec(migrationSql);

    const db = createSqliteD1(sqlite);
    env = {
      DB: db,
      ENVIRONMENT: 'test',
      TURNSTILE_SECRET_KEY: '',
    };
    app = createApp();

    const now = new Date().toISOString();
    const adminPw = await hashPassword('AdminPass1234!');
    const modPw = await hashPassword('ModPass12345!');

    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, email, display_name, role, password_hash, password_salt, is_active, must_change_password, created_at)
           VALUES ('USR-ADMIN', 'admin@test.org', 'Lead Admin', 'admin', ?, ?, 1, 0, ?)`
        )
        .bind(adminPw.hashHex, adminPw.saltHex, now),
      db
        .prepare(
          `INSERT INTO users (id, email, display_name, role, password_hash, password_salt, is_active, must_change_password, created_at)
           VALUES ('USR-MOD', 'mod@test.org', 'Co-Author Mod', 'moderator', ?, ?, 1, 0, ?)`
        )
        .bind(modPw.hashHex, modPw.saltHex, now),
      db
        .prepare(
          `INSERT INTO agenda_meta (key, value_json, updated_at) VALUES ('terminology_rules', ?, ?)`
        )
        .bind(
          JSON.stringify([
            {
              id: 'TERM-1',
              locked_term: 'capabilities',
              disallowed_substitutes: ['skills'],
              severity: 'warning',
              paper_context: 'Section 1',
              rationale: 'Preserve manuscript wording',
            },
          ]),
          now
        ),
      db
        .prepare(
          `INSERT INTO agenda_meta (key, value_json, updated_at) VALUES ('current_version', '"v1"', ?)`
        )
        .bind(now),
      db
        .prepare(
          `INSERT INTO open_problems (
            id, category, title, description, scores_json, paper_section_id,
            manuscript_alignment, status, lineage_json, provenance_json,
            governance_json, terminology_alerts_json, public_extra_json,
            internal_extra_json, sort_order, updated_at
          ) VALUES (
            'C.F1a', 'F', 'Original Title', 'Original description of capabilities.',
            '[4,3,3,2,2]', '1.1', 'aligned', 'active',
            '{"what_changed":"Initial","why_changed":"Baseline","justification_status":"documented"}',
            '{"author_type":"human","proposer_name":"Authors","known_ai_role":"None"}',
            '{"status":"screening_recommendation","moderator_signoff":{"moderator_name":null,"decision_date":null,"notes":null}}',
            '[]', '{"reference_ids":["S001"]}', '{"expert_ids":["E01"],"notes":"内部中文批注绝不能公开"}', 0, ?
          )`
        )
        .bind(now),
      db
        .prepare(
          `INSERT INTO specific_challenges (
            id, title, kind, problem_ids_json, status, owners_json, evidence_json, extra_json, is_active, sort_order, updated_at
          ) VALUES ('SC.1', 'Benchmark Challenge', 'Empirical', '["C.F1a"]', 'Open for owners', '[]', '[]', '{}', 1, 0, ?)`
        )
        .bind(now),
      db
        .prepare(
          `INSERT INTO internal_experts (id, expert, wording, wording_en, payload_json, sort_order)
           VALUES ('E01', 'Expert A', '这是内部中文专家反馈', 'Internal feedback', '{"id":"E01","wording":"这是内部中文专家反馈"}', 0)`
        ),
    ]);
  });

  async function loginAs(email: string, password: string): Promise<string> {
    const res = await app.request(
      'https://example.workers.dev/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://example.workers.dev',
        },
        body: JSON.stringify({ email, password }),
      },
      env
    );
    expect(res.status).toBe(200);
    return extractCookie(res);
  }

  it('blocks unauthenticated access to internal corpus and admin endpoints', async () => {
    const r1 = await app.request('https://example.workers.dev/api/internal/crosswalk', {}, env);
    const r2 = await app.request('https://example.workers.dev/api/internal/sources?kind=experts', {}, env);
    const r3 = await app.request('https://example.workers.dev/api/admin/queue', {}, env);
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r3.status).toBe(401);
  });

  it('never leaks internal_extra_json or pending submissions into /api/public/bootstrap', async () => {
    // Submit a pending proposal and pending review
    const pRes = await app.request(
      'https://example.workers.dev/api/public/proposals',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstile_token: 'dev-turnstile-bypass',
          proposal_type: 'revise',
          target_problem_ids: ['C.F1a'],
          category: 'F',
          proposed_title: 'Revised Title via Community',
          proposed_description: 'Clarifies capabilities framing for evaluation.',
          what_changed: 'Refines title',
          why_changed: 'Improves conceptual clarity across all evaluation regimes.',
          is_original_synthesis: true,
          coi_statement: 'None declared',
          proposer_name: 'Dr. External',
        }),
      },
      env
    );
    expect(pRes.status).toBe(201);

    const revRes = await app.request(
      'https://example.workers.dev/api/public/reviews',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstile_token: 'dev-turnstile-bypass',
          target_id: 'C.F1a',
          reviewer_name: 'Reviewer X',
          stance: 'support',
          summary: 'Strong problem framing with clear empirical boundaries.',
        }),
      },
      env
    );
    expect(revRes.status).toBe(201);

    // Fetch public bootstrap: must NOT include pending items or internal CJK notes
    const bootRes = await app.request('https://example.workers.dev/api/public/bootstrap', {}, env);
    expect(bootRes.status).toBe(200);
    const rawText = await bootRes.text();
    expect(rawText).not.toContain('内部中文批注');
    expect(rawText).not.toContain('expert_ids');
    expect(rawText).not.toContain('Revised Title via Community');
    expect(rawText).not.toContain('Reviewer X');
  });

  it('allows moderator to approve reviews & one-click publish proposals live, while blocking admin-only routes', async () => {
    // Community submits a revise proposal and a peer review
    const pRes = await app.request(
      'https://example.workers.dev/api/public/proposals',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstile_token: 'dev-turnstile-bypass',
          proposal_type: 'revise',
          target_problem_ids: ['C.F1a'],
          category: 'F',
          proposed_title: 'Published Community Revision',
          proposed_description: 'Updated description preserving capabilities terminology.',
          what_changed: 'Updated title & description',
          why_changed: 'Addresses scope ambiguity identified in peer discussion.',
          is_original_synthesis: true,
          coi_statement: 'None declared',
          proposer_name: 'Dr. Jane',
        }),
      },
      env
    );
    const { id: propId } = (await pRes.json()) as { id: string };

    const rRes = await app.request(
      'https://example.workers.dev/api/public/reviews',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstile_token: 'dev-turnstile-bypass',
          target_id: 'C.F1a',
          reviewer_name: 'Prof. Smith',
          stance: 'revise',
          summary: 'Recommend tightening operational definition.',
        }),
      },
      env
    );
    const { id: revId } = (await rRes.json()) as { id: string };

    const modCookie = await loginAs('mod@test.org', 'ModPass12345!');

    // Moderator can read internal unredacted experts
    const expRes = await app.request(
      'https://example.workers.dev/api/internal/sources?kind=experts',
      { headers: { Cookie: modCookie } },
      env
    );
    expect(expRes.status).toBe(200);
    expect(await expRes.text()).toContain('这是内部中文专家反馈');

    // Moderator approves peer review
    const modRev = await app.request(
      `https://example.workers.dev/api/admin/reviews/${revId}/moderate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: modCookie,
          Origin: 'https://example.workers.dev',
        },
        body: JSON.stringify({ status: 'approved', notes: 'Constructive feedback' }),
      },
      env
    );
    expect(modRev.status).toBe(200);

    // Moderator one-click publishes proposal
    const pubProp = await app.request(
      `https://example.workers.dev/api/admin/proposals/${propId}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: modCookie,
          Origin: 'https://example.workers.dev',
        },
        body: JSON.stringify({
          rationale: 'Consensus reached among co-authors to adopt clearer phrasing.',
          scores: [4, 4, 3, 3, 3],
        }),
      },
      env
    );
    expect(pubProp.status).toBe(200);

    // Public bootstrap IMMEDIATELY reflects the published Open Problem, Decision, and Review
    const bootRes = await app.request('https://example.workers.dev/api/public/bootstrap', {}, env);
    const boot = (await bootRes.json()) as PublicBootstrapResponse;
    expect(boot.bundle.open_problems[0].title).toBe('Published Community Revision');
    expect(boot.bundle.open_problems[0].scores).toEqual([4, 4, 3, 3, 3]);
    expect(boot.bundle.open_problems[0].governance.status).toBe('moderator_approved');
    expect(boot.bundle.participation.reviews.length).toBe(1);
    expect(boot.bundle.participation.decisions.length).toBe(1);
    expect(boot.bundle.participation.decisions[0].moderator_name).toBe('Co-Author Mod');

    // Moderator is forbidden from admin-only endpoints (users, rollback, hard delete)
    const usersDenied = await app.request(
      'https://example.workers.dev/api/admin/users',
      { headers: { Cookie: modCookie } },
      env
    );
    expect(usersDenied.status).toBe(403);
  });

  it('supports release snapshot freezing and admin-only rollback', async () => {
    const adminCookie = await loginAs('admin@test.org', 'AdminPass1234!');

    // Freeze baseline release v1.0
    const freezeRes = await app.request(
      'https://example.workers.dev/api/admin/releases',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'https://example.workers.dev',
        },
        body: JSON.stringify({
          id: 'consensus-v1.0',
          title: 'Initial Consensus',
          summary: 'Frozen baseline',
        }),
      },
      env
    );
    expect(freezeRes.status).toBe(201);

    // Edit C.F1a directly
    const editRes = await app.request(
      'https://example.workers.dev/api/admin/problems/C.F1a',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'https://example.workers.dev',
        },
        body: JSON.stringify({
          title: 'Temporary Experimental Title',
          why_changed: 'Testing edit before rollback.',
        }),
      },
      env
    );
    expect(editRes.status).toBe(200);

    // Rollback to consensus-v1.0
    const rbRes = await app.request(
      'https://example.workers.dev/api/admin/releases/consensus-v1.0/rollback',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Origin: 'https://example.workers.dev',
        },
        body: JSON.stringify({ reason: 'Restore stable baseline' }),
      },
      env
    );
    expect(rbRes.status).toBe(200);

    const bootRes = await app.request('https://example.workers.dev/api/public/bootstrap', {}, env);
    const boot = (await bootRes.json()) as PublicBootstrapResponse;
    expect(boot.bundle.open_problems[0].title).toBe('Original Title');
  });
});
