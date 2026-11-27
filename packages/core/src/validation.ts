import type { ProposalDraft, TerminologyAlert, TerminologyRule } from './types';
import { checkTerminology } from './terminology';

export interface ProposalValidationResult {
  valid: boolean;
  errors: string[];
  fieldErrors: Record<string, string>;
  terminology_alerts: TerminologyAlert[];
}

export function validateProposal(
  draft: ProposalDraft,
  rules: TerminologyRule[],
  knownIds?: Set<string>
): ProposalValidationResult {
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};

  const addError = (field: string, msg: string) => {
    errors.push(msg);
    if (!fieldErrors[field]) fieldErrors[field] = msg;
  };

  if (!draft.proposer_name.trim()) {
    addError('proposer_name', 'Author name or pseudonym is required for traceability.');
  }
  if (!draft.coi_statement.trim()) {
    addError('coi_statement', 'Conflict of Interest (COI) statement is required.');
  }
  if (draft.proposal_type !== 'retire' && !draft.proposed_title.trim()) {
    addError('proposed_title', 'Proposed title is required.');
  }
  if (!draft.why_changed.trim() || draft.why_changed.trim().length < 15) {
    addError(
      'why_changed',
      'Normative justification ("Why this change is needed") must be at least 15 characters.'
    );
  }

  if (draft.proposal_type === 'merge' && draft.target_problem_ids.length < 2) {
    addError(
      'target_problem_ids',
      'Merge proposals must reference at least 2 existing Open Problem IDs.'
    );
  }

  if (
    ['revise', 'split', 'retire', 'challenge', 'challenge_update'].includes(
      draft.proposal_type
    ) &&
    draft.target_problem_ids.length < 1
  ) {
    addError(
      'target_problem_ids',
      `Proposal type "${draft.proposal_type}" must reference at least 1 target ID.`
    );
  }

  if (knownIds && draft.target_problem_ids.length > 0 && draft.proposal_type !== 'add') {
    const unknown = draft.target_problem_ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      addError(
        'target_problem_ids',
        `Unknown target ID(s): ${unknown.join(', ')}. Please pick from existing agenda items.`
      );
    }
  }

  if (!draft.is_original_synthesis) {
    if (!draft.source_url.trim().startsWith('https://')) {
      addError(
        'source_url',
        'Non-original synthesis proposals require a public https:// source URL.'
      );
    }
    if (!draft.source_verification.trim()) {
      addError(
        'source_verification',
        'Source verification note is required for external literature sources.'
      );
    }
  }

  if (draft.used_ai_assistance) {
    if (!draft.ai_disclosure_details.trim()) {
      addError(
        'ai_disclosure_details',
        'AI assistance disclosure details are required when AI was used.'
      );
    }
    if (!draft.human_verification_steps.trim()) {
      addError(
        'human_verification_steps',
        'Human verification steps are required when AI assistance was used.'
      );
    }
  }

  const combined = `${draft.proposed_title} ${draft.proposed_description}`;
  const terminology_alerts = checkTerminology(combined, rules);

  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
    terminology_alerts,
  };
}
