import React, { useEffect, useMemo, useState } from 'react';
import type { CategoryCode, OpenProblem, PublicBundle } from '@opae/core';
import {
  AUTHOR_LABELS,
  AlertCircleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CopyButton,
  EditIcon,
  FileTextIcon,
  GOVERNANCE_LABELS,
  MessageSquareIcon,
  PlusIcon,
  RotateCcwIcon,
  ScorePills,
  SearchIcon,
  SlidersIcon,
  TerminologyAlertsPanel,
  XIcon,
  applyTerminologyFixes,
} from '@opae/ui';
import type { ProposalPrefill } from './ProposalDrawer';

export type ProblemFilterMode =
  | 'all'
  | 'human'
  | 'ai_assisted'
  | 'term_alert'
  | 'needs_why';

const FILTER_LABELS: Record<ProblemFilterMode, string> = {
  all: 'All Open Problems',
  term_alert: 'Terminology Alerts',
  needs_why: 'Needs Justification',
  human: 'Human Retained',
  ai_assisted: 'AI-Assisted Drafts',
};

export const OpenProblemsTab: React.FC<{
  bundle: PublicBundle;
  selectedId: string;
  filterMode: ProblemFilterMode;
  onFilterModeChange: (mode: ProblemFilterMode) => void;
  onSelectProblem: (id: string) => void;
  onJumpToChallenge: (problemId: string) => void;
  onOpenSource: (sourceId: string) => void;
  onPropose: (prefill: ProposalPrefill) => void;
  onOpenReview: (problemId: string) => void;
  onNotify: (msg: string) => void;
}> = ({
  bundle,
  selectedId,
  filterMode,
  onFilterModeChange,
  onSelectProblem,
  onJumpToChallenge,
  onOpenSource,
  onPropose,
  onOpenReview,
  onNotify,
}) => {
  const [cat, setCat] = useState<'ALL' | CategoryCode>('ALL');
  const [query, setQuery] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAllMappedChallenges, setShowAllMappedChallenges] = useState(false);

  useEffect(() => {
    setShowAllMappedChallenges(false);
  }, [selectedId]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const refById = useMemo(() => {
    const map: Record<string, { title: string; url?: string }> = {};
    for (const r of bundle.references) {
      map[r.id] = { title: r.title, url: r.url };
    }
    return map;
  }, [bundle.references]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of bundle.open_problems) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [bundle.open_problems]);

  const challengeCountByProblem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of bundle.specific_challenges) {
      for (const pid of c.problem_ids) {
        map[pid] = (map[pid] ?? 0) + 1;
      }
    }
    return map;
  }, [bundle.specific_challenges]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bundle.open_problems.filter((p) => {
      if (cat !== 'ALL' && p.category !== cat) return false;
      if (filterMode === 'human' && p.provenance.author_type !== 'human') return false;
      if (filterMode === 'ai_assisted' && p.provenance.author_type === 'human') return false;
      if (filterMode === 'term_alert' && p.terminology_alerts.length === 0) return false;
      if (
        filterMode === 'needs_why' &&
        p.lineage.justification_status !== 'needs_human_justification'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.paper_section_id.toLowerCase().includes(q)
      );
    });
  }, [bundle.open_problems, cat, query, filterMode]);

  const selected: OpenProblem | undefined =
    filtered.find((p) => p.id === selectedId) ?? filtered[0];

  const mappedChallenges = useMemo(() => {
    if (!selected) return [];
    return bundle.specific_challenges.filter((c) =>
      c.problem_ids.includes(selected.id)
    );
  }, [bundle.specific_challenges, selected]);

  const termAlertCount = bundle.open_problems.filter(
    (p) => p.terminology_alerts.length > 0
  ).length;
  const needsWhyCount = bundle.open_problems.filter(
    (p) => p.lineage.justification_status === 'needs_human_justification'
  ).length;
  const humanCount = bundle.open_problems.filter(
    (p) => p.provenance.author_type === 'human'
  ).length;
  const aiCount = bundle.open_problems.length - humanCount;

  const hasActiveFilters = cat !== 'ALL' || filterMode !== 'all' || query.trim() !== '';

  const resetAllFilters = () => {
    setCat('ALL');
    onFilterModeChange('all');
    setQuery('');
  };

  const handleProposeRevision = (prob: OpenProblem) => {
    onPropose({
      proposal_type: 'revise',
      target_problem_ids: [prob.id],
      category: prob.category,
      proposed_title: prob.title,
      proposed_description: prob.description,
      what_changed: `Revising wording of ${prob.id}`,
      contextLabel: `Revising ${prob.id} · ${bundle.categories[prob.category]}`,
    });
  };

  const handleProposeTermFix = (prob: OpenProblem) => {
    const fixedTitle = applyTerminologyFixes(prob.title, prob.terminology_alerts);
    const fixedDesc = applyTerminologyFixes(prob.description, prob.terminology_alerts);
    const pairs = prob.terminology_alerts
      .map((a) => `'${a.found_term}' → '${a.locked_term}'`)
      .join(', ');
    onPropose({
      proposal_type: 'revise',
      target_problem_ids: [prob.id],
      category: prob.category,
      proposed_title: fixedTitle,
      proposed_description: fixedDesc,
      what_changed: `Restores locked manuscript terminology in ${prob.id}: ${pairs}.`,
      why_changed: `The AI-assisted draft replaced intentional human manuscript terminology (${pairs}), diluting technical precision.`,
      contextLabel: `Terminology Alignment · ${prob.id}`,
    });
  };

  const handleProposeChallenge = (prob: OpenProblem) => {
    onPropose({
      proposal_type: 'challenge',
      target_problem_ids: [prob.id],
      category: prob.category,
      what_changed: `Adds a Tier-3 Specific Challenge grounded under ${prob.id}.`,
      contextLabel: `New Challenge for ${prob.id}`,
    });
  };

  const visibleChallenges = showAllMappedChallenges
    ? mappedChallenges
    : mappedChallenges.slice(0, 3);

  const shareUrl = selected
    ? `${window.location.href.split('#')[0]}#problems/${encodeURIComponent(selected.id)}`
    : window.location.href;

  return (
    <div className="ed-forum-grid">
      {/* Left Minimalist Sidebar */}
      <aside
        className={`ed-sidebar ed-desktop-filters ${mobileFiltersOpen ? '' : 'is-collapsed'}`}
        aria-label="Categories and governance filters"
      >
        <div className="ed-sidebar-group">
          <div className="ed-sidebar-head">Categories</div>
          <button
            type="button"
            className="ed-sidebar-item"
            aria-pressed={cat === 'ALL'}
            onClick={() => setCat('ALL')}
          >
            <span>All Categories</span>
            <span className="ed-count">{bundle.open_problems.length}</span>
          </button>
          {(Object.entries(bundle.categories) as Array<[CategoryCode, string]>).map(
            ([code, label]) => (
              <button
                key={code}
                type="button"
                className="ed-sidebar-item"
                aria-pressed={cat === code}
                onClick={() => setCat(code)}
              >
                <span className="ed-inline">
                  <span className="ed-mono" style={{ fontSize: '11.5px', opacity: 0.72 }}>
                    {code}
                  </span>
                  <span>{label}</span>
                </span>
                <span className="ed-count">{categoryCounts[code] ?? 0}</span>
              </button>
            )
          )}
        </div>

        <div className="ed-sidebar-group">
          <div className="ed-sidebar-head">Governance</div>
          {(
            [
              ['all', FILTER_LABELS.all, bundle.open_problems.length],
              ['term_alert', FILTER_LABELS.term_alert, termAlertCount],
              ['needs_why', FILTER_LABELS.needs_why, needsWhyCount],
              ['human', FILTER_LABELS.human, humanCount],
              ['ai_assisted', FILTER_LABELS.ai_assisted, aiCount],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className="ed-sidebar-item"
              aria-pressed={filterMode === id}
              onClick={() => onFilterModeChange(id)}
            >
              <span>{label}</span>
              <span className="ed-count">{count}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Center Editorial Feed */}
      <section className="ed-stack" style={{ gap: '14px' }} aria-label="Open Problems feed">
        <div className="ed-toolbar-top">
          <div className="ed-search-wrap" style={{ maxWidth: 'none' }}>
            <span className="ed-search-icon">
              <SearchIcon size={15} />
            </span>
            <input
              type="search"
              className="ed-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search open problems by ID, manuscript §, title, or keyword..."
              aria-label="Search open problems"
            />
          </div>

          <button
            type="button"
            className="ed-chip ed-mobile-only"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen((v) => !v)}
          >
            <SlidersIcon size={13} />
            <span>
              Filters{cat !== 'ALL' || filterMode !== 'all' ? ' (Active)' : ''}
            </span>
          </button>
        </div>

        {hasActiveFilters && (
          <div className="ed-active-filters" aria-label="Active filters">
            <span className="ed-faint">Filtered:</span>
            {cat !== 'ALL' && (
              <button
                type="button"
                className="ed-tag is-ink"
                onClick={() => setCat('ALL')}
              >
                <span>
                  {cat} · {bundle.categories[cat]}
                </span>
                <XIcon size={11} />
              </button>
            )}
            {filterMode !== 'all' && (
              <button
                type="button"
                className="ed-tag is-ink"
                onClick={() => onFilterModeChange('all')}
              >
                <span>{FILTER_LABELS[filterMode]}</span>
                <XIcon size={11} />
              </button>
            )}
            {query.trim() && (
              <button
                type="button"
                className="ed-tag is-ink"
                onClick={() => setQuery('')}
              >
                <span>&ldquo;{query.trim()}&rdquo;</span>
                <XIcon size={11} />
              </button>
            )}
            <button
              type="button"
              className="ed-btn is-ghost is-sm"
              style={{ marginLeft: 'auto' }}
              onClick={resetAllFilters}
            >
              <RotateCcwIcon size={12} />
              <span>Reset all</span>
            </button>
          </div>
        )}

        <div className="ed-between ed-small ed-faint">
          <span>
            Showing <strong style={{ color: 'var(--ed-ink)' }}>{filtered.length}</strong> of{' '}
            <span className="ed-mono">{bundle.open_problems.length}</span> Open Problems
          </span>
          <span>Tier 2 · Aligned with manuscript</span>
        </div>

        <div className="ed-card-list">
          {filtered.map((p) => {
            const cCount = challengeCountByProblem[p.id] ?? 0;
            const isHuman = p.provenance.author_type === 'human';
            const needsWhy = p.lineage.justification_status === 'needs_human_justification';
            const isUnaligned = p.paper_section_id === 'UNALIGNED_PROPOSAL';
            return (
              <button
                key={p.id}
                type="button"
                className={`ed-card ${selected?.id === p.id ? 'is-selected' : ''}`}
                onClick={() => {
                  onSelectProblem(p.id);
                  setSheetOpen(true);
                }}
              >
                <div className="ed-card-meta">
                  <div className="ed-inline">
                    <span className="ed-mono ed-code">{p.id}</span>
                    <span className="ed-sep">·</span>
                    <span className="ed-mono ed-faint">
                      {isUnaligned ? 'New proposal' : `§ ${p.paper_section_id}`}
                    </span>
                    <span className="ed-sep">·</span>
                    <span className="ed-faint">{bundle.categories[p.category]}</span>
                  </div>
                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    {p.terminology_alerts.length > 0 && (
                      <span className="ed-tag is-accent">
                        <AlertCircleIcon size={12} />
                        <span>{p.terminology_alerts.length} term</span>
                      </span>
                    )}
                    {isHuman && <span className="ed-tag is-add">Human retained</span>}
                    {needsWhy && <span className="ed-tag">Needs rationale</span>}
                    {cCount > 0 && (
                      <span className="ed-tag ed-mono">{cCount} ch.</span>
                    )}
                  </div>
                </div>
                <div className="ed-card-title">{p.title}</div>
                <p className="ed-card-excerpt">{p.description}</p>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="ed-empty ed-stack" style={{ gap: '10px', justifyItems: 'start' }}>
              <span>No Open Problems match your current filter criteria.</span>
              <button type="button" className="ed-btn is-sm" onClick={resetAllFilters}>
                <RotateCcwIcon size={13} />
                <span>Reset all filters</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Tablet/Mobile Slide-Over Backdrop */}
      {sheetOpen && (
        <div
          className="ed-sheet-backdrop ed-tablet-only"
          onClick={() => setSheetOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Right Reading & Audit Sheet */}
      <aside
        className={`ed-inspector ${sheetOpen ? 'is-sheet-open' : ''}`}
        aria-label="Open Problem detail drawer"
      >
        <div className="ed-between ed-tablet-only">
          <span className="ed-section-label">Problem Details</span>
          <button
            type="button"
            className="ed-btn is-ghost is-sm"
            onClick={() => setSheetOpen(false)}
            aria-label="Close details"
          >
            <XIcon size={15} />
            <span>Close</span>
          </button>
        </div>

        {selected ? (
          <>
            <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
              <span className="ed-mono ed-code">{selected.id}</span>
              <span className="ed-sep">·</span>
              <span className="ed-muted">{bundle.categories[selected.category]}</span>
              <span className="ed-sep">·</span>
              <span className="ed-mono ed-faint">
                {selected.paper_section_id === 'UNALIGNED_PROPOSAL'
                  ? 'New proposal (unaligned)'
                  : `§ ${selected.paper_section_id}`}
              </span>
            </div>

            <div>
              <h2 className="ed-inspector-title" style={{ marginBottom: '8px' }}>
                {selected.title}
              </h2>
              <p className="ed-inspector-body">{selected.description}</p>
            </div>

            {/* Contextual Actions */}
            <div className="ed-actions-row">
              <button
                type="button"
                className="ed-btn is-primary is-sm"
                onClick={() => handleProposeRevision(selected)}
              >
                <EditIcon size={13} />
                <span>Propose Revision</span>
              </button>
              <button
                type="button"
                className="ed-btn is-sm"
                onClick={() => onOpenReview(selected.id)}
              >
                <MessageSquareIcon size={13} />
                <span>Peer Review</span>
              </button>
              <CopyButton
                text={shareUrl}
                label="Share Link"
                copiedLabel="Link Copied"
                className="ed-btn is-ghost is-sm"
                onCopied={() => onNotify(`Direct link to ${selected.id} copied.`)}
              />
            </div>

            <TerminologyAlertsPanel
              alerts={selected.terminology_alerts}
              onFixTerms={() => handleProposeTermFix(selected)}
              fixLabel="Restore Locked Terms"
            />

            <div className="ed-kv-list">
              <div className="ed-kv-row">
                <span className="ed-kv-label">Governance</span>
                <span className="ed-kv-val">
                  {GOVERNANCE_LABELS[selected.governance.status] ?? selected.governance.status}
                </span>
              </div>
              <div className="ed-kv-row">
                <span className="ed-kv-label">Authorship</span>
                <span className="ed-kv-val">
                  {AUTHOR_LABELS[selected.provenance.author_type] ?? selected.provenance.author_type}
                </span>
              </div>
              {selected.confidence && (
                <div className="ed-kv-row">
                  <span className="ed-kv-label">Screening Confidence</span>
                  <span className="ed-kv-val" style={{ textTransform: 'capitalize' }}>
                    {selected.confidence}
                  </span>
                </div>
              )}
              <div className="ed-kv-row">
                <span className="ed-kv-label">Moderator Sign-off</span>
                <span className="ed-kv-val">
                  {selected.governance.moderator_signoff.moderator_name
                    ? `${selected.governance.moderator_signoff.moderator_name} (${selected.governance.moderator_signoff.decision_date})`
                    : 'Pending human review'}
                </span>
              </div>
            </div>

            <div className="ed-lineage-grid">
              <div className="ed-lineage-box">
                <span className="ed-section-label">What Changed</span>
                <p className="ed-muted" style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                  {selected.lineage.what_changed}
                </p>
                {selected.lineage.predecessors && selected.lineage.predecessors.length > 0 && (
                  <div className="ed-inline" style={{ flexWrap: 'wrap', marginTop: '4px' }}>
                    <span className="ed-faint ed-small">Predecessors:</span>
                    {selected.lineage.predecessors.map((pred) => (
                      <span key={pred} className="ed-tag ed-mono">
                        {pred}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="ed-lineage-box">
                <span className="ed-section-label">Why This Change Was Needed</span>
                <p className="ed-muted" style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                  {selected.lineage.why_changed}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              <span className="ed-section-label">Five-Dimension Rubric Scores</span>
              <ScorePills scores={selected.scores} />
            </div>

            {selected.research_targets && selected.research_targets.length > 0 && (
              <div className="ed-lineage-box" style={{ gap: '6px' }}>
                <span className="ed-section-label">Research Targets</span>
                <ul style={{ margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '4px' }}>
                  {selected.research_targets.map((rt, idx) => (
                    <li key={idx} className="ed-small ed-muted">
                      {rt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.reference_ids && selected.reference_ids.length > 0 && (
              <div className="ed-stack" style={{ gap: '8px' }}>
                <span className="ed-section-label">
                  Cited Public Literature ({selected.reference_ids.length})
                </span>
                <div className="ed-chip-row">
                  {selected.reference_ids.map((rid) => (
                    <button
                      key={rid}
                      type="button"
                      className="ed-tag ed-mono"
                      title={refById[rid]?.title ?? rid}
                      onClick={() => onOpenSource(rid)}
                    >
                      <BookOpenIcon size={11} />
                      <span>{rid}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="ed-lineage-box" style={{ gap: '6px' }}>
              <span className="ed-section-label">Provenance &amp; Disclosed AI Role</span>
              <p className="ed-small ed-muted">
                <strong>Attribution:</strong> {selected.provenance.proposer_name}
              </p>
              <p className="ed-small ed-muted">
                <strong>AI Role:</strong> {selected.provenance.known_ai_role}
              </p>
              {selected.stakeholders && selected.stakeholders.length > 0 && (
                <p className="ed-small ed-muted">
                  <strong>Stakeholders:</strong> {selected.stakeholders.join(' · ')}
                </p>
              )}
            </div>

            <div className="ed-stack" style={{ gap: '8px' }}>
              <div className="ed-between">
                <span className="ed-section-label">
                  Tier-3 Specific Challenges ({mappedChallenges.length})
                </span>
                {mappedChallenges.length > 0 ? (
                  <button
                    type="button"
                    className="ed-btn is-sm"
                    onClick={() => onJumpToChallenge(selected.id)}
                  >
                    <span>Open in Challenges</span>
                    <ArrowRightIcon size={13} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ed-btn is-sm"
                    onClick={() => handleProposeChallenge(selected)}
                  >
                    <PlusIcon size={12} />
                    <span>Propose First Challenge</span>
                  </button>
                )}
              </div>
              {visibleChallenges.map((c) => (
                <div key={c.id} className="ed-lineage-box">
                  <span className="ed-mono ed-faint" style={{ fontSize: '12px' }}>
                    {c.id}
                  </span>
                  <span className="ed-small">{c.title}</span>
                </div>
              ))}
              {mappedChallenges.length > 3 && !showAllMappedChallenges && (
                <button
                  type="button"
                  className="ed-btn is-ghost is-sm"
                  style={{ justifySelf: 'start' }}
                  onClick={() => setShowAllMappedChallenges(true)}
                >
                  Show all {mappedChallenges.length} mapped challenges
                </button>
              )}
              {mappedChallenges.length === 0 && (
                <p className="ed-small ed-faint">
                  No illustrative seed challenges are mapped yet for {selected.id}. Community
                  contributors can propose concrete, tractable challenges directly.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="ed-empty ed-inline">
            <FileTextIcon size={15} />
            <span>Select any Open Problem to inspect its provenance and audit details.</span>
          </div>
        )}
      </aside>
    </div>
  );
};
