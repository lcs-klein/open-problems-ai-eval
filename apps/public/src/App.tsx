import React, { useCallback, useEffect, useState } from 'react';
import type {
  CollectiveDecision,
  PeerReview,
  ProposalDraft,
  PublicBundle,
} from '@opae/core';
import {
  EditorialMark,
  LanguageToggle,
  LocaleProvider,
  PlusIcon,
  Toast,
  useLocale,
} from '@opae/ui';
import rawBundle from '@data/public_bundle.json';
import { OpenProblemsTab, type ProblemFilterMode } from './OpenProblemsTab';
import { ChallengesTab } from './ChallengesTab';
import { GovernanceTab } from './ParticipateTab';
import { MethodsAuditTab, SourcesTab, VersionsTab } from './SourcesMethodsVersionsTabs';
import { ProposalDrawer, type ProposalPrefill } from './ProposalDrawer';

const bundle = rawBundle as unknown as PublicBundle;

type TabId = 'problems' | 'challenges' | 'sources' | 'methods' | 'versions' | 'governance';

const VALID_TABS: TabId[] = [
  'problems',
  'challenges',
  'sources',
  'methods',
  'governance',
  'versions',
];

const STORAGE_PROPOSALS = 'opae_public_proposals_v2';
const STORAGE_REVIEWS = 'opae_public_reviews_v2';
const STORAGE_DECISIONS = 'opae_public_decisions_v2';

function readStoredList<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

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

const OfflineAppShell: React.FC = () => {
  const { t, isZh } = useLocale();
  const initialRoute = parseHash();
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
  const [reviewTargetId, setReviewTargetId] = useState<string>(
    bundle.open_problems[0]?.id ?? 'C.F2a'
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPrefill, setDrawerPrefill] = useState<ProposalPrefill | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [proposals, setProposals] = useState<ProposalDraft[]>(() =>
    readStoredList(STORAGE_PROPOSALS, bundle.participation.proposals ?? [])
  );
  const [reviews, setReviews] = useState<PeerReview[]>(() =>
    readStoredList(STORAGE_REVIEWS, bundle.participation.reviews ?? [])
  );
  const [decisions, setDecisions] = useState<CollectiveDecision[]>(() =>
    readStoredList(STORAGE_DECISIONS, bundle.participation.decisions ?? [])
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PROPOSALS, JSON.stringify(proposals));
    } catch {
      // ignore
    }
  }, [proposals]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_REVIEWS, JSON.stringify(reviews));
    } catch {
      // ignore
    }
  }, [reviews]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DECISIONS, JSON.stringify(decisions));
    } catch {
      // ignore
    }
  }, [decisions]);

  const syncHash = useCallback((nextHash: string) => {
    if (window.location.hash !== `#${nextHash}`) {
      window.history.pushState(null, '', `#${nextHash}`);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHash();
      setTab(parsed.tab);
      if (parsed.tab === 'problems') {
        setFocusedProblemId(parsed.itemId ?? '');
      }
      if (parsed.tab === 'challenges') {
        setChallengeProblemFilter(parsed.problemFilter ?? '');
      }
      if (parsed.tab === 'sources') {
        setFocusedSourceId(parsed.itemId ?? '');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
        'Human-readable release log of frozen screening runs and moderated consensus milestones.'
      ),
    },
    governance: {
      title: t('heading.governance.title', 'Governance & Deliberation Log'),
      subtitle: t(
        'heading.governance.subtitle.offline',
        'Community proposals, peer reviews, and human moderator sign-offs persisted locally.'
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

  const handleBrandHome = () => {
    setFocusedProblemId('');
    setProblemFilterMode('all');
    setChallengeProblemFilter('');
    setFocusedSourceId('');
    setTab('problems');
    syncHash('problems');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const govRecordCount = proposals.length + reviews.length + decisions.length;
  const versionCount =
    (bundle.participation.releases?.length ?? 0) ||
    Object.keys(bundle.version_snapshots ?? {}).length;

  const navItems: Array<{ id: TabId; label: string; count?: number }> = [
    {
      id: 'problems',
      label: t('nav.problems', 'Open Problems'),
      count: bundle.open_problems.length,
    },
    {
      id: 'challenges',
      label: t('nav.challenges', 'Challenges'),
      count: bundle.specific_challenges.length,
    },
    {
      id: 'sources',
      label: t('nav.sources', 'Sources'),
      count: bundle.references.length,
    },
    {
      id: 'methods',
      label: t('nav.methods', 'Methodology'),
    },
    {
      id: 'governance',
      label: t('nav.governance', 'Governance'),
      count: govRecordCount > 0 ? govRecordCount : undefined,
    },
    {
      id: 'versions',
      label: t('nav.versions', 'Versions'),
      count: versionCount > 0 ? versionCount : undefined,
    },
  ];

  return (
    <div className="ed-shell">
      <header className="ed-topbar">
        <div className="ed-topbar-inner is-minimal">
          <button
            type="button"
            className="ed-brand"
            onClick={handleBrandHome}
            title={t('brand.homeTitle', 'Back to Open Problems home')}
          >
            <EditorialMark size={18} />
            <span>{t('brand.name', 'AI Eval Agenda')}</span>
          </button>

          <div className="ed-topbar-actions">
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
        <section className="ed-masthead is-centered">
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

        <nav className="ed-masthead-tabs" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ed-masthead-tab"
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => {
                if (item.id === 'problems') {
                  setProblemFilterMode('all');
                }
                navigateTab(item.id);
              }}
            >
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span className="ed-masthead-tab-count">{item.count}</span>
              )}
            </button>
          ))}
        </nav>

        {tab !== 'problems' && (
          <header className="ed-tab-intro">
            <div>
              <h2 className="ed-tab-intro-title">{compactHeadings[tab].title}</h2>
              <p className="ed-small ed-muted" style={{ marginTop: '3px' }}>
                {compactHeadings[tab].subtitle}
              </p>
            </div>
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
                syncHash(id ? `problems/${encodeURIComponent(id)}` : 'problems');
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
            <VersionsTab bundle={bundle} onOpenProblem={handleOpenProblem} />
          )}
          {tab === 'governance' && (
            <GovernanceTab
              bundle={bundle}
              proposals={proposals}
              reviews={reviews}
              decisions={decisions}
              initialTargetId={reviewTargetId}
              onAddReview={(rev) => {
                setReviews((prev) => [rev, ...prev]);
                setToast(`Peer review recorded for ${rev.target_id}.`);
              }}
              onAddDecision={(dec) => {
                setDecisions((prev) => [dec, ...prev]);
                setToast(`Moderator decision recorded for ${dec.target_id}.`);
              }}
              onNewProposal={() => handleOpenProposal(null)}
              onOpenProblem={handleOpenProblem}
              onNotify={setToast}
            />
          )}
        </div>
      </main>

      <ProposalDrawer
        open={drawerOpen}
        bundle={bundle}
        prefill={drawerPrefill}
        onClose={() => setDrawerOpen(false)}
        onProposalCreated={(p) => setProposals((prev) => [p, ...prev])}
        onNotify={setToast}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />

      <footer className="ed-footer">
        <span>
          {t(
            'footer.offline',
            'Open Problems in AI Evaluation · Standalone Offline-First Release (Strict CSP · Sanitized)'
          )}
        </span>
        <span className="ed-mono">
          Schema v{bundle.schema_version} · {bundle.participation.current_version}
        </span>
      </footer>
    </div>
  );
};

export const App: React.FC = () => (
  <LocaleProvider>
    <OfflineAppShell />
  </LocaleProvider>
);
