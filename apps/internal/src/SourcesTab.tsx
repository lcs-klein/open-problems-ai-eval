import React, { useMemo, useState } from 'react';
import type { InternalBundle } from '@opae/core';
import { ArrowUpRightIcon, RotateCcwIcon, SearchIcon } from '@opae/ui';

type SourceKind = 'experts' | 'originals' | 'programme' | 'literature';

const PAGE_STEP = 80;

export const SourcesTab: React.FC<{
  bundle: InternalBundle;
  onOpenProblem: (problemId: string) => void;
}> = ({ bundle, onOpenProblem }) => {
  const [kind, setKind] = useState<SourceKind>('experts');
  const [query, setQuery] = useState('');
  const [progLimit, setProgLimit] = useState(PAGE_STEP);
  const [litLimit, setLitLimit] = useState(PAGE_STEP);

  const q = query.trim().toLowerCase();

  const workingIdSet = useMemo(
    () => new Set(bundle.open_problems.map((p) => p.id)),
    [bundle.open_problems]
  );

  const filteredExperts = useMemo(
    () =>
      bundle.experts.filter(
        (ex) =>
          !q ||
          (ex.id ?? '').toLowerCase().includes(q) ||
          (ex.expert ?? '').toLowerCase().includes(q) ||
          (ex.wording ?? '').toLowerCase().includes(q) ||
          (ex.wording_en ?? '').toLowerCase().includes(q) ||
          (ex.supports ?? '').toLowerCase().includes(q) ||
          (ex.versions ?? []).some((v) => (v ?? '').toLowerCase().includes(q))
      ),
    [bundle.experts, q]
  );

  const filteredOriginals = useMemo(
    () =>
      bundle.originals.filter(
        (o) =>
          !q ||
          (o.title ?? '').toLowerCase().includes(q) ||
          (o.statement ?? '').toLowerCase().includes(q) ||
          (o.legacy_id ?? o.id ?? '').toLowerCase().includes(q)
      ),
    [bundle.originals, q]
  );

  const filteredProgrammeAll = useMemo(
    () =>
      bundle.programme.filter(
        (p) =>
          !q ||
          (p.id ?? '').toLowerCase().includes(q) ||
          (p.question ?? '').toLowerCase().includes(q) ||
          (p.module ?? '').toLowerCase().includes(q) ||
          (p.new_candidate_links ?? []).some((id) => (id ?? '').toLowerCase().includes(q))
      ),
    [bundle.programme, q]
  );

  const filteredLiteratureAll = useMemo(
    () =>
      bundle.literature.filter(
        (l) =>
          !q ||
          (l.id ?? '').toLowerCase().includes(q) ||
          (l.title ?? '').toLowerCase().includes(q) ||
          (l.source_id ?? '').toLowerCase().includes(q) ||
          (l.source_title ?? '').toLowerCase().includes(q) ||
          (l.question_zh ?? '').toLowerCase().includes(q)
      ),
    [bundle.literature, q]
  );

  const switchKind = (next: SourceKind) => {
    setKind(next);
    setProgLimit(PAGE_STEP);
    setLitLimit(PAGE_STEP);
  };

  const renderProblemLink = (id: string, prefix = '') =>
    workingIdSet.has(id) ? (
      <button
        key={id}
        type="button"
        className="ed-tag is-ink ed-mono"
        title={`Inspect ${id} in Crosswalk`}
        onClick={() => onOpenProblem(id)}
      >
        {prefix}
        {id}
      </button>
    ) : (
      <span key={id} className="ed-tag ed-mono">
        {prefix}
        {id}
      </span>
    );

  return (
    <div className="ed-stack">
      <div className="ed-toolbar" style={{ marginBottom: 0 }}>
        <div className="ed-toolbar-top">
          <div className="ed-chip-row" role="group" aria-label="Internal source corpus">
            <button
              type="button"
              className="ed-chip"
              aria-pressed={kind === 'experts'}
              onClick={() => switchKind('experts')}
            >
              <span>Bilingual Experts</span>
              <span className="ed-mono" style={{ opacity: 0.7 }}>{bundle.experts.length}</span>
            </button>
            <button
              type="button"
              className="ed-chip"
              aria-pressed={kind === 'originals'}
              onClick={() => switchKind('originals')}
            >
              <span>Manuscript Originals</span>
              <span className="ed-mono" style={{ opacity: 0.7 }}>{bundle.originals.length}</span>
            </button>
            <button
              type="button"
              className="ed-chip"
              aria-pressed={kind === 'programme'}
              onClick={() => switchKind('programme')}
            >
              <span>Programme Corpus</span>
              <span className="ed-mono" style={{ opacity: 0.7 }}>{bundle.programme.length}</span>
            </button>
            <button
              type="button"
              className="ed-chip"
              aria-pressed={kind === 'literature'}
              onClick={() => switchKind('literature')}
            >
              <span>Table 2 Literature</span>
              <span className="ed-mono" style={{ opacity: 0.7 }}>{bundle.literature.length}</span>
            </button>
          </div>

          <div className="ed-search-wrap">
            <span className="ed-search-icon">
              <SearchIcon size={15} />
            </span>
            <input
              type="search"
              className="ed-search-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setProgLimit(PAGE_STEP);
                setLitLimit(PAGE_STEP);
              }}
              placeholder="Search experts, originals, programme, or Table 2 literature..."
              aria-label="Search internal sources"
            />
          </div>
        </div>
      </div>

      {kind === 'experts' && (
        <div className="ed-card-list">
          {filteredExperts.map((ex) => (
            <article key={ex.id} className="ed-panel ed-stack" style={{ gap: '10px' }}>
              <div className="ed-between">
                <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                  <span className="ed-mono ed-code">{ex.id}</span>
                  <span className="ed-sep">·</span>
                  <strong>{ex.expert}</strong>
                </div>
                <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                  {ex.versions?.map((v) => renderProblemLink(v, 'Maps to '))}
                </div>
              </div>
              <div className="ed-lineage-box">
                <span className="ed-section-label">Original Feedback (ZH)</span>
                <p style={{ fontSize: '14px' }}>{ex.wording}</p>
              </div>
              {ex.wording_en && (
                <p className="ed-small ed-muted">
                  <strong>English Translation:</strong> {ex.wording_en}
                </p>
              )}
              {ex.supports && (
                <p className="ed-small ed-muted">
                  <strong>Supports:</strong> {ex.supports}
                </p>
              )}
            </article>
          ))}
          {filteredExperts.length === 0 && (
            <div className="ed-empty ed-inline" style={{ justifyContent: 'space-between' }}>
              <span>No expert feedback matches &ldquo;{query}&rdquo;.</span>
              <button type="button" className="ed-btn is-sm" onClick={() => setQuery('')}>
                <RotateCcwIcon size={12} />
                <span>Clear search</span>
              </button>
            </div>
          )}
        </div>
      )}

      {kind === 'originals' && (
        <div className="ed-card-list">
          {filteredOriginals.map((o) => (
            <article
              key={o.legacy_id || o.id}
              className="ed-panel-soft ed-stack"
              style={{ gap: '6px' }}
            >
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                <span className="ed-mono ed-code">{o.legacy_id || o.id}</span>
                <span className="ed-sep">·</span>
                <strong>{o.title}</strong>
              </div>
              <p className="ed-small ed-muted">
                {o.statement || 'Heading-only entry in the Nov 6 draft.'}
              </p>
            </article>
          ))}
          {filteredOriginals.length === 0 && (
            <div className="ed-empty ed-inline" style={{ justifyContent: 'space-between' }}>
              <span>No manuscript originals match &ldquo;{query}&rdquo;.</span>
              <button type="button" className="ed-btn is-sm" onClick={() => setQuery('')}>
                <RotateCcwIcon size={12} />
                <span>Clear search</span>
              </button>
            </div>
          )}
        </div>
      )}

      {kind === 'programme' && (
        <div className="ed-stack" style={{ gap: '12px' }}>
          <div className="ed-between ed-small ed-muted">
            <span>
              Showing <strong style={{ color: 'var(--ed-ink)' }}>{Math.min(progLimit, filteredProgrammeAll.length)}</strong> of{' '}
              <span className="ed-mono">{filteredProgrammeAll.length}</span> matching programme records.
            </span>
          </div>
          <div className="ed-table-wrap">
            <table className="ed-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Module</th>
                  <th>Question</th>
                  <th>Mapped Open Problems</th>
                </tr>
              </thead>
              <tbody>
                {filteredProgrammeAll.slice(0, progLimit).map((p) => (
                  <tr key={p.id}>
                    <td className="ed-mono ed-code">{p.id}</td>
                    <td className="ed-small ed-muted">{p.module ?? '—'}</td>
                    <td className="ed-small">{p.question}</td>
                    <td>
                      {(p.new_candidate_links ?? []).length > 0 ? (
                        <div className="ed-chip-row">
                          {(p.new_candidate_links ?? []).map((cid) => renderProblemLink(cid))}
                        </div>
                      ) : (
                        <span className="ed-faint ed-small">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {progLimit < filteredProgrammeAll.length && (
            <button
              type="button"
              className="ed-btn is-sm"
              style={{ justifySelf: 'center' }}
              onClick={() => setProgLimit((n) => n + PAGE_STEP)}
            >
              Load more ({filteredProgrammeAll.length - progLimit} remaining)
            </button>
          )}
        </div>
      )}

      {kind === 'literature' && (
        <div className="ed-stack" style={{ gap: '12px' }}>
          <div className="ed-between ed-small ed-muted">
            <span>
              Showing <strong style={{ color: 'var(--ed-ink)' }}>{Math.min(litLimit, filteredLiteratureAll.length)}</strong> of{' '}
              <span className="ed-mono">{filteredLiteratureAll.length}</span> matching Table 2 records.
            </span>
          </div>
          <div className="ed-table-wrap">
            <table className="ed-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Source</th>
                  <th>Extracted Problem</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {filteredLiteratureAll.slice(0, litLimit).map((l) => (
                  <tr key={l.id}>
                    <td className="ed-mono ed-code">{l.id}</td>
                    <td className="ed-small ed-muted">
                      {l.source_url ? (
                        <a
                          href={l.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ed-inline"
                        >
                          <span>
                            {l.source_id} · {l.source_title}
                          </span>
                          <ArrowUpRightIcon size={12} />
                        </a>
                      ) : (
                        `${l.source_id ?? ''} · ${l.source_title ?? ''}`
                      )}
                    </td>
                    <td className="ed-small">{l.title || l.question_zh}</td>
                    <td className="ed-small ed-muted">{l.scope ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {litLimit < filteredLiteratureAll.length && (
            <button
              type="button"
              className="ed-btn is-sm"
              style={{ justifySelf: 'center' }}
              onClick={() => setLitLimit((n) => n + PAGE_STEP)}
            >
              Load more ({filteredLiteratureAll.length - litLimit} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
};
