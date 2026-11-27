import { Hono } from 'hono';
import {
  checkPublicSafe,
  validateProposal,
  type CategoryCode,
  type PeerReview,
  type ProposalDraft,
  type ProposalType,
  type PublicBootstrapResponse,
  type PublicBundle,
  type ReferenceItem,
} from '@opae/core';
import type { AppEnv } from '../env';
import { checkRateLimit, getClientIp, getClientIpHash } from '../middleware/rateLimit';
import { verifyTurnstileToken } from '../middleware/turnstile';
import { generateId } from '../services/crypto';
import {
  loadTerminologyRules,
  mapChallenge,
  mapDecision,
  mapPeerReview,
  mapProposal,
  mapPublicOpenProblem,
  mapRelease,
  parseJson,
  type CollectiveDecisionRow,
  type OpenProblemRow,
  type PeerReviewRow,
  type ProposalRow,
  type ReleaseRow,
  type SpecificChallengeRow,
} from '../services/mappers';
import { dispatchWebhook } from '../services/notify';

export const publicRoutes = new Hono<AppEnv>();

const VALID_CATEGORIES = new Set<CategoryCode>(['F', 'T', 'V', 'D', 'L', 'I', 'P']);
const VALID_PROPOSAL_TYPES = new Set<ProposalType>([
  'add',
  'revise',
  'merge',
  'split',
  'retire',
  'challenge',
  'challenge_update',
]);
const VALID_STANCES = new Set<PeerReview['stance']>(['support', 'revise', 'object']);

interface RefRow {
  id: string;
  title: string;
  url: string | null;
  type: string | null;
  table2: number;
  extraction_counts_json: string;
}

publicRoutes.get('/bootstrap', async (c) => {
  const db = c.env.DB;

  const [
    metaRes,
    problemsRes,
    challengesRes,
    refsRes,
    proposalsRes,
    reviewsRes,
    decisionsRes,
    releasesRes,
  ] = await db.batch([
    db.prepare('SELECT key, value_json, updated_at FROM agenda_meta'),
    db.prepare(
      `SELECT id, category, title, description, scores_json, paper_section_id,
              manuscript_alignment, status, lineage_json, provenance_json,
              governance_json, terminology_alerts_json, public_extra_json,
              sort_order, updated_at, updated_by
       FROM open_problems
       WHERE status = 'active'
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
    db.prepare(
      `SELECT id, title, url, type, table2, extraction_counts_json
       FROM public_references
       ORDER BY sort_order ASC, id ASC`
    ),
    db.prepare(
      `SELECT id, moderation_status, proposal_type, target_problem_ids_json,
              category, proposed_title, proposed_description, what_changed,
              why_changed, is_original_synthesis, source_url, source_verification,
              used_ai_assistance, ai_disclosure_details, human_verification_steps,
              coi_statement, proposer_name, challenge_milestone, challenge_owner,
              challenge_status, terminology_alerts_json, created_at,
              reviewed_by, reviewed_by_name, reviewed_at, review_notes, decision_id
       FROM proposals
       WHERE moderation_status = 'approved'
       ORDER BY created_at DESC`
    ),
    db.prepare(
      `SELECT id, moderation_status, target_id, reviewer_name, stance, summary,
              created_at, reviewed_by, reviewed_by_name, reviewed_at, review_notes
       FROM peer_reviews
       WHERE moderation_status = 'approved'
       ORDER BY created_at DESC`
    ),
    db.prepare(
      `SELECT id, proposal_id, target_id, outcome, moderator_name, rationale,
              minority_dissent, decided_at
       FROM collective_decisions
       ORDER BY decided_at DESC`
    ),
    db.prepare(
      `SELECT id, title, kind, summary, problem_ids_json, is_current,
              published_by_name, published_at
       FROM agenda_releases
       ORDER BY published_at DESC`
    ),
  ]);

  const metaMap: Record<string, unknown> = {};
  let latestUpdate = '';
  for (const row of (metaRes.results || []) as Array<{
    key: string;
    value_json: string;
    updated_at: string;
  }>) {
    metaMap[row.key] = parseJson(row.value_json, null);
    if (row.updated_at > latestUpdate) latestUpdate = row.updated_at;
  }

  const openProblems = ((problemsRes.results || []) as unknown as OpenProblemRow[]).map((r) => {
    if (r.updated_at > latestUpdate) latestUpdate = r.updated_at;
    return mapPublicOpenProblem(r);
  });

  const specificChallenges = (
    (challengesRes.results || []) as unknown as SpecificChallengeRow[]
  ).map((r) => {
    if (r.updated_at > latestUpdate) latestUpdate = r.updated_at;
    return mapChallenge(r);
  });

  const references: ReferenceItem[] = ((refsRes.results || []) as unknown as RefRow[]).map(
    (r) => ({
      id: r.id,
      title: r.title,
      url: r.url ?? undefined,
      type: r.type ?? undefined,
      table2: r.table2 === 1,
      extraction_counts: parseJson<Record<string, number>>(r.extraction_counts_json, {}),
    })
  );

  const approvedProposals = ((proposalsRes.results || []) as unknown as ProposalRow[]).map(
    mapProposal
  );
  const approvedReviews = ((reviewsRes.results || []) as unknown as PeerReviewRow[]).map(
    mapPeerReview
  );
  const decisions = ((decisionsRes.results || []) as unknown as CollectiveDecisionRow[]).map(
    mapDecision
  );
  const releases = ((releasesRes.results || []) as unknown as ReleaseRow[]).map(mapRelease);

  const currentRelease = releases.find((r) => r.is_current);
  const currentVersion =
    currentRelease?.id ||
    (typeof metaMap.current_version === 'string'
      ? metaMap.current_version
      : 'screening-2026-11-11-v1');

  const bundle: PublicBundle = {
    schema_version: Number(metaMap.schema_version ?? 2),
    taxonomy: (metaMap.taxonomy as PublicBundle['taxonomy']) ?? {
      tier1_label: 'Fixed Categories',
      tier2_label: 'Open Problems',
      tier3_label: 'Specific Challenges',
    },
    project: (metaMap.project as PublicBundle['project']) ?? {
      title: 'Open Problems in AI Evaluation',
      subtitle: '',
      manuscript: '',
      manuscript_date: '',
    },
    categories: (metaMap.categories as PublicBundle['categories']) ?? {
      F: 'Foundations',
      T: 'Testing & Elicitation',
      V: 'Validity & Robustness',
      D: 'Deployment & Drift',
      L: 'Lifecycle & Reproducibility',
      I: 'Institutions & Incentives',
      P: 'Policy & Priorities',
    },
    rubric: (metaMap.rubric as PublicBundle['rubric']) ?? [],
    terminology_rules: (metaMap.terminology_rules as PublicBundle['terminology_rules']) ?? [],
    open_problems: openProblems,
    specific_challenges: specificChallenges,
    references,
    source_audit: (metaMap.source_audit as Record<string, unknown>) ?? {},
    participation: {
      current_version: currentVersion,
      proposals: approvedProposals,
      reviews: approvedReviews,
      decisions,
      challenges: [],
      releases: releases as unknown as Array<Record<string, unknown>>,
      challenge_updates: [],
    },
    version_snapshots: {},
    generation_method: (metaMap.generation_method as Record<string, unknown>) ?? {},
    provenance_audit: (metaMap.provenance_audit as Record<string, unknown>) ?? {},
    editorial_audit: (metaMap.editorial_audit as Record<string, unknown>) ?? {},
    screening_alternatives: (metaMap.screening_alternatives as Record<string, unknown>) ?? {},
    screening_frontier: (metaMap.screening_frontier as PublicBundle['screening_frontier']) ?? [],
    manuscript_review: (metaMap.manuscript_review as Record<string, unknown>) ?? {},
    generation_upstream: (metaMap.generation_upstream as Record<string, unknown>) ?? {},
    openness_review: (metaMap.openness_review as Record<string, unknown>) ?? {},
    reproduce_packages: (metaMap.reproduce_packages as PublicBundle['reproduce_packages']) ?? [],
  };

  c.header('Cache-Control', 'no-cache');
  const response: PublicBootstrapResponse = {
    bundle,
    releases,
    updated_at: latestUpdate || new Date().toISOString(),
  };
  return c.json(response);
});

publicRoutes.get('/releases/:id/snapshot', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    'SELECT id, title, kind, summary, snapshot_json, published_at FROM agenda_releases WHERE id = ?'
  )
    .bind(id)
    .first<{
      id: string;
      title: string;
      kind: string;
      summary: string;
      snapshot_json: string;
      published_at: string;
    }>();

  if (!row) {
    return c.json({ error: 'Release snapshot not found.' }, 404);
  }

  c.header('Content-Disposition', `attachment; filename="agenda-snapshot-${row.id}.json"`);
  return c.json({
    release_id: row.id,
    title: row.title,
    kind: row.kind,
    summary: row.summary,
    published_at: row.published_at,
    snapshot: parseJson(row.snapshot_json, {}),
  });
});

publicRoutes.post('/proposals', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | (Partial<ProposalDraft> & { turnstile_token?: string })
    | null;
  if (!body) {
    return c.json({ error: 'Invalid JSON request body.' }, 400);
  }

  const clientIp = getClientIp(c);
  const ipHash = await getClientIpHash(c);
  const reqHost = new URL(c.req.url).hostname;

  const turnstile = await verifyTurnstileToken({
    token: body.turnstile_token,
    expectedAction: 'proposal_submit',
    clientIp,
    requestHostname: reqHost,
    env: c.env,
  });
  if (!turnstile.ok) {
    return c.json({ error: turnstile.reason || 'Human verification failed.' }, 403);
  }

  const rl = await checkRateLimit(c.env.DB, `proposal:ip:${ipHash}`, 5, 3600);
  if (!rl.allowed) {
    c.header('Retry-After', String(rl.retryAfterSeconds));
    return c.json({ error: 'Rate limit exceeded (max 5 proposals/hour).' }, 429);
  }

  const proposalType = body.proposal_type as ProposalType;
  const category = body.category as CategoryCode;
  if (!VALID_PROPOSAL_TYPES.has(proposalType)) {
    return c.json({ error: 'Invalid proposal_type.' }, 400);
  }
  if (!VALID_CATEGORIES.has(category)) {
    return c.json({ error: 'Invalid category.' }, 400);
  }

  const [rules, probIdsRes, chalIdsRes] = await Promise.all([
    loadTerminologyRules(c.env.DB),
    c.env.DB.prepare("SELECT id FROM open_problems WHERE status = 'active'").all<{ id: string }>(),
    c.env.DB.prepare('SELECT id FROM specific_challenges WHERE is_active = 1').all<{ id: string }>(),
  ]);

  const knownIds = new Set<string>();
  for (const r of probIdsRes.results || []) knownIds.add(r.id);
  for (const r of chalIdsRes.results || []) knownIds.add(r.id);

  const now = new Date().toISOString();
  const id = generateId('PROP');
  const draft: ProposalDraft = {
    id,
    created_at: now,
    proposal_type: proposalType,
    target_problem_ids: Array.isArray(body.target_problem_ids)
      ? body.target_problem_ids.map((x) => String(x).trim()).filter(Boolean)
      : [],
    category,
    proposed_title: String(body.proposed_title ?? '').trim().slice(0, 300),
    proposed_description: String(body.proposed_description ?? '').trim().slice(0, 4000),
    what_changed: String(body.what_changed ?? '').trim().slice(0, 1000),
    why_changed: String(body.why_changed ?? '').trim().slice(0, 3000),
    is_original_synthesis: Boolean(body.is_original_synthesis),
    source_url: String(body.source_url ?? '').trim().slice(0, 500),
    source_verification: String(body.source_verification ?? '').trim().slice(0, 500),
    used_ai_assistance: Boolean(body.used_ai_assistance),
    ai_disclosure_details: String(body.ai_disclosure_details ?? '').trim().slice(0, 1000),
    human_verification_steps: String(body.human_verification_steps ?? '').trim().slice(0, 1000),
    coi_statement: String(body.coi_statement ?? '').trim().slice(0, 500),
    proposer_name: String(body.proposer_name ?? '').trim().slice(0, 200),
    challenge_milestone: body.challenge_milestone
      ? String(body.challenge_milestone).trim().slice(0, 500)
      : undefined,
    challenge_owner: body.challenge_owner
      ? String(body.challenge_owner).trim().slice(0, 200)
      : undefined,
    challenge_status: body.challenge_status
      ? String(body.challenge_status).trim().slice(0, 100)
      : undefined,
  };

  const validation = validateProposal(draft, rules, knownIds);
  if (!validation.valid) {
    return c.json(
      {
        error: validation.errors[0] || 'Proposal validation failed.',
        errors: validation.errors,
        fieldErrors: validation.fieldErrors,
      },
      400
    );
  }

  const safety = checkPublicSafe(draft, { strictCjk: false });
  if (!safety.passed) {
    return c.json({ error: safety.hardViolations[0] }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO proposals (
      id, moderation_status, proposal_type, target_problem_ids_json, category,
      proposed_title, proposed_description, what_changed, why_changed,
      is_original_synthesis, source_url, source_verification,
      used_ai_assistance, ai_disclosure_details, human_verification_steps,
      coi_statement, proposer_name, challenge_milestone, challenge_owner,
      challenge_status, terminology_alerts_json, submitter_ip_hash, created_at
    ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      draft.id,
      draft.proposal_type,
      JSON.stringify(draft.target_problem_ids),
      draft.category,
      draft.proposed_title,
      draft.proposed_description,
      draft.what_changed,
      draft.why_changed,
      draft.is_original_synthesis ? 1 : 0,
      draft.source_url,
      draft.source_verification,
      draft.used_ai_assistance ? 1 : 0,
      draft.ai_disclosure_details,
      draft.human_verification_steps,
      draft.coi_statement,
      draft.proposer_name,
      draft.challenge_milestone ?? null,
      draft.challenge_owner ?? null,
      draft.challenge_status ?? null,
      JSON.stringify(validation.terminology_alerts),
      ipHash,
      draft.created_at
    )
    .run();

  let execCtx: { waitUntil(p: Promise<unknown>): void } | undefined;
  try {
    execCtx = c.executionCtx;
  } catch {
    execCtx = undefined;
  }
  dispatchWebhook(c.env, execCtx, {
    event: 'proposal.submitted',
    id: draft.id,
    summary: `[${draft.proposal_type}] ${draft.proposed_title || draft.target_problem_ids.join(', ')}`,
    actor: draft.proposer_name,
    created_at: draft.created_at,
  });

  return c.json(
    {
      id: draft.id,
      moderation_status: 'pending',
      created_at: draft.created_at,
      terminology_alerts: validation.terminology_alerts,
      message:
        'Proposal received and queued for human moderator review. It will appear publicly once approved.',
    },
    201
  );
});

publicRoutes.post('/reviews', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | (Partial<PeerReview> & { turnstile_token?: string })
    | null;
  if (!body) {
    return c.json({ error: 'Invalid JSON request body.' }, 400);
  }

  const clientIp = getClientIp(c);
  const ipHash = await getClientIpHash(c);
  const reqHost = new URL(c.req.url).hostname;

  const turnstile = await verifyTurnstileToken({
    token: body.turnstile_token,
    expectedAction: 'review_submit',
    clientIp,
    requestHostname: reqHost,
    env: c.env,
  });
  if (!turnstile.ok) {
    return c.json({ error: turnstile.reason || 'Human verification failed.' }, 403);
  }

  const rl = await checkRateLimit(c.env.DB, `review:ip:${ipHash}`, 10, 3600);
  if (!rl.allowed) {
    c.header('Retry-After', String(rl.retryAfterSeconds));
    return c.json({ error: 'Rate limit exceeded (max 10 peer reviews/hour).' }, 429);
  }

  const targetId = String(body.target_id ?? '').trim();
  const reviewerName = String(body.reviewer_name ?? '').trim().slice(0, 200);
  const stance = body.stance as PeerReview['stance'];
  const summary = String(body.summary ?? '').trim().slice(0, 3000);

  if (!targetId || !reviewerName || !VALID_STANCES.has(stance) || summary.length < 10) {
    return c.json(
      {
        error:
          'target_id, reviewer_name, valid stance (support/revise/object), and summary (>= 10 chars) are required.',
      },
      400
    );
  }

  const targetExists = await c.env.DB.prepare(
    "SELECT id FROM open_problems WHERE id = ? AND status = 'active'"
  )
    .bind(targetId)
    .first<{ id: string }>();
  if (!targetExists) {
    return c.json({ error: `Unknown active Open Problem target_id: ${targetId}` }, 400);
  }

  const safety = checkPublicSafe({ reviewerName, summary }, { strictCjk: false });
  if (!safety.passed) {
    return c.json({ error: safety.hardViolations[0] }, 400);
  }

  const id = generateId('REV');
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO peer_reviews (id, moderation_status, target_id, reviewer_name, stance, summary, submitter_ip_hash, created_at)
     VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, targetId, reviewerName, stance, summary, ipHash, now)
    .run();

  let execCtx: { waitUntil(p: Promise<unknown>): void } | undefined;
  try {
    execCtx = c.executionCtx;
  } catch {
    execCtx = undefined;
  }
  dispatchWebhook(c.env, execCtx, {
    event: 'review.submitted',
    id,
    summary: `[${stance}] on ${targetId}: ${summary.slice(0, 120)}`,
    actor: reviewerName,
    created_at: now,
  });

  return c.json(
    {
      id,
      moderation_status: 'pending',
      created_at: now,
      message:
        'Peer review received and queued for human moderator review. It will appear publicly once approved.',
    },
    201
  );
});
