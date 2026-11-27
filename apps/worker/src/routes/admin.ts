import { Hono } from 'hono';
import {
  checkPublicSafe,
  checkTerminology,
  type AdminUserRecord,
  type AuditLogEntry,
  type CategoryCode,
  type GovernanceStatus,
  type ModerationQueueResponse,
  type PublishProposalRequest,
  type UserRole,
} from '@opae/core';
import type { AppEnv } from '../env';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { generateId, generateRandomPassword, hashPassword } from '../services/crypto';
import {
  buildAuditInsert,
  loadTerminologyRules,
  mapDecision,
  mapPeerReview,
  mapProposal,
  mapPublicOpenProblem,
  mapRelease,
  type CollectiveDecisionRow,
  type OpenProblemRow,
  type PeerReviewRow,
  type ProposalRow,
  type ReleaseRow,
} from '../services/mappers';
import {
  buildLiveSnapshotPayload,
  extractSnapshotProblems,
  PublishError,
  publishProposalTransaction,
} from '../services/publish';

export const adminRoutes = new Hono<AppEnv>();

// All /api/admin/* endpoints require authentication
adminRoutes.use('*', requireAuth);

// --- 1. Moderation Queue ---
adminRoutes.get('/queue', async (c) => {
  const db = c.env.DB;
  const [propRes, revRes, decRes] = await db.batch([
    db.prepare('SELECT * FROM proposals ORDER BY CASE moderation_status WHEN \'pending\' THEN 0 ELSE 1 END, created_at DESC LIMIT 200'),
    db.prepare('SELECT * FROM peer_reviews ORDER BY CASE moderation_status WHEN \'pending\' THEN 0 ELSE 1 END, created_at DESC LIMIT 200'),
    db.prepare('SELECT * FROM collective_decisions ORDER BY decided_at DESC LIMIT 200'),
  ]);

  const proposals = ((propRes.results || []) as unknown as ProposalRow[]).map(mapProposal);
  const reviews = ((revRes.results || []) as unknown as PeerReviewRow[]).map(mapPeerReview);
  const decisions = ((decRes.results || []) as unknown as CollectiveDecisionRow[]).map(mapDecision);

  const response: ModerationQueueResponse = {
    counts: {
      pending_proposals: proposals.filter((p) => p.moderation_status === 'pending').length,
      pending_reviews: reviews.filter((r) => r.moderation_status === 'pending').length,
      total_proposals: proposals.length,
      total_reviews: reviews.length,
    },
    proposals,
    reviews,
    decisions,
  };

  c.header('Cache-Control', 'no-store');
  return c.json(response);
});

// One-click approve & publish proposal (moderator + admin)
adminRoutes.post('/proposals/:id/publish', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as PublishProposalRequest | null;
  if (!body) return c.json({ error: 'Invalid JSON request body.' }, 400);

  const row = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?')
    .bind(id)
    .first<ProposalRow>();
  if (!row) return c.json({ error: `Proposal ${id} not found.` }, 404);

  const rules = await loadTerminologyRules(c.env.DB);
  try {
    const result = await publishProposalTransaction(
      c.env.DB,
      mapProposal(row),
      body,
      user,
      rules
    );
    return c.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof PublishError) {
      return c.json(
        { error: err.message, warnings: err.warnings },
        err.status as 400 | 404 | 409
      );
    }
    throw err;
  }
});

// Defer, reject, or mark spam (moderator + admin)
adminRoutes.post('/proposals/:id/decide', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as {
    status?: 'rejected' | 'deferred' | 'spam';
    rationale?: string;
    minority_dissent?: string;
    record_public_decision?: boolean;
  } | null;

  const nextStatus = body?.status;
  if (!nextStatus || !['rejected', 'deferred', 'spam'].includes(nextStatus)) {
    return c.json({ error: 'status must be rejected, deferred, or spam.' }, 400);
  }
  const rationale = (body?.rationale || '').trim();
  if (nextStatus !== 'spam' && rationale.length < 5) {
    return c.json({ error: 'Please provide a decision rationale (>= 5 chars).' }, 400);
  }

  const row = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?')
    .bind(id)
    .first<ProposalRow>();
  if (!row) return c.json({ error: `Proposal ${id} not found.` }, 404);

  const proposal = mapProposal(row);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let decisionId: string | null = null;

  if (body?.record_public_decision && (nextStatus === 'rejected' || nextStatus === 'deferred')) {
    decisionId = generateId('DEC');
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO collective_decisions (
          id, proposal_id, target_id, outcome, moderator_user_id, moderator_name,
          rationale, minority_dissent, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        decisionId,
        proposal.id,
        proposal.target_problem_ids[0] || proposal.id,
        nextStatus,
        user.id,
        user.display_name,
        rationale,
        body.minority_dissent?.trim() || null,
        now
      )
    );
  }

  statements.push(
    c.env.DB.prepare(
      `UPDATE proposals
       SET moderation_status = ?, reviewed_by = ?, reviewed_by_name = ?,
           reviewed_at = ?, review_notes = ?, decision_id = COALESCE(?, decision_id)
       WHERE id = ?`
    ).bind(nextStatus, user.id, user.display_name, now, rationale || nextStatus, decisionId, id),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: `proposal.${nextStatus}`,
      entityType: 'proposal',
      entityId: id,
      before: { moderation_status: proposal.moderation_status },
      after: { moderation_status: nextStatus, decision_id: decisionId },
      reason: rationale || nextStatus,
    })
  );

  await c.env.DB.batch(statements);
  return c.json({ ok: true, id, moderation_status: nextStatus, decision_id: decisionId });
});

// Moderate peer review: approve (goes live publicly) / reject / spam
adminRoutes.post('/reviews/:id/moderate', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as {
    status?: 'approved' | 'rejected' | 'spam';
    notes?: string;
  } | null;

  const nextStatus = body?.status;
  if (!nextStatus || !['approved', 'rejected', 'spam'].includes(nextStatus)) {
    return c.json({ error: 'status must be approved, rejected, or spam.' }, 400);
  }

  const row = await c.env.DB.prepare('SELECT * FROM peer_reviews WHERE id = ?')
    .bind(id)
    .first<PeerReviewRow>();
  if (!row) return c.json({ error: `Peer review ${id} not found.` }, 404);

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE peer_reviews
       SET moderation_status = ?, reviewed_by = ?, reviewed_by_name = ?,
           reviewed_at = ?, review_notes = ?
       WHERE id = ?`
    ).bind(nextStatus, user.id, user.display_name, now, body?.notes?.trim() || null, id),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: `review.${nextStatus}`,
      entityType: 'peer_review',
      entityId: id,
      before: { moderation_status: row.moderation_status },
      after: { moderation_status: nextStatus },
      reason: body?.notes?.trim() || `Review marked ${nextStatus}`,
    }),
  ]);

  return c.json({ ok: true, id, moderation_status: nextStatus });
});

// Admin-only hard delete of spam/erroneous proposal or review
adminRoutes.delete('/proposals/:id', requireAdmin, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Proposal not found.' }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM proposals WHERE id = ?').bind(id),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: 'proposal.delete',
      entityType: 'proposal',
      entityId: id,
      before: existing,
      reason: 'Deleted by admin',
    }),
  ]);
  return c.json({ ok: true });
});

adminRoutes.delete('/reviews/:id', requireAdmin, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM peer_reviews WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Peer review not found.' }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM peer_reviews WHERE id = ?').bind(id),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: 'review.delete',
      entityType: 'peer_review',
      entityId: id,
      before: existing,
      reason: 'Deleted by admin',
    }),
  ]);
  return c.json({ ok: true });
});

// --- 2. Direct Open Problem Editorial Editing (Rubric Editor / Crosswalk) ---
adminRoutes.put('/problems/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as {
    title?: string;
    description?: string;
    category?: CategoryCode;
    scores?: number[];
    governance_status?: GovernanceStatus;
    why_changed?: string;
    what_changed?: string;
    status?: 'active' | 'retired';
    allow_cjk?: boolean;
  } | null;

  if (!body || !body.why_changed?.trim()) {
    return c.json({ error: 'Normative justification (why_changed) is required.' }, 400);
  }

  const existingRow = await c.env.DB.prepare('SELECT * FROM open_problems WHERE id = ?')
    .bind(id)
    .first<OpenProblemRow>();
  if (!existingRow) return c.json({ error: `Open Problem ${id} not found.` }, 404);

  const before = mapPublicOpenProblem(existingRow);
  const title = (body.title ?? before.title).trim();
  const description = (body.description ?? before.description).trim();
  const category = (body.category ?? before.category) as CategoryCode;
  const scores =
    Array.isArray(body.scores) && body.scores.length === 5
      ? body.scores.map((n) => Math.max(0, Math.min(4, Math.round(Number(n) || 0))))
      : before.scores;
  const nextStatus = body.status ?? existingRow.status;

  const safety = checkPublicSafe({ title, description, why_changed: body.why_changed }, { strictCjk: !body.allow_cjk });
  if (!safety.passed) {
    return c.json({ error: safety.hardViolations[0], warnings: safety.hardViolations }, 400);
  }

  const rules = await loadTerminologyRules(c.env.DB);
  const alerts = checkTerminology(`${title} ${description}`, rules);
  const now = new Date().toISOString();
  const nextLineage = {
    ...before.lineage,
    what_changed: (body.what_changed || before.lineage.what_changed || `Edited ${id} in internal workbench.`).trim(),
    why_changed: body.why_changed.trim(),
    justification_status: 'documented' as const,
  };
  const nextGov = {
    status: body.governance_status ?? before.governance.status,
    moderator_signoff: {
      moderator_name: user.display_name,
      decision_date: now.slice(0, 10),
      notes: body.why_changed.trim(),
    },
  };

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE open_problems
       SET category = ?, title = ?, description = ?, scores_json = ?,
           status = ?, lineage_json = ?, governance_json = ?,
           terminology_alerts_json = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`
    ).bind(
      category,
      title,
      description,
      JSON.stringify(scores),
      nextStatus,
      JSON.stringify(nextLineage),
      JSON.stringify(nextGov),
      JSON.stringify(alerts),
      now,
      user.id,
      id
    ),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: 'problem.edit',
      entityType: 'open_problem',
      entityId: id,
      before: { title: before.title, category: before.category, scores: before.scores, status: existingRow.status },
      after: { title, category, scores, status: nextStatus },
      reason: body.why_changed.trim(),
    }),
  ]);

  return c.json({ ok: true, id, terminology_alerts: alerts });
});

adminRoutes.post('/problems', async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as {
    id?: string;
    title?: string;
    description?: string;
    category?: CategoryCode;
    scores?: number[];
    governance_status?: GovernanceStatus;
    why_changed?: string;
    allow_cjk?: boolean;
  } | null;

  if (!body || !body.title?.trim() || !body.description?.trim() || !body.why_changed?.trim()) {
    return c.json({ error: 'title, description, and why_changed are required.' }, 400);
  }

  const category = (body.category || 'F') as CategoryCode;
  const id = (body.id || `H.${category}${Date.now().toString(36).slice(-3).toUpperCase()}`).trim();
  const dup = await c.env.DB.prepare('SELECT id FROM open_problems WHERE id = ?').bind(id).first();
  if (dup) return c.json({ error: `Open Problem ID "${id}" already exists.` }, 409);

  const safety = checkPublicSafe(
    { title: body.title, description: body.description, why_changed: body.why_changed },
    { strictCjk: !body.allow_cjk }
  );
  if (!safety.passed) {
    return c.json({ error: safety.hardViolations[0], warnings: safety.hardViolations }, 400);
  }

  const scores =
    Array.isArray(body.scores) && body.scores.length === 5
      ? body.scores.map((n) => Math.max(0, Math.min(4, Math.round(Number(n) || 0))))
      : [3, 3, 3, 3, 3];
  const rules = await loadTerminologyRules(c.env.DB);
  const alerts = checkTerminology(`${body.title} ${body.description}`, rules);
  const now = new Date().toISOString();
  const sortRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM open_problems'
  ).first<{ next_order: number }>();

  const lineage = {
    type: 'new',
    predecessors: [],
    what_changed: `Added new human-authored Open Problem ${id}.`,
    why_changed: body.why_changed.trim(),
    justification_status: 'documented',
  };
  const provenance = {
    author_type: 'human',
    proposer_name: user.display_name,
    known_ai_role: 'None (human authored)',
  };
  const governance = {
    status: body.governance_status ?? 'moderator_approved',
    moderator_signoff: {
      moderator_name: user.display_name,
      decision_date: now.slice(0, 10),
      notes: body.why_changed.trim(),
    },
  };

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO open_problems (
        id, category, title, description, scores_json, paper_section_id,
        manuscript_alignment, status, lineage_json, provenance_json,
        governance_json, terminology_alerts_json, public_extra_json,
        internal_extra_json, sort_order, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, 'NEW_HUMAN_PROPOSAL', 'new_proposal', 'active', ?, ?, ?, ?, '{}', '{}', ?, ?, ?)`
    ).bind(
      id,
      category,
      body.title.trim(),
      body.description.trim(),
      JSON.stringify(scores),
      JSON.stringify(lineage),
      JSON.stringify(provenance),
      JSON.stringify(governance),
      JSON.stringify(alerts),
      Number(sortRow?.next_order ?? 100),
      now,
      user.id
    ),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: 'problem.create',
      entityType: 'open_problem',
      entityId: id,
      after: { id, category, title: body.title.trim(), scores },
      reason: body.why_changed.trim(),
    }),
  ]);

  return c.json({ ok: true, id, terminology_alerts: alerts }, 201);
});

// --- 3. Manual Version Releases & Admin Rollback ---
adminRoutes.get('/releases', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT id, title, kind, summary, problem_ids_json, is_current,
            published_by_name, published_at
     FROM agenda_releases
     ORDER BY published_at DESC`
  ).all();
  const releases = ((res.results || []) as unknown as ReleaseRow[]).map(mapRelease);
  return c.json({ releases });
});

adminRoutes.post('/releases', async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as {
    id?: string;
    title?: string;
    kind?: string;
    summary?: string;
  } | null;

  const relId = (body?.id || '').trim();
  const title = (body?.title || '').trim();
  if (!relId || !/^[A-Za-z0-9._-]+$/.test(relId) || !title) {
    return c.json(
      { error: 'Valid release id (letters, digits, ., _, -) and title are required.' },
      400
    );
  }

  const dup = await c.env.DB.prepare('SELECT id FROM agenda_releases WHERE id = ?')
    .bind(relId)
    .first();
  if (dup) return c.json({ error: `Release "${relId}" already exists.` }, 409);

  const { problemIds, snapshot } = await buildLiveSnapshotPayload(c.env.DB);
  const now = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE agenda_releases SET is_current = 0'),
    c.env.DB.prepare(
      `INSERT INTO agenda_releases (
        id, title, kind, summary, problem_ids_json, snapshot_json,
        is_current, published_by, published_by_name, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(
      relId,
      title,
      (body?.kind || 'consensus').trim(),
      (body?.summary || '').trim(),
      JSON.stringify(problemIds),
      JSON.stringify(snapshot),
      user.id,
      user.display_name,
      now
    ),
    c.env.DB.prepare(
      "INSERT OR REPLACE INTO agenda_meta (key, value_json, updated_at) VALUES ('current_version', ?, ?)"
    ).bind(JSON.stringify(relId), now),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: 'release.freeze',
      entityType: 'release',
      entityId: relId,
      after: { id: relId, title, problem_count: problemIds.length },
      reason: (body?.summary || title).trim(),
    }),
  ]);

  return c.json({ ok: true, id: relId, problem_count: problemIds.length }, 201);
});

adminRoutes.post('/releases/:id/rollback', requireAdmin, async (c) => {
  const user = c.get('user')!;
  const relId = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { reason?: string } | null;

  const row = await c.env.DB.prepare(
    'SELECT id, title, snapshot_json FROM agenda_releases WHERE id = ?'
  )
    .bind(relId)
    .first<{ id: string; title: string; snapshot_json: string }>();
  if (!row) return c.json({ error: `Release ${relId} not found.` }, 404);

  const parsed = extractSnapshotProblems(row.snapshot_json);
  if (!parsed || parsed.open_problems.length === 0) {
    return c.json(
      {
        error:
          'This legacy snapshot only stores IDs/metadata and cannot be automatically rolled back. Create a new consensus snapshot first.',
      },
      400
    );
  }

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE open_problems SET status = 'retired', updated_at = ?, updated_by = ?").bind(
      now,
      user.id
    ),
  ];

  const CORE_KEYS = new Set([
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

  parsed.open_problems.forEach((p, idx) => {
    const pubExtra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      if (!CORE_KEYS.has(k)) pubExtra[k] = v;
    }
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO open_problems (
          id, category, title, description, scores_json, paper_section_id,
          manuscript_alignment, status, lineage_json, provenance_json,
          governance_json, terminology_alerts_json, public_extra_json,
          internal_extra_json, sort_order, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, '{}', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          category = excluded.category,
          title = excluded.title,
          description = excluded.description,
          scores_json = excluded.scores_json,
          paper_section_id = excluded.paper_section_id,
          manuscript_alignment = excluded.manuscript_alignment,
          status = 'active',
          lineage_json = excluded.lineage_json,
          provenance_json = excluded.provenance_json,
          governance_json = excluded.governance_json,
          terminology_alerts_json = excluded.terminology_alerts_json,
          public_extra_json = excluded.public_extra_json,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by`
      ).bind(
        p.id,
        p.category,
        p.title,
        p.description,
        JSON.stringify(p.scores ?? [3, 3, 3, 3, 3]),
        p.paper_section_id ?? '',
        p.manuscript_alignment ?? 'aligned',
        JSON.stringify(p.lineage ?? {}),
        JSON.stringify(p.provenance ?? {}),
        JSON.stringify(p.governance ?? {}),
        JSON.stringify(p.terminology_alerts ?? []),
        JSON.stringify(pubExtra),
        idx,
        now,
        user.id
      )
    );
  });

  stmts.push(
    c.env.DB.prepare('UPDATE agenda_releases SET is_current = CASE WHEN id = ? THEN 1 ELSE 0 END').bind(relId),
    c.env.DB.prepare(
      "INSERT OR REPLACE INTO agenda_meta (key, value_json, updated_at) VALUES ('current_version', ?, ?)"
    ).bind(JSON.stringify(relId), now),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: 'release.rollback',
      entityType: 'release',
      entityId: relId,
      after: { restored_problem_count: parsed.open_problems.length },
      reason: (body?.reason || `Rolled back to ${relId}`).trim(),
    })
  );

  await c.env.DB.batch(stmts);
  return c.json({ ok: true, restored_release: relId, problem_count: parsed.open_problems.length });
});

// --- 4. Audit Log ---
adminRoutes.get('/audit-logs', async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || '100')));
  const offset = Math.max(0, Number(c.req.query('offset') || '0'));
  const [cntRes, rowsRes] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM audit_logs'),
    c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(
      limit,
      offset
    ),
  ]);
  const total = Number(((cntRes.results || [])[0] as { cnt?: number } | undefined)?.cnt ?? 0);
  return c.json({
    total,
    logs: (rowsRes.results || []) as unknown as AuditLogEntry[],
  });
});

// --- 5. Admin-Only User Account Management ---
adminRoutes.get('/users', requireAdmin, async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT id, email, display_name, role, is_active, must_change_password,
            created_at, created_by, last_login_at
     FROM users ORDER BY created_at ASC`
  ).all<{
    id: string;
    email: string;
    display_name: string;
    role: UserRole;
    is_active: number;
    must_change_password: number;
    created_at: string;
    created_by: string | null;
    last_login_at: string | null;
  }>();

  const users: AdminUserRecord[] = (res.results || []).map((u) => ({
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    role: u.role,
    is_active: u.is_active === 1,
    must_change_password: u.must_change_password === 1,
    created_at: u.created_at,
    created_by: u.created_by,
    last_login_at: u.last_login_at,
  }));

  return c.json({ users });
});

adminRoutes.post('/users', requireAdmin, async (c) => {
  const actor = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as {
    email?: string;
    display_name?: string;
    role?: UserRole;
    password?: string;
  } | null;

  const email = (body?.email || '').trim().toLowerCase();
  const displayName = (body?.display_name || '').trim();
  const role: UserRole = body?.role === 'admin' ? 'admin' : 'moderator';
  if (!email || !email.includes('@') || !displayName) {
    return c.json({ error: 'Valid email and display_name are required.' }, 400);
  }

  const dup = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (dup) return c.json({ error: 'A user with this email already exists.' }, 409);

  const initialPassword = body?.password?.trim() || generateRandomPassword(16);
  if (initialPassword.length < 10) {
    return c.json({ error: 'Password must be at least 10 characters.' }, 400);
  }

  const { hashHex, saltHex } = await hashPassword(initialPassword);
  const id = generateId('USR');
  const now = new Date().toISOString();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, display_name, role, password_hash, password_salt, is_active, must_change_password, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
    ).bind(id, email, displayName, role, hashHex, saltHex, now, actor.id),
    buildAuditInsert(c.env.DB, {
      actor,
      action: 'user.create',
      entityType: 'user',
      entityId: id,
      after: { email, display_name: displayName, role },
      reason: 'Invited editorial member',
    }),
  ]);

  return c.json(
    {
      ok: true,
      user: { id, email, display_name: displayName, role, is_active: true, must_change_password: true },
      temporary_password: initialPassword,
    },
    201
  );
});

adminRoutes.patch('/users/:id', requireAdmin, async (c) => {
  const actor = c.get('user')!;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as {
    display_name?: string;
    role?: UserRole;
    is_active?: boolean;
    reset_password?: boolean;
  } | null;
  if (!body) return c.json({ error: 'Invalid JSON body.' }, 400);

  const target = await c.env.DB.prepare(
    'SELECT id, email, display_name, role, is_active FROM users WHERE id = ?'
  )
    .bind(id)
    .first<{ id: string; email: string; display_name: string; role: UserRole; is_active: number }>();
  if (!target) return c.json({ error: 'User not found.' }, 404);

  // Guard: admin cannot deactivate or demote themselves
  if (id === actor.id && (body.is_active === false || body.role === 'moderator')) {
    return c.json({ error: 'You cannot deactivate or demote your own admin account.' }, 400);
  }

  const nextName = (body.display_name ?? target.display_name).trim();
  const nextRole: UserRole =
    body.role === 'admin' || body.role === 'moderator' ? body.role : target.role;
  const nextActive = body.is_active === undefined ? target.is_active : body.is_active ? 1 : 0;

  const stmts: D1PreparedStatement[] = [];
  let tempPassword: string | undefined;

  if (body.reset_password) {
    tempPassword = generateRandomPassword(16);
    const { hashHex, saltHex } = await hashPassword(tempPassword);
    stmts.push(
      c.env.DB.prepare(
        `UPDATE users SET display_name = ?, role = ?, is_active = ?, password_hash = ?, password_salt = ?, must_change_password = 1 WHERE id = ?`
      ).bind(nextName, nextRole, nextActive, hashHex, saltHex, id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id)
    );
  } else {
    stmts.push(
      c.env.DB.prepare(
        'UPDATE users SET display_name = ?, role = ?, is_active = ? WHERE id = ?'
      ).bind(nextName, nextRole, nextActive, id)
    );
    if (nextActive === 0) {
      stmts.push(c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
    }
  }

  stmts.push(
    buildAuditInsert(c.env.DB, {
      actor,
      action: body.reset_password ? 'user.reset_password' : 'user.update',
      entityType: 'user',
      entityId: id,
      before: { display_name: target.display_name, role: target.role, is_active: target.is_active === 1 },
      after: { display_name: nextName, role: nextRole, is_active: nextActive === 1 },
      reason: body.reset_password ? 'Admin reset user password' : 'Admin updated user account',
    })
  );

  await c.env.DB.batch(stmts);
  return c.json({ ok: true, id, temporary_password: tempPassword });
});
