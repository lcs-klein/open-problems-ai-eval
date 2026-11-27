export type CategoryCode = 'F' | 'T' | 'V' | 'D' | 'L' | 'I' | 'P';

export type AuthorType = 'human' | 'ai_assisted' | 'machine_generated';

export type GovernanceStatus =
  | 'draft'
  | 'screening_recommendation'
  | 'under_human_review'
  | 'moderator_approved'
  | 'rejected';

export interface TerminologyRule {
  id: string;
  locked_term: string;
  disallowed_substitutes: string[];
  severity: 'error' | 'warning';
  paper_context: string;
  rationale: string;
}

export interface TerminologyAlert {
  rule_id: string;
  locked_term: string;
  found_term: string;
  severity: 'error' | 'warning';
  paper_context: string;
  rationale: string;
}

export interface ProblemLineage {
  type?: string;
  predecessors?: string[];
  related?: string[];
  what_changed: string;
  why_changed: string;
  justification_status: 'documented' | 'needs_human_justification';
}

export interface ProvenanceInfo {
  author_type: AuthorType;
  proposer_name: string;
  known_ai_role: string;
}

export interface ModeratorSignoff {
  moderator_name: string | null;
  decision_date: string | null;
  notes: string | null;
}

export interface GovernanceInfo {
  status: GovernanceStatus;
  moderator_signoff: ModeratorSignoff;
}

export interface OpenProblem {
  id: string;
  category: CategoryCode;
  title: string;
  description: string;
  confidence?: string;
  scores: number[];
  parents?: string[];
  operation?: string;
  rationales?: string[];
  paper_section_id: string;
  manuscript_alignment: 'aligned' | 'restructured' | 'new_proposal';
  lineage: ProblemLineage;
  provenance: ProvenanceInfo;
  governance: GovernanceInfo;
  terminology_alerts: TerminologyAlert[];
  reference_ids?: string[];
  input_kinds?: string[];
  stakeholders?: string[];
  research_targets?: string[];
  known_ai_role?: string;
  review_status?: string;
  notes?: string;
  included?: boolean;
  expert_ids?: string[];
  programme_ids?: string[];
  sources?: string[];
}

export interface SpecificChallenge {
  id: string;
  title: string;
  kind: string;
  earlier_problem_id?: string;
  problem_ids: string[];
  possible_problem_ids?: string[];
  formulation_id?: string;
  parent_formulation_ids?: string[];
  evidence?: Array<{
    source_id?: string;
    source_question_id?: string;
    location?: string;
    quote?: string;
    url?: string;
    formulation_type?: string;
  }>;
  status?: string;
  tractability?: string;
  first_milestone?: string;
  owners?: string[];
}

export interface RubricDimension {
  id: string;
  label: string;
  description: string;
  min?: number;
  max?: number;
  threshold?: number;
  rule?: string;
}

export interface ReferenceItem {
  id: string;
  title: string;
  url?: string;
  type?: string;
  table2?: boolean;
  extraction_counts?: Record<string, number>;
}

export interface ReproducePackage {
  id: string;
  title: string;
  href: string;
  command: string;
  description: string;
}

export type ProposalType =
  | 'add'
  | 'revise'
  | 'merge'
  | 'split'
  | 'retire'
  | 'challenge'
  | 'challenge_update';

export interface ProposalDraft {
  id: string;
  created_at: string;
  proposal_type: ProposalType;
  target_problem_ids: string[];
  category: CategoryCode;
  proposed_title: string;
  proposed_description: string;
  what_changed: string;
  why_changed: string;
  is_original_synthesis: boolean;
  source_url: string;
  source_verification: string;
  used_ai_assistance: boolean;
  ai_disclosure_details: string;
  human_verification_steps: string;
  coi_statement: string;
  proposer_name: string;
  challenge_milestone?: string;
  challenge_owner?: string;
  challenge_status?: string;
}

export interface PeerReview {
  id: string;
  target_id: string;
  reviewer_name: string;
  stance: 'support' | 'revise' | 'object';
  summary: string;
  created_at: string;
}

export interface CollectiveDecision {
  id: string;
  target_id: string;
  outcome: 'moderator_approved' | 'deferred' | 'rejected';
  moderator_name: string;
  rationale: string;
  minority_dissent?: string;
  decided_at: string;
}

export interface ScreeningFrontierPoint {
  k: number;
  objective: number;
  bridge_score?: number;
  avg_q1?: number;
  avg_q2?: number;
  avg_q3?: number;
  needs_coverage?: number;
  research_coverage?: number;
}

export interface OriginalLocatorObject {
  source?: string;
  section?: string;
  page_start?: number;
  page_end?: number;
  text_heading_line?: number;
}

export interface OriginalLinkItem {
  candidate_id: string;
  relationship?: string;
  coverage?: string;
  evidence?: string;
}

export interface PublicBundle {
  schema_version: number;
  taxonomy: {
    tier1_label: string;
    tier2_label: string;
    tier3_label: string;
  };
  project: {
    title: string;
    subtitle: string;
    manuscript: string;
    manuscript_date: string;
    paper_url?: string;
  };
  categories: Record<CategoryCode, string>;
  rubric: RubricDimension[];
  terminology_rules: TerminologyRule[];
  open_problems: OpenProblem[];
  specific_challenges: SpecificChallenge[];
  references: ReferenceItem[];
  source_audit: Record<string, unknown>;
  participation: {
    current_version: string;
    github?: { repository?: string; issue_template?: string };
    proposals: ProposalDraft[];
    reviews: PeerReview[];
    decisions: CollectiveDecision[];
    challenges: SpecificChallenge[];
    releases: Array<Record<string, unknown>>;
    challenge_updates: Array<Record<string, unknown>>;
  };
  version_snapshots: Record<string, Record<string, unknown>>;
  generation_method: Record<string, unknown>;
  provenance_audit: Record<string, unknown>;
  editorial_audit: Record<string, unknown>;
  screening_alternatives: Record<string, unknown>;
  screening_frontier?: ScreeningFrontierPoint[];
  manuscript_review: Record<string, unknown>;
  generation_upstream: Record<string, unknown>;
  openness_review: Record<string, unknown>;
  reproduce_packages: ReproducePackage[];
}

export interface OriginalProseObject {
  todos?: string[];
  ai_marked_passages?: number;
  preserve_developed_material?: boolean;
}

export interface OriginalItem {
  id: string;
  legacy_id: string;
  title: string;
  statement?: string | null;
  statement_status?: string;
  locator?: string | OriginalLocatorObject;
  source_attribution?: string;
  prose?: string | OriginalProseObject | null;
  links?: Array<string | OriginalLinkItem>;
  disposition?: string;
}

export interface ProgrammeItem {
  id: string;
  question: string;
  module?: string;
  session?: string;
  instructor?: string;
  primary?: string;
  secondary?: string[];
  status?: string;
  new_candidate_links?: string[];
}

export interface LiteratureItem {
  id: string;
  source_id?: string;
  source_title?: string;
  source_url?: string;
  title?: string;
  question_zh?: string;
  rationale?: string;
  scope?: string;
}

export interface ExpertItem {
  id: string;
  expert: string;
  source_type?: string;
  wording: string;
  wording_en?: string;
  location?: string;
  supports?: string;
  versions?: string[];
}

export interface InternalBundle {
  schema_version: number;
  taxonomy: {
    tier1_label: string;
    tier2_label: string;
    tier3_label: string;
  };
  meta: Record<string, unknown>;
  categories: Record<CategoryCode, string>;
  rubric: RubricDimension[];
  terminology_rules: TerminologyRule[];
  open_problems: OpenProblem[];
  candidates: OpenProblem[];
  originals: OriginalItem[];
  programme: ProgrammeItem[];
  literature: LiteratureItem[];
  experts: ExpertItem[];
  method: Record<string, unknown>;
}

export type EditAction = 'added' | 'modified' | 'deleted';

export interface ProblemEdit {
  id: string;
  action: EditAction;
  before?: Partial<OpenProblem>;
  after?: Partial<OpenProblem>;
  why_changed: string;
  updated_at: string;
}

export interface ReviewDiffPayload {
  schema_version: number;
  reviewer_name: string;
  exported_at: string;
  edits: Record<string, ProblemEdit>;
}
