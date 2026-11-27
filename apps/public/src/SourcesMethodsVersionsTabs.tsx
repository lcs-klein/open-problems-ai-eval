import React, { useMemo, useState } from 'react';
import type { CategoryCode, PublicBundle } from '@opae/core';
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  CopyButton,
  DownloadIcon,
  FrontierChart,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
} from '@opae/ui';

export const SourcesTab: React.FC<{
  bundle: PublicBundle;
  highlightedSourceId?: string;
  onClearHighlight?: () => void;
  onOpenProblem: (problemId: string) => void;
}> = ({ bundle, highlightedSourceId = '', onClearHighlight, onOpenProblem }) => {
  const [query, setQuery] = useState('');
  const [onlyTable2, setOnlyTable2] = useState(false);

  const problemsByRef = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of bundle.open_problems) {
      for (const rid of p.reference_ids ?? []) {
        if (!map[rid]) map[rid] = [];
        map[rid].push(p.id);
      }
    }
    return map;
  }, [bundle.open_problems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bundle.references.filter((ref) => {
      if (highlightedSourceId && ref.id !== highlightedSourceId) return false;
      if (onlyTable2 && !ref.table2) return false;
      if (!q) return true;
      return (
        ref.id.toLowerCase().includes(q) ||
        ref.title.toLowerCase().includes(q) ||
        (ref.type ?? '').toLowerCase().includes(q) ||
        (problemsByRef[ref.id] ?? []).some((pid) => pid.toLowerCase().includes(q))
      );
    });
  }, [bundle.references, highlightedSourceId, onlyTable2, query, problemsByRef]);

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
              placeholder="Search sources by ID, author/title, or mapped Open Problem..."
              aria-label="Search public literature sources"
            />
          </div>

          <div className="ed-chip-row">
            <button
              type="button"
              className="ed-chip"
              aria-pressed={!onlyTable2}
              onClick={() => setOnlyTable2(false)}
            >
              All Sources ({bundle.references.length})
            </button>
            <button
              type="button"
              className="ed-chip"
              aria-pressed={onlyTable2}
              onClick={() => setOnlyTable2(true)}
            >
              Table 2 Core ({bundle.references.filter((r) => r.table2).length})
            </button>
          </div>
        </div>
      </div>

      {highlightedSourceId && (
        <div className="ed-active-filters">
          <span className="ed-faint">Focused citation:</span>
          <button
            type="button"
            className="ed-tag is-ink ed-mono"
            onClick={onClearHighlight}
          >
            <span>{highlightedSourceId}</span>
            <XIcon size={11} />
          </button>
          <button
            type="button"
            className="ed-btn is-ghost is-sm"
            style={{ marginLeft: 'auto' }}
            onClick={onClearHighlight}
          >
            Show all {bundle.references.length} sources
          </button>
        </div>
      )}

      <div className="ed-table-wrap">
        <table className="ed-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title &amp; Link</th>
              <th>Extracted Records</th>
              <th>Grounded Open Problems</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ref) => {
              const linked = problemsByRef[ref.id] ?? [];
              const direct = ref.extraction_counts?.direct ?? 0;
              const indirect = ref.extraction_counts?.indirect ?? 0;
              return (
                <tr key={ref.id}>
                  <td className="ed-mono ed-code">
                    <div>{ref.id}</div>
                    {ref.table2 && (
                      <span className="ed-tag" style={{ marginTop: '4px' }}>
                        Table 2
                      </span>
                    )}
                  </td>
                  <td>
                    {ref.url ? (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="ed-inline"
                      >
                        <span>{ref.title}</span>
                        <ArrowUpRightIcon size={13} />
                      </a>
                    ) : (
                      ref.title
                    )}
                    <div className="ed-small ed-faint" style={{ marginTop: '2px' }}>
                      {ref.type ?? 'Literature'}
                    </div>
                  </td>
                  <td className="ed-mono ed-small ed-muted" style={{ whiteSpace: 'nowrap' }}>
                    {direct + indirect > 0 ? (
                      <div>
                        <strong style={{ color: 'var(--ed-ink)' }}>{direct}</strong> direct
                        {indirect > 0 ? ` · ${indirect} indirect` : ''}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {linked.length > 0 ? (
                      <div className="ed-chip-row">
                        {linked.map((pid) => (
                          <button
                            key={pid}
                            type="button"
                            className="ed-tag ed-mono"
                            onClick={() => onOpenProblem(pid)}
                          >
                            {pid}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="ed-faint ed-small">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="ed-inline" style={{ justifyContent: 'space-between', width: '100%' }}>
                    <span className="ed-muted">No sources match your current filter.</span>
                    <button
                      type="button"
                      className="ed-btn is-sm"
                      onClick={() => {
                        setQuery('');
                        setOnlyTable2(false);
                        onClearHighlight?.();
                      }}
                    >
                      <RotateCcwIcon size={12} />
                      <span>Reset</span>
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface UpstreamCounts {
  rawRecords?: number;
  eligibleSources?: number;
  manuscriptFormulations?: number;
  activeFamilies?: number;
  specificExamples?: number;
}

interface AltScenario {
  id: string;
  model: string;
  size: number;
  score: number;
  needsCoverage?: number;
  researchCoverage?: number;
  scope?: string;
}

interface ManuscriptReviewInfo {
  lineage_date?: string;
  framework_date?: string;
  body_comparison?: { match?: number; small_edits?: number; material_changes?: number };
  materially_changed_ids?: string[];
  summary?: string;
  recheck?: string;
}

export const MethodsAuditTab: React.FC<{
  bundle: PublicBundle;
  onNotify: (msg: string) => void;
}> = ({ bundle, onNotify }) => {
  const upstreamCounts = (bundle.generation_upstream?.counts ?? {}) as UpstreamCounts;
  const scenarios = (
    (bundle.screening_alternatives?.scenarios ?? []) as AltScenario[]
  );
  const manuscriptReview = (bundle.manuscript_review ?? {}) as ManuscriptReviewInfo;
  const methodLimits = (bundle.generation_method?.limits ?? []) as string[];
  const frontierPoints = bundle.screening_frontier ?? [];

  const funnelSteps = [
    { label: 'Raw literature records', count: upstreamCounts.rawRecords ?? 1095 },
    { label: 'Eligible evaluation records', count: upstreamCounts.eligibleSources ?? 801 },
    { label: 'Distinct problem formulations', count: upstreamCounts.manuscriptFormulations ?? 438 },
    { label: 'Active target families', count: upstreamCounts.activeFamilies ?? 327 },
    { label: 'Published Tier-3 seed challenges', count: upstreamCounts.specificExamples ?? 60, accent: true },
  ];
  const maxFunnel = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <div className="ed-stack">
      {/* 1. Upstream Funnel */}
      <section className="ed-panel ed-stack" style={{ gap: '14px' }}>
        <div>
          <h2 className="ed-panel-title">Upstream Literature-to-Challenge Funnel</h2>
          <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
            Reproducible deterministic progression from 28 published review/position sources to the 60
            illustrative Tier-3 Specific Challenges.
          </p>
        </div>
        <div className="ed-funnel">
          {funnelSteps.map((step) => (
            <div key={step.label} className="ed-funnel-row">
              <span className="ed-muted">{step.label}</span>
              <div className="ed-funnel-track">
                <div
                  className={`ed-funnel-fill ${step.accent ? 'is-accent' : ''}`}
                  style={{ width: `${Math.max(4, (step.count / maxFunnel) * 100)}%` }}
                />
              </div>
              <strong className="ed-mono" style={{ textAlign: 'right' }}>
                {step.count.toLocaleString()}
              </strong>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Interactive Combinatorial Frontier */}
      {frontierPoints.length > 0 && (
        <FrontierChart
          points={frontierPoints}
          title="Downstream Combinatorial Optimization Frontier F(S) · K = 7..48"
        />
      )}

      {/* 3. Exact Portfolio Alternatives Comparison */}
      {scenarios.length > 0 && (
        <section className="ed-stack" style={{ gap: '10px' }}>
          <div className="ed-between">
            <h3 className="ed-panel-title">
              Exact Optimal Portfolio Alternatives (K = 35, 36, 48)
            </h3>
            <span className="ed-small ed-faint">Expanded vs. Bridge coverage dictionaries</span>
          </div>
          <div className="ed-table-wrap">
            <table className="ed-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Model</th>
                  <th>Size K</th>
                  <th>Objective F(S)</th>
                  <th>Stakeholder Coverage</th>
                  <th>Research Coverage</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((sc) => (
                  <tr key={sc.id}>
                    <td className="ed-mono ed-code">{sc.id}</td>
                    <td className="ed-small" style={{ textTransform: 'capitalize' }}>
                      {sc.model}
                    </td>
                    <td className="ed-mono">{sc.size}</td>
                    <td className="ed-mono">
                      <strong>{sc.score.toFixed(2)}</strong>
                    </td>
                    <td className="ed-mono ed-small">
                      {typeof sc.needsCoverage === 'number'
                        ? `${(sc.needsCoverage * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="ed-mono ed-small">
                      {typeof sc.researchCoverage === 'number'
                        ? `${(sc.researchCoverage * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="ed-small ed-muted">{sc.scope ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. Self-Critical Audit & Manuscript Drift */}
      <div className="ed-two-col">
        <section className="ed-panel ed-stack" style={{ gap: '10px' }}>
          <span className="ed-section-label">Manuscript Sync Audit</span>
          <h3 className="ed-panel-title">
            Draft Drift ({manuscriptReview.lineage_date || 'Nov 6'} →{' '}
            {manuscriptReview.framework_date || 'Nov 10'})
          </h3>
          {manuscriptReview.body_comparison && (
            <div className="ed-chip-row">
              <span className="ed-tag is-add ed-mono">
                {manuscriptReview.body_comparison.match ?? 0} unchanged
              </span>
              <span className="ed-tag ed-mono">
                {manuscriptReview.body_comparison.small_edits ?? 0} small edits
              </span>
              <span className="ed-tag is-accent ed-mono">
                {manuscriptReview.body_comparison.material_changes ?? 0} material body changes
              </span>
            </div>
          )}
          {manuscriptReview.summary && (
            <p className="ed-small ed-muted">{manuscriptReview.summary}</p>
          )}
          {manuscriptReview.materially_changed_ids && (
            <div className="ed-lineage-box" style={{ gap: '6px' }}>
              <span className="ed-section-label">Items Requiring Current-Draft Recheck</span>
              <div className="ed-chip-row">
                {manuscriptReview.materially_changed_ids.map((mid) => (
                  <span key={mid} className="ed-tag ed-mono">
                    {mid}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="ed-panel ed-stack" style={{ gap: '10px' }}>
          <span className="ed-section-label">Self-Critical Limitations</span>
          <h3 className="ed-panel-title">Disclosed Screening Biases &amp; Limits</h3>
          <div className="ed-lineage-box" style={{ gap: '4px' }}>
            <span className="ed-section-label">Combinatorial Objective</span>
            <code className="ed-inline-code">
              F(S) = 20 × [mean(q1)/4 + mean(q2)/4 + mean(q3)/4 + union(Q4) + union(Q5)]
            </code>
          </div>
          {methodLimits.length > 0 && (
            <ul style={{ margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '8px' }}>
              {methodLimits.map((lim, idx) => (
                <li key={idx} className="ed-small ed-muted" style={{ lineHeight: 1.5 }}>
                  {lim}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 5. Zero-Gap Reproducible Replay Packages */}
      <section className="ed-panel ed-stack" style={{ gap: '14px' }}>
        <div>
          <h3 className="ed-panel-title">Reproducible Replay Packages (Verified SHA-256)</h3>
          <p className="ed-small ed-muted" style={{ marginTop: '2px' }}>
            Pure Python 3.10+ standard library kits—zero third-party dependencies required to verify
            every exact ranking and branch-and-bound optimality bound.
          </p>
        </div>
        <div className="ed-card-list">
          {bundle.reproduce_packages.map((pkg) => (
            <div key={pkg.id} className="ed-panel-soft ed-stack" style={{ gap: '10px' }}>
              <div className="ed-between">
                <strong>{pkg.title}</strong>
                <a className="ed-btn is-primary is-sm" href={pkg.href} download>
                  <DownloadIcon size={13} />
                  <span>Download ZIP</span>
                </a>
              </div>
              <p className="ed-small ed-muted">{pkg.description}</p>
              <div className="ed-between" style={{ gap: '8px' }}>
                <code className="ed-inline-code" style={{ flex: '1 1 auto' }}>
                  {pkg.command}
                </code>
                <CopyButton
                  text={pkg.command}
                  label="Copy command"
                  copiedLabel="Copied"
                  className="ed-btn is-sm"
                  onCopied={() => onNotify('Replay command copied to clipboard.')}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Terminology Lock Policy */}
      <section className="ed-stack" style={{ gap: '10px' }}>
        <div className="ed-between">
          <h3 className="ed-panel-title">
            Terminology Lock Policy ({bundle.terminology_rules.length} Active Rules)
          </h3>
          <span className="ed-mono ed-faint ed-small">Manuscript Priority</span>
        </div>
        <div className="ed-table-wrap">
          <table className="ed-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Locked Term</th>
                <th>Disallowed Substitutes</th>
                <th>Manuscript Context</th>
              </tr>
            </thead>
            <tbody>
              {bundle.terminology_rules.map((r) => (
                <tr key={r.id}>
                  <td className="ed-mono ed-code">{r.id}</td>
                  <td>
                    <span className="ed-term-new ed-mono" style={{ fontSize: '12px' }}>
                      {r.locked_term}
                    </span>
                  </td>
                  <td className="ed-mono ed-small" style={{ color: 'var(--ed-accent)' }}>
                    {r.disallowed_substitutes.join(', ')}
                  </td>
                  <td className="ed-small ed-muted">{r.paper_context}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

interface ReleaseRecord {
  id: string;
  title?: string;
  date?: string;
  kind?: string;
  summary?: string;
  problem_ids?: string[];
  decision_ids?: string[];
}

export const VersionsTab: React.FC<{
  bundle: PublicBundle;
  onOpenProblem: (problemId: string) => void;
}> = ({ bundle, onOpenProblem }) => {
  const [expandedRelease, setExpandedRelease] = useState<string | null>(null);

  const releases = (bundle.participation.releases ?? []) as unknown as ReleaseRecord[];
  const problemById = useMemo(() => {
    const map: Record<string, { title: string; category: CategoryCode }> = {};
    for (const p of bundle.open_problems) {
      map[p.id] = { title: p.title, category: p.category };
    }
    return map;
  }, [bundle.open_problems]);

  const handleDownloadSnapshot = (verId: string) => {
    const snap = bundle.version_snapshots[verId] ?? {};
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agenda-snapshot-${verId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entries: ReleaseRecord[] =
    releases.length > 0
      ? releases
      : Object.keys(bundle.version_snapshots).map((verId) => ({
          id: verId,
          title: 'Agenda Snapshot',
          kind: 'screening',
          problem_ids: Object.keys(bundle.version_snapshots[verId] ?? {}),
        }));

  return (
    <div className="ed-stack">
      {entries.map((rel) => {
        const ids = rel.problem_ids ?? Object.keys(bundle.version_snapshots[rel.id] ?? {});
        const isCurrent = rel.id === bundle.participation.current_version;
        const isExpanded = expandedRelease === rel.id;

        const catCounts: Record<string, number> = {};
        for (const pid of ids) {
          const cat = problemById[pid]?.category;
          if (cat) catCounts[cat] = (catCounts[cat] ?? 0) + 1;
        }

        return (
          <article key={rel.id} className="ed-panel ed-stack" style={{ gap: '14px' }}>
            <div className="ed-between">
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                <span className="ed-tag is-ink ed-mono">{rel.id}</span>
                {isCurrent && <span className="ed-tag is-add">Current Working Release</span>}
                {rel.kind && (
                  <span className="ed-tag" style={{ textTransform: 'capitalize' }}>
                    {rel.kind}
                  </span>
                )}
                {rel.date && <span className="ed-mono ed-small ed-faint">{rel.date}</span>}
              </div>

              <button
                type="button"
                className="ed-btn is-sm"
                onClick={() => handleDownloadSnapshot(rel.id)}
              >
                <DownloadIcon size={13} />
                <span>Download Snapshot JSON</span>
              </button>
            </div>

            <div>
              <h2 className="ed-panel-title">{rel.title || rel.id}</h2>
              {rel.summary && (
                <p className="ed-small ed-muted" style={{ marginTop: '6px', lineHeight: 1.6 }}>
                  {rel.summary}
                </p>
              )}
            </div>

            <div className="ed-chip-row">
              <span className="ed-tag ed-mono">{ids.length} Open Problems</span>
              {(Object.entries(bundle.categories) as Array<[CategoryCode, string]>).map(
                ([code, label]) =>
                  catCounts[code] ? (
                    <span key={code} className="ed-tag">
                      <span className="ed-mono">{code}</span> {label}:{' '}
                      <strong className="ed-mono">{catCounts[code]}</strong>
                    </span>
                  ) : null
              )}
            </div>

            <div>
              <button
                type="button"
                className="ed-btn is-ghost is-sm"
                aria-expanded={isExpanded}
                onClick={() => setExpandedRelease(isExpanded ? null : rel.id)}
              >
                <span>
                  {isExpanded
                    ? 'Hide included Open Problems'
                    : `Browse all ${ids.length} included Open Problems`}
                </span>
                <ChevronDownIcon size={13} />
              </button>
            </div>

            {isExpanded && (
              <div className="ed-table-wrap">
                <table className="ed-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Category</th>
                      <th>Open Problem Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ids.map((pid) => {
                      const info = problemById[pid];
                      return (
                        <tr key={pid}>
                          <td className="ed-mono">
                            <button
                              type="button"
                              className="ed-tag is-ink ed-mono"
                              onClick={() => onOpenProblem(pid)}
                            >
                              {pid}
                            </button>
                          </td>
                          <td className="ed-small ed-muted">
                            {info ? `${info.category} · ${bundle.categories[info.category]}` : '—'}
                          </td>
                          <td className="ed-small">
                            {info?.title ?? 'Archived snapshot entry'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
