import React, { useMemo, useState } from 'react';
import type { CategoryCode, PublicBundle } from '@opae/core';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  CopyButton,
  DownloadIcon,
  FrontierChart,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
  useLocale,
  type ZhKey,
} from '@opae/ui';

export const SourcesTab: React.FC<{
  bundle: PublicBundle;
  highlightedSourceId?: string;
  onClearHighlight?: () => void;
  onOpenProblem: (problemId: string) => void;
}> = ({ bundle, highlightedSourceId = '', onClearHighlight, onOpenProblem }) => {
  const { t } = useLocale();
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

  const table2Count = bundle.references.filter((r) => r.table2).length;

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
                'sources.searchPlaceholder',
                'Search sources by ID, author/title, or mapped Open Problem...'
              )}
              aria-label={t(
                'sources.searchPlaceholder',
                'Search public literature sources'
              )}
            />
          </div>

          <div className="ed-chip-row">
            <button
              type="button"
              className="ed-chip"
              aria-pressed={!onlyTable2}
              onClick={() => setOnlyTable2(false)}
            >
              {t('sources.allSources', 'All Sources ({count})', { count: bundle.references.length })}
            </button>
            <button
              type="button"
              className="ed-chip"
              aria-pressed={onlyTable2}
              onClick={() => setOnlyTable2(true)}
            >
              {t('sources.table2Core', 'Table 2 Core ({count})', { count: table2Count })}
            </button>
          </div>
        </div>
      </div>

      {highlightedSourceId && (
        <div className="ed-active-filters">
          <span className="ed-faint">{t('sources.focusedCitation', 'Focused citation:')}</span>
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
            {t('sources.showAll', 'Show all {count} sources', { count: bundle.references.length })}
          </button>
        </div>
      )}

      <div className="ed-table-wrap">
        <table className="ed-table">
          <thead>
            <tr>
              <th>{t('sources.th.id', 'ID')}</th>
              <th>{t('sources.th.title', 'Title & Link')}</th>
              <th>{t('sources.th.records', 'Extracted Records')}</th>
              <th>{t('sources.th.problems', 'Grounded Open Problems')}</th>
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
                      {ref.type ?? t('sources.literatureFallback', 'Literature')}
                    </div>
                  </td>
                  <td className="ed-mono ed-small ed-muted" style={{ whiteSpace: 'nowrap' }}>
                    {direct + indirect > 0 ? (
                      <div>
                        <strong style={{ color: 'var(--ed-ink)' }}>{direct}</strong>{' '}
                        {t('sources.direct', 'direct')}
                        {indirect > 0 ? ` · ${indirect} ${t('sources.indirect', 'indirect')}` : ''}
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
                    <span className="ed-muted">
                      {t('sources.empty', 'No sources match your current filter.')}
                    </span>
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
                      <span>{t('common.reset', 'Reset')}</span>
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
  rationale?: string;
}

interface ManuscriptReviewInfo {
  lineage_date?: string;
  framework_date?: string;
  body_comparison?: { match?: number; small_edits?: number; material_changes?: number };
  materially_changed_ids?: string[];
  summary?: string;
  recheck?: string;
}

type MethodSubTab = 'overview' | 'policy' | 'reproduce';

const RUBRIC_I18N: Record<
  string,
  { labelKey: ZhKey; descKey: ZhKey; badgeKey: ZhKey; badgeEn: string; noteKey: ZhKey; noteEn: string }
> = {
  q1: {
    labelKey: 'rubric.q1.label',
    descKey: 'rubric.q1.desc',
    badgeKey: 'methods.rubric.role.q1.badge',
    badgeEn: 'Quality · Gate >= 3',
    noteKey: 'methods.rubric.role.avgNote',
    noteEn: 'Averaged across selected set',
  },
  q2: {
    labelKey: 'rubric.q2.label',
    descKey: 'rubric.q2.desc',
    badgeKey: 'methods.rubric.role.q2.badge',
    badgeEn: 'Quality · Gate >= 2',
    noteKey: 'methods.rubric.role.avgNote',
    noteEn: 'Averaged across selected set',
  },
  q3: {
    labelKey: 'rubric.q3.label',
    descKey: 'rubric.q3.desc',
    badgeKey: 'methods.rubric.role.q3.badge',
    badgeEn: 'Quality · Gate >= 2',
    noteKey: 'methods.rubric.role.avgNote',
    noteEn: 'Averaged across selected set',
  },
  q4: {
    labelKey: 'rubric.q4.label',
    descKey: 'rubric.q4.desc',
    badgeKey: 'methods.rubric.role.unionBadge',
    badgeEn: 'Breadth · Union',
    noteKey: 'methods.rubric.role.unionNote',
    noteEn: 'Weighted coverage, no double-counting',
  },
  q5: {
    labelKey: 'rubric.q5.label',
    descKey: 'rubric.q5.desc',
    badgeKey: 'methods.rubric.role.unionBadge',
    badgeEn: 'Breadth · Union',
    noteKey: 'methods.rubric.role.unionNote',
    noteEn: 'Weighted coverage, no double-counting',
  },
};

export const MethodsAuditTab: React.FC<{
  bundle: PublicBundle;
  onNotify: (msg: string) => void;
}> = ({ bundle, onNotify }) => {
  const { t } = useLocale();
  const [subTab, setSubTab] = useState<MethodSubTab>('overview');

  const upstreamCounts = (bundle.generation_upstream?.counts ?? {}) as UpstreamCounts;
  const scenarios = (bundle.screening_alternatives?.scenarios ?? []) as AltScenario[];
  const manuscriptReview = (bundle.manuscript_review ?? {}) as ManuscriptReviewInfo;
  const methodLimits = (bundle.generation_method?.limits ?? []) as string[];
  const frontierPoints = bundle.screening_frontier ?? [];

  const rawCount = upstreamCounts.rawRecords ?? 1095;
  const eligibleCount = upstreamCounts.eligibleSources ?? 801;
  const formulationsCount = upstreamCounts.manuscriptFormulations ?? 438;
  const familiesCount = upstreamCounts.activeFamilies ?? 327;
  const challengesCount = upstreamCounts.specificExamples ?? bundle.specific_challenges.length ?? 60;
  const sourceCount = bundle.references.length || 28;
  const openProblemCount = bundle.open_problems.length || 48;

  const describeScenario = (sc: AltScenario): { label: string; modelLabel: string } => {
    const modelLabel =
      sc.model === 'expanded'
        ? t('methods.scenario.model.expanded', 'Expanded ledger')
        : sc.model === 'bridge'
          ? t('methods.scenario.model.bridge', 'Bridge baseline')
          : sc.model;
    if (sc.id === 'expanded-k48') {
      return {
        label: t('methods.scenario.k48', '48 problems · Current working set'),
        modelLabel,
      };
    }
    if (sc.id === 'expanded-k35') {
      return {
        label: t('methods.scenario.k35', '35 problems · Manuscript-length optimum'),
        modelLabel,
      };
    }
    if (sc.id === 'expanded-k36') {
      return {
        label: t('methods.scenario.k36', '36 problems · Adds construct validity (C.V1a)'),
        modelLabel,
      };
    }
    if (sc.id === 'expanded-k35-require-c-v1a') {
      return {
        label: t('methods.scenario.k35Req', '35 problems · Must include C.V1a (stress test)'),
        modelLabel,
      };
    }
    if (sc.id.startsWith('bridge-k')) {
      return {
        label: t('methods.scenario.bridge', '{size} problems · Earlier coverage baseline', {
          size: sc.size,
        }),
        modelLabel,
      };
    }
    return {
      label: t('methods.scenario.fallback', '{size} problems · {model}', {
        size: sc.size,
        model: modelLabel,
      }),
      modelLabel,
    };
  };

  const funnelSteps = [
    {
      label: t('methods.funnel.s1.label', 'Raw literature records'),
      caption: t(
        'methods.funnel.s1.caption',
        'All candidate questions extracted from {sources} review and position papers',
        { sources: sourceCount }
      ),
      count: rawCount,
    },
    {
      label: t('methods.funnel.s2.label', 'Eligible evaluation records'),
      caption: t(
        'methods.funnel.s2.caption',
        'In-scope records passing relevance and source verification checks'
      ),
      count: eligibleCount,
    },
    {
      label: t('methods.funnel.s3.label', 'Distinct problem formulations'),
      caption: t(
        'methods.funnel.s3.caption',
        'Consolidated statements after deduplicating overlapping wordings'
      ),
      count: formulationsCount,
    },
    {
      label: t('methods.funnel.s4.label', 'Active target families'),
      caption: t(
        'methods.funnel.s4.caption',
        'Unique underlying research targets (1 highest-ranked representative each)'
      ),
      count: familiesCount,
    },
    {
      label: t('methods.funnel.s5.label', 'Published Tier-3 challenges'),
      caption: t(
        'methods.funnel.s5.caption',
        'Concrete, actionable challenge seeds mapped to Open Problems on this site'
      ),
      count: challengesCount,
      accent: true,
    },
  ];
  const maxFunnel = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <div className="ed-stack">
      {/* Sub-navigation dividing reader intents cleanly */}
      <div className="ed-subtabs" role="tablist" aria-label="Methodology sections">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'overview'}
          className="ed-subtab-btn"
          onClick={() => setSubTab('overview')}
        >
          <span className="ed-subtab-title">
            <span>{t('methods.tab.overview.title', 'How It Works')}</span>
            <span className="ed-mono" style={{ fontSize: '11.5px', opacity: 0.75 }}>
              {t('methods.tab.overview.badge', 'Overview')}
            </span>
          </span>
          <span className="ed-subtab-desc">
            {t(
              'methods.tab.overview.desc',
              'Literature funnel, 5-point scoring rubric, and why {count} problems vs. 35',
              { count: openProblemCount }
            )}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'policy'}
          className="ed-subtab-btn"
          onClick={() => setSubTab('policy')}
        >
          <span className="ed-subtab-title">
            <span>{t('methods.tab.policy.title', 'Policy & Limits')}</span>
            <span className="ed-mono" style={{ fontSize: '11.5px', opacity: 0.75 }}>
              {t('methods.tab.policy.badge', '{count} rules', {
                count: bundle.terminology_rules.length,
              })}
            </span>
          </span>
          <span className="ed-subtab-desc">
            {t(
              'methods.tab.policy.desc',
              'Terminology locks, disclosed AI screening biases, and manuscript draft sync'
            )}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'reproduce'}
          className="ed-subtab-btn"
          onClick={() => setSubTab('reproduce')}
        >
          <span className="ed-subtab-title">
            <span>{t('methods.tab.reproduce.title', 'Reproduce & Verify')}</span>
            <span className="ed-mono" style={{ fontSize: '11.5px', opacity: 0.75 }}>
              {t('methods.tab.reproduce.badge', '{count} kits', {
                count: bundle.reproduce_packages.length,
              })}
            </span>
          </span>
          <span className="ed-subtab-desc">
            {t(
              'methods.tab.reproduce.desc',
              'Zero-dependency Python ZIPs, exact scoring formula, and {scenarios} solver scenarios',
              { scenarios: scenarios.length }
            )}
          </span>
        </button>
      </div>

      {/* SUB-TAB 1: HOW IT WORKS */}
      {subTab === 'overview' && (
        <div className="ed-stack" role="tabpanel" aria-label="How It Works">
          <section className="ed-panel ed-stack" style={{ gap: '16px' }}>
            <div className="ed-between">
              <div>
                <h2 className="ed-panel-title">
                  {t('methods.steps.title', 'How This Agenda Was Built (4-Step Summary)')}
                </h2>
                <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                  {t(
                    'methods.steps.subtitle',
                    'AI assists with literature extraction and coverage math, while human scholars set the taxonomy, protect technical terminology, and approve every release.'
                  )}
                </p>
              </div>
              <button
                type="button"
                className="ed-btn is-sm"
                onClick={() => setSubTab('reproduce')}
              >
                <span>{t('methods.steps.jumpReproduce', 'Download Python replay kits')}</span>
                <ArrowRightIcon size={13} />
              </button>
            </div>

            <div className="ed-step-grid">
              <div className="ed-step-card">
                <span className="ed-step-num">{t('methods.step1.num', 'Step 01 · Gather')}</span>
                <div className="ed-step-title">
                  {t('methods.step1.title', 'Extract from {sources} papers', {
                    sources: sourceCount,
                  })}
                </div>
                <p className="ed-step-body">
                  {t(
                    'methods.step1.body',
                    'Logged {raw} raw items from published reviews and position papers, alongside course prompts and draft sections.',
                    { raw: rawCount.toLocaleString() }
                  )}
                </p>
              </div>
              <div className="ed-step-card">
                <span className="ed-step-num">{t('methods.step2.num', 'Step 02 · Narrow')}</span>
                <div className="ed-step-title">
                  {t('methods.step2.title', 'Deduplicate to {challenges} challenges', {
                    challenges: challengesCount,
                  })}
                </div>
                <p className="ed-step-body">
                  {t(
                    'methods.step2.body',
                    'Filtered to {eligible} in-scope records, grouped into {families} unique research targets, and surfaced {challenges} concrete Tier-3 seeds.',
                    {
                      eligible: eligibleCount,
                      families: familiesCount,
                      challenges: challengesCount,
                    }
                  )}
                </p>
              </div>
              <div className="ed-step-card">
                <span className="ed-step-num">{t('methods.step3.num', 'Step 03 · Optimize')}</span>
                <div className="ed-step-title">
                  {t('methods.step3.title', 'Score & compare set sizes')}
                </div>
                <p className="ed-step-body">
                  {t(
                    'methods.step3.body',
                    'Rated candidates on 5 criteria and ran an exact solver across sizes K = 7 to 48 to balance brevity against breadth.'
                  )}
                </p>
              </div>
              <div className="ed-step-card">
                <span className="ed-step-num">{t('methods.step4.num', 'Step 04 · Govern')}</span>
                <div className="ed-step-title">
                  {t('methods.step4.title', 'Human review & term lock')}
                </div>
                <p className="ed-step-body">
                  {t(
                    'methods.step4.body',
                    'Screening output is a starting proposal—not final authority. Terms are locked to the paper, and changes require human moderator sign-off.'
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* 1. Literature Screening Funnel */}
          <section className="ed-panel ed-stack" style={{ gap: '16px' }}>
            <div>
              <h2 className="ed-panel-title">
                {t(
                  'methods.funnel.title',
                  '1. Literature Screening Funnel ({raw} records → {challenges} challenges)',
                  { raw: rawCount.toLocaleString(), challenges: challengesCount }
                )}
              </h2>
              <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                {t(
                  'methods.funnel.subtitle',
                  'Deterministic narrowing from raw paper extracts to the concrete Tier-3 Specific Challenges published in the Challenges tab.'
                )}
              </p>
            </div>
            <div className="ed-funnel">
              {funnelSteps.map((step) => (
                <div key={step.label} className="ed-funnel-row">
                  <div className="ed-funnel-label">
                    <span style={{ fontWeight: 500, color: 'var(--ed-ink)' }}>{step.label}</span>
                    <span className="ed-funnel-caption">{step.caption}</span>
                  </div>
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

          {/* 2. 5-Dimension Scoring Rubric */}
          {bundle.rubric.length > 0 && (
            <section className="ed-panel ed-stack" style={{ gap: '14px' }}>
              <div>
                <h2 className="ed-panel-title">
                  {t(
                    'methods.rubric.title',
                    '2. Five Criteria Used to Score Candidate Problems (0–4 Scale)'
                  )}
                </h2>
                <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                  {t(
                    'methods.rubric.subtitle',
                    'Q1–Q3 score each problem’s individual quality (averaged across the set). Q4–Q5 measure how much distinct stakeholder and research ground the set covers without double-counting overlapping problems.'
                  )}
                </p>
              </div>
              <div className="ed-rubric-cards">
                {bundle.rubric.map((dim) => {
                  const meta = RUBRIC_I18N[dim.id.toLowerCase()];
                  return (
                    <div key={dim.id} className="ed-panel-soft ed-stack" style={{ gap: '8px' }}>
                      <div className="ed-between">
                        <span className="ed-tag is-ink ed-mono">{dim.id.toUpperCase()}</span>
                        {meta && <span className="ed-tag">{t(meta.badgeKey, meta.badgeEn)}</span>}
                      </div>
                      <strong style={{ fontSize: '14px', lineHeight: 1.35 }}>
                        {meta ? t(meta.labelKey, dim.label) : dim.label}
                      </strong>
                      <p className="ed-small ed-muted" style={{ lineHeight: 1.5 }}>
                        {meta ? t(meta.descKey, dim.description) : dim.description}
                      </p>
                      {meta && (
                        <span className="ed-faint" style={{ fontSize: '11.5px' }}>
                          {t(meta.noteKey, meta.noteEn)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. Interactive Portfolio Size Trade-off */}
          {frontierPoints.length > 0 && (
            <div className="ed-stack" style={{ gap: '10px' }}>
              <FrontierChart
                points={frontierPoints}
                title={t(
                  'methods.frontier.title',
                  '3. Portfolio Size Trade-off: Why {count} Open Problems Instead of 35?',
                  { count: openProblemCount }
                )}
                subtitle={t(
                  'methods.frontier.subtitle',
                  'The companion manuscript targets ~35 problems, while the full working set holds 48. Click any preset or dot to see how adding problems trades conciseness for broader coverage.'
                )}
                presetLabels={{
                  35: t('methods.frontier.preset35', 'K=35 · Paper target'),
                  36: t('methods.frontier.preset36', 'K=36 · +C.V1a'),
                  48: t('methods.frontier.preset48', 'K=48 · Working set'),
                }}
              />
              <div className="ed-notice">
                <span className="ed-small ed-muted">
                  {t(
                    'methods.frontier.notice',
                    'Want the exact scoring equation, the 6-scenario comparison table, or the solver code to re-run this curve locally?'
                  )}
                </span>
                <button
                  type="button"
                  className="ed-btn is-sm"
                  onClick={() => setSubTab('reproduce')}
                >
                  <span>{t('methods.frontier.openReproduce', 'Open Reproduce & Verify')}</span>
                  <ArrowRightIcon size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: POLICY & LIMITS */}
      {subTab === 'policy' && (
        <div className="ed-stack" role="tabpanel" aria-label="Policy and Limits">
          {/* 1. Terminology Lock Policy */}
          <section className="ed-panel ed-stack" style={{ gap: '14px' }}>
            <div className="ed-between">
              <div>
                <h2 className="ed-panel-title">
                  {t('methods.policy.termTitle', 'Terminology Lock Policy ({count} Active Rules)', {
                    count: bundle.terminology_rules.length,
                  })}
                </h2>
                <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                  {t(
                    'methods.policy.termSubtitle',
                    'AI editing tools often swap precise academic terms for looser everyday synonyms (such as turning "capabilities" into "abilities"). These rules keep human manuscript vocabulary authoritative across every proposal.'
                  )}
                </p>
              </div>
              <span className="ed-tag is-ink">
                {t('term.manuscriptPriority', 'Manuscript Priority')}
              </span>
            </div>
            <div className="ed-table-wrap">
              <table className="ed-table">
                <thead>
                  <tr>
                    <th>{t('methods.policy.th.rule', 'Rule')}</th>
                    <th>{t('methods.policy.th.locked', 'Locked Term')}</th>
                    <th>{t('methods.policy.th.disallowed', 'Disallowed Substitutes')}</th>
                    <th>{t('methods.policy.th.context', 'Context & Why It Matters')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.terminology_rules.map((r) => (
                    <tr key={r.id}>
                      <td className="ed-mono ed-code" style={{ whiteSpace: 'nowrap' }}>
                        {r.id}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="ed-term-new ed-mono" style={{ fontSize: '12px' }}>
                          {r.locked_term}
                        </span>
                      </td>
                      <td className="ed-mono ed-small" style={{ color: 'var(--ed-accent)' }}>
                        {r.disallowed_substitutes.join(', ')}
                      </td>
                      <td className="ed-small">
                        <div style={{ fontWeight: 500, color: 'var(--ed-ink)' }}>
                          {r.paper_context}
                        </div>
                        {r.rationale && (
                          <div className="ed-muted" style={{ marginTop: '3px', lineHeight: 1.5 }}>
                            {r.rationale}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. Disclosed Screening Biases + Manuscript Sync Audit */}
          <div className="ed-two-col">
            <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
              <span className="ed-section-label">
                {t('methods.policy.limitsEyebrow', 'Self-Critical Limitations')}
              </span>
              <div>
                <h3 className="ed-panel-title">
                  {t('methods.policy.limitsTitle', 'Disclosed Screening Biases & Limits')}
                </h3>
                <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                  {t(
                    'methods.policy.limitsSubtitle',
                    'Known caveats of the algorithmic screening stage that reviewers should weigh before adopting any screening recommendation.'
                  )}
                </p>
              </div>
              {methodLimits.length > 0 && (
                <ul style={{ margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '10px' }}>
                  {methodLimits.map((lim, idx) => (
                    <li key={idx} className="ed-small ed-muted" style={{ lineHeight: 1.55 }}>
                      {lim}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
              <span className="ed-section-label">
                {t('methods.policy.syncEyebrow', 'Paper Draft Sync')}
              </span>
              <div>
                <h3 className="ed-panel-title">
                  {t('methods.policy.syncTitle', 'Manuscript Drift ({from} → {to})', {
                    from: manuscriptReview.lineage_date || 'Nov 6',
                    to: manuscriptReview.framework_date || 'Nov 10',
                  })}
                </h3>
                <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                  {t(
                    'methods.policy.syncSubtitle',
                    'Tracks where the evolving paper draft moved ahead of the frozen screening crosswalk so human authors know which sections need re-checking.'
                  )}
                </p>
              </div>
              {manuscriptReview.body_comparison && (
                <div className="ed-chip-row">
                  <span className="ed-tag is-add ed-mono">
                    {t('methods.policy.unchanged', '{count} unchanged', {
                      count: manuscriptReview.body_comparison.match ?? 0,
                    })}
                  </span>
                  <span className="ed-tag ed-mono">
                    {t('methods.policy.smallEdits', '{count} small edits', {
                      count: manuscriptReview.body_comparison.small_edits ?? 0,
                    })}
                  </span>
                  <span className="ed-tag is-accent ed-mono">
                    {t('methods.policy.materialChanges', '{count} material body changes', {
                      count: manuscriptReview.body_comparison.material_changes ?? 0,
                    })}
                  </span>
                </div>
              )}
              {manuscriptReview.summary && (
                <p className="ed-small ed-muted" style={{ lineHeight: 1.55 }}>
                  {manuscriptReview.summary}
                </p>
              )}
              {manuscriptReview.recheck && (
                <div className="ed-lineage-box" style={{ gap: '4px' }}>
                  <span className="ed-section-label">
                    {t('methods.policy.recheckLabel', 'Recommended Reviewer Check')}
                  </span>
                  <p className="ed-small ed-muted" style={{ lineHeight: 1.5 }}>
                    {manuscriptReview.recheck}
                  </p>
                </div>
              )}
              {manuscriptReview.materially_changed_ids && (
                <div className="ed-lineage-box" style={{ gap: '6px' }}>
                  <span className="ed-section-label">
                    {t('methods.policy.changedIdsLabel', 'Sections Needing Current-Draft Recheck')}
                  </span>
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
          </div>
        </div>
      )}

      {/* SUB-TAB 3: REPRODUCE & VERIFY */}
      {subTab === 'reproduce' && (
        <div className="ed-stack" role="tabpanel" aria-label="Reproduce and Verify">
          {/* 1. Zero-Gap Reproducible Replay Packages */}
          <section className="ed-panel ed-stack" style={{ gap: '14px' }}>
            <div>
              <h2 className="ed-panel-title">
                {t(
                  'methods.reproduce.kitsTitle',
                  'Downloadable Replay Kits (Pure Python 3.10+ · SHA-256 Verified)'
                )}
              </h2>
              <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                {t(
                  'methods.reproduce.kitsSubtitle',
                  'Verify every ranking and optimality bound on your own machine with zero third-party dependencies. Unzip either archive and run the command below.'
                )}
              </p>
            </div>
            <div className="ed-card-list">
              {bundle.reproduce_packages.map((pkg) => (
                <div key={pkg.id} className="ed-panel-soft ed-stack" style={{ gap: '10px' }}>
                  <div className="ed-between">
                    <strong>{pkg.title}</strong>
                    <a className="ed-btn is-primary is-sm" href={pkg.href} download>
                      <DownloadIcon size={13} />
                      <span>{t('methods.reproduce.downloadZip', 'Download ZIP')}</span>
                    </a>
                  </div>
                  <p className="ed-small ed-muted">{pkg.description}</p>
                  <div className="ed-between" style={{ gap: '8px' }}>
                    <code className="ed-inline-code" style={{ flex: '1 1 auto' }}>
                      {pkg.command}
                    </code>
                    <CopyButton
                      text={pkg.command}
                      label={t('methods.reproduce.copyCmd', 'Copy command')}
                      copiedLabel={t('common.copied', 'Copied')}
                      className="ed-btn is-sm"
                      onCopied={() =>
                        onNotify(
                          t('methods.reproduce.copiedToast', 'Replay command copied to clipboard.')
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Exact Scoring Formula Explained */}
          <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
            <div>
              <h3 className="ed-panel-title">
                {t('methods.reproduce.formulaTitle', 'Exact Portfolio Objective Formula F(S)')}
              </h3>
              <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                {t(
                  'methods.reproduce.formulaSubtitle',
                  'The downstream integer branch-and-bound solver selects a conflict-free subset S of size K covering all 7 categories to maximize this 100-point composite score:'
                )}
              </p>
            </div>
            <div className="ed-lineage-box" style={{ gap: '6px' }}>
              <span className="ed-section-label">
                {t('methods.reproduce.formulaLabel', 'Composite Score (Max = 100)')}
              </span>
              <code className="ed-inline-code">
                F(S) = 20 &times; [mean(q1)/4 + mean(q2)/4 + mean(q3)/4 + union(Q4) + union(Q5)]
              </code>
            </div>
            <ul style={{ margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '6px' }}>
              <li className="ed-small ed-muted" style={{ lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--ed-ink)' }}>
                  {t('methods.reproduce.formulaBullet1Lead', 'Quality terms (up to 60 pts):')}
                </strong>{' '}
                {t(
                  'methods.reproduce.formulaBullet1Body',
                  'mean(q1)/4, mean(q2)/4, and mean(q3)/4 average each problem’s relevance, openness, and clarity/fit (20 pts each).'
                )}
              </li>
              <li className="ed-small ed-muted" style={{ lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--ed-ink)' }}>
                  {t('methods.reproduce.formulaBullet2Lead', 'Breadth terms (up to 40 pts):')}
                </strong>{' '}
                {t(
                  'methods.reproduce.formulaBullet2Body',
                  'union(Q4) and union(Q5) compute the deduplicated weighted share of stakeholder decision needs and research targets covered at least once (20 pts each).'
                )}
              </li>
              <li className="ed-small ed-muted" style={{ lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--ed-ink)' }}>
                  {t('methods.reproduce.formulaBullet3Lead', 'Expanded vs. Bridge baseline:')}
                </strong>{' '}
                {t(
                  'methods.reproduce.formulaBullet3Body',
                  'Expanded uses all current coverage units; Bridge reverts to the earlier unit dictionary so reviewers can isolate the numerical impact of newly added units.'
                )}
              </li>
            </ul>
          </section>

          {/* 3. Exact Portfolio Alternatives Comparison */}
          {scenarios.length > 0 && (
            <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
              <div className="ed-between">
                <div>
                  <h3 className="ed-panel-title">
                    {t(
                      'methods.reproduce.scenariosTitle',
                      'Exact Optimal Portfolio Scenarios (K = 35, 36, 48)'
                    )}
                  </h3>
                  <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                    {t(
                      'methods.reproduce.scenariosSubtitle',
                      'Side-by-side comparison of certified solver optima across portfolio sizes, coverage dictionaries, and constrained editorial stress tests.'
                    )}
                  </p>
                </div>
                <span className="ed-tag ed-mono">
                  {t('methods.reproduce.certifiedCount', '{count} certified optima', {
                    count: scenarios.length,
                  })}
                </span>
              </div>
              <div className="ed-table-wrap">
                <table className="ed-table">
                  <thead>
                    <tr>
                      <th>{t('methods.reproduce.th.scenario', 'Scenario')}</th>
                      <th>{t('methods.reproduce.th.model', 'Coverage Model')}</th>
                      <th>{t('methods.reproduce.th.size', 'Size K')}</th>
                      <th>{t('methods.reproduce.th.score', 'Score F(S)')}</th>
                      <th>{t('methods.reproduce.th.stakeholder', 'Stakeholder')}</th>
                      <th>{t('methods.reproduce.th.research', 'Research')}</th>
                      <th>{t('methods.reproduce.th.takeaway', 'Takeaway')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc) => {
                      const info = describeScenario(sc);
                      return (
                        <tr key={sc.id}>
                          <td>
                            <div style={{ fontWeight: 500, color: 'var(--ed-ink)' }}>
                              {info.label}
                            </div>
                            <div
                              className="ed-mono ed-faint"
                              style={{ fontSize: '11.5px', marginTop: '2px' }}
                            >
                              {sc.id}
                            </div>
                          </td>
                          <td className="ed-small" style={{ whiteSpace: 'nowrap' }}>
                            {info.modelLabel}
                          </td>
                          <td className="ed-mono">{sc.size}</td>
                          <td className="ed-mono" style={{ whiteSpace: 'nowrap' }}>
                            <strong>{sc.score.toFixed(2)}</strong>
                            <span className="ed-faint"> / 100</span>
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
                          <td className="ed-small">
                            <div style={{ fontWeight: 500, color: 'var(--ed-ink)' }}>
                              {sc.scope ?? '—'}
                            </div>
                            {sc.rationale && (
                              <div className="ed-muted" style={{ marginTop: '3px', lineHeight: 1.45 }}>
                                {sc.rationale}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
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
  const { t, catLabel } = useLocale();
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
                {isCurrent && (
                  <span className="ed-tag is-add">
                    {t('versions.currentRelease', 'Current Working Release')}
                  </span>
                )}
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
                <span>{t('versions.downloadSnapshot', 'Download Snapshot JSON')}</span>
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
              <span className="ed-tag ed-mono">
                {t('versions.openProblemsCount', '{count} Open Problems', { count: ids.length })}
              </span>
              {(Object.entries(bundle.categories) as Array<[CategoryCode, string]>).map(
                ([code, label]) =>
                  catCounts[code] ? (
                    <span key={code} className="ed-tag">
                      <span className="ed-mono">{code}</span> {catLabel(code, label)}:{' '}
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
                    ? t('versions.hideIncluded', 'Hide included Open Problems')
                    : t('versions.browseIncluded', 'Browse all {count} included Open Problems', {
                        count: ids.length,
                      })}
                </span>
                <ChevronDownIcon size={13} />
              </button>
            </div>

            {isExpanded && (
              <div className="ed-table-wrap">
                <table className="ed-table">
                  <thead>
                    <tr>
                      <th>{t('versions.th.id', 'ID')}</th>
                      <th>{t('versions.th.category', 'Category')}</th>
                      <th>{t('versions.th.title', 'Open Problem Title')}</th>
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
                            {info
                              ? `${info.category} · ${catLabel(info.category, bundle.categories[info.category])}`
                              : '—'}
                          </td>
                          <td className="ed-small">
                            {info?.title ?? t('versions.archivedEntry', 'Archived snapshot entry')}
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
