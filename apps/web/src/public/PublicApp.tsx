import React, { useCallback, useEffect, useState } from 'react';
import type { PublicBundle, ReleaseRecord } from '@opae/core';
import {
  EditorialMark,
  LanguageToggle,
  LocaleProvider,
  PlusIcon,
  RotateCcwIcon,
  ShieldIcon,
  Toast,
  useLocale,
} from '@opae/ui';
import { OpenProblemsTab, type ProblemFilterMode } from '../../../public/src/OpenProblemsTab';
import { ChallengesTab } from '../../../public/src/ChallengesTab';
import { MethodsAuditTab, SourcesTab } from '../../../public/src/SourcesMethodsVersionsTabs';
import type { ProposalPrefill } from '../../../public/src/ProposalDrawer';
import { publicApi } from '../api/client';
import { OnlineGovernanceTab } from './OnlineGovernanceTab';
import { OnlineProposalDrawer } from './OnlineProposalDrawer';
import { PublicVersionsTab } from './PublicVersionsTab';

type TabId = 'problems' | 'challenges' | 'sources' | 'methods' | 'versions' | 'governance';

const VALID_TABS: TabId[] = [
  'problems',
  'challenges',
  'sources',
  'methods',
  'versions',
  'governance',
];

function parseHash(): { tab: TabId; itemId?: string; problemFilter?: string } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return { tab: 'problems' };
  const [pathPart, queryPart] = hash.split('?');
  const [rawTab, itemId] = pathPart.split('/');
  const tab: TabId = VALID_TABS.includes(rawTab as TabId)
    ? (rawTab as TabId)
    : rawTab === 'participate'
      ? 'governance'
      : 'problems';
  const params = new URLSearchParams(queryPart || '');
  return {
    tab,
    itemId: itemId ? decodeURIComponent(itemId) : undefined,
    problemFilter: params.get('problem') ?? undefined,
  };
}

const PublicAppShell: React.FC<{ onGoAdmin: () => void }> = ({ onGoAdmin }) => {
  const { t, isZh } = useLocale();
  const initialRoute = parseHash();
  const [bundle, setBundle] = useState<PublicBundle | null>(null);
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>(initialRoute.tab);
  const [focusedProblemId, setFocusedProblemId] = useState<string>(
    initialRoute.tab === 'problems' && initialRoute.itemId ? initialRoute.itemId : ''
  );
  const [problemFilterMode, setProblemFilterMode] = useState<ProblemFilterMode>('all');
  const [challengeProblemFilter, setChallengeProblemFilter] = useState(
    initialRoute.tab === 'challenges' && initialRoute.problemFilter
      ? initialRoute.problemFilter
      : ''
  );
  const [focusedSourceId, setFocusedSourceId] = useState<string>(
    initialRoute.tab === 'sources' && initialRoute.itemId ? initialRoute.itemId : ''
  );
  const [reviewTargetId, setReviewTargetId] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPrefill, setDrawerPrefill] = useState<ProposalPrefill | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await publicApi.getBootstrap();
      setBundle(res.bundle);
      setReleases(res.releases);
      setFocusedProblemId((prev) => prev || res.bundle.open_problems[0]?.id || '');
      setReviewTargetId((prev) => prev || res.bundle.open_problems[0]?.id || '');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load agenda data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const syncHash = useCallback((nextHash: string) => {
    if (window.location.hash !== `#${nextHash}`) {
      window.history.pushState(null, '', `#${nextHash}`);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHash();
      setTab(parsed.tab);
      if (parsed.tab === 'problems' && parsed.itemId) setFocusedProblemId(parsed.itemId);
      if (parsed.tab === 'challenges') setChallengeProblemFilter(parsed.problemFilter ?? '');
      if (parsed.tab === 'sources') setFocusedSourceId(parsed.itemId ?? '');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (loading && !bundle) {
    return (
      <div className="ed-shell">
        <main className="ed-container" style={{ paddingTop: '64px' }}>
          <div className="ed-panel">
            <p className="ed-muted">
              {t('loading.agenda', 'Loading Open Problems in AI Evaluation…')}
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (loadError || !bundle) {
    return (
      <div className="ed-shell">
        <main className="ed-container" style={{ paddingTop: '64px' }}>
          <div className="ed-panel ed-stack" style={{ gap: '12px' }}>
            <h1 className="ed-panel-title">
              {t('error.apiTitle', 'Unable to reach Agenda API')}
            </h1>
            <p className="ed-small ed-muted">
              {loadError || t('error.noData', 'No data returned.')}
            </p>
            <div>
              <button type="button" className="ed-btn is-primary" onClick={() => void loadData()}>
                <RotateCcwIcon size={14} />
                <span>{t('common.retry', 'Retry')}</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const compactHeadings: Record<Exclude<TabId, 'problems'>, { title: string; subtitle: string }> = {
    challenges: {
      title: t('heading.challenges.title', 'Specific Research Challenges'),
      subtitle: t(
        'heading.challenges.subtitle',
        'Tier 3 · Volatile, actionable questions grounded in literature and mapped to Open Problems.'
      ),
    },
    sources: {
      title: t('heading.sources.title', 'Public Literature Sources'),
      subtitle: t(
        'heading.sources.subtitle',
        'Sanitized evidence catalog with extraction counts and reverse links to Open Problems.'
      ),
    },
    methods: {
      title: t('heading.methods.title', 'Methodology & Reproducibility'),
      subtitle: t(
        'heading.methods.subtitle',
        'How these open problems and challenges were screened from literature, known editorial limits, and downloadable Python replay kits.'
      ),
    },
    versions: {
      title: t('heading.versions.title', 'Agenda Versions & Snapshots'),
      subtitle: t(
        'heading.versions.subtitle',
        'Frozen screening runs and moderated consensus milestones with JSON snapshot downloads.'
      ),
    },
    governance: {
      title: t('heading.governance.title', 'Governance & Deliberation Log'),
      subtitle: t(
        'heading.governance.subtitle.online',
        'Direct community proposals, pre-moderated peer reviews, and signed editorial decisions.'
      ),
    },
  };

  const navigateTab = (next: TabId) => {
    setTab(next);
    if (next === 'challenges') {
      setChallengeProblemFilter('');
      syncHash('challenges');
      return;
    }
    if (next === 'sources') {
      setFocusedSourceId('');
      syncHash('sources');
      return;
    }
    if (next === 'problems') {
      syncHash(focusedProblemId ? `problems/${encodeURIComponent(focusedProblemId)}` : 'problems');
      return;
    }
    syncHash(next);
  };

  const handleOpenProblem = (problemId: string) => {
    setFocusedProblemId(problemId);
    setProblemFilterMode('all');
    setTab('problems');
    syncHash(`problems/${encodeURIComponent(problemId)}`);
  };

  const handleJumpToChallenge = (problemId: string) => {
    setChallengeProblemFilter(problemId);
    setTab('challenges');
    syncHash(`challenges?problem=${encodeURIComponent(problemId)}`);
  };

  const handleOpenSource = (sourceId: string) => {
    setFocusedSourceId(sourceId);
    setTab('sources');
    syncHash(`sources/${encodeURIComponent(sourceId)}`);
  };

  const handleOpenProposal = (prefill: ProposalPrefill | null = null) => {
    setDrawerPrefill(prefill);
    setDrawerOpen(true);
  };

  const handleOpenReviewFor = (problemId: string) => {
    setReviewTargetId(problemId);
    setTab('governance');
    syncHash('governance');
  };

  const termAlertCount = bundle.open_problems.filter(
    (p) => p.terminology_alerts.length > 0
  ).length;
  const govRecordCount =
    (bundle.participation.proposals?.length ?? 0) +
    (bundle.participation.reviews?.length ?? 0) +
    (bundle.participation.decisions?.length ?? 0);

  const govLabelText = t('nav.governance', 'Governance');

  return (
    <div className="ed-shell">
      <header className="ed-topbar">
        <div className="ed-topbar-inner">
          <button
            type="button"
            className="ed-brand"
            onClick={() => {
              setProblemFilterMode('all');
              setChallengeProblemFilter('');
              setFocusedSourceId('');
              setTab('problems');
              syncHash('problems');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            title={t('brand.homeTitle', 'Back to Open Problems home')}
          >
            <EditorialMark size={18} />
            <span>{t('brand.name', 'AI Eval Agenda')}</span>
          </button>

          <nav className="ed-nav" aria-label="Primary navigation">
            {(
              [
                ['problems', t('nav.problems', 'Open Problems')],
                ['challenges', t('nav.challenges', 'Challenges')],
                ['sources', t('nav.sources', 'Sources')],
                ['methods', t('nav.methods', 'Methodology')],
                ['versions', t('nav.versions', 'Versions')],
                [
                  'governance',
                  govRecordCount > 0 ? `${govLabelText} (${govRecordCount})` : govLabelText,
                ],
              ] as Array<[TabId, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="ed-nav-pill"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => navigateTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="ed-topbar-actions">
            <button
              type="button"
              className="ed-btn is-ghost is-sm"
              onClick={onGoAdmin}
              title={t('nav.editorialTitle', 'Co-author & Moderator Login')}
            >
              <ShieldIcon size={13} />
              <span>{t('nav.editorial', 'Editorial')}</span>
            </button>
            <button
              type="button"
              className="ed-btn is-primary"
              onClick={() => handleOpenProposal(null)}
            >
              <PlusIcon size={14} />
              <span>{t('nav.newProposal', 'New Proposal')}</span>
            </button>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="ed-container">
        {tab === 'problems' ? (
          <>
            <section className="ed-masthead">
              <div className="ed-eyebrow">
                <span className="ed-eyebrow-dot" aria-hidden="true" />
                <span>
                  {t(
                    'masthead.eyebrow',
                    'Participatory Research Agenda · Human Moderator Governance · '
                  )}
                  <span className="ed-mono">{bundle.participation.current_version}</span>
                </span>
              </div>
              <h1 className="ed-lead">
                <strong>
                  {isZh
                    ? t('masthead.title', 'Open Problems in AI Evaluation.')
                    : `${bundle.project.title || 'Open Problems in AI Evaluation'}.`}
                </strong>{' '}
                {isZh
                  ? t(
                      'masthead.subtitle',
                      'A human-led participatory research agenda anchored in locked manuscript terminology, normative change justifications, and zero-gap numerical reproducibility.'
                    )
                  : bundle.project.subtitle ||
                    'A human-led participatory research agenda anchored in locked manuscript terminology, normative change justifications, and zero-gap numerical reproducibility.'}
              </h1>
            </section>

            <section className="ed-metrics" aria-label="Agenda summary metrics">
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setProblemFilterMode('all')}
              >
                <span className="ed-metric-label">
                  {t('metrics.categories', 'Fixed Categories')}
                </span>
                <span className="ed-metric-value">{Object.keys(bundle.categories).length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setProblemFilterMode('all')}
              >
                <span className="ed-metric-label">{t('metrics.problems', 'Open Problems')}</span>
                <span className="ed-metric-value">{bundle.open_problems.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => navigateTab('challenges')}
              >
                <span className="ed-metric-label">
                  {t('metrics.challenges', 'Specific Challenges')}
                </span>
                <span className="ed-metric-value">{bundle.specific_challenges.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => navigateTab('sources')}
              >
                <span className="ed-metric-label">{t('metrics.sources', 'Public Sources')}</span>
                <span className="ed-metric-value">{bundle.references.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() =>
                  setProblemFilterMode((prev) => (prev === 'term_alert' ? 'all' : 'term_alert'))
                }
              >
                <span className="ed-metric-label">
                  {t('metrics.termAlerts', 'Terminology Alerts')}
                </span>
                <span className={`ed-metric-value ${termAlertCount > 0 ? 'is-accent' : ''}`}>
                  {termAlertCount}
                </span>
              </button>
            </section>
          </>
        ) : (
          <header className="ed-compact-header">
            <div>
              <h1 className="ed-compact-title">{compactHeadings[tab].title}</h1>
              <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                {compactHeadings[tab].subtitle}
              </p>
            </div>
            <span className="ed-mono ed-faint ed-small">
              {bundle.participation.current_version}
            </span>
          </header>
        )}

        <div>
          {tab === 'problems' && (
            <OpenProblemsTab
              bundle={bundle}
              selectedId={focusedProblemId}
              filterMode={problemFilterMode}
              onFilterModeChange={setProblemFilterMode}
              onSelectProblem={(id) => {
                setFocusedProblemId(id);
                syncHash(`problems/${encodeURIComponent(id)}`);
              }}
              onJumpToChallenge={handleJumpToChallenge}
              onOpenSource={handleOpenSource}
              onPropose={handleOpenProposal}
              onOpenReview={handleOpenReviewFor}
              onNotify={setToast}
            />
          )}
          {tab === 'challenges' && (
            <ChallengesTab
              bundle={bundle}
              problemFilter={challengeProblemFilter}
              onProblemFilterChange={(pid) => {
                setChallengeProblemFilter(pid);
                syncHash(pid ? `challenges?problem=${encodeURIComponent(pid)}` : 'challenges');
              }}
              onOpenProblem={handleOpenProblem}
              onProposeChallengeUpdate={handleOpenProposal}
            />
          )}
          {tab === 'sources' && (
            <SourcesTab
              bundle={bundle}
              highlightedSourceId={focusedSourceId}
              onClearHighlight={() => setFocusedSourceId('')}
              onOpenProblem={handleOpenProblem}
            />
          )}
          {tab === 'methods' && <MethodsAuditTab bundle={bundle} onNotify={setToast} />}
          {tab === 'versions' && (
            <PublicVersionsTab
              bundle={bundle}
              releases={releases}
              onOpenProblem={handleOpenProblem}
            />
          )}
          {tab === 'governance' && (
            <OnlineGovernanceTab
              bundle={bundle}
              initialTargetId={reviewTargetId}
              onNewProposal={() => handleOpenProposal(null)}
              onOpenProblem={handleOpenProblem}
              onGoAdmin={onGoAdmin}
              onNotify={setToast}
            />
          )}
        </div>
      </main>

      <OnlineProposalDrawer
        open={drawerOpen}
        bundle={bundle}
        prefill={drawerPrefill}
        onClose={() => setDrawerOpen(false)}
        onNotify={setToast}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />

      <footer className="ed-footer">
        <span>
          {t(
            'footer.online',
            'Open Problems in AI Evaluation · Live Participatory Platform (Sanitized Public Edition)'
          )}
        </span>
        <div className="ed-inline" style={{ gap: '12px' }}>
          <button type="button" className="ed-btn is-ghost is-sm" onClick={onGoAdmin}>
            {t('footer.editorialLogin', 'Editorial Login')}
          </button>
          <span className="ed-mono">
            Schema v{bundle.schema_version} · {bundle.participation.current_version}
          </span>
        </div>
      </footer>
    </div>
  );
};

export const PublicApp: React.FC<{ onGoAdmin: () => void }> = ({ onGoAdmin }) => (
  <LocaleProvider>
    <PublicAppShell onGoAdmin={onGoAdmin} />
  </LocaleProvider>
);
