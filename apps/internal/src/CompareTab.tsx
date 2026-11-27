import React, { useEffect, useMemo, useState } from 'react';
import type {
  CategoryCode,
  InternalBundle,
  OriginalItem,
  OriginalLocatorObject,
  ProblemEdit,
} from '@opae/core';
import {
  AUTHOR_LABELS,
  AlertCircleIcon,
  BipartiteCrosswalk,
  EditIcon,
  FileTextIcon,
  GOVERNANCE_LABELS,
  RotateCcwIcon,
  ScorePills,
  SearchIcon,
  SlidersIcon,
  TerminologyAlertsPanel,
  TrashIcon,
  XIcon,
  type CrosswalkProblem,
} from '@opae/ui';

function formatLocator(locator?: string | OriginalLocatorObject): string {
  if (!locator) return '';
  if (typeof locator === 'string') return locator;
  const parts: string[] = [];
  if (locator.source) parts.push(locator.source);
  if (locator.section) parts.push(`§ ${locator.section}`);
  if (locator.page_start && locator.page_end && locator.page_end !== locator.page_start) {
    parts.push(`pp. ${locator.page_start}–${locator.page_end}`);
  } else if (locator.page_start) {
    parts.push(`p. ${locator.page_start}`);
  }
  if (locator.text_heading_line) parts.push(`line ${locator.text_heading_line}`);
  return parts.join(' · ');
}

export const CompareTab: React.FC<{
  bundle: InternalBundle;
  problems: CrosswalkProblem[];
  edits: Record<string, ProblemEdit>;
  onlyTermAlerts: boolean;
  onOnlyTermAlertsChange: (val: boolean) => void;
  focusProblemRequest?: { id: string; nonce: number } | null;
  onJumpToEdit: (problemId: string, fixTerms?: boolean) => void;
  onToggleDelete: (problemId: string) => void;
}> = ({
  bundle,
  problems,
  edits,
  onlyTermAlerts,
  onOnlyTermAlertsChange,
  focusProblemRequest,
  onJumpToEdit,
  onToggleDelete,
}) => {
  const [cat, setCat] = useState<'ALL' | CategoryCode>('ALL');
  const [query, setQuery] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>('right');
  const [selectedId, setSelectedId] = useState<string | null>(problems[0]?.id ?? null);
  const [scrollTrigger, setScrollTrigger] = useState<{
    side: 'left' | 'right';
    id: string;
    nonce: number;
  } | null>(null);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileColumn, setMobileColumn] = useState<'left' | 'right'>('right');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!focusProblemRequest) return;
    setCat('ALL');
    setQuery('');
    setOnlyEdited(false);
    setSelectedSide('right');
    setSelectedId(focusProblemRequest.id);
    setScrollTrigger({
      side: 'right',
      id: focusProblemRequest.id,
      nonce: focusProblemRequest.nonce,
    });
  }, [focusProblemRequest]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const filteredProblems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return problems.filter((p) => {
      if (cat !== 'ALL' && p.category !== cat) return false;
      if (onlyTermAlerts && p.terminology_alerts.length === 0) return false;
      if (onlyEdited && !p._editAction) return false;
      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.paper_section_id.toLowerCase().includes(q)
      );
    });
  }, [problems, cat, query, onlyTermAlerts, onlyEdited]);

  const filteredOriginals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bundle.originals.filter((o) => {
      const id = o.legacy_id || o.id;
      if (cat !== 'ALL' && !id.startsWith(`${cat}.`)) return false;
      if (!q) return true;
      return (
        id.toLowerCase().includes(q) ||
        (o.title ?? '').toLowerCase().includes(q) ||
        (o.statement ?? '').toLowerCase().includes(q)
      );
    });
  }, [bundle.originals, cat, query]);

  const selectedOrig: OriginalItem | undefined =
    selectedSide === 'left'
      ? bundle.originals.find((o) => (o.legacy_id || o.id) === selectedId)
      : undefined;
  const selectedProb: CrosswalkProblem | undefined =
    selectedSide === 'right'
      ? problems.find((p) => p.id === selectedId)
      : undefined;

  // Compute working problems linked to the selected manuscript original
  const linkedProblemsForOrig = useMemo(() => {
    if (!selectedOrig) return [];
    const origId = selectedOrig.legacy_id || selectedOrig.id;
    return problems.filter(
      (p) =>
        (p.lineage.predecessors ?? []).includes(origId) ||
        (p.lineage.related ?? []).includes(origId)
    );
  }, [selectedOrig, problems]);

  const jumpToNode = (side: 'left' | 'right', id: string) => {
    setCat('ALL');
    setQuery('');
    setOnlyEdited(false);
    onOnlyTermAlertsChange(false);
    setSelectedSide(side);
    setSelectedId(id);
    setMobileColumn(side);
    setScrollTrigger({ side, id, nonce: Date.now() });
  };

  const resetFilters = () => {
    setCat('ALL');
    setQuery('');
    setOnlyEdited(false);
    onOnlyTermAlertsChange(false);
  };

  const hasFilters = cat !== 'ALL' || query.trim() !== '' || onlyTermAlerts || onlyEdited;
  const editCount = Object.keys(edits).length;
  const termAlertCount = problems.filter((p) => p.terminology_alerts.length > 0).length;
  const formattedLocator = selectedOrig ? formatLocator(selectedOrig.locator) : '';

  return (
    <div>
      {editCount > 0 && (
        <div className="ed-notice is-accent" role="status" style={{ marginBottom: '18px' }}>
          <span>
            <strong>Active review session (auto-saved locally):</strong> {editCount} edited item(s)
            highlighted in the crosswalk (green = added, terracotta = modified, brick-dashed =
            marked delete).
          </span>
          <span className="ed-muted">Use Download Diff in the top bar anytime.</span>
        </div>
      )}

      <div className="ed-toolbar">
        <div className="ed-toolbar-top">
          <div className="ed-search-wrap">
            <span className="ed-search-icon">
              <SearchIcon size={15} />
            </span>
            <input
              type="search"
              className="ed-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter originals, IDs, § sections, or open problems..."
              aria-label="Filter crosswalk"
            />
          </div>

          <div className="ed-chip-row">
            <button
              type="button"
              className="ed-chip ed-mobile-only"
              aria-expanded={mobileFiltersOpen}
              onClick={() => setMobileFiltersOpen((v) => !v)}
            >
              <SlidersIcon size={13} />
              <span>Categories{cat !== 'ALL' ? ` (${cat})` : ''}</span>
            </button>
            <button
              type="button"
              className="ed-chip"
              aria-pressed={onlyTermAlerts}
              onClick={() => onOnlyTermAlertsChange(!onlyTermAlerts)}
            >
              <AlertCircleIcon size={13} />
              <span>Terminology Alerts ({termAlertCount})</span>
            </button>
            <button
              type="button"
              className="ed-chip"
              aria-pressed={onlyEdited}
              onClick={() => setOnlyEdited((v) => !v)}
            >
              <span>Edited Only ({editCount})</span>
            </button>
            {hasFilters && (
              <button
                type="button"
                className="ed-btn is-ghost is-sm"
                onClick={resetFilters}
              >
                <RotateCcwIcon size={12} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        <div
          className={`ed-chip-row ed-desktop-filters ${mobileFiltersOpen ? '' : 'is-collapsed'}`}
          role="group"
          aria-label="Filter by category"
        >
          <button
            type="button"
            className="ed-chip"
            aria-pressed={cat === 'ALL'}
            onClick={() => setCat('ALL')}
          >
            All Categories
          </button>
          {(Object.entries(bundle.categories) as Array<[CategoryCode, string]>).map(
            ([code, label]) => (
              <button
                key={code}
                type="button"
                className="ed-chip"
                aria-pressed={cat === code}
                onClick={() => setCat(code)}
              >
                <span className="ed-mono" style={{ opacity: 0.7 }}>{code}</span>
                <span>{label}</span>
              </button>
            )
          )}
        </div>

        <div className="ed-chip-row ed-mobile-only" role="tablist" aria-label="Crosswalk column">
          <button
            type="button"
            className="ed-chip"
            aria-pressed={mobileColumn === 'right' && !sheetOpen}
            onClick={() => {
              setMobileColumn('right');
              setSheetOpen(false);
            }}
          >
            Open Problems ({filteredProblems.length})
          </button>
          <button
            type="button"
            className="ed-chip"
            aria-pressed={mobileColumn === 'left' && !sheetOpen}
            onClick={() => {
              setMobileColumn('left');
              setSheetOpen(false);
            }}
          >
            Originals ({filteredOriginals.length})
          </button>
          {(selectedOrig || selectedProb) && (
            <button
              type="button"
              className="ed-chip"
              aria-pressed={sheetOpen}
              onClick={() => setSheetOpen(true)}
            >
              Inspector ({selectedId})
            </button>
          )}
        </div>
      </div>

      <div className="ed-workspace">
        <div>
          <BipartiteCrosswalk
            originals={filteredOriginals}
            problems={filteredProblems}
            selectedId={selectedId}
            selectedSide={selectedSide}
            mobileColumn={mobileColumn}
            scrollTrigger={scrollTrigger}
            onSelectOriginal={(id) => {
              setSelectedSide('left');
              setSelectedId(id);
              setSheetOpen(true);
            }}
            onSelectProblem={(id) => {
              setSelectedSide('right');
              setSelectedId(id);
              setSheetOpen(true);
            }}
          />
        </div>

        {sheetOpen && (
          <div
            className="ed-sheet-backdrop ed-tablet-only"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`ed-inspector ${sheetOpen ? 'is-sheet-open' : ''}`}
          aria-label="Crosswalk Inspector"
        >
          <div className="ed-between ed-tablet-only">
            <span className="ed-section-label">Crosswalk Inspector</span>
            <button
              type="button"
              className="ed-btn is-ghost is-sm"
              onClick={() => setSheetOpen(false)}
              aria-label="Close inspector"
            >
              <XIcon size={15} />
              <span>Close</span>
            </button>
          </div>

          {selectedOrig && (
            <>
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                <span className="ed-mono ed-code">{selectedOrig.legacy_id || selectedOrig.id}</span>
                <span className="ed-sep">·</span>
                <span className="ed-tag">Nov 6 Manuscript Original</span>
              </div>

              <h2 className="ed-inspector-title">{selectedOrig.title}</h2>
              {selectedOrig.statement ? (
                <p className="ed-inspector-body">{selectedOrig.statement}</p>
              ) : (
                <p className="ed-small ed-faint">
                  No opening statement text recorded in the Nov 6 draft (heading-only entry).
                </p>
              )}

              {linkedProblemsForOrig.length > 0 && (
                <div className="ed-lineage-box" style={{ gap: '8px' }}>
                  <span className="ed-section-label">
                    Linked Working Open Problems ({linkedProblemsForOrig.length})
                  </span>
                  <div className="ed-chip-row">
                    {linkedProblemsForOrig.map((lp) => {
                      const isPrimary = (lp.lineage.predecessors ?? []).includes(
                        selectedOrig.legacy_id || selectedOrig.id
                      );
                      return (
                        <button
                          key={lp.id}
                          type="button"
                          className={`ed-tag ed-mono ${isPrimary ? 'is-ink' : ''}`}
                          title={`Jump to ${lp.id}: ${lp.title}`}
                          onClick={() => jumpToNode('right', lp.id)}
                        >
                          {lp.id} {isPrimary ? '(primary)' : '(related)'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedOrig.disposition && (
                <div className="ed-lineage-box">
                  <span className="ed-section-label">Crosswalk Disposition</span>
                  <p className="ed-small ed-muted">{selectedOrig.disposition}</p>
                </div>
              )}

              {selectedOrig.prose && (
                <div className="ed-lineage-box" style={{ gap: '8px' }}>
                  <span className="ed-section-label">Manuscript Prose Notes (Internal Only)</span>
                  {typeof selectedOrig.prose === 'string' ? (
                    <p className="ed-inspector-body" style={{ fontSize: '13.5px' }}>
                      {selectedOrig.prose}
                    </p>
                  ) : (
                    <>
                      <div className="ed-chip-row">
                        {selectedOrig.prose.preserve_developed_material && (
                          <span className="ed-tag is-add">Preserve developed material</span>
                        )}
                        {typeof selectedOrig.prose.ai_marked_passages === 'number' && (
                          <span className="ed-tag ed-mono">
                            AI-marked passages: {selectedOrig.prose.ai_marked_passages}
                          </span>
                        )}
                      </div>
                      {selectedOrig.prose.todos && selectedOrig.prose.todos.length > 0 && (
                        <ul style={{ margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '4px' }}>
                          {selectedOrig.prose.todos.map((todo, i) => (
                            <li key={i} className="ed-small ed-muted">
                              {todo}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}

              {formattedLocator && (
                <div className="ed-kv-list">
                  <div className="ed-kv-row">
                    <span className="ed-kv-label">Manuscript Locator</span>
                    <span className="ed-kv-val ed-mono" style={{ fontSize: '12px' }}>
                      {formattedLocator}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {selectedProb && (
            <>
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                <span className="ed-mono ed-code">{selectedProb.id}</span>
                <span className="ed-sep">·</span>
                <span className="ed-muted">{bundle.categories[selectedProb.category]}</span>
                <span className="ed-sep">·</span>
                <span className="ed-mono ed-faint">
                  {selectedProb.paper_section_id === 'UNALIGNED_PROPOSAL'
                    ? 'New proposal'
                    : `§ ${selectedProb.paper_section_id}`}
                </span>
              </div>

              <div>
                <h2 className="ed-inspector-title" style={{ marginBottom: '8px' }}>
                  {selectedProb.title}
                </h2>
                <p className="ed-inspector-body">{selectedProb.description}</p>
              </div>

              <div className="ed-actions-row">
                <button
                  type="button"
                  className="ed-btn is-primary is-sm"
                  onClick={() => onJumpToEdit(selectedProb.id, false)}
                >
                  <EditIcon size={13} />
                  <span>Edit Wording &amp; Scores</span>
                </button>
                <button
                  type="button"
                  className="ed-btn is-del-outline is-sm"
                  onClick={() => onToggleDelete(selectedProb.id)}
                >
                  {selectedProb._editAction === 'deleted' ? (
                    <>
                      <RotateCcwIcon size={13} />
                      <span>Undo Delete Mark</span>
                    </>
                  ) : (
                    <>
                      <TrashIcon size={13} />
                      <span>Mark for Deletion</span>
                    </>
                  )}
                </button>
              </div>

              <TerminologyAlertsPanel
                alerts={selectedProb.terminology_alerts}
                onFixTerms={() => onJumpToEdit(selectedProb.id, true)}
                fixLabel="Restore Locked Terms"
              />

              <div className="ed-kv-list">
                <div className="ed-kv-row">
                  <span className="ed-kv-label">Governance Status</span>
                  <span className="ed-kv-val">
                    {GOVERNANCE_LABELS[selectedProb.governance.status] ??
                      selectedProb.governance.status}
                  </span>
                </div>
                <div className="ed-kv-row">
                  <span className="ed-kv-label">Authorship</span>
                  <span className="ed-kv-val">
                    {AUTHOR_LABELS[selectedProb.provenance.author_type] ??
                      selectedProb.provenance.author_type}
                  </span>
                </div>
                <div className="ed-kv-row">
                  <span className="ed-kv-label">Justification</span>
                  <span className="ed-kv-val">
                    {selectedProb.lineage.justification_status === 'documented'
                      ? 'Documented'
                      : 'Needs Human Rationale'}
                  </span>
                </div>
              </div>

              {((selectedProb.lineage.predecessors?.length ?? 0) > 0 ||
                (selectedProb.lineage.related?.length ?? 0) > 0) && (
                <div className="ed-lineage-box" style={{ gap: '8px' }}>
                  <span className="ed-section-label">Jump to Manuscript Predecessors</span>
                  <div className="ed-chip-row">
                    {(selectedProb.lineage.predecessors ?? []).map((pid) => (
                      <button
                        key={`p-${pid}`}
                        type="button"
                        className="ed-tag is-ink ed-mono"
                        onClick={() => jumpToNode('left', pid)}
                      >
                        {pid} (primary)
                      </button>
                    ))}
                    {(selectedProb.lineage.related ?? []).map((rid) => (
                      <button
                        key={`r-${rid}`}
                        type="button"
                        className="ed-tag ed-mono"
                        onClick={() => jumpToNode('left', rid)}
                      >
                        {rid} (related)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="ed-lineage-grid">
                <div className="ed-lineage-box">
                  <span className="ed-section-label">What Changed</span>
                  <p className="ed-muted" style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                    {selectedProb.lineage.what_changed}
                  </p>
                </div>
                <div className="ed-lineage-box">
                  <span className="ed-section-label">Why This Change Was Needed</span>
                  <p className="ed-muted" style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                    {selectedProb.lineage.why_changed}
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                <span className="ed-section-label">Five-Dimension Rubric Scores</span>
                <ScorePills scores={selectedProb.scores} />
              </div>
            </>
          )}

          {!selectedOrig && !selectedProb && (
            <div className="ed-empty ed-inline">
              <FileTextIcon size={15} />
              <span>Select any manuscript original or Open Problem to inspect details.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
