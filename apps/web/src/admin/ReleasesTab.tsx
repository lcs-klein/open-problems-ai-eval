import React, { useState } from 'react';
import type { AuthUser, ReleaseRecord } from '@opae/core';
import { DownloadIcon, PlusIcon, RotateCcwIcon } from '@opae/ui';
import { ApiError, adminApi } from '../api/client';

export const ReleasesTab: React.FC<{
  user: AuthUser;
  releases: ReleaseRecord[];
  activeProblemCount: number;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}> = ({ user, releases, activeProblemCount, onRefresh, onNotify }) => {
  const [relId, setRelId] = useState(
    `consensus-${new Date().toISOString().slice(0, 10)}-v1.1`
  );
  const [title, setTitle] = useState('Moderated Consensus Snapshot');
  const [kind, setKind] = useState('consensus');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await adminApi.createRelease({
        id: relId.trim(),
        title: title.trim(),
        kind,
        summary: summary.trim(),
      });
      setSummary('');
      await onRefresh();
      onNotify(`Frozen release snapshot "${res.id}" (${res.problem_count} Open Problems).`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to freeze release.');
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (id: string) => {
    const reason = window.prompt(
      `Rollback the live public agenda to snapshot "${id}"?\nEnter a reason for the audit log:`
    );
    if (!reason || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await adminApi.rollbackRelease(id, reason.trim());
      await onRefresh();
      onNotify(`Rolled back live agenda to ${res.restored_release} (${res.problem_count} items).`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rollback failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ed-stack">
      <form className="ed-panel ed-form" onSubmit={handleCreate}>
        <div className="ed-between">
          <div>
            <h2 className="ed-panel-title">Freeze New Version Snapshot</h2>
            <p className="ed-small ed-muted" style={{ marginTop: '2px' }}>
              Captures all {activeProblemCount} active Open Problems &amp; Specific Challenges into
              an immutable release for academic citation, JSON download, and rollback safety.
            </p>
          </div>
        </div>

        <div className="ed-field-row">
          <label className="ed-field" style={{ flex: '1 1 220px' }}>
            Release ID (slug)
            <input
              type="text"
              className="ed-input ed-mono"
              value={relId}
              onChange={(e) => setRelId(e.target.value)}
              placeholder="consensus-2026-12-01-v1.1"
              required
            />
          </label>
          <label className="ed-field" style={{ flex: '2 1 260px' }}>
            Release Title
            <input
              type="text"
              className="ed-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="ed-field" style={{ flex: '1 1 140px' }}>
            Kind
            <select className="ed-select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="consensus">Consensus</option>
              <option value="screening">Screening</option>
              <option value="milestone">Milestone</option>
            </select>
          </label>
        </div>

        <label className="ed-field">
          Release Summary / Changelog
          <textarea
            className="ed-textarea"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Summarize major community proposals incorporated and terminology fixes..."
          />
        </label>

        {error && <div className="ed-notice is-accent">{error}</div>}

        <div className="ed-actions-row">
          <button type="submit" className="ed-btn is-primary" disabled={saving}>
            <PlusIcon size={14} />
            <span>{saving ? 'Freezing…' : 'Freeze Current Agenda Snapshot'}</span>
          </button>
        </div>
      </form>

      <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
        <h2 className="ed-panel-title">Frozen Releases ({releases.length})</h2>
        <div className="ed-card-list">
          {releases.map((rel) => (
            <div key={rel.id} className="ed-lineage-box" style={{ gap: '8px' }}>
              <div className="ed-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                  <span className="ed-tag is-ink ed-mono">{rel.id}</span>
                  {rel.is_current && <span className="ed-tag is-add">Current</span>}
                  <span className="ed-tag">{rel.kind}</span>
                  <span className="ed-mono ed-small ed-faint">{rel.date}</span>
                  <span className="ed-small ed-faint">{rel.problem_ids.length} problems</span>
                </div>
                <div className="ed-inline">
                  <a
                    href={`/api/public/releases/${encodeURIComponent(rel.id)}/snapshot`}
                    download={`agenda-snapshot-${rel.id}.json`}
                    className="ed-btn is-sm"
                  >
                    <DownloadIcon size={13} />
                    <span>Download JSON</span>
                  </a>
                  {user.role === 'admin' && !rel.is_current && (
                    <button
                      type="button"
                      className="ed-btn is-del-outline is-sm"
                      disabled={saving}
                      onClick={() => void handleRollback(rel.id)}
                    >
                      <RotateCcwIcon size={13} />
                      <span>Rollback</span>
                    </button>
                  )}
                </div>
              </div>
              <strong className="ed-small">{rel.title}</strong>
              {rel.summary && <p className="ed-small ed-muted">{rel.summary}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
