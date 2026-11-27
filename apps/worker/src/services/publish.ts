import {
  checkPublicSafe,
  checkTerminology,
  type AuthUser,
  type CategoryCode,
  type OpenProblem,
  type PublishProposalRequest,
  type SpecificChallenge,
  type StoredProposal,
  type TerminologyRule,
} from '@opae/core';
import { generateId } from './crypto';
import {
  buildAuditInsert,
  mapChallenge,
  mapPublicOpenProblem,
  parseJson,
  type OpenProblemRow,
  type SpecificChallengeRow,
} from './mappers';

export interface PublishResult {
  decision_id: string;
  affected_ids: string[];
  sanitization_warnings: string[];
}

export class PublishError extends Error {
  status: number;
  warnings?: string[];
  constructor(message: string, status = 400, warnings?: string[]) {
    super(message);
    this.status = status;
    this.warnings = warnings;
  }
}

const VALID_CATS = new Set<CategoryCode>(['F', 'T', 'V', 'D', 'L', 'I', 'P']);

function normalizeScores(scores?: number[], fallback: number[] = [3, 3, 3, 3, 3]): number[] {
  if (!Array.isArray(scores) || scores.length !== 5) return fallback;
  return scores.map((n) => Math.max(0, Math.min(4, Math.round(Number(n) || 0))));
}

async function getNextSortOrder(db: D1Database, table: 'open_problems' | 'specific_challenges'): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM ${table}`)
    .first<{ next_order: number }>();
  return Number(row?.next_order ?? 100);
}

/**
 * Executes an atomic D1 batch transaction for approving & publishing any of the 7 proposal types.
 */
export async function publishProposalTransaction(
  db: D1Database,
  proposal: StoredProposal,
  input: PublishProposalRequest,
  actor: AuthUser,
  rules: TerminologyRule[]
): Promise<PublishResult> {
  if (proposal.moderation_status === 'approved') {
    throw new PublishError('This proposal has already been approved and published.', 409);
  }

  const rationale = (input.rationale || '').trim();
  if (rationale.length < 5) {
    throw new PublishError('Decision rationale (>= 5 chars) is required to publish.', 400);
  }

  const now = new Date().toISOString();
  const decisionDate = now.slice(0, 10);
  const decisionId = generateId('DEC');
  const category = (input.category || proposal.category) as CategoryCode;
  if (!VALID_CATS.has(category)) {
    throw new PublishError('Invalid category code.', 400);
  }

  // Sanitization check across all text being published to public agenda
  const safetyPayload = {
    title: input.title ?? proposal.proposed_title,
    description: input.description ?? proposal.proposed_description,
    what_changed: input.what_changed ?? proposal.what_changed,
    why_changed: input.why_changed ?? proposal.why_changed,
    split_items: input.split_items,
    challenge_milestone: input.challenge_milestone ?? proposal.challenge_milestone,
    challenge_owner: input.challenge_owner ?? proposal.challenge_owner,
    rationale,
    minority_dissent: input.minority_dissent,
  };
  const safety = checkPublicSafe(safetyPayload, { strictCjk: !input.allow_cjk });
  if (!safety.passed) {
    throw new PublishError(
      safety.hardViolations[0],
      400,
      safety.hasCjk ? safety.hardViolations : undefined
    );
  }

  const statements: D1PreparedStatement[] = [];
  const affectedIds: string[] = [];
  let decisionTargetId = input.target_id || proposal.target_problem_ids[0] || '';

  const buildGovernanceJson = (notes: string) =>
    JSON.stringify({
      status: 'moderator_approved',
      moderator_signoff: {
        moderator_name: actor.display_name,
        decision_date: decisionDate,
        notes,
      },
    });

  const buildProvenanceJson = () =>
    JSON.stringify({
      author_type: proposal.used_ai_assistance ? 'ai_assisted' : 'human',
      proposer_name: proposal.proposer_name,
      known_ai_role: proposal.used_ai_assistance
        ? proposal.ai_disclosure_details || 'AI-assisted community draft'
        : 'None (human authored)',
    });

  if (proposal.proposal_type === 'revise') {
    const targetId = input.target_id || proposal.target_problem_ids[0];
    if (!targetId) throw new PublishError('Revise proposal requires a target Open Problem ID.');

    const existingRow = await db
      .prepare('SELECT * FROM open_problems WHERE id = ?')
      .bind(targetId)
      .first<OpenProblemRow>();
    if (!existingRow) throw new PublishError(`Open Problem ${targetId} not found.`, 404);

    const beforeObj = mapPublicOpenProblem(existingRow);
    const nextTitle = (input.title ?? proposal.proposed_title ?? beforeObj.title).trim();
    const nextDesc = (input.description ?? proposal.proposed_description ?? beforeObj.description).trim();
    const nextScores = normalizeScores(input.scores, beforeObj.scores);
    const nextAlerts = checkTerminology(`${nextTitle} ${nextDesc}`, rules);
    const nextLineage = {
      ...beforeObj.lineage,
      what_changed: (input.what_changed || proposal.what_changed || beforeObj.lineage.what_changed).trim(),
      why_changed: (input.why_changed || proposal.why_changed || rationale).trim(),
      justification_status: 'documented' as const,
    };

    statements.push(
      db
        .prepare(
          `UPDATE open_problems
           SET category = ?, title = ?, description = ?, scores_json = ?,
               lineage_json = ?, governance_json = ?, terminology_alerts_json = ?,
               status = 'active', updated_at = ?, updated_by = ?
           WHERE id = ?`
        )
        .bind(
          category,
          nextTitle,
          nextDesc,
          JSON.stringify(nextScores),
          JSON.stringify(nextLineage),
          buildGovernanceJson(rationale),
          JSON.stringify(nextAlerts),
          now,
          actor.id,
          targetId
        )
    );
    affectedIds.push(targetId);
    decisionTargetId = targetId;
  } else if (proposal.proposal_type === 'add') {
    const newId = (input.new_id || `H.${category}${Date.now().toString(36).slice(-3).toUpperCase()}`).trim();
    const dup = await db.prepare('SELECT id FROM open_problems WHERE id = ?').bind(newId).first();
    if (dup) throw new PublishError(`Open Problem ID "${newId}" already exists.`, 409);

    const title = (input.title ?? proposal.proposed_title).trim();
    const description = (input.description ?? proposal.proposed_description).trim();
    if (!title) throw new PublishError('Title is required to add an Open Problem.');

    const scores = normalizeScores(input.scores, [3, 3, 3, 3, 3]);
    const alerts = checkTerminology(`${title} ${description}`, rules);
    const sortOrder = await getNextSortOrder(db, 'open_problems');
    const lineage = {
      type: 'new',
      predecessors: [],
      what_changed: (input.what_changed || proposal.what_changed || `Added new Open Problem ${newId}.`).trim(),
      why_changed: (input.why_changed || proposal.why_changed || rationale).trim(),
      justification_status: 'documented',
    };

    statements.push(
      db
        .prepare(
          `INSERT INTO open_problems (
            id, category, title, description, scores_json, paper_section_id,
            manuscript_alignment, status, lineage_json, provenance_json,
            governance_json, terminology_alerts_json, public_extra_json,
            internal_extra_json, sort_order, updated_at, updated_by
          ) VALUES (?, ?, ?, ?, ?, 'COMMUNITY_PROPOSAL', 'new_proposal', 'active', ?, ?, ?, ?, '{}', '{}', ?, ?, ?)`
        )
        .bind(
          newId,
          category,
          title,
          description,
          JSON.stringify(scores),
          JSON.stringify(lineage),
          buildProvenanceJson(),
          buildGovernanceJson(rationale),
          JSON.stringify(alerts),
          sortOrder,
          now,
          actor.id
        )
    );
    affectedIds.push(newId);
    decisionTargetId = newId;
  } else if (proposal.proposal_type === 'merge') {
    const sourceIds = proposal.target_problem_ids;
    if (sourceIds.length < 2) {
      throw new PublishError('Merge requires at least 2 target Open Problem IDs.');
    }
    const mergedId = (input.new_id || sourceIds[0]).trim();
    const title = (input.title ?? proposal.proposed_title).trim();
    const description = (input.description ?? proposal.proposed_description).trim();
    if (!title) throw new PublishError('Merged title is required.');

    const scores = normalizeScores(input.scores, [3, 3, 3, 3, 3]);
    const alerts = checkTerminology(`${title} ${description}`, rules);
    const lineage = {
      type: 'merge',
      predecessors: sourceIds,
      what_changed: (
        input.what_changed ||
        proposal.what_changed ||
        `Merged ${sourceIds.join(', ')} into ${mergedId}.`
      ).trim(),
      why_changed: (input.why_changed || proposal.why_changed || rationale).trim(),
      justification_status: 'documented',
    };

    const existingMerged = await db
      .prepare('SELECT * FROM open_problems WHERE id = ?')
      .bind(mergedId)
      .first<OpenProblemRow>();

    if (existingMerged) {
      statements.push(
        db
          .prepare(
            `UPDATE open_problems
             SET category = ?, title = ?, description = ?, scores_json = ?,
                 manuscript_alignment = 'restructured', status = 'active',
                 lineage_json = ?, governance_json = ?, terminology_alerts_json = ?,
                 updated_at = ?, updated_by = ?
             WHERE id = ?`
          )
          .bind(
            category,
            title,
            description,
            JSON.stringify(scores),
            JSON.stringify(lineage),
            buildGovernanceJson(rationale),
            JSON.stringify(alerts),
            now,
            actor.id,
            mergedId
          )
      );
    } else {
      const sortOrder = await getNextSortOrder(db, 'open_problems');
      statements.push(
        db
          .prepare(
            `INSERT INTO open_problems (
              id, category, title, description, scores_json, paper_section_id,
              manuscript_alignment, status, lineage_json, provenance_json,
              governance_json, terminology_alerts_json, public_extra_json,
              internal_extra_json, sort_order, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, 'MERGED_PROPOSAL', 'restructured', 'active', ?, ?, ?, ?, '{}', '{}', ?, ?, ?)`
          )
          .bind(
            mergedId,
            category,
            title,
            description,
            JSON.stringify(scores),
            JSON.stringify(lineage),
            buildProvenanceJson(),
            buildGovernanceJson(rationale),
            JSON.stringify(alerts),
            sortOrder,
            now,
            actor.id
          )
      );
    }

    affectedIds.push(mergedId);
    for (const sid of sourceIds) {
      if (sid === mergedId) continue;
      statements.push(
        db
          .prepare("UPDATE open_problems SET status = 'retired', updated_at = ?, updated_by = ? WHERE id = ?")
          .bind(now, actor.id, sid)
      );
      affectedIds.push(sid);
    }
    decisionTargetId = mergedId;
  } else if (proposal.proposal_type === 'split') {
    const parentId = input.target_id || proposal.target_problem_ids[0];
    if (!parentId) throw new PublishError('Split proposal requires a parent Open Problem ID.');

    const splitItems =
      input.split_items && input.split_items.length >= 2
        ? input.split_items
        : [
            {
              id: (input.new_id || `${parentId}.1`).trim(),
              category,
              title: (input.title ?? proposal.proposed_title).trim(),
              description: (input.description ?? proposal.proposed_description).trim(),
              scores: normalizeScores(input.scores, [3, 3, 3, 3, 3]),
            },
          ];

    let sortOrder = await getNextSortOrder(db, 'open_problems');
    for (const child of splitItems) {
      const childId = child.id.trim();
      if (!childId || !child.title.trim()) {
        throw new PublishError('Each split item requires a non-empty ID and title.');
      }
      const dup = await db.prepare('SELECT id FROM open_problems WHERE id = ?').bind(childId).first();
      if (dup) throw new PublishError(`Split child ID "${childId}" already exists.`, 409);

      const childAlerts = checkTerminology(`${child.title} ${child.description}`, rules);
      const childLineage = {
        type: 'split',
        predecessors: [parentId],
        what_changed: `Split from ${parentId} into ${childId}.`,
        why_changed: (input.why_changed || proposal.why_changed || rationale).trim(),
        justification_status: 'documented',
      };

      statements.push(
        db
          .prepare(
            `INSERT INTO open_problems (
              id, category, title, description, scores_json, paper_section_id,
              manuscript_alignment, status, lineage_json, provenance_json,
              governance_json, terminology_alerts_json, public_extra_json,
              internal_extra_json, sort_order, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, 'restructured', 'active', ?, ?, ?, ?, '{}', '{}', ?, ?, ?)`
          )
          .bind(
            childId,
            child.category || category,
            child.title.trim(),
            child.description.trim(),
            JSON.stringify(normalizeScores(child.scores)),
            parentId,
            JSON.stringify(childLineage),
            buildProvenanceJson(),
            buildGovernanceJson(rationale),
            JSON.stringify(childAlerts),
            sortOrder++,
            now,
            actor.id
          )
      );
      affectedIds.push(childId);
    }

    if (input.retire_original !== false) {
      statements.push(
        db
          .prepare("UPDATE open_problems SET status = 'retired', updated_at = ?, updated_by = ? WHERE id = ?")
          .bind(now, actor.id, parentId)
      );
      affectedIds.push(parentId);
    }
    decisionTargetId = parentId;
  } else if (proposal.proposal_type === 'retire') {
    const targetId = input.target_id || proposal.target_problem_ids[0];
    if (!targetId) throw new PublishError('Retire proposal requires a target Open Problem ID.');
    const existingRow = await db
      .prepare('SELECT * FROM open_problems WHERE id = ?')
      .bind(targetId)
      .first<OpenProblemRow>();
    if (!existingRow) throw new PublishError(`Open Problem ${targetId} not found.`, 404);

    const beforeObj = mapPublicOpenProblem(existingRow);
    const nextLineage = {
      ...beforeObj.lineage,
      what_changed: (input.what_changed || proposal.what_changed || `Retired ${targetId}.`).trim(),
      why_changed: (input.why_changed || proposal.why_changed || rationale).trim(),
      justification_status: 'documented',
    };

    statements.push(
      db
        .prepare(
          `UPDATE open_problems
           SET status = 'retired', lineage_json = ?, governance_json = ?, updated_at = ?, updated_by = ?
           WHERE id = ?`
        )
        .bind(
          JSON.stringify(nextLineage),
          buildGovernanceJson(rationale),
          now,
          actor.id,
          targetId
        )
    );
    affectedIds.push(targetId);
    decisionTargetId = targetId;
  } else if (proposal.proposal_type === 'challenge') {
    const chalId = (input.challenge_id || generateId('SC')).trim();
    const dup = await db.prepare('SELECT id FROM specific_challenges WHERE id = ?').bind(chalId).first();
    if (dup) throw new PublishError(`Specific Challenge ID "${chalId}" already exists.`, 409);

    const title = (input.title ?? proposal.proposed_title).trim();
    if (!title) throw new PublishError('Challenge title is required.');
    const problemIds = input.challenge_problem_ids?.length
      ? input.challenge_problem_ids
      : proposal.target_problem_ids;
    const owners = (input.challenge_owner || proposal.challenge_owner || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const sortOrder = await getNextSortOrder(db, 'specific_challenges');
    const evidence = proposal.source_url
      ? [
          {
            source_id: 'COMMUNITY',
            location: proposal.source_verification || 'Community submission',
            url: proposal.source_url,
          },
        ]
      : [];

    statements.push(
      db
        .prepare(
          `INSERT INTO specific_challenges (
            id, title, kind, problem_ids_json, status, tractability,
            first_milestone, owners_json, evidence_json, extra_json,
            is_active, sort_order, updated_at, updated_by
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, '{}', 1, ?, ?, ?)`
        )
        .bind(
          chalId,
          title,
          (input.challenge_kind || 'Community challenge').trim(),
          JSON.stringify(problemIds),
          (input.challenge_status || proposal.challenge_status || 'Open for owners').trim(),
          (input.challenge_milestone || proposal.challenge_milestone || null),
          JSON.stringify(owners),
          JSON.stringify(evidence),
          sortOrder,
          now,
          actor.id
        )
    );
    affectedIds.push(chalId);
    decisionTargetId = problemIds[0] || chalId;
  } else if (proposal.proposal_type === 'challenge_update') {
    const chalId = (input.challenge_id || input.target_id || proposal.target_problem_ids[0] || '').trim();
    if (!chalId) throw new PublishError('Challenge update requires a target challenge ID.');
    const existingRow = await db
      .prepare('SELECT * FROM specific_challenges WHERE id = ?')
      .bind(chalId)
      .first<SpecificChallengeRow>();
    if (!existingRow) throw new PublishError(`Specific Challenge ${chalId} not found.`, 404);

    const existing = mapChallenge(existingRow);
    const nextTitle = (input.title || proposal.proposed_title || existing.title).trim();
    const nextStatus = (input.challenge_status || proposal.challenge_status || existing.status || null);
    const nextMilestone = (
      input.challenge_milestone ||
      proposal.challenge_milestone ||
      existing.first_milestone ||
      null
    );
    const incomingOwner = (input.challenge_owner || proposal.challenge_owner || '').trim();
    const owners = [...(existing.owners ?? [])];
    if (incomingOwner && !owners.includes(incomingOwner)) {
      owners.push(incomingOwner);
    }

    statements.push(
      db
        .prepare(
          `UPDATE specific_challenges
           SET title = ?, status = ?, first_milestone = ?, owners_json = ?,
               updated_at = ?, updated_by = ?
           WHERE id = ?`
        )
        .bind(nextTitle, nextStatus, nextMilestone, JSON.stringify(owners), now, actor.id, chalId)
    );
    affectedIds.push(chalId);
    decisionTargetId = existing.problem_ids[0] || chalId;
  }

  // Always update proposal moderation record, insert CollectiveDecision, and append Audit Log
  statements.push(
    db
      .prepare(
        `UPDATE proposals
         SET moderation_status = 'approved', reviewed_by = ?, reviewed_by_name = ?,
             reviewed_at = ?, review_notes = ?, decision_id = ?
         WHERE id = ?`
      )
      .bind(
        actor.id,
        actor.display_name,
        now,
        (input.review_notes || rationale).trim(),
        decisionId,
        proposal.id
      ),
    db
      .prepare(
        `INSERT INTO collective_decisions (
          id, proposal_id, target_id, outcome, moderator_user_id, moderator_name,
          rationale, minority_dissent, decided_at
        ) VALUES (?, ?, ?, 'moderator_approved', ?, ?, ?, ?, ?)`
      )
      .bind(
        decisionId,
        proposal.id,
        decisionTargetId || proposal.id,
        actor.id,
        actor.display_name,
        rationale,
        input.minority_dissent?.trim() || null,
        now
      ),
    buildAuditInsert(db, {
      actor,
      action: 'proposal.approve_publish',
      entityType: 'proposal',
      entityId: proposal.id,
      before: { moderation_status: proposal.moderation_status },
      after: {
        moderation_status: 'approved',
        decision_id: decisionId,
        affected_ids: affectedIds,
      },
      reason: rationale,
    })
  );

  await db.batch(statements);

  return {
    decision_id: decisionId,
    affected_ids: affectedIds,
    sanitization_warnings: safety.warnings,
  };
}

/**
 * Captures the full live active agenda as a frozen Release snapshot object.
 */
export async function buildLiveSnapshotPayload(db: D1Database): Promise<{
  problemIds: string[];
  snapshot: {
    open_problems: OpenProblem[];
    specific_challenges: SpecificChallenge[];
    captured_at: string;
  };
}> {
  const [probRes, chalRes] = await db.batch([
    db.prepare(
      `SELECT id, category, title, description, scores_json, paper_section_id,
              manuscript_alignment, status, lineage_json, provenance_json,
              governance_json, terminology_alerts_json, public_extra_json,
              sort_order, updated_at, updated_by
       FROM open_problems WHERE status = 'active' ORDER BY sort_order ASC, id ASC`
    ),
    db.prepare(
      `SELECT id, title, kind, problem_ids_json, status, tractability,
              first_milestone, owners_json, evidence_json, extra_json,
              is_active, sort_order, updated_at
       FROM specific_challenges WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`
    ),
  ]);

  const open_problems = ((probRes.results || []) as unknown as OpenProblemRow[]).map(
    mapPublicOpenProblem
  );
  const specific_challenges = (
    (chalRes.results || []) as unknown as SpecificChallengeRow[]
  ).map(mapChallenge);

  return {
    problemIds: open_problems.map((p) => p.id),
    snapshot: {
      open_problems,
      specific_challenges,
      captured_at: new Date().toISOString(),
    },
  };
}

export function extractSnapshotProblems(
  rawSnapshotJson: string
): { open_problems: OpenProblem[]; specific_challenges?: SpecificChallenge[] } | null {
  const parsed = parseJson<Record<string, unknown>>(rawSnapshotJson, {});
  if (Array.isArray(parsed.open_problems)) {
    return {
      open_problems: parsed.open_problems as OpenProblem[],
      specific_challenges: Array.isArray(parsed.specific_challenges)
        ? (parsed.specific_challenges as SpecificChallenge[])
        : undefined,
    };
  }
  return null;
}
