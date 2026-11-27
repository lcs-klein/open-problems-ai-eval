import React, { useEffect, useState } from 'react';
import type {
  CollectiveDecision,
  PeerReview,
  ProposalDraft,
  PublicBundle,
} from '@opae/core';
import { CopyButton, DownloadIcon, PlusIcon, ShieldIcon } from '@opae/ui';
import { ApiError, publicApi } from '../api/client';
import { TurnstileWidget } from '../components/TurnstileWidget';

export const OnlineGovernanceTab: React.FC<{
  bundle: PublicBundle;
  initialTargetId: string;
  onNewProposal: () => void;
  onOpenProblem: (problemId: string) => void;
  onGoAdmin: () => void;
  onNotify: (msg: string) => void;
}> = ({ bundle, initialTargetId, onNewProposal, onOpenProblem, onGoAdmin, onNotify }) => {
  const proposals: ProposalDraft[] = bundle.participation.proposals ?? [];
  const reviews: PeerReview[] = bundle.participation.reviews ?? [];
  const decisions: CollectiveDecision[] = bundle.participation.decisions ?? [];

  const [reviewForm, setReviewForm] = useState({
    target_id: initialTargetId || bundle.open_problems[0]?.id || '',
    reviewer_name: '',
    stance: 'revise' as PeerReview['stance'],
    summary: '',
  });
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reviewReceipt, setReviewReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!initialTargetId) return;
    setReviewForm((prev) => ({ ...prev, target_id: initialTargetId }));
  }, [initialTargetId]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setReviewReceipt(null);
    if (!reviewForm.reviewer_name.trim() || reviewForm.summary.trim().length < 10) {
      setSubmitError('Reviewer name and review summary (at least 10 characters) are required.');
      return;
    }
    if (!turnstileToken) {
      setSubmitError('Please complete the human verification challenge first.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await publicApi.submitReview({
        target_id: reviewForm.target_id,
        reviewer_name: reviewForm.reviewer_name.trim(),
        stance: reviewForm.stance,
        summary: reviewForm.summary.trim(),
        turnstile_token: turnstileToken,
      });
      setReviewReceipt(res.id);
      setReviewForm((prev) => ({ ...prev, summary: '' }));
      onNotify(`Peer review ${res.id} submitted for moderation.`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit peer review.');
    } finally {
      setSubmitting(false);
      setTurnstileNonce((n) => n + 1);
    }
  };

  const handleExportGovernanceLog = () => {
    const payload = JSON.stringify(
      {
        schema_version: bundle.schema_version,
        agenda_version: bundle.participation.current_version,
        exported_at: new Date().toISOString(),
        approved_proposals: proposals,
        approved_reviews: reviews,
        decisions,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `governance-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Published governance log exported as JSON.');
  };

  const problemIdSet = new Set(bundle.open_problems.map((p) => p.id));

  return (
    <div className="ed-stack">
      <div className="ed-notice">
        <span>
          <strong>Human-in-the-Loop Governance:</strong> Submit proposals and peer reviews directly
          from this page—no GitHub account or JSON copy-paste required. Submissions enter the
          editorial moderation queue and appear publicly once approved by a human moderator.
        </span>
        <div className="ed-inline">
          <button type="button" className="ed-btn is-primary is-sm" onClick={onNewProposal}>
            <PlusIcon size={13} />
            <span>Submit Proposal</span>
          </button>
          <button
            type="button"
            className="ed-btn is-sm"
            onClick={handleExportGovernanceLog}
            disabled={proposals.length + reviews.length + decisions.length === 0}
          >
            <DownloadIcon size={13} />
            <span>Export Public Log</span>
          </button>
        </div>
      </div>

      {/* 1. Approved Community Proposals */}
      <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
        <div className="ed-between">
          <div>
            <h2 className="ed-panel-title">1. Published Community Proposals ({proposals.length})</h2>
            <p className="ed-small ed-muted" style={{ marginTop: '2px' }}>
              Moderator-approved proposals integrated into the live research agenda.
            </p>
          </div>
          <button type="button" className="ed-btn is-sm" onClick={onNewProposal}>
            <PlusIcon size={13} />
            <span>New Proposal</span>
          </button>
        </div>

        {proposals.length === 0 ? (
          <div className="ed-empty">
            No community proposals published yet. Click <strong>Submit Proposal</strong> to propose
            a revision, addition, or challenge update directly on the web.
          </div>
        ) : (
          <div className="ed-card-list">
            {proposals.map((p) => (
              <div key={p.id} className="ed-lineage-box" style={{ gap: '8px' }}>
                <div className="ed-between">
                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    <span className="ed-mono ed-code">{p.id}</span>
                    <span className="ed-tag is-add">approved</span>
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
                {p.proposed_title && <strong style={{ fontSize: '14px' }}>{p.proposed_title}</strong>}
                <p className="ed-small ed-muted">
                  <strong>Why:</strong> {p.why_changed}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Community Peer Review */}
      <section className="ed-panel ed-form">
        <div>
          <h2 className="ed-panel-title">2. Community Peer Reviews ({reviews.length})</h2>
          <p className="ed-small ed-muted" style={{ marginTop: '2px' }}>
            Submit scholarly critiques, wording refinements, or objections preserving manuscript
            terminology. Reviews appear below once approved by an editor.
          </p>
        </div>

        <form className="ed-form" onSubmit={handleReviewSubmit}>
          <div className="ed-field-row">
            <label className="ed-field" style={{ flex: '2 1 260px' }}>
              Target Open Problem
              <select
                className="ed-select"
                value={reviewForm.target_id}
                onChange={(e) => setReviewForm({ ...reviewForm, target_id: e.target.value })}
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
                onChange={(e) => setReviewForm({ ...reviewForm, reviewer_name: e.target.value })}
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
            Review Summary (≥ 10 characters)
            <textarea
              className="ed-textarea"
              value={reviewForm.summary}
              onChange={(e) => setReviewForm({ ...reviewForm, summary: e.target.value })}
              placeholder="State concrete scientific, terminological, or scoping feedback..."
              required
            />
          </label>

          <TurnstileWidget
            action="review_submit"
            resetNonce={turnstileNonce}
            onTokenChange={setTurnstileToken}
          />

          {submitError && <div className="ed-notice is-accent">{submitError}</div>}
          {reviewReceipt && (
            <div className="ed-panel-soft ed-small" style={{ borderColor: 'var(--ed-add)' }}>
              <strong style={{ color: 'var(--ed-add)' }}>
                Peer review {reviewReceipt} received!
              </strong>{' '}
              It is queued for editorial moderation and will appear publicly once approved.
            </div>
          )}

          <div className="ed-actions-row">
            <button
              type="submit"
              className="ed-btn is-primary is-sm"
              disabled={
                submitting ||
                !reviewForm.reviewer_name.trim() ||
                reviewForm.summary.trim().length < 10
              }
            >
              {submitting ? 'Submitting…' : 'Submit Peer Review'}
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
                  <span className="ed-faint ed-small ed-mono">{r.created_at.slice(0, 10)}</span>
                </div>
                <p className="ed-small ed-muted">{r.summary}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Signed Human Moderator Decisions (Read-Only Public Ledger) */}
      <section className="ed-panel ed-stack" style={{ gap: '14px' }}>
        <div className="ed-between">
          <div className="ed-inline">
            <ShieldIcon size={16} />
            <div>
              <h2 className="ed-panel-title">
                3. Human Moderator Sign-offs ({decisions.length})
              </h2>
              <p className="ed-small ed-muted" style={{ marginTop: '2px' }}>
                Authenticated editorial decisions and preserved minority dissents logged from the
                internal workbench.
              </p>
            </div>
          </div>
          <button type="button" className="ed-btn is-sm" onClick={onGoAdmin}>
            Editorial Login →
          </button>
        </div>

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
                  <span className="ed-faint ed-small ed-mono">{d.decided_at.slice(0, 10)}</span>
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
            No moderator sign-offs published yet for {bundle.participation.current_version}.
          </p>
        )}
      </section>
    </div>
  );
};
