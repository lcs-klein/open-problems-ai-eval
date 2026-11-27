import React, { useCallback, useEffect, useState } from 'react';
import type {
  CollectiveDecision,
  PeerReview,
  ProposalDraft,
  PublicBundle,
} from '@opae/core';
import { EditorialMark, PlusIcon, Toast } from '@opae/ui';
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
  'versions',
  'governance',
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

const COMPACT_HEADINGS: Record<Exclude<TabId, 'problems'>, { title: string; subtitle: string }> = {
  challenges: {
    title: 'Specific Research Challenges',
    subtitle: 'Tier 3 · Volatile, actionable questions grounded in literature and mapped to Open Problems.',
  },
  sources: {
    title: 'Public Literature Sources',
    subtitle: 'Sanitized evidence catalog with extraction counts and reverse links to Open Problems.',
  },
  methods: {
    title: 'Audit & Reproducibility',
    subtitle: 'Upstream funnel, combinatorial frontier, self-critical bias audit, and SHA-256 replay kits.',
  },
  versions: {
    title: 'Agenda Versions & Snapshots',
    subtitle: 'Human-readable release log of frozen screening runs and moderated consensus milestones.',
  },
  governance: {
    title: 'Governance & Deliberation Log',
    subtitle: 'Community proposals, peer reviews, and human moderator sign-offs persisted locally.',
  },
};

export const App: React.FC = () => {
  const initialRoute = parseHash();
  const [tab, setTab] = useState<TabId>(initialRoute.tab);
  const [focusedProblemId, setFocusedProblemId] = useState<string>(
    initialRoute.tab === 'problems' && initialRoute.itemId
      ? initialRoute.itemId
      : bundle.open_problems[0]?.id ?? ''
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
      if (parsed.tab === 'problems' && parsed.itemId) {
        setFocusedProblemId(parsed.itemId);
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

  const termAlertCount = bundle.open_problems.filter(
    (p) => p.terminology_alerts.length > 0
  ).length;
  const govRecordCount = proposals.length + reviews.length + decisions.length;

  return (
    <div className="ed-shell">
      <header className="ed-topbar">
        <div className="ed-topbar-inner">
          <button
            type="button"
            className="ed-brand"
            onClick={handleBrandHome}
            title="Back to Open Problems home"
          >
            <EditorialMark size={18} />
            <span>AI Eval Agenda</span>
          </button>

          <nav className="ed-nav" aria-label="Primary navigation">
            {(
              [
                ['problems', 'Open Problems'],
                ['challenges', 'Challenges'],
                ['sources', 'Sources'],
                ['methods', 'Audit & Replay'],
                ['versions', 'Versions'],
                [
                  'governance',
                  govRecordCount > 0 ? `Governance (${govRecordCount})` : 'Governance',
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
              className="ed-btn is-primary"
              onClick={() => handleOpenProposal(null)}
            >
              <PlusIcon size={14} />
              <span>New Proposal</span>
            </button>
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
                  Participatory Research Agenda · Human Moderator Governance ·{' '}
                  <span className="ed-mono">{bundle.participation.current_version}</span>
                </span>
              </div>
              <h1 className="ed-lead">
                <strong>{bundle.project.title || 'Open Problems in AI Evaluation'}.</strong>{' '}
                {bundle.project.subtitle ||
                  'A human-led participatory research agenda anchored in locked manuscript terminology, normative change justifications, and zero-gap numerical reproducibility.'}
              </h1>
            </section>

            <section className="ed-metrics" aria-label="Agenda summary metrics">
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setProblemFilterMode('all')}
                title="View all 7 fixed categories"
              >
                <span className="ed-metric-label">Fixed Categories</span>
                <span className="ed-metric-value">{Object.keys(bundle.categories).length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => setProblemFilterMode('all')}
                title="Show all Open Problems"
              >
                <span className="ed-metric-label">Open Problems</span>
                <span className="ed-metric-value">{bundle.open_problems.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => navigateTab('challenges')}
                title="Browse Tier-3 Specific Challenges"
              >
                <span className="ed-metric-label">Specific Challenges</span>
                <span className="ed-metric-value">{bundle.specific_challenges.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() => navigateTab('sources')}
                title="Browse public literature sources"
              >
                <span className="ed-metric-label">Public Sources</span>
                <span className="ed-metric-value">{bundle.references.length}</span>
              </button>
              <button
                type="button"
                className="ed-metric-cell"
                onClick={() =>
                  setProblemFilterMode((prev) =>
                    prev === 'term_alert' ? 'all' : 'term_alert'
                  )
                }
                title="Filter Open Problems with Terminology Alerts"
              >
                <span className="ed-metric-label">Terminology Alerts</span>
                <span className={`ed-metric-value ${termAlertCount > 0 ? 'is-accent' : ''}`}>
                  {termAlertCount}
                </span>
              </button>
            </section>
          </>
        ) : (
          <header className="ed-compact-header">
            <div>
              <h1 className="ed-compact-title">{COMPACT_HEADINGS[tab].title}</h1>
              <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
                {COMPACT_HEADINGS[tab].subtitle}
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
                syncHash(
                  pid ? `challenges?problem=${encodeURIComponent(pid)}` : 'challenges'
                );
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
          {tab === 'methods' && (
            <MethodsAuditTab bundle={bundle} onNotify={setToast} />
          )}
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
          Open Problems in AI Evaluation · Standalone Offline-First Release (Strict CSP · Sanitized)
        </span>
        <span className="ed-mono">
          Schema v{bundle.schema_version} · {bundle.participation.current_version}
        </span>
      </footer>
    </div>
  );
};
