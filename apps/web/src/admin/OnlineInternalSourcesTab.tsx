import React, { useEffect, useState } from 'react';
import type {
  ExpertItem,
  LiteratureItem,
  OriginalItem,
  ProgrammeItem,
} from '@opae/core';
import { ArrowUpRightIcon, SearchIcon } from '@opae/ui';
import { internalApi } from '../api/client';

type SourceKind = 'experts' | 'originals' | 'programme' | 'literature';

const PAGE_SIZE = 60;

export const OnlineInternalSourcesTab: React.FC<{
  counts: { experts: number; originals: number; programme: number; literature: number };
  workingIds: Set<string>;
  onOpenProblem: (id: string) => void;
}> = ({ counts, workingIds, onOpenProblem }) => {
  const [kind, setKind] = useState<SourceKind>('experts');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    internalApi
      .getSources(kind, debouncedQuery, PAGE_SIZE, offset)
      .then((res) => {
        if (cancelled) return;
        setTotal(res.total);
        setItems(res.items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sources.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, debouncedQuery, offset]);

  const renderProblemTag = (id: string) =>
    workingIds.has(id) ? (
      <button
        key={id}
        type="button"
        className="ed-tag is-ink ed-mono"
        onClick={() => onOpenProblem(id)}
      >
        {id}
      </button>
    ) : (
      <span key={id} className="ed-tag ed-mono">
        {id}
      </span>
    );

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
              placeholder="Search unredacted experts (EN/ZH), originals, programme, or literature..."
            />
          </div>

          <div className="ed-chip-row">
            {(
              [
                ['experts', `Expert Feedback (${counts.experts})`],
                ['originals', `Originals (${counts.originals})`],
                ['programme', `Programme (${counts.programme})`],
                ['literature', `Literature (${counts.literature})`],
              ] as Array<[SourceKind, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className="ed-chip"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  setOffset(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="ed-notice is-accent">{error}</div>}

      <div className="ed-between">
        <span className="ed-small ed-faint">
          {loading
            ? 'Searching internal D1 corpus…'
            : `Showing ${items.length === 0 ? 0 : offset + 1}–${Math.min(offset + items.length, total)} of ${total} record(s)`}
        </span>
        <div className="ed-inline">
          <button
            type="button"
            className="ed-btn is-sm"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            Previous
          </button>
          <button
            type="button"
            className="ed-btn is-sm"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </div>

      {kind === 'experts' && (
        <div className="ed-card-list">
          {(items as ExpertItem[]).map((ex) => (
            <article key={ex.id} className="ed-panel ed-stack" style={{ gap: '8px' }}>
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                <span className="ed-mono ed-code">{ex.id}</span>
                <strong>{ex.expert}</strong>
                {ex.source_type && <span className="ed-tag">{ex.source_type}</span>}
                {ex.location && <span className="ed-small ed-faint">{ex.location}</span>}
              </div>
              <p className="ed-small">{ex.wording}</p>
              {ex.wording_en && <p className="ed-small ed-muted">{ex.wording_en}</p>}
              {(ex.versions ?? []).length > 0 && (
                <div className="ed-chip-row">
                  {(ex.versions ?? []).map((v) => renderProblemTag(v))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {kind === 'originals' && (
        <div className="ed-card-list">
          {(items as OriginalItem[]).map((o) => (
            <article key={o.id} className="ed-panel ed-stack" style={{ gap: '8px' }}>
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                <span className="ed-mono ed-code">{o.legacy_id || o.id}</span>
                <strong>{o.title}</strong>
                {o.disposition && <span className="ed-tag">{o.disposition}</span>}
              </div>
              {o.statement && <p className="ed-small ed-muted">{o.statement}</p>}
            </article>
          ))}
        </div>
      )}

      {kind === 'programme' && (
        <div className="ed-table-wrap">
          <table className="ed-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Module</th>
                <th>Question</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {(items as ProgrammeItem[]).map((p) => (
                <tr key={p.id}>
                  <td className="ed-mono ed-code">{p.id}</td>
                  <td className="ed-small ed-muted">{p.module || '—'}</td>
                  <td className="ed-small">{p.question}</td>
                  <td>
                    <div className="ed-chip-row">
                      {(p.new_candidate_links ?? []).map((cid) => renderProblemTag(cid))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {kind === 'literature' && (
        <div className="ed-table-wrap">
          <table className="ed-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Source</th>
                <th>Title &amp; ZH Question</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {(items as LiteratureItem[]).map((l) => (
                <tr key={l.id}>
                  <td className="ed-mono ed-code">{l.id}</td>
                  <td className="ed-small">
                    {l.source_url ? (
                      <a
                        href={l.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="ed-inline"
                      >
                        <span>{l.source_id || 'Link'}</span>
                        <ArrowUpRightIcon size={12} />
                      </a>
                    ) : (
                      l.source_id || '—'
                    )}
                  </td>
                  <td className="ed-small">
                    <div>{l.title || l.source_title}</div>
                    {l.question_zh && (
                      <div className="ed-faint" style={{ marginTop: '3px' }}>
                        {l.question_zh}
                      </div>
                    )}
                  </td>
                  <td className="ed-small ed-muted">{l.scope || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
