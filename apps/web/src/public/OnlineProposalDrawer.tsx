import React, { useEffect, useMemo, useState } from 'react';
import {
  validateProposal,
  type CategoryCode,
  type ProposalDraft,
  type ProposalType,
  type PublicBundle,
} from '@opae/core';
import {
  CheckIcon,
  CopyButton,
  DownloadIcon,
  RotateCcwIcon,
  SearchIcon,
  TerminologyAlertsPanel,
  XIcon,
  applyTerminologyFixes,
} from '@opae/ui';
import type { ProposalPrefill } from '../../../public/src/ProposalDrawer';
import { ApiError, publicApi } from '../api/client';
import { TurnstileWidget } from '../components/TurnstileWidget';

const DRAFT_STORAGE_KEY = 'opae_online_proposal_draft_v3';

const EMPTY_DRAFT: ProposalDraft = {
  id: '',
  created_at: '',
  proposal_type: 'revise',
  target_problem_ids: [],
  category: 'F',
  proposed_title: '',
  proposed_description: '',
  what_changed: '',
  why_changed: '',
  is_original_synthesis: false,
  source_url: '',
  source_verification: '',
  used_ai_assistance: false,
  ai_disclosure_details: '',
  human_verification_steps: '',
  coi_statement: 'None declared',
  proposer_name: '',
  challenge_milestone: '',
  challenge_owner: '',
  challenge_status: '',
};

export const OnlineProposalDrawer: React.FC<{
  open: boolean;
  bundle: PublicBundle;
  prefill: ProposalPrefill | null;
  onClose: () => void;
  onNotify: (message: string) => void;
}> = ({ open, bundle, prefill, onClose, onNotify }) => {
  const [draft, setDraft] = useState<ProposalDraft>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      return saved ? { ...EMPTY_DRAFT, ...JSON.parse(saved) } : EMPTY_DRAFT;
    } catch {
      return EMPTY_DRAFT;
    }
  });
  const [pickerQuery, setPickerQuery] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; json: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setReceipt(null);
    setAttemptedSubmit(false);
    setTouched({});
    setPickerQuery('');
    if (prefill) {
      setDraft((prev) => ({
        ...EMPTY_DRAFT,
        proposer_name: prev.proposer_name,
        coi_statement: prev.coi_statement || 'None declared',
        proposal_type: prefill.proposal_type ?? 'revise',
        target_problem_ids: prefill.target_problem_ids ?? [],
        category: prefill.category ?? 'F',
        proposed_title: prefill.proposed_title ?? '',
        proposed_description: prefill.proposed_description ?? '',
        what_changed: prefill.what_changed ?? '',
        why_changed: prefill.why_changed ?? '',
        challenge_milestone: prefill.challenge_milestone ?? '',
        challenge_owner: prefill.challenge_owner ?? '',
        challenge_status: prefill.challenge_status ?? '',
        is_original_synthesis:
          prefill.proposal_type === 'revise' || prefill.proposal_type === 'challenge_update',
      }));
    }
  }, [open, prefill]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [draft]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const knownIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of bundle.open_problems) ids.add(p.id);
    for (const c of bundle.specific_challenges) ids.add(c.id);
    return ids;
  }, [bundle.open_problems, bundle.specific_challenges]);

  const pickerPool = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const isChallengeTarget = draft.proposal_type === 'challenge_update';
    const items = isChallengeTarget
      ? bundle.specific_challenges.map((c) => ({
          id: c.id,
          title: c.title,
          meta: c.problem_ids.join(', '),
        }))
      : bundle.open_problems.map((p) => ({
          id: p.id,
          title: p.title,
          meta: `${p.category} · §${p.paper_section_id}`,
        }));

    return items.filter(
      (item) =>
        !q ||
        item.id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.meta.toLowerCase().includes(q)
    );
  }, [bundle.open_problems, bundle.specific_challenges, draft.proposal_type, pickerQuery]);

  const validation = useMemo(
    () => validateProposal(draft, bundle.terminology_rules, knownIds),
    [draft, bundle.terminology_rules, knownIds]
  );

  if (!open) return null;

  const markTouched = (field: string) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  const showError = (field: string) =>
    attemptedSubmit || touched[field] ? validation.fieldErrors[field] : undefined;

  const toggleTargetId = (id: string) => {
    markTouched('target_problem_ids');
    setDraft((prev) => {
      const exists = prev.target_problem_ids.includes(id);
      const nextIds = exists
        ? prev.target_problem_ids.filter((x) => x !== id)
        : [...prev.target_problem_ids, id];
      return { ...prev, target_problem_ids: nextIds };
    });
  };

  const handleRestoreLockedTerms = () => {
    setDraft((prev) => ({
      ...prev,
      proposed_title: applyTerminologyFixes(prev.proposed_title, validation.terminology_alerts),
      proposed_description: applyTerminologyFixes(
        prev.proposed_description,
        validation.terminology_alerts
      ),
    }));
    onNotify('Restored locked manuscript terminology in draft.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    setSubmitError(null);
    if (!validation.valid) return;
    if (!turnstileToken) {
      setSubmitError('Please complete the human verification challenge before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const { id: _ignoreId, created_at: _ignoreCreated, ...payload } = draft;
      const res = await publicApi.submitProposal({
        ...payload,
        turnstile_token: turnstileToken,
      });
      const backupJson = JSON.stringify(
        { ...draft, id: res.id, created_at: res.created_at, moderation_status: 'pending' },
        null,
        2
      );
      setReceipt({ id: res.id, json: backupJson });
      setDraft((prev) => ({
        ...EMPTY_DRAFT,
        proposer_name: prev.proposer_name,
        coi_statement: prev.coi_statement || 'None declared',
      }));
      setTouched({});
      setAttemptedSubmit(false);
      onNotify(`Proposal ${res.id} submitted for moderator review.`);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : 'Submission failed. Please check your connection.'
      );
    } finally {
      setSubmitting(false);
      setTurnstileNonce((n) => n + 1);
    }
  };

  const handleDownloadBackup = () => {
    if (!receipt) return;
    const blob = new Blob([receipt.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${receipt.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setTouched({});
    setAttemptedSubmit(false);
    setSubmitError(null);
    setReceipt(null);
    onNotify('Proposal draft cleared.');
  };

  const needsTargets = draft.proposal_type !== 'add';
  const isRetire = draft.proposal_type === 'retire';
  const isChallengeUpdate = draft.proposal_type === 'challenge_update';

  const readiness = [
    {
      label: 'Targets & Title',
      done: !validation.fieldErrors.target_problem_ids && !validation.fieldErrors.proposed_title,
    },
    { label: 'Why Changed', done: !validation.fieldErrors.why_changed },
    {
      label: 'Evidence / AI Disclosure',
      done:
        !validation.fieldErrors.source_url &&
        !validation.fieldErrors.source_verification &&
        !validation.fieldErrors.ai_disclosure_details &&
        !validation.fieldErrors.human_verification_steps,
    },
    {
      label: 'Author & COI',
      done: !validation.fieldErrors.proposer_name && !validation.fieldErrors.coi_statement,
    },
  ];

  return (
    <>
      <div className="ed-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="ed-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Submit Structured Agenda Proposal"
      >
        <div className="ed-drawer-head">
          <div>
            <span className="ed-section-label">
              {prefill?.contextLabel || 'Structured Agenda Proposal'}
            </span>
            <h2 className="ed-panel-title" style={{ marginTop: '4px' }}>
              Submit Community Proposal
            </h2>
          </div>
          <div className="ed-inline">
            <button
              type="button"
              className="ed-btn is-ghost is-sm"
              onClick={handleResetDraft}
              title="Reset draft"
            >
              <RotateCcwIcon size={13} />
              <span>Clear</span>
            </button>
            <button
              type="button"
              className="ed-btn is-ghost is-sm"
              onClick={onClose}
              aria-label="Close proposal drawer"
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>

        <form id="online-proposal-form" className="ed-drawer-body" onSubmit={handleSubmit} noValidate>
          {receipt && (
            <div className="ed-panel-soft ed-stack" style={{ gap: '10px', borderColor: 'var(--ed-add)' }}>
              <div className="ed-between">
                <strong className="ed-small" style={{ color: 'var(--ed-add)' }}>
                  Proposal Submitted · Tracking ID <span className="ed-mono">{receipt.id}</span>
                </strong>
                <div className="ed-inline">
                  <CopyButton
                    text={receipt.id}
                    label="Copy ID"
                    copiedLabel="Copied"
                    className="ed-btn is-sm"
                  />
                  <button type="button" className="ed-btn is-sm" onClick={handleDownloadBackup}>
                    <DownloadIcon size={13} />
                    <span>JSON Backup</span>
                  </button>
                </div>
              </div>
              <p className="ed-small ed-muted">
                Your submission is now in the editorial moderation queue. Once a human moderator
                reviews and approves it, the update and signed decision will be published live on
                this site.
              </p>
            </div>
          )}

          <div className="ed-checklist" aria-label="Proposal readiness checklist">
            {readiness.map((item) => (
              <span key={item.label} className={`ed-check-item ${item.done ? 'is-done' : ''}`}>
                <CheckIcon size={12} />
                <span>{item.label}</span>
              </span>
            ))}
          </div>

          <div className="ed-field-row">
            <label className="ed-field" style={{ flex: '1 1 210px' }}>
              Proposal Type
              <select
                className="ed-select"
                value={draft.proposal_type}
                onChange={(e) => {
                  const nextType = e.target.value as ProposalType;
                  setDraft((prev) => ({
                    ...prev,
                    proposal_type: nextType,
                    target_problem_ids: nextType === 'add' ? [] : prev.target_problem_ids,
                  }));
                }}
              >
                <option value="revise">Revise existing Open Problem</option>
                <option value="add">Add new Open Problem</option>
                <option value="merge">Merge Open Problems (≥ 2 IDs)</option>
                <option value="split">Split Open Problem</option>
                <option value="retire">Retire Open Problem</option>
                <option value="challenge">Add Specific Challenge</option>
                <option value="challenge_update">Update Challenge Milestone / Owner</option>
              </select>
            </label>

            <label className="ed-field" style={{ flex: '1 1 170px' }}>
              Tier-1 Category
              <select
                className="ed-select"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as CategoryCode })}
              >
                {(Object.entries(bundle.categories) as Array<[CategoryCode, string]>).map(
                  ([code, name]) => (
                    <option key={code} value={code}>
                      {code} · {name}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          {needsTargets && (
            <div className="ed-field">
              <span>
                {isChallengeUpdate
                  ? 'Select Target Specific Challenge(s)'
                  : draft.proposal_type === 'merge'
                    ? 'Select Open Problems to Merge (pick at least 2)'
                    : 'Select Target Open Problem(s)'}
              </span>
              <div className="ed-picker">
                {draft.target_problem_ids.length > 0 && (
                  <div className="ed-chip-row">
                    {draft.target_problem_ids.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="ed-tag is-ink ed-mono"
                        onClick={() => toggleTargetId(id)}
                        title="Click to remove"
                      >
                        <span>{id}</span>
                        <XIcon size={11} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="ed-search-wrap" style={{ maxWidth: 'none' }}>
                  <span className="ed-search-icon">
                    <SearchIcon size={14} />
                  </span>
                  <input
                    type="search"
                    className="ed-search-input"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder={
                      isChallengeUpdate
                        ? 'Filter challenges by ID or keyword...'
                        : 'Filter open problems by ID, § section, or title...'
                    }
                  />
                </div>
                <div className="ed-picker-list" role="listbox" aria-label="Target items">
                  {pickerPool.slice(0, 24).map((item) => {
                    const active = draft.target_problem_ids.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="ed-picker-option"
                        aria-pressed={active}
                        onClick={() => toggleTargetId(item.id)}
                      >
                        <span className="ed-mono ed-code" style={{ flexShrink: 0 }}>
                          {item.id}
                        </span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.title}
                        </span>
                      </button>
                    );
                  })}
                  {pickerPool.length === 0 && (
                    <span className="ed-small ed-faint" style={{ padding: '6px 8px' }}>
                      No matching agenda items.
                    </span>
                  )}
                </div>
              </div>
              {showError('target_problem_ids') && (
                <span className="ed-field-error">{showError('target_problem_ids')}</span>
              )}
            </div>
          )}

          <label className="ed-field">
            {isRetire ? 'Retirement Summary (optional)' : 'Proposed Title'}
            <input
              type="text"
              className="ed-input"
              value={draft.proposed_title}
              onBlur={() => markTouched('proposed_title')}
              onChange={(e) => setDraft({ ...draft, proposed_title: e.target.value })}
              placeholder="Concise title preserving manuscript terminology..."
            />
            {showError('proposed_title') && (
              <span className="ed-field-error">{showError('proposed_title')}</span>
            )}
          </label>

          {!isRetire && (
            <label className="ed-field">
              Proposed Description
              <textarea
                className="ed-textarea"
                value={draft.proposed_description}
                onChange={(e) => setDraft({ ...draft, proposed_description: e.target.value })}
                placeholder="3–4 lines stating the evaluation obstacle, claim, and decision it informs..."
              />
            </label>
          )}

          <TerminologyAlertsPanel
            alerts={validation.terminology_alerts}
            onFixTerms={handleRestoreLockedTerms}
            fixLabel="Auto-restore locked terms"
          />

          {(isChallengeUpdate || draft.proposal_type === 'challenge') && (
            <div className="ed-field-row">
              <label className="ed-field" style={{ flex: '1 1 180px' }}>
                Proposed Owner / Team
                <input
                  type="text"
                  className="ed-input"
                  value={draft.challenge_owner ?? ''}
                  onChange={(e) => setDraft({ ...draft, challenge_owner: e.target.value })}
                  placeholder="Name or lab claiming this challenge"
                />
              </label>
              <label className="ed-field" style={{ flex: '1 1 180px' }}>
                Status
                <select
                  className="ed-select"
                  value={draft.challenge_status ?? ''}
                  onChange={(e) => setDraft({ ...draft, challenge_status: e.target.value })}
                >
                  <option value="">Keep / default status</option>
                  <option value="Open for owners">Open for owners</option>
                  <option value="Active investigation">Active investigation</option>
                  <option value="Benchmark / evidence submitted">
                    Benchmark / evidence submitted
                  </option>
                </select>
              </label>
              <label className="ed-field" style={{ flex: '1 1 100%' }}>
                First Concrete Milestone
                <input
                  type="text"
                  className="ed-input"
                  value={draft.challenge_milestone ?? ''}
                  onChange={(e) => setDraft({ ...draft, challenge_milestone: e.target.value })}
                  placeholder="Observable deliverable or benchmark protocol..."
                />
              </label>
            </div>
          )}

          <label className="ed-field">
            What Changed (Factual Summary)
            <input
              type="text"
              className="ed-input"
              value={draft.what_changed}
              onChange={(e) => setDraft({ ...draft, what_changed: e.target.value })}
              placeholder="e.g. Restores manuscript terms 'capabilities' and 'propensities'"
            />
          </label>

          <label className="ed-field">
            Why This Change Is Needed (Normative Justification · ≥ 15 chars)
            <textarea
              className="ed-textarea"
              value={draft.why_changed}
              onBlur={() => markTouched('why_changed')}
              onChange={(e) => setDraft({ ...draft, why_changed: e.target.value })}
              placeholder="Explain what defect, ambiguity, terminology drift, or overlap justifies this change..."
            />
            {showError('why_changed') && (
              <span className="ed-field-error">{showError('why_changed')}</span>
            )}
          </label>

          <label className="ed-check-row">
            <input
              type="checkbox"
              checked={draft.is_original_synthesis}
              onChange={(e) => setDraft({ ...draft, is_original_synthesis: e.target.checked })}
            />
            <span>Original synthesis / terminology alignment (no new external URL required)</span>
          </label>

          {!draft.is_original_synthesis && (
            <div className="ed-field-row">
              <label className="ed-field" style={{ flex: '1 1 220px' }}>
                Public Source URL (https://)
                <input
                  type="url"
                  className="ed-input"
                  value={draft.source_url}
                  onBlur={() => markTouched('source_url')}
                  onChange={(e) => setDraft({ ...draft, source_url: e.target.value })}
                  placeholder="https://arxiv.org/abs/..."
                />
                {showError('source_url') && (
                  <span className="ed-field-error">{showError('source_url')}</span>
                )}
              </label>
              <label className="ed-field" style={{ flex: '1 1 220px' }}>
                Source Verification Note
                <input
                  type="text"
                  className="ed-input"
                  value={draft.source_verification}
                  onBlur={() => markTouched('source_verification')}
                  onChange={(e) => setDraft({ ...draft, source_verification: e.target.value })}
                  placeholder="Section / page checked by human"
                />
                {showError('source_verification') && (
                  <span className="ed-field-error">{showError('source_verification')}</span>
                )}
              </label>
            </div>
          )}

          <label className="ed-check-row">
            <input
              type="checkbox"
              checked={draft.used_ai_assistance}
              onChange={(e) => setDraft({ ...draft, used_ai_assistance: e.target.checked })}
            />
            <span>AI assistance was used in drafting or screening (mandatory disclosure)</span>
          </label>

          {draft.used_ai_assistance && (
            <div className="ed-field-row">
              <label className="ed-field" style={{ flex: '1 1 220px' }}>
                AI Assistance Disclosure
                <input
                  type="text"
                  className="ed-input"
                  value={draft.ai_disclosure_details}
                  onBlur={() => markTouched('ai_disclosure_details')}
                  onChange={(e) => setDraft({ ...draft, ai_disclosure_details: e.target.value })}
                  placeholder="Model name and exact role..."
                />
                {showError('ai_disclosure_details') && (
                  <span className="ed-field-error">{showError('ai_disclosure_details')}</span>
                )}
              </label>
              <label className="ed-field" style={{ flex: '1 1 220px' }}>
                Human Verification Steps
                <input
                  type="text"
                  className="ed-input"
                  value={draft.human_verification_steps}
                  onBlur={() => markTouched('human_verification_steps')}
                  onChange={(e) =>
                    setDraft({ ...draft, human_verification_steps: e.target.value })
                  }
                  placeholder="How you checked terminology and citations..."
                />
                {showError('human_verification_steps') && (
                  <span className="ed-field-error">{showError('human_verification_steps')}</span>
                )}
              </label>
            </div>
          )}

          <div className="ed-field-row">
            <label className="ed-field" style={{ flex: '1 1 200px' }}>
              Author / ORCID / Pseudonym
              <input
                type="text"
                className="ed-input"
                value={draft.proposer_name}
                onBlur={() => markTouched('proposer_name')}
                onChange={(e) => setDraft({ ...draft, proposer_name: e.target.value })}
                placeholder="Full name, ORCID, or pseudonym"
              />
              {showError('proposer_name') && (
                <span className="ed-field-error">{showError('proposer_name')}</span>
              )}
            </label>
            <label className="ed-field" style={{ flex: '1 1 220px' }}>
              Conflict of Interest (COI)
              <input
                type="text"
                className="ed-input"
                value={draft.coi_statement}
                onBlur={() => markTouched('coi_statement')}
                onChange={(e) => setDraft({ ...draft, coi_statement: e.target.value })}
              />
              {showError('coi_statement') && (
                <span className="ed-field-error">{showError('coi_statement')}</span>
              )}
            </label>
          </div>

          <div className="ed-field">
            <span>Human Verification</span>
            <TurnstileWidget
              action="proposal_submit"
              resetNonce={turnstileNonce}
              onTokenChange={setTurnstileToken}
            />
          </div>

          {submitError && <div className="ed-notice is-accent">{submitError}</div>}
        </form>

        <div className="ed-drawer-foot">
          <span className="ed-small ed-faint">
            Direct submission · Pre-moderated before publication
          </span>
          <div className="ed-inline">
            <button type="button" className="ed-btn" onClick={onClose}>
              Close
            </button>
            <button
              type="submit"
              form="online-proposal-form"
              className="ed-btn is-primary"
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit Proposal for Review'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
