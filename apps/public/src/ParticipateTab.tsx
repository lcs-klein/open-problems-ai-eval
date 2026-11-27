import React, { useEffect, useState } from 'react';
import type {
  CollectiveDecision,
  PeerReview,
  ProposalDraft,
  PublicBundle,
} from '@opae/core';
import {
  ChevronDownIcon,
  CopyButton,
  DownloadIcon,
  PlusIcon,
  ShieldIcon,
} from '@opae/ui';

export const GovernanceTab: React.FC<{
  bundle: PublicBundle;
  proposals: ProposalDraft[];
  reviews: PeerReview[];
  decisions: CollectiveDecision[];
  initialTargetId: string;
  onAddReview: (review: PeerReview) => void;
  onAddDecision: (decision: CollectiveDecision) => void;
  onNewProposal: () => void;
  onOpenProblem: (problemId: string) => void;
  onNotify: (msg: string) => void;
}> = ({
  bundle,
  proposals,
  reviews,
  decisions,
  initialTargetId,
  onAddReview,
  onAddDecision,
  onNewProposal,
  onOpenProblem,
  onNotify,
}) => {
  const [moderatorMode, setModeratorMode] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    target_id: initialTargetId || bundle.open_problems[0]?.id || 'C.F2a',
    reviewer_name: '',
    stance: 'revise' as PeerReview['stance'],
    summary: '',
  });
  const [decisionForm, setDecisionForm] = useState({
    target_id: initialTargetId || bundle.open_problems[0]?.id || 'C.F2a',
    moderator_name: '',
    outcome: 'moderator_approved' as CollectiveDecision['outcome'],
    rationale: '',
    minority_dissent: '',
  });

  useEffect(() => {
    if (!initialTargetId) return;
    setReviewForm((prev) => ({ ...prev, target_id: initialTargetId }));
    setDecisionForm((prev) => ({ ...prev, target_id: initialTargetId }));
  }, [initialTargetId]);

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewForm.reviewer_name.trim() || !reviewForm.summary.trim()) return;
    onAddReview({
      id: `REV-${Date.now().toString(36).toUpperCase()}`,
      created_at: new Date().toISOString(),
      ...reviewForm,
      reviewer_name: reviewForm.reviewer_name.trim(),
      summary: reviewForm.summary.trim(),
    });
    setReviewForm((r) => ({ ...r, summary: '' }));
  };

  const handleDecisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionForm.moderator_name.trim() || !decisionForm.rationale.trim()) return;
    onAddDecision({
      id: `DEC-${Date.now().toString(36).toUpperCase()}`,
      decided_at: new Date().toISOString(),
      ...decisionForm,
      moderator_name: decisionForm.moderator_name.trim(),
      rationale: decisionForm.rationale.trim(),
      minority_dissent: decisionForm.minority_dissent.trim() || undefined,
    });
    setDecisionForm((d) => ({ ...d, rationale: '', minority_dissent: '' }));
  };

  const fullGovernanceBundle = JSON.stringify(
    {
      schema_version: bundle.schema_version,
      agenda_version: bundle.participation.current_version,
      exported_at: new Date().toISOString(),
      proposals,
      reviews,
      decisions,
    },
    null,
    2
  );

  const handleExportGovernanceLog = () => {
    const blob = new Blob([fullGovernanceBundle], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `governance-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Governance log exported as JSON.');
  };

  const problemIdSet = new Set(bundle.open_problems.map((p) => p.id));

  return (
    <div className="ed-stack">
      <div className="ed-notice">
        <span>
          <strong>Human-in-the-Loop Governance (Wikipedia Model):</strong> Community members submit
          structured proposals and peer reviews; human moderators deliberate and sign off before any
          canonical change enters a new release. All records below persist locally in your browser.
        </span>
        <div className="ed-inline">
          <button type="button" className="ed-btn is-primary is-sm" onClick={onNewProposal}>
            <PlusIcon size={13} />
            <span>New Proposal</span>
          </button>
          <button
            type="button"
            className="ed-btn is-sm"
            onClick={handleExportGovernanceLog}
            disabled={proposals.length + reviews.length + decisions.length === 0}
          >
            <DownloadIcon size={13} />
            <span>Export Log JSON</span>
          </button>
        </div>
      </div>

      {/* 1. Packaged Proposals Log */}
      <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
        <div className="ed-between">
          <div>
            <h2 className="ed-panel-title">1. Packaged Proposals ({proposals.length})</h2>
            <p className="ed-small ed-muted" style={{ marginTop: '2px' }}>
              Proposals packaged in this browser via the Proposal Drawer, ready to paste into GitHub
              Issues.
            </p>
          </div>
          <button type="button" className="ed-btn is-sm" onClick={onNewProposal}>
            <PlusIcon size={13} />
            <span>Draft Proposal</span>
          </button>
        </div>

        {proposals.length === 0 ? (
          <div className="ed-empty">
            No proposals packaged yet. Click <strong>New Proposal</strong> in the top bar—or use{' '}
            <strong>Propose Revision / Restore Locked Terms</strong> directly on any Open Problem.
          </div>
        ) : (
          <div className="ed-card-list">
            {proposals.map((p) => (
              <div key={p.id} className="ed-lineage-box" style={{ gap: '8px' }}>
                <div className="ed-between">
                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    <span className="ed-mono ed-code">{p.id}</span>
                    <span className="ed-tag">{p.proposal_type}</span>
                    {p.target_problem_ids.map((tid) =>
                      problemIdSet.has(tid) ? (
                        <button
                          key={tid}
                          type="button"
                          className="ed-tag is-ink ed-mono"
                          onClick={() => onOpenProblem(tid)}
                        >
                          {tid}
                        </button>
                      ) : (
                        <span key={tid} className="ed-tag ed-mono">
                          {tid}
                        </span>
                      )
                    )}
                    <span className="ed-faint ed-small">by {p.proposer_name}</span>
                  </div>
                  <CopyButton
                    text={JSON.stringify(p, null, 2)}
                    label="Copy JSON"
                    copiedLabel="Copied"
                    className="ed-btn is-ghost is-sm"
                    onCopied={() => onNotify(`Copied ${p.id} JSON.`)}
                  />
                </div>
                {p.proposed_title && (
                  <strong style={{ fontSize: '14px' }}>{p.proposed_title}</strong>
                )}
                <p className="ed-small ed-muted">
                  <strong>Why:</strong> {p.why_changed}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Peer Review Desk */}
      <section className="ed-panel ed-form">
        <div>
          <h2 className="ed-panel-title">2. Community Peer Review ({reviews.length})</h2>
          <p className="ed-small ed-muted" style={{ marginTop: '2px' }}>
            Record scholarly critiques, wording suggestions, or objections preserving manuscript
            terminology.
          </p>
        </div>

        <form className="ed-form" onSubmit={handleReviewSubmit}>
          <div className="ed-field-row">
            <label className="ed-field" style={{ flex: '2 1 260px' }}>
              Target Open Problem
              <select
                className="ed-select"
                value={reviewForm.target_id}
                onChange={(e) =>
                  setReviewForm({ ...reviewForm, target_id: e.target.value })
                }
              >
                {bundle.open_problems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} — {p.title.slice(0, 64)}
                  </option>
                ))}
              </select>
            </label>

            <label className="ed-field" style={{ flex: '1 1 180px' }}>
              Reviewer Name / ORCID
              <input
                type="text"
                className="ed-input"
                value={reviewForm.reviewer_name}
                onChange={(e) =>
                  setReviewForm({ ...reviewForm, reviewer_name: e.target.value })
                }
                placeholder="Your name or pseudonym"
                required
              />
            </label>

            <label className="ed-field" style={{ flex: '1 1 180px' }}>
              Stance
              <select
                className="ed-select"
                value={reviewForm.stance}
                onChange={(e) =>
                  setReviewForm({
                    ...reviewForm,
                    stance: e.target.value as PeerReview['stance'],
                  })
                }
              >
                <option value="support">Support</option>
                <option value="revise">Request Revision</option>
                <option value="object">Object / Preserve Manuscript Wording</option>
              </select>
            </label>
          </div>

          <label className="ed-field">
            Review Summary
            <textarea
              className="ed-textarea"
              value={reviewForm.summary}
              onChange={(e) => setReviewForm({ ...reviewForm, summary: e.target.value })}
              placeholder="State concrete scientific, terminological, or scoping feedback..."
              required
            />
          </label>

          <div className="ed-actions-row">
            <button
              type="submit"
              className="ed-btn is-primary is-sm"
              disabled={!reviewForm.reviewer_name.trim() || !reviewForm.summary.trim()}
            >
              Record Peer Review
            </button>
          </div>
        </form>

        {reviews.length > 0 && (
          <div className="ed-card-list">
            {reviews.map((r) => (
              <div key={r.id} className="ed-lineage-box">
                <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="ed-tag is-ink ed-mono"
                    onClick={() => onOpenProblem(r.target_id)}
                  >
                    {r.target_id}
                  </button>
                  <span
                    className={`ed-tag ${
                      r.stance === 'support'
                        ? 'is-add'
                        : r.stance === 'object'
                          ? 'is-accent'
                          : ''
                    }`}
                  >
                    {r.stance}
                  </span>
                  <strong className="ed-small">{r.reviewer_name}</strong>
                  <span className="ed-faint ed-small ed-mono">
                    {r.created_at.slice(0, 10)}
                  </span>
                </div>
                <p className="ed-small ed-muted">{r.summary}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Controlled Human Moderator Section */}
      <section className="ed-panel ed-stack" style={{ gap: '14px' }}>
        <div className="ed-between">
          <div className="ed-inline">
            <ShieldIcon size={16} />
            <div>
              <h2 className="ed-panel-title">
                3. Human Moderator Sign-offs ({decisions.length})
              </h2>
              <p className="ed-small ed-muted" style={{ marginTop: '2px' }}>
                Reserved for editorial board / human moderators logging collective decisions and
                preserved minority dissents.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ed-btn is-sm"
            aria-expanded={moderatorMode}
            onClick={() => setModeratorMode((v) => !v)}
          >
            <span>{moderatorMode ? 'Hide Moderator Form' : 'Enter Moderator Mode'}</span>
            <ChevronDownIcon size={13} />
          </button>
        </div>

        {moderatorMode && (
          <form className="ed-panel-soft ed-form" onSubmit={handleDecisionSubmit}>
            <div className="ed-field-row">
              <label className="ed-field" style={{ flex: '2 1 240px' }}>
                Target Open Problem
                <select
                  className="ed-select"
                  value={decisionForm.target_id}
                  onChange={(e) =>
                    setDecisionForm({ ...decisionForm, target_id: e.target.value })
                  }
                >
                  {bundle.open_problems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} — {p.title.slice(0, 64)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ed-field" style={{ flex: '1 1 180px' }}>
                Human Moderator Name
                <input
                  type="text"
                  className="ed-input"
                  value={decisionForm.moderator_name}
                  onChange={(e) =>
                    setDecisionForm({ ...decisionForm, moderator_name: e.target.value })
                  }
                  placeholder="Moderator full name"
                  required
                />
              </label>

              <label className="ed-field" style={{ flex: '1 1 180px' }}>
                Outcome
                <select
                  className="ed-select"
                  value={decisionForm.outcome}
                  onChange={(e) =>
                    setDecisionForm({
                      ...decisionForm,
                      outcome: e.target.value as CollectiveDecision['outcome'],
                    })
                  }
                >
                  <option value="moderator_approved">Human Moderator Approved</option>
                  <option value="deferred">Deferred for Full-Section Draft</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
            </div>

            <label className="ed-field">
              Decision Rationale
              <textarea
                className="ed-textarea"
                value={decisionForm.rationale}
                onChange={(e) =>
                  setDecisionForm({ ...decisionForm, rationale: e.target.value })
                }
                placeholder="Summarize collective deliberation outcome and manuscript alignment rationale..."
                required
              />
            </label>

            <label className="ed-field">
              Minority Dissent (Optional, permanently preserved on record)
              <input
                type="text"
                className="ed-input"
                value={decisionForm.minority_dissent}
                onChange={(e) =>
                  setDecisionForm({ ...decisionForm, minority_dissent: e.target.value })
                }
                placeholder="Document any substantive dissenting perspective..."
              />
            </label>

            <div className="ed-actions-row">
              <button
                type="submit"
                className="ed-btn is-primary is-sm"
                disabled={
                  !decisionForm.moderator_name.trim() || !decisionForm.rationale.trim()
                }
              >
                Record Moderator Sign-off
              </button>
            </div>
          </form>
        )}

        {decisions.length > 0 ? (
          <div className="ed-card-list">
            {decisions.map((d) => (
              <div key={d.id} className="ed-lineage-box">
                <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="ed-tag is-ink ed-mono"
                    onClick={() => onOpenProblem(d.target_id)}
                  >
                    {d.target_id}
                  </button>
                  <span
                    className={`ed-tag ${
                      d.outcome === 'moderator_approved'
                        ? 'is-add'
                        : d.outcome === 'rejected'
                          ? 'is-del'
                          : ''
                    }`}
                  >
                    {d.outcome}
                  </span>
                  <strong className="ed-small">{d.moderator_name}</strong>
                  <span className="ed-faint ed-small ed-mono">
                    {d.decided_at.slice(0, 10)}
                  </span>
                </div>
                <p className="ed-small ed-muted">{d.rationale}</p>
                {d.minority_dissent && (
                  <p className="ed-small ed-faint">
                    <strong>Minority Dissent:</strong> {d.minority_dissent}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="ed-small ed-faint">
            No moderator sign-offs recorded yet for {bundle.participation.current_version}.
          </p>
        )}
      </section>
    </div>
  );
};

export const ParticipateTab = GovernanceTab;
