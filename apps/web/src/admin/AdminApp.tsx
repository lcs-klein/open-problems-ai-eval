import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuthUser,
  InternalBundle,
  InternalCrosswalkResponse,
  ModerationQueueResponse,
  ProblemEdit,
  ReleaseRecord,
} from '@opae/core';
import { EditorialMark, RotateCcwIcon, Toast } from '@opae/ui';
import { CompareTab } from '../../../internal/src/CompareTab';
import {
  ResearchAgendaTab,
  RubricEditorTab,
} from '../../../internal/src/AgendaRubricReviewTabs';
import { ApiError, adminApi, authApi, internalApi } from '../api/client';
import { AccountsAuditTab } from './AccountsAuditTab';
import { ForcePasswordChangeModal, LoginPage } from './LoginPage';
import { ModerationQueueTab } from './ModerationQueueTab';
import { OnlineInternalSourcesTab } from './OnlineInternalSourcesTab';
import { ReleasesTab } from './ReleasesTab';

type AdminTab =
  | 'queue'
  | 'compare'
  | 'sources'
  | 'frontier'
  | 'rubric'
  | 'releases'
  | 'team';

export const AdminApp: React.FC<{ onGoPublic: () => void }> = ({ onGoPublic }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<AdminTab>('queue');

  const [queue, setQueue] = useState<ModerationQueueResponse | null>(null);
  const [crosswalk, setCrosswalk] = useState<InternalCrosswalkResponse['bundle'] | null>(null);
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [compareOnlyTermAlerts, setCompareOnlyTermAlerts] = useState(false);
  const [focusProblemRequest, setFocusProblemRequest] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const [editRequest, setEditRequest] = useState<{
    id: string | null;
    newMode?: boolean;
    fixTerms?: boolean;
    nonce: number;
  }>({ id: null, nonce: 0 });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    authApi
      .me()
      .then((res) => {
        if (res.authenticated && res.user) setUser(res.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const refreshWorkspace = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const [qRes, cRes, rRes] = await Promise.all([
        adminApi.getQueue(),
        internalApi.getCrosswalk(),
        adminApi.getReleases(),
      ]);
      setQueue(qRes);
      setCrosswalk(cRes.bundle);
      setReleases(rRes.releases);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        return;
      }
      setDataError(err instanceof Error ? err.message : 'Failed to load editorial workspace.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (user && !user.must_change_password) {
      void refreshWorkspace();
    }
  }, [user, refreshWorkspace]);

  const compatInternalBundle: InternalBundle | null = useMemo(() => {
    if (!crosswalk) return null;
    return {
      ...crosswalk,
      programme: [],
      literature: [],
    };
  }, [crosswalk]);

  const workingIdSet = useMemo(
    () => new Set((crosswalk?.open_problems ?? []).map((p) => p.id)),
    [crosswalk]
  );

  const fullCandidatePool = useMemo(
    () => [...(crosswalk?.open_problems ?? []), ...(crosswalk?.candidates ?? [])],
    [crosswalk]
  );

  const handleSaveDirectEdit = async (edit: ProblemEdit) => {
    try {
      if (edit.action === 'added' && edit.after) {
        await adminApi.createProblem({
          id: edit.id,
          title: edit.after.title || '',
          description: edit.after.description || '',
          category: edit.after.category || 'F',
          scores: edit.after.scores || [3, 3, 3, 3, 3],
          governance_status: edit.after.governance?.status,
          why_changed: edit.why_changed,
        });
        await refreshWorkspace();
        setToast(`Created & published new Open Problem ${edit.id} live.`);
        setTab('compare');
        setFocusProblemRequest({ id: edit.id, nonce: Date.now() });
      } else if (edit.action === 'modified' && edit.after) {
        await adminApi.updateProblem(edit.id, {
          title: edit.after.title,
          description: edit.after.description,
          category: edit.after.category,
          scores: edit.after.scores,
          governance_status: edit.after.governance?.status,
          why_changed: edit.why_changed,
        });
        await refreshWorkspace();
        setToast(`Saved & published edits to ${edit.id} live.`);
        setTab('compare');
        setFocusProblemRequest({ id: edit.id, nonce: Date.now() });
      }
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Failed to publish edit.');
    }
  };

  const handleRetireProblem = async (problemId: string) => {
    const reason = window.prompt(
      `Retire Open Problem "${problemId}" from the active public agenda?\nEnter a normative justification:`
    );
    if (!reason || !reason.trim()) return;
    try {
      await adminApi.updateProblem(problemId, {
        status: 'retired',
        why_changed: reason.trim(),
      });
      await refreshWorkspace();
      setToast(`Retired ${problemId} from the active agenda.`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : 'Failed to retire problem.');
    }
  };

  const handleLogout = async () => {
    await authApi.logout().catch(() => undefined);
    setUser(null);
    setQueue(null);
    setCrosswalk(null);
  };

  if (!authChecked) {
    return (
      <div className="ed-shell">
        <main className="ed-container" style={{ paddingTop: '64px' }}>
          <div className="ed-panel">
            <p className="ed-muted">Checking editorial session…</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onAuthenticated={(u) => setUser(u)} onGoPublic={onGoPublic} />;
  }

  if (user.must_change_password) {
    return (
      <div className="ed-shell">
        <main className="ed-container">
          <ForcePasswordChangeModal
            user={user}
            onCompleted={() => setUser((prev) => (prev ? { ...prev, must_change_password: false } : null))}
          />
        </main>
      </div>
    );
  }

  const pendingTotal =
    (queue?.counts.pending_proposals ?? 0) + (queue?.counts.pending_reviews ?? 0);

  return (
    <div className="ed-shell">
      <header className="ed-topbar">
        <div className="ed-topbar-inner">
          <button
            type="button"
            className="ed-brand"
            onClick={() => setTab('queue')}
            title="Editorial Workbench home"
          >
            <EditorialMark size={18} />
            <span>AI Eval · Admin</span>
          </button>

          <nav className="ed-nav" aria-label="Editorial workspace navigation">
            {(
              [
                ['queue', pendingTotal > 0 ? `Moderation (${pendingTotal})` : 'Moderation'],
                ['compare', 'Crosswalk'],
                ['sources', 'Internal Sources'],
                ['frontier', 'Frontier'],
                ['rubric', 'Rubric Editor'],
                ['releases', 'Releases'],
                ['team', user.role === 'admin' ? 'Team & Audit' : 'Audit & Account'],
              ] as Array<[AdminTab, string]>
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
            <button
              type="button"
              className="ed-btn is-ghost is-sm"
              onClick={() => void refreshWorkspace()}
              disabled={loadingData}
              title="Refresh from D1"
            >
              <RotateCcwIcon size={13} />
            </button>
            <button type="button" className="ed-btn is-sm" onClick={onGoPublic}>
              Public Site ↗
            </button>
            <button type="button" className="ed-btn is-ghost is-sm" onClick={() => void handleLogout()}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="ed-container">
        {dataError && (
          <div className="ed-notice is-accent" style={{ marginBottom: '16px' }}>
            <span>{dataError}</span>
            <button type="button" className="ed-btn is-sm" onClick={() => void refreshWorkspace()}>
              Retry
            </button>
          </div>
        )}

        {(!queue || !crosswalk || !compatInternalBundle) && loadingData ? (
          <div className="ed-panel">
            <p className="ed-muted">Loading authenticated editorial workspace from D1…</p>
          </div>
        ) : (
          queue &&
          crosswalk &&
          compatInternalBundle && (
            <>
              <header className="ed-compact-header">
                <div>
                  <span className="ed-section-label">
                    Authenticated Editorial Workbench · {user.display_name} ({user.role})
                  </span>
                  <h1 className="ed-compact-title" style={{ marginTop: '4px' }}>
                    {tab === 'queue' && 'Community Moderation & One-Click Publishing'}
                    {tab === 'compare' && 'Manuscript Crosswalk & Live Agenda'}
                    {tab === 'sources' && 'Unredacted Internal Evidence Corpus'}
                    {tab === 'frontier' && 'Pipeline & Combinatorial Frontier'}
                    {tab === 'rubric' && 'Live Rubric & Open Problem Editor'}
                    {tab === 'releases' && 'Version Snapshots & Rollback'}
                    {tab === 'team' && 'Team Accounts & Immutable Audit Log'}
                  </h1>
                </div>
                <span className="ed-mono ed-faint ed-small">
                  {crosswalk.open_problems.length} active · {pendingTotal} pending
                </span>
              </header>

              {tab === 'queue' && (
                <ModerationQueueTab
                  user={user}
                  queue={queue}
                  categories={crosswalk.categories}
                  terminologyRules={crosswalk.terminology_rules}
                  openProblems={crosswalk.open_problems}
                  onRefresh={refreshWorkspace}
                  onNotify={setToast}
                />
              )}

              {tab === 'compare' && (
                <CompareTab
                  bundle={compatInternalBundle}
                  problems={crosswalk.open_problems}
                  edits={{}}
                  onlyTermAlerts={compareOnlyTermAlerts}
                  onOnlyTermAlertsChange={setCompareOnlyTermAlerts}
                  focusProblemRequest={focusProblemRequest}
                  onJumpToEdit={(id, fixTerms = false) => {
                    setEditRequest({ id, fixTerms, newMode: false, nonce: Date.now() });
                    setTab('rubric');
                  }}
                  onToggleDelete={(id) => void handleRetireProblem(id)}
                />
              )}

              {tab === 'sources' && (
                <OnlineInternalSourcesTab
                  counts={{
                    experts: crosswalk.experts.length,
                    originals: crosswalk.originals.length,
                    programme: crosswalk.programme_count,
                    literature: crosswalk.literature_count,
                  }}
                  workingIds={workingIdSet}
                  onOpenProblem={(id) => {
                    setCompareOnlyTermAlerts(false);
                    setFocusProblemRequest({ id, nonce: Date.now() });
                    setTab('compare');
                  }}
                />
              )}

              {tab === 'frontier' && <ResearchAgendaTab bundle={compatInternalBundle} />}

              {tab === 'rubric' && (
                <RubricEditorTab
                  bundle={compatInternalBundle}
                  allItems={fullCandidatePool}
                  editRequest={editRequest}
                  onSaveEdit={(edit) => void handleSaveDirectEdit(edit)}
                />
              )}

              {tab === 'releases' && (
                <ReleasesTab
                  user={user}
                  releases={releases}
                  activeProblemCount={crosswalk.open_problems.length}
                  onRefresh={refreshWorkspace}
                  onNotify={setToast}
                />
              )}

              {tab === 'team' && <AccountsAuditTab user={user} onNotify={setToast} />}
            </>
          )
        )}
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />

      <footer className="ed-footer">
        <span>
          Internal Editorial Workbench · Authenticated Session · All edits audited in Cloudflare D1
        </span>
        <span className="ed-mono">
          {user.email} ({user.role})
        </span>
      </footer>
    </div>
  );
};
