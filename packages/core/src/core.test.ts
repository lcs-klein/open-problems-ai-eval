import { describe, expect, it } from 'vitest';
import {
  checkTerminology,
  validateProposal,
  createReviewDiffPayload,
  parseReviewDiffPayload,
  applyEditsToProblems,
  type OpenProblem,
  type ProposalDraft,
  type TerminologyRule,
} from './index';

const SAMPLE_RULES: TerminologyRule[] = [
  {
    id: 'TERM-001',
    locked_term: 'capabilities',
    disallowed_substitutes: ['abilities'],
    severity: 'error',
    paper_context: 'Section F.2',
    rationale: 'Preserve technical term capabilities.',
  },
  {
    id: 'TERM-002',
    locked_term: 'propensities',
    disallowed_substitutes: ['tendencies'],
    severity: 'error',
    paper_context: 'Section F.2',
    rationale: 'Preserve technical term propensities.',
  },
];

describe('@opae/core', () => {
  it('flags locked terminology replacements', () => {
    const alerts = checkTerminology(
      'Unclear definitions of abilities and tendencies',
      SAMPLE_RULES
    );
    expect(alerts.map((a) => a.locked_term)).toEqual(['capabilities', 'propensities']);
  });

  it('validates merge proposal constraints and AI disclosure', () => {
    const invalidDraft: ProposalDraft = {
      id: 'P-1',
      created_at: '2026-11-24T00:00:00Z',
      proposal_type: 'merge',
      target_problem_ids: ['C.F1a'],
      category: 'F',
      proposed_title: 'Merged abilities problem',
      proposed_description: 'Desc',
      what_changed: 'Merged two items',
      why_changed: 'Short',
      is_original_synthesis: false,
      source_url: 'http://insecure.example',
      source_verification: '',
      used_ai_assistance: true,
      ai_disclosure_details: '',
      human_verification_steps: '',
      coi_statement: '',
      proposer_name: '',
    };

    const res = validateProposal(invalidDraft, SAMPLE_RULES);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(6);
    expect(res.fieldErrors.proposer_name).toBeTruthy();
    expect(res.fieldErrors.target_problem_ids).toBeTruthy();
    expect(res.terminology_alerts).toHaveLength(1);
  });

  it('allows retire proposals without a new title and checks known target IDs', () => {
    const known = new Set(['C.F1a', 'C.F2a']);
    const retireDraft: ProposalDraft = {
      id: 'P-2',
      created_at: '2026-11-24T00:00:00Z',
      proposal_type: 'retire',
      target_problem_ids: ['C.F2a'],
      category: 'F',
      proposed_title: '',
      proposed_description: '',
      what_changed: 'Retire C.F2a',
      why_changed: 'Fully subsumed by updated manuscript section F.2 after author consensus.',
      is_original_synthesis: true,
      source_url: '',
      source_verification: '',
      used_ai_assistance: false,
      ai_disclosure_details: '',
      human_verification_steps: '',
      coi_statement: 'None declared',
      proposer_name: 'Dr. Jane Doe',
    };

    const ok = validateProposal(retireDraft, SAMPLE_RULES, known);
    expect(ok.valid).toBe(true);

    const badTarget = validateProposal(
      { ...retireDraft, target_problem_ids: ['NON_EXISTENT'] },
      SAMPLE_RULES,
      known
    );
    expect(badTarget.valid).toBe(false);
    expect(badTarget.fieldErrors.target_problem_ids).toContain('NON_EXISTENT');
  });

  it('round-trips ReviewDiffPayload and applies edits to OpenProblem list', () => {
    const base: OpenProblem[] = [
      {
        id: 'C.F2a',
        category: 'F',
        title: 'Unclear definitions of abilities and tendencies',
        description: 'Base desc',
        scores: [4, 3, 4, 4, 4],
        paper_section_id: 'F.2',
        manuscript_alignment: 'restructured',
        lineage: {
          what_changed: 'Merged F.2-F.4',
          why_changed: 'Pending',
          justification_status: 'needs_human_justification',
        },
        provenance: {
          author_type: 'ai_assisted',
          proposer_name: 'Astra',
          known_ai_role: 'Screening',
        },
        governance: {
          status: 'screening_recommendation',
          moderator_signoff: { moderator_name: null, decision_date: null, notes: null },
        },
        terminology_alerts: [],
      },
    ];

    const payload = createReviewDiffPayload('Jose', {
      'C.F2a': {
        id: 'C.F2a',
        action: 'modified',
        after: { title: 'Unclear definitions of capabilities and propensities' },
        why_changed: 'Restore manuscript terminology.',
        updated_at: '2026-11-24T00:00:00Z',
      },
    });
    const parsed = parseReviewDiffPayload(JSON.stringify(payload));
    const applied = applyEditsToProblems(base, parsed.edits);
    expect(applied[0].title).toBe('Unclear definitions of capabilities and propensities');
    expect(applied[0]._editAction).toBe('modified');
    expect(applied[0].lineage.why_changed).toBe('Restore manuscript terminology.');
  });
});
