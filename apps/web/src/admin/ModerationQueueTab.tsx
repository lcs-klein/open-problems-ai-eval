import React, { useMemo, useState } from 'react';
import {
  checkTerminology,
  type AuthUser,
  type CategoryCode,
  type ModerationQueueResponse,
  type OpenProblem,
  type StoredProposal,
  type TerminologyRule,
} from '@opae/core';
import {
  CheckIcon,
  RUBRIC_SHORT,
  TerminologyAlertsPanel,
  TrashIcon,
  XIcon,
  applyTerminologyFixes,
} from '@opae/ui';
import { ApiError, adminApi } from '../api/client';

export const ModerationQueueTab: React.FC<{
  user: AuthUser;
  queue: ModerationQueueResponse;
  categories: Record<CategoryCode, string>;
  terminologyRules: TerminologyRule[];
  openProblems: OpenProblem[];
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}> = ({ user, queue, categories, terminologyRules, openProblems, onRefresh, onNotify }) => {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'all'>('pending');
  const [activePublish, setActivePublish] = useState<StoredProposal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Publish modal state
  const [pubTitle, setPubTitle] = useState('');
  const [pubDesc, setPubDesc] = useState('');
  const [pubCategory, setPubCategory] = useState<CategoryCode>('F');
  const [pubNewId, setPubNewId] = useState('');
  const [pubScores, setPubScores] = useState<number[]>([3, 3, 3, 3, 3]);
  const [pubChallengeOwner, setPubChallengeOwner] = useState('');
  const [pubChallengeMilestone, setPubChallengeMilestone] = useState('');
  const [pubChallengeStatus, setPubChallengeStatus] = useState('');
  const [pubRationale, setPubRationale] = useState('');
  const [pubDissent, setPubDissent] = useState('');
  const [pubAllowCjk, setPubAllowCjk] = useState(false);
  const [pubError, setPubError] = useState<string | null>(null);
  const [pubNeedsCjkConfirm, setPubNeedsCjkConfirm] = useState(false);

  // Reject/defer inline state
  const [decidingProposal, setDecidingProposal] = useState<{
    proposal: StoredProposal;
    status: 'deferred' | 'rejected' | 'spam';
  } | null>(null);
  const [decideReason, setDecideReason] = useState('');
  const [decidePublic, setDecidePublic] = useState(false);

  const openPublishModal = (p: StoredProposal) => {
    const existingTarget = openProblems.find((op) => op.id === p.target_problem_ids[0]);
    setActivePublish(p);
    setPubTitle(p.proposed_title || existingTarget?.title || '');
    setPubDesc(p.proposed_description || existingTarget?.description || '');
    setPubCategory(p.category);
    setPubNewId(
      p.proposal_type === 'add'
        ? `H.${p.category}${Date.now().toString(36).slice(-2).toUpperCase()}`
        : p.proposal_type === 'merge'
          ? p.target_problem_ids[0] || ''
          : ''
    );
    setPubScores(existingTarget?.scores ? [...existingTarget.scores] : [3, 3, 3, 3, 3]);
    setPubChallengeOwner(p.challenge_owner || '');
    setPubChallengeMilestone(p.challenge_milestone || '');
    setPubChallengeStatus(p.challenge_status || '');
    setPubRationale(p.why_changed || '');
    setPubDissent('');
    setPubAllowCjk(false);
    setPubNeedsCjkConfirm(false);
    setPubError(null);
  };

  const liveTermAlerts = useMemo(
    () => checkTerminology(`${pubTitle} ${pubDesc}`, terminologyRules),
    [pubTitle, pubDesc, terminologyRules]
  );

  const handleConfirmPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePublish) return;
    setPubError(null);
    setBusyId(activePublish.id);
    try {
      const res = await adminApi.publishProposal(activePublish.id, {
        title: pubTitle,
        description: pubDesc,
        category: pubCategory,
        new_id: pubNewId.trim() || undefined,
        scores: pubScores,
        challenge_owner: pubChallengeOwner || undefined,
        challenge_milestone: pubChallengeMilestone || undefined,
        challenge_status: pubChallengeStatus || undefined,
        rationale: pubRationale,
        minority_dissent: pubDissent.trim() || undefined,
        allow_cjk: pubAllowCjk,
      });
      setActivePublish(null);
      await onRefresh();
      onNotify(
        `Published ${activePublish.id} live! Decision ${res.decision_id} (${res.affected_ids.join(', ')}).`
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setPubError(err.message);
        if (err.warnings?.some((w) => w.includes('CJK'))) {
          setPubNeedsCjkConfirm(true);
        }
      } else {
        setPubError('Failed to publish proposal.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDecide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decidingProposal) return;
    setBusyId(decidingProposal.proposal.id);
    try {
      await adminApi.decideProposal(decidingProposal.proposal.id, {
        status: decidingProposal.status,
        rationale: decideReason || decidingProposal.status,
        record_public_decision: decidePublic,
      });
      const label = decidingProposal.status;
      setDecidingProposal(null);
      setDecideReason('');
      setDecidePublic(false);
      await onRefresh();
      onNotify(`Proposal marked ${label}.`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleModerateReview = async (id: string, status: 'approved' | 'rejected' | 'spam') => {
    setBusyId(id);
    try {
      await adminApi.moderateReview(id, status);
      await onRefresh();
      onNotify(
        status === 'approved'
          ? `Peer review ${id} approved and published live.`
          : `Peer review ${id} marked ${status}.`
      );
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Failed to moderate review.');
    } finally {
      setBusyId(null);
    }
  };

  const handleHardDelete = async (kind: 'proposal' | 'review', id: string) => {
    if (!window.confirm(`Permanently delete ${kind} ${id}? This is logged in the audit trail.`)) {
      return;
    }
    setBusyId(id);
    try {
      if (kind === 'proposal') await adminApi.deleteProposal(id);
      else await adminApi.deleteReview(id);
      await onRefresh();
      onNotify(`Deleted ${kind} ${id}.`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredProposals = queue.proposals.filter((p) =>
    statusFilter === 'all' ? true : p.moderation_status === statusFilter
  );
  const filteredReviews = queue.reviews.filter((r) =>
    statusFilter === 'all' ? true : r.moderation_status === statusFilter
  );

  return (
    <div className="ed-stack">
      <div className="ed-between" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div className="ed-chip-row">
          <button
            type="button"
            className="ed-chip"
            aria-pressed={statusFilter === 'pending'}
            onClick={() => setStatusFilter('pending')}
          >
            Pending Review ({queue.counts.pending_proposals + queue.counts.pending_reviews})
          </button>
          <button
            type="button"
            className="ed-chip"
            aria-pressed={statusFilter === 'approved'}
            onClick={() => setStatusFilter('approved')}
          >
            Published
          </button>
          <button
            type="button"
            className="ed-chip"
            aria-pressed={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          >
            All History ({queue.counts.total_proposals + queue.counts.total_reviews})
          </button>
        </div>
        <span className="ed-small ed-faint">
          Signed in as <strong>{user.display_name}</strong> ({user.role})
        </span>
      </div>

      {/* 1. Community Proposals */}
      <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
        <h2 className="ed-panel-title">
          Community Proposals ({filteredProposals.length})
        </h2>

        {filteredProposals.length === 0 ? (
          <div className="ed-empty">No proposals in the "{statusFilter}" queue.</div>
        ) : (
          <div className="ed-card-list">
            {filteredProposals.map((p) => (
              <div key={p.id} className="ed-lineage-box" style={{ gap: '8px' }}>
                <div className="ed-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    <span className="ed-mono ed-code">{p.id}</span>
                    <span
                      className={`ed-tag ${
                        p.moderation_status === 'approved'
                          ? 'is-add'
                          : p.moderation_status === 'pending'
                            ? 'is-accent'
                            : 'is-del'
                      }`}
                    >
                      {p.moderation_status}
                    </span>
                    <span className="ed-tag is-ink">{p.proposal_type}</span>
                    <span className="ed-tag">{p.category}</span>
                    {p.target_problem_ids.map((tid) => (
                      <span key={tid} className="ed-tag ed-mono">
                        {tid}
                      </span>
                    ))}
                    <span className="ed-small ed-faint">
                      by <strong>{p.proposer_name}</strong> · {p.created_at.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>

                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    {p.moderation_status !== 'approved' && (
                      <button
                        type="button"
                        className="ed-btn is-primary is-sm"
                        disabled={busyId === p.id}
                        onClick={() => openPublishModal(p)}
                      >
                        <CheckIcon size={13} />
                        <span>Review &amp; Publish Live</span>
                      </button>
                    )}
                    {p.moderation_status === 'pending' && (
                      <>
                        <button
                          type="button"
                          className="ed-btn is-sm"
                          disabled={busyId === p.id}
                          onClick={() => {
                            setDecidingProposal({ proposal: p, status: 'deferred' });
                            setDecideReason('');
                          }}
                        >
                          Defer
                        </button>
                        <button
                          type="button"
                          className="ed-btn is-del-outline is-sm"
                          disabled={busyId === p.id}
                          onClick={() => {
                            setDecidingProposal({ proposal: p, status: 'rejected' });
                            setDecideReason('');
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {user.role === 'admin' && (
                      <button
                        type="button"
                        className="ed-btn is-ghost is-sm"
                        title="Admin delete"
                        disabled={busyId === p.id}
                        onClick={() => void handleHardDelete('proposal', p.id)}
                      >
                        <TrashIcon size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {p.proposed_title && <strong style={{ fontSize: '14.5px' }}>{p.proposed_title}</strong>}
                {p.proposed_description && <p className="ed-small">{p.proposed_description}</p>}
                <p className="ed-small ed-muted">
                  <strong>Why:</strong> {p.why_changed}
                </p>
                <div className="ed-inline ed-small ed-faint" style={{ flexWrap: 'wrap', gap: '12px' }}>
                  <span>COI: {p.coi_statement}</span>
                  {p.source_url && (
                    <a href={p.source_url} target="_blank" rel="noreferrer noopener">
                      Source Link ↗
                    </a>
                  )}
                  {p.used_ai_assistance && (
                    <span className="ed-tag is-accent">AI Assisted: {p.ai_disclosure_details}</span>
                  )}
                  {p.terminology_alerts.length > 0 && (
                    <span className="ed-tag is-accent">
                      {p.terminology_alerts.length} Terminology Alert(s)
                    </span>
                  )}
                  {p.reviewed_by_name && (
                    <span>
                      Reviewed by {p.reviewed_by_name} ({p.reviewed_at?.slice(0, 10)})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Community Peer Reviews */}
      <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
        <h2 className="ed-panel-title">
          Community Peer Reviews ({filteredReviews.length})
        </h2>

        {filteredReviews.length === 0 ? (
          <div className="ed-empty">No peer reviews in the "{statusFilter}" queue.</div>
        ) : (
          <div className="ed-card-list">
            {filteredReviews.map((r) => (
              <div key={r.id} className="ed-lineage-box" style={{ gap: '8px' }}>
                <div className="ed-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    <span className="ed-mono ed-code">{r.id}</span>
                    <span
                      className={`ed-tag ${
                        r.moderation_status === 'approved'
                          ? 'is-add'
                          : r.moderation_status === 'pending'
                            ? 'is-accent'
                            : 'is-del'
                      }`}
                    >
                      {r.moderation_status}
                    </span>
                    <span className="ed-tag is-ink ed-mono">{r.target_id}</span>
                    <span className="ed-tag">{r.stance}</span>
                    <strong className="ed-small">{r.reviewer_name}</strong>
                    <span className="ed-small ed-faint ed-mono">{r.created_at.slice(0, 10)}</span>
                  </div>

                  <div className="ed-inline">
                    {r.moderation_status !== 'approved' && (
                      <button
                        type="button"
                        className="ed-btn is-primary is-sm"
                        disabled={busyId === r.id}
                        onClick={() => void handleModerateReview(r.id, 'approved')}
                      >
                        <CheckIcon size={13} />
                        <span>Approve &amp; Publish</span>
                      </button>
                    )}
                    {r.moderation_status === 'pending' && (
                      <button
                        type="button"
                        className="ed-btn is-del-outline is-sm"
                        disabled={busyId === r.id}
                        onClick={() => void handleModerateReview(r.id, 'rejected')}
                      >
                        Reject
                      </button>
                    )}
                    {user.role === 'admin' && (
                      <button
                        type="button"
                        className="ed-btn is-ghost is-sm"
                        disabled={busyId === r.id}
                        onClick={() => void handleHardDelete('review', r.id)}
                      >
                        <TrashIcon size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="ed-small ed-muted">{r.summary}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* One-Click Publish Drawer */}
      {activePublish && (
        <>
          <div
            className="ed-drawer-backdrop"
            onClick={() => setActivePublish(null)}
            aria-hidden="true"
          />
          <aside className="ed-drawer" role="dialog" aria-modal="true" aria-label="Approve and Publish Proposal">
            <div className="ed-drawer-head">
              <div>
                <span className="ed-section-label">
                  Atomic Publish · {activePublish.id} ({activePublish.proposal_type})
                </span>
                <h2 className="ed-panel-title" style={{ marginTop: '4px' }}>
                  Review, Fine-Tune &amp; Publish Live
                </h2>
              </div>
              <button
                type="button"
                className="ed-btn is-ghost is-sm"
                onClick={() => setActivePublish(null)}
              >
                <XIcon size={16} />
              </button>
            </div>

            <form
              id="publish-proposal-form"
              className="ed-drawer-body"
              onSubmit={handleConfirmPublish}
            >
              <div className="ed-notice">
                <span>
                  Publishing updates the live public site immediately, records a signed{' '}
                  <strong>CollectiveDecision</strong> under <strong>{user.display_name}</strong>, and
                  logs full before/after audit state.
                </span>
              </div>

              {(activePublish.proposal_type === 'add' ||
                activePublish.proposal_type === 'merge') && (
                <label className="ed-field">
                  {activePublish.proposal_type === 'add'
                    ? 'New Open Problem ID'
                    : 'Target Merged Open Problem ID'}
                  <input
                    type="text"
                    className="ed-input ed-mono"
                    value={pubNewId}
                    onChange={(e) => setPubNewId(e.target.value)}
                    required
                  />
                </label>
              )}

              {activePublish.proposal_type !== 'retire' && (
                <>
                  <label className="ed-field">
                    Final Published Title
                    <input
                      type="text"
                      className="ed-input"
                      value={pubTitle}
                      onChange={(e) => setPubTitle(e.target.value)}
                      required
                    />
                  </label>

                  {activePublish.proposal_type !== 'challenge_update' && (
                    <label className="ed-field">
                      Final Published Description
                      <textarea
                        className="ed-textarea"
                        value={pubDesc}
                        onChange={(e) => setPubDesc(e.target.value)}
                      />
                    </label>
                  )}

                  <TerminologyAlertsPanel
                    alerts={liveTermAlerts}
                    onFixTerms={() => {
                      setPubTitle((t) => applyTerminologyFixes(t, liveTermAlerts));
                      setPubDesc((d) => applyTerminologyFixes(d, liveTermAlerts));
                    }}
                    fixLabel="Auto-restore locked terms"
                  />
                </>
              )}

              {['revise', 'add', 'merge'].includes(activePublish.proposal_type) && (
                <>
                  <label className="ed-field">
                    Category
                    <select
                      className="ed-select"
                      value={pubCategory}
                      onChange={(e) => setPubCategory(e.target.value as CategoryCode)}
                    >
                      {(Object.entries(categories) as Array<[CategoryCode, string]>).map(
                        ([code, label]) => (
                          <option key={code} value={code}>
                            {code} · {label}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <div className="ed-field">
                    <span>Rubric Scores (Q1–Q5)</span>
                    <div className="ed-field-row">
                      {pubScores.map((s, idx) => (
                        <div key={idx} className="ed-panel-soft" style={{ padding: '8px 10px' }}>
                          <span className="ed-small ed-mono">
                            Q{idx + 1} {RUBRIC_SHORT[idx]}
                          </span>
                          <div className="ed-seg-group" style={{ marginTop: '4px' }}>
                            {[0, 1, 2, 3, 4].map((val) => (
                              <button
                                key={val}
                                type="button"
                                className="ed-seg-btn"
                                aria-pressed={s === val}
                                onClick={() => {
                                  const next = [...pubScores];
                                  next[idx] = val;
                                  setPubScores(next);
                                }}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {['challenge', 'challenge_update'].includes(activePublish.proposal_type) && (
                <div className="ed-field-row">
                  <label className="ed-field" style={{ flex: '1 1 180px' }}>
                    Owner / Team
                    <input
                      type="text"
                      className="ed-input"
                      value={pubChallengeOwner}
                      onChange={(e) => setPubChallengeOwner(e.target.value)}
                    />
                  </label>
                  <label className="ed-field" style={{ flex: '1 1 180px' }}>
                    Status
                    <input
                      type="text"
                      className="ed-input"
                      value={pubChallengeStatus}
                      onChange={(e) => setPubChallengeStatus(e.target.value)}
                    />
                  </label>
                  <label className="ed-field" style={{ flex: '1 1 100%' }}>
                    First Milestone
                    <input
                      type="text"
                      className="ed-input"
                      value={pubChallengeMilestone}
                      onChange={(e) => setPubChallengeMilestone(e.target.value)}
                    />
                  </label>
                </div>
              )}

              <label className="ed-field">
                Moderator Decision Rationale (published publicly)
                <textarea
                  className="ed-textarea"
                  value={pubRationale}
                  onChange={(e) => setPubRationale(e.target.value)}
                  required
                />
              </label>

              <label className="ed-field">
                Minority Dissent (optional, preserved on record)
                <input
                  type="text"
                  className="ed-input"
                  value={pubDissent}
                  onChange={(e) => setPubDissent(e.target.value)}
                />
              </label>

              {pubNeedsCjkConfirm && (
                <label className="ed-check-row">
                  <input
                    type="checkbox"
                    checked={pubAllowCjk}
                    onChange={(e) => setPubAllowCjk(e.target.checked)}
                  />
                  <span>
                    I confirm these CJK characters are intentional public content (not internal
                    expert feedback).
                  </span>
                </label>
              )}

              {pubError && <div className="ed-notice is-accent">{pubError}</div>}
            </form>

            <div className="ed-drawer-foot">
              <span className="ed-small ed-faint">Signed off by {user.display_name}</span>
              <div className="ed-inline">
                <button
                  type="button"
                  className="ed-btn"
                  onClick={() => setActivePublish(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="publish-proposal-form"
                  className="ed-btn is-primary"
                  disabled={busyId === activePublish.id}
                >
                  {busyId === activePublish.id ? 'Publishing…' : 'Confirm & Publish Live'}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Defer / Reject Modal */}
      {decidingProposal && (
        <>
          <div
            className="ed-drawer-backdrop"
            onClick={() => setDecidingProposal(null)}
            aria-hidden="true"
          />
          <aside className="ed-drawer" role="dialog" aria-modal="true" style={{ maxWidth: '480px' }}>
            <div className="ed-drawer-head">
              <h2 className="ed-panel-title">
                Mark {decidingProposal.proposal.id} as {decidingProposal.status}
              </h2>
              <button
                type="button"
                className="ed-btn is-ghost is-sm"
                onClick={() => setDecidingProposal(null)}
              >
                <XIcon size={16} />
              </button>
            </div>
            <form className="ed-drawer-body" onSubmit={handleConfirmDecide}>
              <label className="ed-field">
                Decision Rationale (≥ 5 chars)
                <textarea
                  className="ed-textarea"
                  value={decideReason}
                  onChange={(e) => setDecideReason(e.target.value)}
                  required
                />
              </label>
              <label className="ed-check-row">
                <input
                  type="checkbox"
                  checked={decidePublic}
                  onChange={(e) => setDecidePublic(e.target.checked)}
                />
                <span>Also record this decision on the public Governance ledger</span>
              </label>
              <div className="ed-actions-row">
                <button
                  type="submit"
                  className="ed-btn is-primary"
                  disabled={busyId === decidingProposal.proposal.id || decideReason.trim().length < 5}
                >
                  Confirm {decidingProposal.status}
                </button>
              </div>
            </form>
          </aside>
        </>
      )}
    </div>
  );
};
