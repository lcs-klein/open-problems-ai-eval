import type {
  AuthUser,
  CategoryCode,
  CollectiveDecision,
  OpenProblem,
  PeerReview,
  ProposalType,
  ReleaseRecord,
  SpecificChallenge,
  StoredPeerReview,
  StoredProposal,
  TerminologyRule,
} from '@opae/core';
import { generateId } from './crypto';

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface OpenProblemRow {
  id: string;
  category: CategoryCode;
  title: string;
  description: string;
  scores_json: string;
  paper_section_id: string;
  manuscript_alignment: OpenProblem['manuscript_alignment'];
  status: 'active' | 'retired';
  lineage_json: string;
  provenance_json: string;
  governance_json: string;
  terminology_alerts_json: string;
  public_extra_json: string;
  internal_extra_json?: string;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Maps an open_problems row strictly for PUBLIC API responses.
 * Never reads or spreads internal_extra_json.
 */
export function mapPublicOpenProblem(row: OpenProblemRow): OpenProblem {
  const pubExtra = parseJson<Record<string, unknown>>(row.public_extra_json, {});
  return {
    ...pubExtra,
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description,
    scores: parseJson<number[]>(row.scores_json, [3, 3, 3, 3, 3]),
    paper_section_id: row.paper_section_id,
    manuscript_alignment: row.manuscript_alignment,
    lineage: parseJson(row.lineage_json, {
      what_changed: '',
      why_changed: '',
      justification_status: 'documented',
    }),
    provenance: parseJson(row.provenance_json, {
      author_type: 'human',
      proposer_name: 'Editorial Board',
      known_ai_role: 'None',
    }),
    governance: parseJson(row.governance_json, {
      status: 'screening_recommendation',
      moderator_signoff: { moderator_name: null, decision_date: null, notes: null },
    }),
    terminology_alerts: parseJson(row.terminology_alerts_json, []),
  } as OpenProblem;
}

/**
 * Maps an open_problems row for authenticated INTERNAL workbench APIs.
 * Merges internal_extra_json in addition to public fields.
 */
export function mapInternalOpenProblem(row: OpenProblemRow): OpenProblem {
  const base = mapPublicOpenProblem(row);
  const intlExtra = parseJson<Record<string, unknown>>(row.internal_extra_json, {});
  return {
    ...intlExtra,
    ...base,
  } as OpenProblem;
}

export interface SpecificChallengeRow {
  id: string;
  title: string;
  kind: string;
  problem_ids_json: string;
  status: string | null;
  tractability: string | null;
  first_milestone: string | null;
  owners_json: string;
  evidence_json: string;
  extra_json: string;
  is_active: number;
  sort_order: number;
  updated_at: string;
}

export function mapChallenge(row: SpecificChallengeRow): SpecificChallenge {
  const extra = parseJson<Record<string, unknown>>(row.extra_json, {});
  return {
    ...extra,
    id: row.id,
    title: row.title,
    kind: row.kind,
    problem_ids: parseJson<string[]>(row.problem_ids_json, []),
    status: row.status ?? undefined,
    tractability: row.tractability ?? undefined,
    first_milestone: row.first_milestone ?? undefined,
    owners: parseJson<string[]>(row.owners_json, []),
    evidence: parseJson(row.evidence_json, []),
  } as SpecificChallenge;
}

export interface ProposalRow {
  id: string;
  moderation_status: StoredProposal['moderation_status'];
  proposal_type: ProposalType;
  target_problem_ids_json: string;
  category: CategoryCode;
  proposed_title: string;
  proposed_description: string;
  what_changed: string;
  why_changed: string;
  is_original_synthesis: number;
  source_url: string;
  source_verification: string;
  used_ai_assistance: number;
  ai_disclosure_details: string;
  human_verification_steps: string;
  coi_statement: string;
  proposer_name: string;
  challenge_milestone: string | null;
  challenge_owner: string | null;
  challenge_status: string | null;
  terminology_alerts_json: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  decision_id: string | null;
}

export function mapProposal(row: ProposalRow): StoredProposal {
  return {
    id: row.id,
    created_at: row.created_at,
    moderation_status: row.moderation_status,
    proposal_type: row.proposal_type,
    target_problem_ids: parseJson<string[]>(row.target_problem_ids_json, []),
    category: row.category,
    proposed_title: row.proposed_title,
    proposed_description: row.proposed_description,
    what_changed: row.what_changed,
    why_changed: row.why_changed,
    is_original_synthesis: row.is_original_synthesis === 1,
    source_url: row.source_url,
    source_verification: row.source_verification,
    used_ai_assistance: row.used_ai_assistance === 1,
    ai_disclosure_details: row.ai_disclosure_details,
    human_verification_steps: row.human_verification_steps,
    coi_statement: row.coi_statement,
    proposer_name: row.proposer_name,
    challenge_milestone: row.challenge_milestone ?? undefined,
    challenge_owner: row.challenge_owner ?? undefined,
    challenge_status: row.challenge_status ?? undefined,
    terminology_alerts: parseJson(row.terminology_alerts_json, []),
    reviewed_by: row.reviewed_by,
    reviewed_by_name: row.reviewed_by_name,
    reviewed_at: row.reviewed_at,
    review_notes: row.review_notes,
    decision_id: row.decision_id,
  };
}

export interface PeerReviewRow {
  id: string;
  moderation_status: StoredPeerReview['moderation_status'];
  target_id: string;
  reviewer_name: string;
  stance: PeerReview['stance'];
  summary: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export function mapPeerReview(row: PeerReviewRow): StoredPeerReview {
  return {
    id: row.id,
    moderation_status: row.moderation_status,
    target_id: row.target_id,
    reviewer_name: row.reviewer_name,
    stance: row.stance,
    summary: row.summary,
    created_at: row.created_at,
    reviewed_by: row.reviewed_by,
    reviewed_by_name: row.reviewed_by_name,
    reviewed_at: row.reviewed_at,
    review_notes: row.review_notes,
  };
}

export interface CollectiveDecisionRow {
  id: string;
  proposal_id: string | null;
  target_id: string;
  outcome: CollectiveDecision['outcome'];
  moderator_name: string;
  rationale: string;
  minority_dissent: string | null;
  decided_at: string;
}

export function mapDecision(row: CollectiveDecisionRow): CollectiveDecision {
  return {
    id: row.id,
    target_id: row.target_id,
    outcome: row.outcome,
    moderator_name: row.moderator_name,
    rationale: row.rationale,
    minority_dissent: row.minority_dissent ?? undefined,
    decided_at: row.decided_at,
  };
}

export interface ReleaseRow {
  id: string;
  title: string;
  kind: string;
  summary: string;
  problem_ids_json: string;
  is_current: number;
  published_by_name: string | null;
  published_at: string;
}

export function mapRelease(row: ReleaseRow): ReleaseRecord {
  return {
    id: row.id,
    title: row.title,
    date: row.published_at.slice(0, 10),
    kind: row.kind,
    summary: row.summary,
    problem_ids: parseJson<string[]>(row.problem_ids_json, []),
    is_current: row.is_current === 1,
    published_by_name: row.published_by_name,
    published_at: row.published_at,
  };
}

export async function loadTerminologyRules(db: D1Database): Promise<TerminologyRule[]> {
  const row = await db
    .prepare("SELECT value_json FROM agenda_meta WHERE key = 'terminology_rules'")
    .first<{ value_json: string }>();
  return parseJson<TerminologyRule[]>(row?.value_json, []);
}

export function buildAuditInsert(
  db: D1Database,
  params: {
    actor: Pick<AuthUser, 'id' | 'display_name' | 'role'>;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  }
): D1PreparedStatement {
  const id = generateId('AUD');
  const now = new Date().toISOString();
  return db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, before_json, after_json, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.actor.id,
      params.actor.display_name,
      params.actor.role,
      params.action,
      params.entityType,
      params.entityId,
      params.before !== undefined ? JSON.stringify(params.before) : null,
      params.after !== undefined ? JSON.stringify(params.after) : null,
      params.reason ?? null,
      now
    );
}
