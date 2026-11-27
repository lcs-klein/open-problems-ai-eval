import React, { useEffect, useMemo, useState } from 'react';
import {
  applyEditsToProblems,
  createReviewDiffPayload,
  type InternalBundle,
  type ProblemEdit,
} from '@opae/core';
import { DownloadIcon, EditorialMark, PlusIcon, Toast } from '@opae/ui';
import rawBundle from '@data/internal_bundle.json';
import { CompareTab } from './CompareTab';
import { SourcesTab } from './SourcesTab';
import {
  ResearchAgendaTab,
  ReviewExportTab,
  RubricEditorTab,
} from './AgendaRubricReviewTabs';

const bundle = rawBundle as unknown as InternalBundle;

type TabId = 'compare' | 'sources' | 'agenda' | 'rubric' | 'review';

const STORAGE_EDITS = 'opae_internal_edits_v2';
const STORAGE_REVIEWER = 'opae_internal_reviewer_v2';

const COMPACT_HEADERS: Record<Exclude<TabId, 'compare'>, { title: string; subtitle: string }> = {
  sources: {
    title: 'Unredacted Internal Evidence Corpus',
    subtitle: 'Search across bilingual expert feedback, manuscript originals, programme corpus, and Table 2 literature.',
  },
  agenda: {
    title: 'Pipeline & Combinatorial Frontier',
    subtitle: 'Four-stage synthesis workflow and interactive K = 7..48 optimization frontier.',
  },
  rubric: {
    title: 'Rubric & Open Problem Editor',
    subtitle: 'Revise wording, restore locked terminology, update Q1–Q5 scores, and record normative rationales.',
  },
  review: {
    title: 'Review Diff & Co-Author Exchange',
    subtitle: 'Inspect before/after session changes, export JSON diff payloads, or import a co-author review.',
  },
};

export const App: React.FC = () => {
  const [tab, setTab] = useState<TabId>('compare');
  const [reviewerName, setReviewerName] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_REVIEWER) ?? '';
    } catch {
      return '';
    }
  });
  const [edits, setEdits] = useState<Record<string, ProblemEdit>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_EDITS);
      return saved ? (JSON.parse(saved) as Record<string, ProblemEdit>) : {};
    } catch {
      return {};
    }
  });

  const [editRequest, setEditRequest] = useState<{
    id: string | null;
    newMode?: boolean;
    fixTerms?: boolean;
    nonce: number;
  }>({ id: null, nonce: 0 });
  const [focusProblemRequest, setFocusProblemRequest] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const [compareOnlyTermAlerts, setCompareOnlyTermAlerts] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_EDITS, JSON.stringify(edits));
    } catch {
      // ignore storage errors under file://
    }
  }, [edits]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_REVIEWER, reviewerName);
    } catch {
      // ignore
    }
  }, [reviewerName]);

  const workingProblems = useMemo(
    () => applyEditsToProblems(bundle.open_problems, edits),
    [edits]
  );

  const fullCandidatePool = useMemo(
    () => [...workingProblems, ...bundle.candidates],
    [workingProblems]
  );

  const handleSaveEdit = (edit: ProblemEdit) => {
    setEdits((prev) => ({ ...prev, [edit.id]: edit }));
    setTab('compare');
    setFocusProblemRequest({ id: edit.id, nonce: Date.now() });
    setToast(`Saved ${edit.action} edit for ${edit.id} (auto-saved locally).`);
  };

  const handleToggleDelete = (problemId: string) => {
    setEdits((prev) => {
      const existing = prev[problemId];
      if (existing?.action === 'deleted') {
        const copy = { ...prev };
        delete copy[problemId];
        setToast(`Restored ${problemId} from deletion mark.`);
        return copy;
      }
      setToast(`Marked ${problemId} for deletion in session diff.`);
      return {
        ...prev,
        [problemId]: {
          id: problemId,
          action: 'deleted',
          why_changed: 'Marked for deletion during co-author review.',
          updated_at: new Date().toISOString(),
        },
      };
    });
  };

  const handleQuickDownloadDiff = () => {
    const payload = createReviewDiffPayload(reviewerName, edits);
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-diff-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(`Downloaded Review Diff JSON (${Object.keys(edits).length} edit(s)).`);
  };

  const editCount = Object.keys(edits).length;
  const termAlertCount = workingProblems.filter(
    (p) => p.terminology_alerts.length > 0
  ).length;

  return (
    <div className="ed-shell">
      <header className="ed-topbar">
        <div className="ed-topbar-inner">
          <button
            type="button"
            className="ed-brand"
            onClick={() => {
              setCompareOnlyTermAlerts(false);
              setTab('compare');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            title="Back to Crosswalk workspace"
          >
            <EditorialMark size={18} />
            <span>AI Eval · Internal</span>
          </button>

          <nav className="ed-nav" aria-label="Internal workspace navigation">
            {(
              [
                ['compare', 'Crosswalk'],
                ['sources', 'Sources'],
                ['agenda', 'Frontier'],
                ['rubric', 'Rubric Editor'],
                ['review', `Review Diff (${editCount})`],
              ] as Array<[TabId, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="ed-nav-pill"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="ed-topbar-actions">
            {editCount > 0 ? (
              <button
                type="button"
                className="ed-btn is-primary"
                onClick={handleQuickDownloadDiff}
                title="Download current review diff JSON immediately"
              >
                <DownloadIcon size={14} />
                <span>Download Diff ({editCount})</span>
              </button>
            ) : (
              <button
                type="button"
                className="ed-btn is-primary"
                onClick={() => {
                  setEditRequest({ id: null, newMode: true, nonce: Date.now() });
                  setTab('rubric');
                }}
              >
                <PlusIcon size={14} />
                <span>New Problem</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="ed-container">
        {tab === 'compare' ? (
          <>
            <section className="ed-masthead">
              <div className="ed-eyebrow">
                <span className="ed-eyebrow-dot" aria-hidden="true" />
                <span>Internal Co-Author Review Edition · Do Not Publish</span>
              </div>
              <h1 className="ed-lead">
                <strong>Co-author crosswalk and governance workbench.</strong>{' '}
                Compare the November 6 manuscript originals against the working Open Problems set,
                resolve locked terminology drift, and document normative change justifications.
              </h1>
            </section>

            <section className="ed-metrics" aria-label="Workspace summary metrics">
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setCompareOnlyTermAlerts(false)}
                title="View all manuscript originals in Crosswalk"
              >
                <span className="ed-metric-label">Manuscript Originals</span>
                <span className="ed-metric-value">{bundle.originals.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setCompareOnlyTermAlerts(false)}
                title="View all working Open Problems"
              >
                <span className="ed-metric-label">Open Problems</span>
                <span className="ed-metric-value">{workingProblems.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setTab('sources')}
                title="Inspect Table 2 literature corpus"
              >
                <span className="ed-metric-label">Table 2 Literature</span>
                <span className="ed-metric-value">{bundle.literature.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setCompareOnlyTermAlerts((v) => !v)}
                title="Filter Open Problems with Terminology Alerts"
              >
                <span className="ed-metric-label">Terminology Alerts</span>
                <span className={`ed-metric-value ${termAlertCount > 0 ? 'is-accent' : ''}`}>
                  {termAlertCount}
                </span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setTab('review')}
                title="Open Review Diff & Export"
              >
                <span className="ed-metric-label">Session Edits</span>
                <span className={`ed-metric-value ${editCount > 0 ? 'is-accent' : ''}`}>
                  {editCount}
                </span>
              </button>
            </section>
          </>
        ) : (
          <header className="ed-compact-header">
            <div>
              <h1 className="ed-compact-title">{COMPACT_HEADERS[tab].title}</h1>
              <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                {COMPACT_HEADERS[tab].subtitle}
              </p>
            </div>
            <span className="ed-mono ed-faint ed-small">Internal Co-Author Edition</span>
          </header>
        )}

        <div>
          {tab === 'compare' && (
            <CompareTab
              bundle={bundle}
              problems={workingProblems}
              edits={edits}
              onlyTermAlerts={compareOnlyTermAlerts}
              onOnlyTermAlertsChange={setCompareOnlyTermAlerts}
              focusProblemRequest={focusProblemRequest}
              onJumpToEdit={(id, fixTerms = false) => {
                setEditRequest({ id, fixTerms, newMode: false, nonce: Date.now() });
                setTab('rubric');
              }}
              onToggleDelete={handleToggleDelete}
            />
          )}
          {tab === 'sources' && (
            <SourcesTab
              bundle={bundle}
              onOpenProblem={(id) => {
                setCompareOnlyTermAlerts(false);
                setFocusProblemRequest({ id, nonce: Date.now() });
                setTab('compare');
              }}
            />
          )}
          {tab === 'agenda' && <ResearchAgendaTab bundle={bundle} />}
          {tab === 'rubric' && (
            <RubricEditorTab
              bundle={bundle}
              allItems={fullCandidatePool}
              editRequest={editRequest}
              onSaveEdit={handleSaveEdit}
            />
          )}
          {tab === 'review' && (
            <ReviewExportTab
              reviewerName={reviewerName}
              setReviewerName={setReviewerName}
              edits={edits}
              onImportEdits={(imported, rev) => {
                setEdits(imported);
                if (rev) setReviewerName(rev);
                setToast(`Imported ${Object.keys(imported).length} co-author edit(s).`);
              }}
              onClearEdits={() => {
                setEdits({});
                setToast('All session edits cleared.');
              }}
              onNotify={setToast}
            />
          )}
        </div>
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />

      <footer className="ed-footer">
        <span>
          Internal Co-Author Edition · Contains unredacted manuscript &amp; bilingual expert records · Auto-saved locally
        </span>
        <span className="ed-mono">
          Schema v{bundle.schema_version} · Standalone Offline HTML
        </span>
      </footer>
    </div>
  );
};
