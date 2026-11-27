import React, { useEffect, useMemo, useState } from 'react';
import {
  checkTerminology,
  createReviewDiffPayload,
  parseReviewDiffPayload,
  type CategoryCode,
  type GovernanceStatus,
  type InternalBundle,
  type OpenProblem,
  type ProblemEdit,
} from '@opae/core';
import {
  ChevronDownIcon,
  CopyButton,
  DownloadIcon,
  FrontierChart,
  PlusIcon,
  RUBRIC_SHORT,
  RotateCcwIcon,
  TerminologyAlertsPanel,
  applyTerminologyFixes,
  type FrontierPoint,
} from '@opae/ui';

export const ResearchAgendaTab: React.FC<{ bundle: InternalBundle }> = ({ bundle }) => {
  const frontierPoints: FrontierPoint[] = useMemo(() => {
    const raw = (
      bundle.method as {
        frontier?: Array<{
          size?: number;
          k?: number;
          K?: number;
          expanded_score?: number;
          bridge_score?: number;
          score?: number;
          objective?: number;
          F?: number;
          components?: {
            avg_q1?: number;
            avg_q2?: number;
            avg_q3?: number;
            needs_weighted_union?: number;
            research_weighted_union?: number;
          };
        }>;
      }
    ).frontier;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((pt) => ({
        k: Number(pt.size ?? pt.k ?? pt.K ?? 0),
        objective: Number(
          pt.expanded_score ?? pt.bridge_score ?? pt.objective ?? pt.score ?? pt.F ?? 0
        ),
        bridge_score: pt.bridge_score ? Number(pt.bridge_score) : undefined,
        avg_q1: pt.components?.avg_q1,
        avg_q2: pt.components?.avg_q2,
        avg_q3: pt.components?.avg_q3,
        needs_coverage: pt.components?.needs_weighted_union,
        research_coverage: pt.components?.research_weighted_union,
      }))
      .filter((pt) => pt.k > 0 && pt.objective > 0);
  }, [bundle.method]);

  return (
    <div className="ed-stack">
      <div className="ed-panel ed-stack" style={{ gap: '14px' }}>
        <h2 className="ed-panel-title">Four-Stage Participatory Research Agenda Pipeline</h2>
        <div className="ed-kv-list">
          <div className="ed-kv-row">
            <span className="ed-kv-label ed-mono">01 · Collect</span>
            <span className="ed-kv-val ed-muted" style={{ maxWidth: '62ch' }}>
              Multi-source synthesis (1,022 literature records + 291 programme items + 37 manuscript draft items + expert feedback).
            </span>
          </div>
          <div className="ed-kv-row">
            <span className="ed-kv-label ed-mono">02 · Screen &amp; Optimize</span>
            <span className="ed-kv-val ed-muted" style={{ maxWidth: '62ch' }}>
              Five-dimension rubric gating + exact integer branch-and-bound combinatorial optimization across K = 7..48.
            </span>
          </div>
          <div className="ed-kv-row">
            <span className="ed-kv-label ed-mono">03 · Human Deliberation</span>
            <span className="ed-kv-val ed-muted" style={{ maxWidth: '62ch' }}>
              Terminology lock enforcement, mandatory &ldquo;Why changed&rdquo; justifications, and human moderator sign-off.
            </span>
          </div>
          <div className="ed-kv-row">
            <span className="ed-kv-label ed-mono">04 · Publish &amp; Revisit</span>
            <span className="ed-kv-val ed-muted" style={{ maxWidth: '62ch' }}>
              Sanitized standalone release + SHA-256 verified Python replay packages + structured community proposals.
            </span>
          </div>
        </div>
      </div>
      <FrontierChart points={frontierPoints} />
    </div>
  );
};

const RUBRIC_GATES = ['Gate ≥ 3', 'Gate ≥ 2', 'Gate ≥ 2', 'Coverage', 'Coverage'];

export const RubricEditorTab: React.FC<{
  bundle: InternalBundle;
  allItems: OpenProblem[];
  editRequest: { id: string | null; newMode?: boolean; fixTerms?: boolean; nonce: number };
  onSaveEdit: (edit: ProblemEdit) => void;
}> = ({ bundle, allItems, editRequest, onSaveEdit }) => {
  const [rubricExpanded, setRubricExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState(editRequest.id || allItems[0]?.id || '');
  const current = allItems.find((p) => p.id === selectedId) ?? allItems[0];

  const [title, setTitle] = useState(current?.title ?? '');
  const [description, setDescription] = useState(current?.description ?? '');
  const [category, setCategory] = useState<CategoryCode>(current?.category ?? 'F');
  const [scores, setScores] = useState<number[]>(current?.scores ?? [3, 3, 3, 3, 3]);
  const [govStatus, setGovStatus] = useState<GovernanceStatus>(
    current?.governance.status ?? 'screening_recommendation'
  );
  const [moderatorName, setModeratorName] = useState(
    current?.governance.moderator_signoff.moderator_name ?? ''
  );
  const [whyChanged, setWhyChanged] = useState('');
  const [isNewMode, setIsNewMode] = useState(Boolean(editRequest.newMode));
  const [newId, setNewId] = useState('H.NEW1');

  const loadItem = (id: string, fixTerms = false) => {
    setIsNewMode(false);
    setSelectedId(id);
    const target = allItems.find((p) => p.id === id);
    if (!target) return;
    const nextTitle = fixTerms
      ? applyTerminologyFixes(target.title, target.terminology_alerts)
      : target.title;
    const nextDesc = fixTerms
      ? applyTerminologyFixes(target.description, target.terminology_alerts)
      : target.description;
    setTitle(nextTitle);
    setDescription(nextDesc);
    setCategory(target.category);
    setScores([...target.scores]);
    setGovStatus(target.governance.status);
    setModeratorName(target.governance.moderator_signoff.moderator_name ?? '');
    if (fixTerms && target.terminology_alerts.length > 0) {
      const pairs = target.terminology_alerts
        .map((a) => `'${a.found_term}' → '${a.locked_term}'`)
        .join(', ');
      setWhyChanged(
        `Restored locked manuscript terminology (${pairs}) to preserve human-authored conceptual precision.`
      );
    } else {
      setWhyChanged('');
    }
  };

  useEffect(() => {
    if (editRequest.newMode) {
      setIsNewMode(true);
      setTitle('');
      setDescription('');
      setScores([3, 3, 3, 3, 3]);
      setWhyChanged('');
      return;
    }
    if (editRequest.id) {
      loadItem(editRequest.id, Boolean(editRequest.fixTerms));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest.nonce]);

  const liveAlerts = checkTerminology(`${title} ${description}`, bundle.terminology_rules);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whyChanged.trim()) return;
    const now = new Date().toISOString();

    if (isNewMode) {
      const createdId = newId.trim() || `H.${Date.now().toString(36).toUpperCase()}`;
      const created: OpenProblem = {
        id: createdId,
        category,
        title,
        description,
        scores,
        paper_section_id: 'NEW_HUMAN_PROPOSAL',
        manuscript_alignment: 'new_proposal',
        lineage: {
          type: 'new',
          predecessors: [],
          what_changed: `Added new human-authored Open Problem ${createdId}.`,
          why_changed: whyChanged,
          justification_status: 'documented',
        },
        provenance: {
          author_type: 'human',
          proposer_name: moderatorName || 'Co-author',
          known_ai_role: 'None (human authored)',
        },
        governance: {
          status: govStatus,
          moderator_signoff: {
            moderator_name: moderatorName || null,
            decision_date: moderatorName ? now.slice(0, 10) : null,
            notes: whyChanged,
          },
        },
        terminology_alerts: liveAlerts,
      };
      onSaveEdit({
        id: created.id,
        action: 'added',
        after: created,
        why_changed: whyChanged,
        updated_at: now,
      });
      setIsNewMode(false);
      return;
    }

    if (!current) return;
    onSaveEdit({
      id: current.id,
      action: 'modified',
      before: {
        title: current.title,
        description: current.description,
        category: current.category,
        scores: current.scores,
      },
      after: {
        title,
        description,
        category,
        scores,
        terminology_alerts: liveAlerts,
        governance: {
          status: govStatus,
          moderator_signoff: {
            moderator_name: moderatorName || null,
            decision_date: moderatorName ? now.slice(0, 10) : null,
            notes: whyChanged,
          },
        },
      },
      why_changed: whyChanged,
      updated_at: now,
    });
  };

  return (
    <div className="ed-stack">
      {/* Collapsible Rubric Reference */}
      <div className="ed-panel ed-stack" style={{ gap: '12px', padding: '16px 20px' }}>
        <div className="ed-between">
          <div>
            <span className="ed-section-label">Reference Guide</span>
            <h2 className="ed-panel-title" style={{ fontSize: '16.5px', marginTop: '2px' }}>
              Five-Dimension Screening Rubric (Q1–Q5)
            </h2>
          </div>
          <button
            type="button"
            className="ed-btn is-ghost is-sm"
            aria-expanded={rubricExpanded}
            onClick={() => setRubricExpanded((v) => !v)}
          >
            <span>{rubricExpanded ? 'Hide Rubric Guide' : 'Show Rubric Guide'}</span>
            <ChevronDownIcon size={13} />
          </button>
        </div>
        {rubricExpanded && (
          <div className="ed-rubric-cards">
            {bundle.rubric.map((r) => (
              <div key={r.id} className="ed-panel-soft ed-stack" style={{ gap: '6px' }}>
                <span className="ed-mono ed-code">{r.id.toUpperCase()}</span>
                <strong style={{ fontSize: '14px' }}>{r.label}</strong>
                <p className="ed-small ed-muted">{r.description}</p>
                {r.rule && <p className="ed-small ed-faint">{r.rule}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Editor Form */}
      <form className="ed-panel ed-form" onSubmit={handleSave}>
        <div className="ed-between">
          <h3 className="ed-panel-title">
            {isNewMode
              ? 'Propose New Human-Authored Open Problem'
              : `Edit Open Problem / Candidate (${allItems.length} in pool)`}
          </h3>
          {isNewMode ? (
            <button
              type="button"
              className="ed-btn is-sm"
              onClick={() => loadItem(selectedId || allItems[0]?.id || '')}
            >
              <RotateCcwIcon size={13} />
              <span>Cancel &amp; Edit Existing</span>
            </button>
          ) : (
            <button
              type="button"
              className="ed-btn is-sm"
              onClick={() => {
                setIsNewMode(true);
                setTitle('');
                setDescription('');
                setScores([3, 3, 3, 3, 3]);
                setWhyChanged('');
              }}
            >
              <PlusIcon size={13} />
              <span>Propose New Open Problem</span>
            </button>
          )}
        </div>

        {!isNewMode ? (
          <label className="ed-field">
            Select Item to Edit
            <select
              className="ed-select"
              value={selectedId}
              onChange={(e) => loadItem(e.target.value)}
            >
              {allItems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} [{p.category}] — {p.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="ed-field">
            New Open Problem ID
            <input
              type="text"
              className="ed-input ed-mono"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
            />
          </label>
        )}

        <label className="ed-field">
          Title
          <input
            type="text"
            className="ed-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        <label className="ed-field">
          Description
          <textarea
            className="ed-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </label>

        <TerminologyAlertsPanel
          alerts={liveAlerts}
          onFixTerms={() => {
            setTitle((t) => applyTerminologyFixes(t, liveAlerts));
            setDescription((d) => applyTerminologyFixes(d, liveAlerts));
          }}
          fixLabel="Auto-restore locked terms"
        />

        <div className="ed-field-row">
          <label className="ed-field" style={{ flex: '1 1 220px' }}>
            Category
            <select
              className="ed-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryCode)}
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

        <div className="ed-field">
          <span>Five-Dimension Rubric Scores (0–4)</span>
          <div className="ed-field-row">
            {scores.map((s, idx) => (
              <div key={idx} className="ed-panel-soft" style={{ padding: '10px 12px', display: 'grid', gap: '6px' }}>
                <div className="ed-between" style={{ gap: '8px' }}>
                  <span className="ed-small">
                    <strong className="ed-mono">Q{idx + 1}</strong> {RUBRIC_SHORT[idx]}
                  </span>
                  <span className="ed-mono ed-faint" style={{ fontSize: '11px' }}>
                    {RUBRIC_GATES[idx]}
                  </span>
                </div>
                <div className="ed-seg-group" role="group" aria-label={`Score Q${idx + 1}`}>
                  {[0, 1, 2, 3, 4].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className="ed-seg-btn"
                      aria-pressed={s === val}
                      onClick={() => {
                        const next = [...scores];
                        next[idx] = val;
                        setScores(next);
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

        <div className="ed-field-row">
          <label className="ed-field" style={{ flex: '1 1 240px' }}>
            Governance Status (Human Moderator Workflow)
            <select
              className="ed-select"
              value={govStatus}
              onChange={(e) => setGovStatus(e.target.value as GovernanceStatus)}
            >
              <option value="screening_recommendation">Screening Recommendation</option>
              <option value="under_human_review">Under Human Review</option>
              <option value="moderator_approved">Human Moderator Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="ed-field" style={{ flex: '1 1 240px' }}>
            Human Moderator / Co-Author Name
            <input
              type="text"
              className="ed-input"
              value={moderatorName}
              onChange={(e) => setModeratorName(e.target.value)}
              placeholder="e.g. Jose Hernandez-Orallo"
            />
          </label>
        </div>

        <label className="ed-field">
          Why This Change Is Needed (Mandatory Normative Justification)
          <textarea
            className="ed-textarea"
            value={whyChanged}
            onChange={(e) => setWhyChanged(e.target.value)}
            placeholder="Explain what defect, ambiguity, or terminology drift justifies this change..."
            required
          />
        </label>

        <div className="ed-actions-row">
          <button type="submit" className="ed-btn is-primary" disabled={!whyChanged.trim()}>
            Save Edit to Session Diff
          </button>
        </div>
      </form>
    </div>
  );
};

export const ReviewExportTab: React.FC<{
  reviewerName: string;
  setReviewerName: (name: string) => void;
  edits: Record<string, ProblemEdit>;
  onImportEdits: (edits: Record<string, ProblemEdit>, reviewer: string) => void;
  onClearEdits: () => void;
  onNotify: (msg: string) => void;
}> = ({ reviewerName, setReviewerName, edits, onImportEdits, onClearEdits, onNotify }) => {
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const editList = Object.values(edits);
  const payload = createReviewDiffPayload(reviewerName, edits);
  const serialized = JSON.stringify(payload, null, 2);

  const handleDownload = () => {
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-diff-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Downloaded Review Diff JSON (${editList.length} edit(s)).`);
  };

  const handleImport = () => {
    try {
      const parsed = parseReviewDiffPayload(importText);
      onImportEdits(parsed.edits, parsed.reviewer_name);
      setImportError('');
      setImportText('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse JSON Diff.');
    }
  };

  return (
    <div className="ed-stack">
      {/* Human-Readable Session Diff Preview */}
      <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
        <div className="ed-between">
          <h2 className="ed-panel-title">Session Changes Preview ({editList.length})</h2>
          <span className="ed-small ed-faint">Auto-saved in browser localStorage</span>
        </div>

        {editList.length === 0 ? (
          <div className="ed-empty">
            No edits recorded in this review session yet. Edit any Open Problem from the Crosswalk
            or Rubric Editor to build a shareable JSON diff.
          </div>
        ) : (
          <div className="ed-card-list">
            {editList.map((ed) => {
              const badgeCls =
                ed.action === 'added'
                  ? 'is-add'
                  : ed.action === 'deleted'
                    ? 'is-del'
                    : 'is-accent';
              return (
                <div key={ed.id} className="ed-lineage-box" style={{ gap: '6px' }}>
                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    <span className="ed-mono ed-code">{ed.id}</span>
                    <span className={`ed-tag ${badgeCls}`}>{ed.action}</span>
                    <span className="ed-mono ed-faint ed-small">
                      {ed.updated_at.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  {ed.before?.title && ed.after?.title && ed.before.title !== ed.after.title && (
                    <div className="ed-small">
                      <span className="ed-term-old">{ed.before.title}</span>{' '}
                      <span>→</span>{' '}
                      <span className="ed-term-new">{ed.after.title}</span>
                    </div>
                  )}
                  {ed.action === 'added' && ed.after?.title && (
                    <strong className="ed-small">{ed.after.title}</strong>
                  )}
                  <p className="ed-small ed-muted">
                    <strong>Why:</strong> {ed.why_changed}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="ed-two-col">
        <div className="ed-panel ed-form">
          <h3 className="ed-panel-title">Export Review Diff (Serverless Exchange)</h3>
          <label className="ed-field">
            Co-Author / Reviewer Name
            <input
              type="text"
              className="ed-input"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="Enter your name for diff attribution..."
            />
          </label>

          <div className="ed-actions-row">
            <button type="button" className="ed-btn is-primary" onClick={handleDownload}>
              <DownloadIcon size={14} />
              <span>Download JSON ({editList.length})</span>
            </button>
            <CopyButton
              text={serialized}
              label="Copy JSON"
              copiedLabel="Copied JSON"
              className="ed-btn"
              onCopied={() => onNotify('Review Diff JSON copied to clipboard.')}
            />
            {!confirmingClear ? (
              <button
                type="button"
                className="ed-btn is-del-outline"
                disabled={editList.length === 0}
                onClick={() => setConfirmingClear(true)}
              >
                <RotateCcwIcon size={14} />
                <span>Clear All</span>
              </button>
            ) : (
              <div className="ed-inline">
                <button
                  type="button"
                  className="ed-btn is-del-outline is-sm"
                  onClick={() => {
                    onClearEdits();
                    setConfirmingClear(false);
                  }}
                >
                  Confirm Clear ({editList.length})
                </button>
                <button
                  type="button"
                  className="ed-btn is-ghost is-sm"
                  onClick={() => setConfirmingClear(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <pre className="ed-code-block" style={{ maxHeight: '260px' }}>
            {serialized}
          </pre>
        </div>

        <div className="ed-panel ed-form">
          <h3 className="ed-panel-title">Import Another Co-Author&apos;s Diff</h3>
          <p className="ed-small ed-muted">
            Paste a ReviewDiffPayload JSON exported by a co-author to reproduce their exact
            highlights and normative justifications in the crosswalk.
          </p>
          <textarea
            className="ed-textarea ed-mono"
            style={{ minHeight: '160px' }}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"schema_version": 2, "reviewer_name": "...", "edits": { ... }}'
          />
          {importError && <div className="ed-notice is-accent">{importError}</div>}
          <div className="ed-actions-row">
            <button
              type="button"
              className="ed-btn is-primary"
              disabled={!importText.trim()}
              onClick={handleImport}
            >
              Import &amp; Apply Diff
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
