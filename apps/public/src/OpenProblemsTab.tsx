import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryCode, OpenProblem, PublicBundle } from '@opae/core';
import {
  AUTHOR_LABELS,
  AlertCircleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CopyButton,
  EditIcon,
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
  useLocale,
} from '@opae/ui';
import type { ProposalPrefill } from './ProposalDrawer';

export type ProblemFilterMode =
  | 'all'
  | 'human'
  | 'ai_assisted'
  | 'term_alert'
  | 'needs_why';

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
  const { t, catLabel, govLabel, authorLabel } = useLocale();
  const [cat, setCat] = useState<'ALL' | CategoryCode>('ALL');
  const [query, setQuery] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showAllMappedChallenges, setShowAllMappedChallenges] = useState(false);
  const inspectorRef = useRef<HTMLElement | null>(null);

  const filterLabels: Record<ProblemFilterMode, string> = {
    all: t('problems.filter.all', 'All Open Problems'),
    term_alert: t('problems.filter.term_alert', 'Terminology Alerts'),
    needs_why: t('problems.filter.needs_why', 'Needs Justification'),
    human: t('problems.filter.human', 'Human Retained'),
    ai_assisted: t('problems.filter.ai_assisted', 'AI-Assisted Drafts'),
  };

  useEffect(() => {
    setShowAllMappedChallenges(false);
  }, [selectedId]);

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

  const selected: OpenProblem | undefined = useMemo(
    () =>
      selectedId
        ? filtered.find((p) => p.id === selectedId) ??
          bundle.open_problems.find((p) => p.id === selectedId)
        : undefined,
    [selectedId, filtered, bundle.open_problems]
  );

  const [renderedProblem, setRenderedProblem] = useState<OpenProblem | null>(selected ?? null);
  const [inspectorVisible, setInspectorVisible] = useState<boolean>(Boolean(selected));

  useEffect(() => {
    if (selected) {
      setRenderedProblem(selected);
      if (inspectorRef.current) {
        inspectorRef.current.scrollTop = 0;
      }
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setInspectorVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setInspectorVisible(false);
    const timer = window.setTimeout(() => {
      setRenderedProblem(null);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSelectProblem('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onSelectProblem]);

  const mappedChallenges = useMemo(() => {
    if (!renderedProblem) return [];
    return bundle.specific_challenges.filter((c) =>
      c.problem_ids.includes(renderedProblem.id)
    );
  }, [bundle.specific_challenges, renderedProblem]);

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
      contextLabel: `Revising ${prob.id} · ${catLabel(prob.category, bundle.categories[prob.category])}`,
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

  const shareUrl = renderedProblem
    ? `${window.location.href.split('#')[0]}#problems/${encodeURIComponent(renderedProblem.id)}`
    : window.location.href;

  const handleCloseDetail = () => {
    onSelectProblem('');
  };

  return (
    <div className="ed-forum-grid">
      {/* Left Minimalist Sidebar */}
      <aside
        className={`ed-sidebar ed-desktop-filters ${mobileFiltersOpen ? '' : 'is-collapsed'}`}
        aria-label="Categories and governance filters"
      >
        <div className="ed-sidebar-group">
          <div className="ed-sidebar-head">
            {t('problems.sidebar.categories', 'Categories')}
          </div>
          <button
            type="button"
            className="ed-sidebar-item"
            aria-pressed={cat === 'ALL'}
            onClick={() => setCat('ALL')}
          >
            <span>{t('problems.sidebar.allCategories', 'All Categories')}</span>
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
                  <span>{catLabel(code, label)}</span>
                </span>
                <span className="ed-count">{categoryCounts[code] ?? 0}</span>
              </button>
            )
          )}
        </div>

        <div className="ed-sidebar-group">
          <div className="ed-sidebar-head">
            {t('problems.sidebar.governance', 'Governance')}
          </div>
          {(
            [
              ['all', filterLabels.all, bundle.open_problems.length],
              ['term_alert', filterLabels.term_alert, termAlertCount],
              ['needs_why', filterLabels.needs_why, needsWhyCount],
              ['human', filterLabels.human, humanCount],
              ['ai_assisted', filterLabels.ai_assisted, aiCount],
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
              placeholder={t(
                'problems.searchPlaceholder',
                'Search open problems by ID, manuscript §, title, or keyword...'
              )}
              aria-label={t('problems.searchPlaceholder', 'Search open problems')}
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
              {t('problems.filtersBtn', 'Filters')}
              {cat !== 'ALL' || filterMode !== 'all'
                ? t('problems.filtersActive', ' (Active)')
                : ''}
            </span>
          </button>
        </div>

        {hasActiveFilters && (
          <div className="ed-active-filters" aria-label="Active filters">
            <span className="ed-faint">{t('problems.filteredLabel', 'Filtered:')}</span>
            {cat !== 'ALL' && (
              <button
                type="button"
                className="ed-tag is-ink"
                onClick={() => setCat('ALL')}
              >
                <span>
                  {cat} · {catLabel(cat, bundle.categories[cat])}
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
                <span>{filterLabels[filterMode]}</span>
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
              <span>{t('common.resetAll', 'Reset all')}</span>
            </button>
          </div>
        )}

        <div className="ed-between ed-small ed-faint">
          <span>
            {t('problems.showing', 'Showing {shown} of {total} Open Problems', {
              shown: filtered.length,
              total: bundle.open_problems.length,
            })}
          </span>
          <span>{t('problems.tier2Hint', 'Tier 2 · Aligned with manuscript')}</span>
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
                }}
              >
                <div className="ed-card-meta">
                  <div className="ed-inline">
                    <span className="ed-mono ed-code">{p.id}</span>
                    <span className="ed-sep">·</span>
                    <span className="ed-mono ed-faint">
                      {isUnaligned
                        ? t('problems.newProposalTag', 'New proposal')
                        : `§ ${p.paper_section_id}`}
                    </span>
                    <span className="ed-sep">·</span>
                    <span className="ed-faint">{catLabel(p.category, bundle.categories[p.category])}</span>
                  </div>
                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    {p.terminology_alerts.length > 0 && (
                      <span className="ed-tag is-accent">
                        <AlertCircleIcon size={12} />
                        <span>
                          {t('problems.termTag', '{count} term', {
                            count: p.terminology_alerts.length,
                          })}
                        </span>
                      </span>
                    )}
                    {isHuman && (
                      <span className="ed-tag is-add">
                        {t('problems.humanTag', 'Human retained')}
                      </span>
                    )}
                    {needsWhy && (
                      <span className="ed-tag">
                        {t('problems.needsRationaleTag', 'Needs rationale')}
                      </span>
                    )}
                    {cCount > 0 && (
                      <span className="ed-tag ed-mono">
                        {t('problems.chTag', '{count} ch.', { count: cCount })}
                      </span>
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
              <span>{t('problems.empty', 'No Open Problems match your current filter criteria.')}</span>
              <button type="button" className="ed-btn is-sm" onClick={resetAllFilters}>
                <RotateCcwIcon size={13} />
                <span>{t('common.resetAll', 'Reset all filters')}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Tablet/Mobile Slide-Over Backdrop */}
      {renderedProblem && (
        <div
          className={`ed-sheet-backdrop ed-tablet-only is-collapsible ${inspectorVisible ? 'is-open' : ''}`}
          onClick={handleCloseDetail}
          aria-hidden="true"
        />
      )}

      {/* Right Reading & Audit Sheet (smooth slide-in when a problem is clicked, blank when closed) */}
      {renderedProblem && (
        <aside
          ref={inspectorRef}
          className={`ed-inspector is-collapsible ${inspectorVisible ? 'is-open' : ''}`}
          aria-label="Open Problem detail drawer"
          aria-hidden={!inspectorVisible}
        >
          <div className="ed-inspector-topbar">
            <div className="ed-inline" style={{ flexWrap: 'wrap', minWidth: 0 }}>
              <span className="ed-mono ed-code">{renderedProblem.id}</span>
              <span className="ed-sep">·</span>
              <span className="ed-muted">
                {catLabel(renderedProblem.category, bundle.categories[renderedProblem.category])}
              </span>
              <span className="ed-sep">·</span>
              <span className="ed-mono ed-faint">
                {renderedProblem.paper_section_id === 'UNALIGNED_PROPOSAL'
                  ? t('problems.newProposalUnaligned', 'New proposal (unaligned)')
                  : `§ ${renderedProblem.paper_section_id}`}
              </span>
            </div>
            <button
              type="button"
              className="ed-btn is-ghost is-sm ed-inspector-close"
              onClick={handleCloseDetail}
              aria-label={t('common.close', 'Close')}
              title={t('common.close', 'Close')}
            >
              <XIcon size={15} />
              <span>{t('common.close', 'Close')}</span>
            </button>
          </div>

          <div key={renderedProblem.id} className="ed-inspector-content">
            <div>
              <h2 className="ed-inspector-title" style={{ marginBottom: '8px' }}>
                {renderedProblem.title}
              </h2>
              <p className="ed-inspector-body">{renderedProblem.description}</p>
            </div>

            {/* Contextual Actions */}
            <div className="ed-actions-row">
              <button
                type="button"
                className="ed-btn is-primary is-sm"
                onClick={() => handleProposeRevision(renderedProblem)}
              >
                <EditIcon size={13} />
                <span>{t('problems.proposeRevision', 'Propose Revision')}</span>
              </button>
              <button
                type="button"
                className="ed-btn is-sm"
                onClick={() => onOpenReview(renderedProblem.id)}
              >
                <MessageSquareIcon size={13} />
                <span>{t('problems.peerReview', 'Peer Review')}</span>
              </button>
              <CopyButton
                text={shareUrl}
                label={t('problems.shareLink', 'Share Link')}
                copiedLabel={t('problems.linkCopied', 'Link Copied')}
                className="ed-btn is-ghost is-sm"
                onCopied={() =>
                  onNotify(
                    t('problems.linkCopiedToast', 'Direct link to {id} copied.', {
                      id: renderedProblem.id,
                    })
                  )
                }
              />
            </div>

            <TerminologyAlertsPanel
              alerts={renderedProblem.terminology_alerts}
              onFixTerms={() => handleProposeTermFix(renderedProblem)}
              fixLabel={t('term.restoreLocked', 'Restore Locked Terms')}
            />

            <div className="ed-kv-list">
              <div className="ed-kv-row">
                <span className="ed-kv-label">{t('problems.kv.governance', 'Governance')}</span>
                <span className="ed-kv-val">
                  {govLabel(
                    renderedProblem.governance.status,
                    GOVERNANCE_LABELS[renderedProblem.governance.status] ??
                      renderedProblem.governance.status
                  )}
                </span>
              </div>
              <div className="ed-kv-row">
                <span className="ed-kv-label">{t('problems.kv.authorship', 'Authorship')}</span>
                <span className="ed-kv-val">
                  {authorLabel(
                    renderedProblem.provenance.author_type,
                    AUTHOR_LABELS[renderedProblem.provenance.author_type] ??
                      renderedProblem.provenance.author_type
                  )}
                </span>
              </div>
              {renderedProblem.confidence && (
                <div className="ed-kv-row">
                  <span className="ed-kv-label">
                    {t('problems.kv.confidence', 'Screening Confidence')}
                  </span>
                  <span className="ed-kv-val" style={{ textTransform: 'capitalize' }}>
                    {renderedProblem.confidence}
                  </span>
                </div>
              )}
              <div className="ed-kv-row">
                <span className="ed-kv-label">
                  {t('problems.kv.signoff', 'Moderator Sign-off')}
                </span>
                <span className="ed-kv-val">
                  {renderedProblem.governance.moderator_signoff.moderator_name
                    ? `${renderedProblem.governance.moderator_signoff.moderator_name} (${renderedProblem.governance.moderator_signoff.decision_date})`
                    : t('problems.kv.pendingReview', 'Pending human review')}
                </span>
              </div>
            </div>

            <div className="ed-lineage-grid">
              <div className="ed-lineage-box">
                <span className="ed-section-label">
                  {t('problems.whatChanged', 'What Changed')}
                </span>
                <p className="ed-muted" style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                  {renderedProblem.lineage.what_changed}
                </p>
                {renderedProblem.lineage.predecessors &&
                  renderedProblem.lineage.predecessors.length > 0 && (
                    <div className="ed-inline" style={{ flexWrap: 'wrap', marginTop: '4px' }}>
                      <span className="ed-faint ed-small">
                        {t('problems.predecessors', 'Predecessors:')}
                      </span>
                      {renderedProblem.lineage.predecessors.map((pred) => (
                        <span key={pred} className="ed-tag ed-mono">
                          {pred}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
              <div className="ed-lineage-box">
                <span className="ed-section-label">
                  {t('problems.whyChanged', 'Why This Change Was Needed')}
                </span>
                <p className="ed-muted" style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
                  {renderedProblem.lineage.why_changed}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              <span className="ed-section-label">
                {t('problems.rubricHeading', 'Five-Dimension Rubric Scores')}
              </span>
              <ScorePills scores={renderedProblem.scores} />
            </div>

            {renderedProblem.research_targets && renderedProblem.research_targets.length > 0 && (
              <div className="ed-lineage-box" style={{ gap: '6px' }}>
                <span className="ed-section-label">
                  {t('problems.researchTargets', 'Research Targets')}
                </span>
                <ul style={{ margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '4px' }}>
                  {renderedProblem.research_targets.map((rt, idx) => (
                    <li key={idx} className="ed-small ed-muted">
                      {rt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {renderedProblem.reference_ids && renderedProblem.reference_ids.length > 0 && (
              <div className="ed-stack" style={{ gap: '8px' }}>
                <span className="ed-section-label">
                  {t('problems.citedLiterature', 'Cited Public Literature ({count})', {
                    count: renderedProblem.reference_ids.length,
                  })}
                </span>
                <div className="ed-chip-row">
                  {renderedProblem.reference_ids.map((rid) => (
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
              <span className="ed-section-label">
                {t('problems.provenanceHeading', 'Provenance & Disclosed AI Role')}
              </span>
              <p className="ed-small ed-muted">
                <strong>{t('problems.attribution', 'Attribution:')}</strong>{' '}
                {renderedProblem.provenance.proposer_name}
              </p>
              <p className="ed-small ed-muted">
                <strong>{t('problems.aiRole', 'AI Role:')}</strong>{' '}
                {renderedProblem.provenance.known_ai_role}
              </p>
              {renderedProblem.stakeholders && renderedProblem.stakeholders.length > 0 && (
                <p className="ed-small ed-muted">
                  <strong>{t('problems.stakeholders', 'Stakeholders:')}</strong>{' '}
                  {renderedProblem.stakeholders.join(' · ')}
                </p>
              )}
            </div>

            <div className="ed-stack" style={{ gap: '8px' }}>
              <div className="ed-between">
                <span className="ed-section-label">
                  {t('problems.mappedChallenges', 'Tier-3 Specific Challenges ({count})', {
                    count: mappedChallenges.length,
                  })}
                </span>
                {mappedChallenges.length > 0 ? (
                  <button
                    type="button"
                    className="ed-btn is-sm"
                    onClick={() => onJumpToChallenge(renderedProblem.id)}
                  >
                    <span>{t('problems.openInChallenges', 'Open in Challenges')}</span>
                    <ArrowRightIcon size={13} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ed-btn is-sm"
                    onClick={() => handleProposeChallenge(renderedProblem)}
                  >
                    <PlusIcon size={12} />
                    <span>{t('problems.proposeFirstChallenge', 'Propose First Challenge')}</span>
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
                  {t('problems.showAllChallenges', 'Show all {count} mapped challenges', {
                    count: mappedChallenges.length,
                  })}
                </button>
              )}
              {mappedChallenges.length === 0 && (
                <p className="ed-small ed-faint">
                  {t(
                    'problems.noChallenges',
                    'No illustrative seed challenges are mapped yet for {id}. Community contributors can propose concrete, tractable challenges directly.',
                    { id: renderedProblem.id }
                  )}
                </p>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};
