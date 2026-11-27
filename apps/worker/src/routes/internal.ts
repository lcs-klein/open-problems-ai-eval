import { Hono } from 'hono';
import type {
  CategoryCode,
  ExpertItem,
  InternalCrosswalkResponse,
  InternalSourcesResponse,
  OpenProblem,
  OriginalItem,
  RubricDimension,
  TerminologyRule,
} from '@opae/core';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import {
  mapChallenge,
  mapInternalOpenProblem,
  parseJson,
  type OpenProblemRow,
  type SpecificChallengeRow,
} from '../services/mappers';

export const internalRoutes = new Hono<AppEnv>();

// Every /api/internal/* endpoint strictly requires an authenticated session.
internalRoutes.use('*', requireAuth);

internalRoutes.get('/crosswalk', async (c) => {
  const db = c.env.DB;
  const [
    agendaMetaRes,
    internalMetaRes,
    problemsRes,
    challengesRes,
    candidatesRes,
    originalsRes,
    expertsRes,
    progCountRes,
    litCountRes,
  ] = await db.batch([
    db.prepare(
      "SELECT key, value_json FROM agenda_meta WHERE key IN ('schema_version', 'taxonomy', 'categories', 'rubric', 'terminology_rules')"
    ),
    db.prepare('SELECT key, value_json FROM internal_meta'),
    db.prepare(
      `SELECT id, category, title, description, scores_json, paper_section_id,
              manuscript_alignment, status, lineage_json, provenance_json,
              governance_json, terminology_alerts_json, public_extra_json,
              internal_extra_json, sort_order, updated_at, updated_by
       FROM open_problems
       ORDER BY sort_order ASC, id ASC`
    ),
    db.prepare(
      `SELECT id, title, kind, problem_ids_json, status, tractability,
              first_milestone, owners_json, evidence_json, extra_json,
              is_active, sort_order, updated_at
       FROM specific_challenges
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    ),
    db.prepare('SELECT payload_json FROM internal_candidates ORDER BY sort_order ASC, id ASC'),
    db.prepare('SELECT payload_json FROM internal_originals ORDER BY sort_order ASC, id ASC'),
    db.prepare('SELECT payload_json FROM internal_experts ORDER BY sort_order ASC, id ASC'),
    db.prepare('SELECT COUNT(*) AS cnt FROM internal_programme'),
    db.prepare('SELECT COUNT(*) AS cnt FROM internal_literature'),
  ]);

  const agendaMeta: Record<string, unknown> = {};
  for (const row of (agendaMetaRes.results || []) as Array<{ key: string; value_json: string }>) {
    agendaMeta[row.key] = parseJson(row.value_json, null);
  }
  const internalMeta: Record<string, unknown> = {};
  for (const row of (internalMetaRes.results || []) as Array<{ key: string; value_json: string }>) {
    internalMeta[row.key] = parseJson(row.value_json, null);
  }

  const allProblems = (problemsRes.results || []) as unknown as OpenProblemRow[];
  const activeProblems = allProblems
    .filter((r) => r.status === 'active')
    .map(mapInternalOpenProblem);
  const retiredProblems = allProblems
    .filter((r) => r.status === 'retired')
    .map(mapInternalOpenProblem);

  const specificChallenges = (
    (challengesRes.results || []) as unknown as SpecificChallengeRow[]
  ).map(mapChallenge);

  const candidates = ((candidatesRes.results || []) as Array<{ payload_json: string }>).map((r) =>
    parseJson<OpenProblem>(r.payload_json, {} as OpenProblem)
  );
  const originals = ((originalsRes.results || []) as Array<{ payload_json: string }>).map((r) =>
    parseJson<OriginalItem>(r.payload_json, {} as OriginalItem)
  );
  const experts = ((expertsRes.results || []) as Array<{ payload_json: string }>).map((r) =>
    parseJson<ExpertItem>(r.payload_json, {} as ExpertItem)
  );

  const progCount = Number(
    ((progCountRes.results || [])[0] as { cnt?: number } | undefined)?.cnt ?? 0
  );
  const litCount = Number(
    ((litCountRes.results || [])[0] as { cnt?: number } | undefined)?.cnt ?? 0
  );

  c.header('Cache-Control', 'no-store');
  const payload: InternalCrosswalkResponse = {
    bundle: {
      schema_version: Number(agendaMeta.schema_version ?? 2),
      taxonomy: (agendaMeta.taxonomy as InternalCrosswalkResponse['bundle']['taxonomy']) ?? {
        tier1_label: 'Fixed Categories',
        tier2_label: 'Open Problems',
        tier3_label: 'Specific Challenges',
      },
      meta: (internalMeta.meta as Record<string, unknown>) ?? {},
      categories: (agendaMeta.categories as Record<CategoryCode, string>) ?? {
        F: 'Foundations',
        T: 'Testing & Elicitation',
        V: 'Validity & Robustness',
        D: 'Deployment & Drift',
        L: 'Lifecycle & Reproducibility',
        I: 'Institutions & Incentives',
        P: 'Policy & Priorities',
      },
      rubric: (agendaMeta.rubric as RubricDimension[]) ?? [],
      terminology_rules: (agendaMeta.terminology_rules as TerminologyRule[]) ?? [],
      open_problems: activeProblems,
      retired_problems: retiredProblems,
      specific_challenges: specificChallenges,
      candidates,
      originals,
      experts,
      method: (internalMeta.method as Record<string, unknown>) ?? {},
      programme_count: progCount,
      literature_count: litCount,
    },
  };

  return c.json(payload);
});

internalRoutes.get('/sources', async (c) => {
  const kind = (c.req.query('kind') || 'experts') as InternalSourcesResponse['kind'];
  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || '80')));
  const offset = Math.max(0, Number(c.req.query('offset') || '0'));

  if (!['experts', 'originals', 'programme', 'literature'].includes(kind)) {
    return c.json({ error: 'Invalid source kind.' }, 400);
  }

  const db = c.env.DB;
  const like = `%${q}%`;
  let countStmt: D1PreparedStatement;
  let rowsStmt: D1PreparedStatement;

  if (kind === 'experts') {
    if (q) {
      countStmt = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM internal_experts
           WHERE id LIKE ? OR expert LIKE ? OR wording LIKE ? OR wording_en LIKE ? OR payload_json LIKE ?`
        )
        .bind(like, like, like, like, like);
      rowsStmt = db
        .prepare(
          `SELECT payload_json FROM internal_experts
           WHERE id LIKE ? OR expert LIKE ? OR wording LIKE ? OR wording_en LIKE ? OR payload_json LIKE ?
           ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`
        )
        .bind(like, like, like, like, like, limit, offset);
    } else {
      countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM internal_experts');
      rowsStmt = db
        .prepare('SELECT payload_json FROM internal_experts ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?')
        .bind(limit, offset);
    }
  } else if (kind === 'originals') {
    if (q) {
      countStmt = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM internal_originals
           WHERE id LIKE ? OR legacy_id LIKE ? OR title LIKE ? OR payload_json LIKE ?`
        )
        .bind(like, like, like, like);
      rowsStmt = db
        .prepare(
          `SELECT payload_json FROM internal_originals
           WHERE id LIKE ? OR legacy_id LIKE ? OR title LIKE ? OR payload_json LIKE ?
           ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`
        )
        .bind(like, like, like, like, limit, offset);
    } else {
      countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM internal_originals');
      rowsStmt = db
        .prepare('SELECT payload_json FROM internal_originals ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?')
        .bind(limit, offset);
    }
  } else if (kind === 'programme') {
    if (q) {
      countStmt = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM internal_programme
           WHERE id LIKE ? OR module LIKE ? OR question LIKE ? OR payload_json LIKE ?`
        )
        .bind(like, like, like, like);
      rowsStmt = db
        .prepare(
          `SELECT payload_json FROM internal_programme
           WHERE id LIKE ? OR module LIKE ? OR question LIKE ? OR payload_json LIKE ?
           ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`
        )
        .bind(like, like, like, like, limit, offset);
    } else {
      countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM internal_programme');
      rowsStmt = db
        .prepare('SELECT payload_json FROM internal_programme ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?')
        .bind(limit, offset);
    }
  } else {
    if (q) {
      countStmt = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM internal_literature
           WHERE id LIKE ? OR source_id LIKE ? OR title LIKE ? OR question_zh LIKE ? OR payload_json LIKE ?`
        )
        .bind(like, like, like, like, like);
      rowsStmt = db
        .prepare(
          `SELECT payload_json FROM internal_literature
           WHERE id LIKE ? OR source_id LIKE ? OR title LIKE ? OR question_zh LIKE ? OR payload_json LIKE ?
           ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`
        )
        .bind(like, like, like, like, like, limit, offset);
    } else {
      countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM internal_literature');
      rowsStmt = db
        .prepare('SELECT payload_json FROM internal_literature ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?')
        .bind(limit, offset);
    }
  }

  const [countRes, rowsRes] = await db.batch([countStmt, rowsStmt]);
  const total = Number(((countRes.results || [])[0] as { cnt?: number } | undefined)?.cnt ?? 0);
  const items = ((rowsRes.results || []) as Array<{ payload_json: string }>).map((r) =>
    parseJson(r.payload_json, {})
  );

  c.header('Cache-Control', 'no-store');
  const response: InternalSourcesResponse = {
    kind,
    total,
    limit,
    offset,
    items,
  };
  return c.json(response);
});
