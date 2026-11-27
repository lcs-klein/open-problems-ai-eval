import type {
  CategoryCode,
  CollectiveDecision,
  InternalBundle,
  OpenProblem,
  PeerReview,
  ProposalDraft,
  PublicBundle,
  SpecificChallenge,
  TerminologyAlert,
} from './types';

export type UserRole = 'admin' | 'moderator';

export type ProposalModerationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'spam';

export type ReviewModerationStatus = 'pending' | 'approved' | 'rejected' | 'spam';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  must_change_password: boolean;
  last_login_at?: string | null;
}

export interface AdminUserRecord extends AuthUser {
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface StoredProposal extends ProposalDraft {
  moderation_status: ProposalModerationStatus;
  terminology_alerts: TerminologyAlert[];
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  decision_id?: string | null;
}

export interface StoredPeerReview extends PeerReview {
  moderation_status: ReviewModerationStatus;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

export interface ReleaseRecord {
  id: string;
  title: string;
  date: string;
  kind: string;
  summary: string;
  problem_ids: string[];
  is_current: boolean;
  published_by_name?: string | null;
  published_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  created_at: string;
}

export interface PublicBootstrapResponse {
  bundle: PublicBundle;
  releases: ReleaseRecord[];
  updated_at: string;
}

export interface SplitProblemItem {
  id: string;
  category: CategoryCode;
  title: string;
  description: string;
  scores: number[];
}

export interface PublishProposalRequest {
  /** Finalized fields (optional overrides over community proposal) */
  target_id?: string;
  new_id?: string;
  category?: CategoryCode;
  title?: string;
  description?: string;
  scores?: number[];
  what_changed?: string;
  why_changed?: string;
  /** For split proposals: 2+ child problems */
  split_items?: SplitProblemItem[];
  retire_original?: boolean;
  /** For challenge / challenge_update */
  challenge_id?: string;
  challenge_kind?: string;
  challenge_problem_ids?: string[];
  challenge_milestone?: string;
  challenge_owner?: string;
  challenge_status?: string;
  /** Mandatory moderator decision record */
  rationale: string;
  minority_dissent?: string;
  review_notes?: string;
  allow_cjk?: boolean;
}

export interface ModerationQueueResponse {
  counts: {
    pending_proposals: number;
    pending_reviews: number;
    total_proposals: number;
    total_reviews: number;
  };
  proposals: StoredProposal[];
  reviews: StoredPeerReview[];
  decisions: CollectiveDecision[];
}

export interface InternalCrosswalkResponse {
  bundle: Omit<InternalBundle, 'programme' | 'literature'> & {
    programme_count: number;
    literature_count: number;
    retired_problems: OpenProblem[];
    specific_challenges: SpecificChallenge[];
  };
}

export interface InternalSourcesResponse {
  kind: 'experts' | 'originals' | 'programme' | 'literature';
  total: number;
  limit: number;
  offset: number;
  items: unknown[];
}
