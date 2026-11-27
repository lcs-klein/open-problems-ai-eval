import React, { useMemo, useState } from 'react';
import type { CategoryCode, PublicBundle, SpecificChallenge } from '@opae/core';
import {
  ArrowUpRightIcon,
  EditIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
  useLocale,
} from '@opae/ui';
import type { ProposalPrefill } from './ProposalDrawer';

export const ChallengesTab: React.FC<{
  bundle: PublicBundle;
  problemFilter: string;
  onProblemFilterChange: (problemId: string) => void;
  onOpenProblem: (problemId: string) => void;
  onProposeChallengeUpdate: (prefill: ProposalPrefill) => void;
}> = ({
  bundle,
  problemFilter,
  onProblemFilterChange,
  onOpenProblem,
  onProposeChallengeUpdate,
}) => {
  const { t, catLabel } = useLocale();
  const [catFilter, setCatFilter] = useState<'ALL' | CategoryCode>('ALL');
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  const problemById = useMemo(() => {
    const map: Record<string, { title: string; category: CategoryCode }> = {};
    for (const p of bundle.open_problems) {
      map[p.id] = { title: p.title, category: p.category };
    }
    return map;
  }, [bundle.open_problems]);

  const kinds = useMemo(
    () => Array.from(new Set(bundle.specific_challenges.map((c) => c.kind))).sort(),
    [bundle.specific_challenges]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bundle.specific_challenges.filter((c) => {
      if (problemFilter && !c.problem_ids.includes(problemFilter)) return false;
      if (catFilter !== 'ALL') {
        const matchesCat = c.problem_ids.some(
          (pid) => problemById[pid]?.category === catFilter
        );
        if (!matchesCat) return false;
      }
      if (kindFilter !== 'ALL' && c.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.problem_ids.some((id) => id.toLowerCase().includes(q)) ||
        (c.evidence ?? []).some((ev) =>
          `${ev.source_id ?? ''} ${ev.location ?? ''}`.toLowerCase().includes(q)
        )
      );
    });
  }, [bundle.specific_challenges, problemFilter, catFilter, kindFilter, query, problemById]);

  const hasFilters =
    Boolean(problemFilter) ||
    catFilter !== 'ALL' ||
    kindFilter !== 'ALL' ||
    query.trim() !== '';

  const resetAll = () => {
    onProblemFilterChange('');
    setCatFilter('ALL');
    setKindFilter('ALL');
    setQuery('');
  };

  const handleClaimOrUpdate = (c: SpecificChallenge) => {
    const parentId = c.problem_ids[0];
    const parentCat = (parentId && problemById[parentId]?.category) || 'F';
    onProposeChallengeUpdate({
      proposal_type: 'challenge_update',
      target_problem_ids: [c.id],
      category: parentCat,
      proposed_title: c.title,
      what_changed: `Proposes owner, milestone, or status update for challenge ${c.id}.`,
      contextLabel: `Update Challenge · ${c.id}`,
    });
  };

  return (
    <div className="ed-stack">
      <div className="ed-toolbar" style={{ marginBottom: 0 }}>
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
              placeholder={t(
                'challenges.searchPlaceholder',
                'Search challenges by ID, title, Open Problem, or source...'
              )}
              aria-label={t('challenges.searchPlaceholder', 'Search specific challenges')}
            />
          </div>

          <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
            <select
              className="ed-select"
              style={{ width: 'auto', minWidth: '220px', maxWidth: '100%' }}
              aria-label="Filter by parent Open Problem"
              value={problemFilter}
              onChange={(e) => onProblemFilterChange(e.target.value)}
            >
              <option value="">{t('challenges.allProblems', 'All Open Problems')}</option>
              {bundle.open_problems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} — {p.title.slice(0, 48)}
                </option>
              ))}
            </select>

            <select
              className="ed-select"
              style={{ width: 'auto' }}
              aria-label="Filter by challenge origin kind"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="ALL">{t('challenges.allOrigins', 'All Origins')}</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ed-chip-row" role="group" aria-label="Filter challenges by category">
          <button
            type="button"
            className="ed-chip"
            aria-pressed={catFilter === 'ALL'}
            onClick={() => setCatFilter('ALL')}
          >
            {t('challenges.allCategories', 'All Categories')}
          </button>
          {(Object.entries(bundle.categories) as Array<[CategoryCode, string]>).map(
            ([code, label]) => (
              <button
                key={code}
                type="button"
                className="ed-chip"
                aria-pressed={catFilter === code}
                onClick={() => setCatFilter(code)}
              >
                <span className="ed-mono" style={{ opacity: 0.7 }}>{code}</span>
                <span>{catLabel(code, label)}</span>
              </button>
            )
          )}
        </div>
      </div>

      {hasFilters && (
        <div className="ed-active-filters" aria-label="Active challenge filters">
          <span className="ed-faint">
            {t('challenges.showing', 'Showing {shown} of {total}:', {
              shown: filtered.length,
              total: bundle.specific_challenges.length,
            })}
          </span>
          {problemFilter && (
            <button
              type="button"
              className="ed-tag is-ink ed-mono"
              onClick={() => onProblemFilterChange('')}
            >
              <span>
                {t('challenges.problemChip', 'Problem: {id}', { id: problemFilter })}
              </span>
              <XIcon size={11} />
            </button>
          )}
          {catFilter !== 'ALL' && (
            <button
              type="button"
              className="ed-tag is-ink"
              onClick={() => setCatFilter('ALL')}
            >
              <span>
                {catFilter} · {catLabel(catFilter, bundle.categories[catFilter])}
              </span>
              <XIcon size={11} />
            </button>
          )}
          {kindFilter !== 'ALL' && (
            <button
              type="button"
              className="ed-tag is-ink"
              onClick={() => setKindFilter('ALL')}
            >
              <span>{kindFilter}</span>
              <XIcon size={11} />
            </button>
          )}
          <button
            type="button"
            className="ed-btn is-ghost is-sm"
            style={{ marginLeft: 'auto' }}
            onClick={resetAll}
          >
            <RotateCcwIcon size={12} />
            <span>{t('common.resetAll', 'Reset all')}</span>
          </button>
        </div>
      )}

      <div className="ed-card-list">
        {filtered.map((c) => (
          <article
            key={c.id}
            className="ed-panel ed-stack"
            style={{ gap: '12px', padding: '18px 20px' }}
          >
            <div className="ed-between">
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                <span className="ed-mono ed-code">{c.id}</span>
                <span className="ed-sep">·</span>
                <span className="ed-tag">{c.kind}</span>
                {c.status && <span className="ed-tag">{c.status}</span>}
              </div>
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                {c.problem_ids.map((pid) => (
                  <button
                    key={pid}
                    type="button"
                    className="ed-tag is-ink ed-mono"
                    title={`Open ${pid}: ${problemById[pid]?.title ?? ''}`}
                    onClick={() => onOpenProblem(pid)}
                  >
                    {pid}
                  </button>
                ))}
                <button
                  type="button"
                  className="ed-btn is-ghost is-sm"
                  onClick={() => handleClaimOrUpdate(c)}
                >
                  <EditIcon size={12} />
                  <span>{t('challenges.claimUpdate', 'Claim / Update')}</span>
                </button>
              </div>
            </div>

            <h3 style={{ fontSize: '15.5px', fontWeight: 600, lineHeight: 1.45 }}>
              {c.title}
            </h3>

            {c.evidence && c.evidence.length > 0 && (
              <div className="ed-lineage-box" style={{ gap: '6px' }}>
                <span className="ed-section-label">
                  {t('challenges.evidence', 'Literature Evidence ({count})', {
                    count: c.evidence.length,
                  })}
                </span>
                <div className="ed-stack" style={{ gap: '6px' }}>
                  {c.evidence.map((ev, idx) => (
                    <div key={`${c.id}-ev-${idx}`} className="ed-small ed-muted">
                      <span className="ed-mono ed-code" style={{ marginRight: '6px' }}>
                        {ev.source_id}
                      </span>
                      {ev.url ? (
                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ed-inline"
                        >
                          <span>{ev.location || ev.url}</span>
                          <ArrowUpRightIcon size={12} />
                        </a>
                      ) : (
                        <span>{ev.location}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}

        {filtered.length === 0 && (
          <div className="ed-empty ed-stack" style={{ gap: '10px', justifyItems: 'start' }}>
            <span>{t('challenges.empty', 'No specific challenges match the current filter.')}</span>
            <button type="button" className="ed-btn is-sm" onClick={resetAll}>
              <RotateCcwIcon size={13} />
              <span>{t('common.resetAll', 'Reset all filters')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
