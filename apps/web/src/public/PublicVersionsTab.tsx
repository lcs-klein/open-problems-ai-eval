import React, { useMemo, useState } from 'react';
import type { CategoryCode, PublicBundle, ReleaseRecord } from '@opae/core';
import { ChevronDownIcon, DownloadIcon, useLocale } from '@opae/ui';

export const PublicVersionsTab: React.FC<{
  bundle: PublicBundle;
  releases: ReleaseRecord[];
  onOpenProblem: (problemId: string) => void;
}> = ({ bundle, releases, onOpenProblem }) => {
  const { t, catLabel } = useLocale();
  const [expandedRelease, setExpandedRelease] = useState<string | null>(null);

  const problemById = useMemo(() => {
    const map: Record<string, { title: string; category: CategoryCode }> = {};
    for (const p of bundle.open_problems) {
      map[p.id] = { title: p.title, category: p.category };
    }
    return map;
  }, [bundle.open_problems]);

  return (
    <div className="ed-stack">
      {releases.map((rel) => {
        const ids = rel.problem_ids ?? [];
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
                {rel.is_current && (
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
                {rel.published_by_name && (
                  <span className="ed-small ed-faint">
                    {t('common.by', 'by ')}
                    {rel.published_by_name}
                  </span>
                )}
              </div>

              <a
                href={`/api/public/releases/${encodeURIComponent(rel.id)}/snapshot`}
                download={`agenda-snapshot-${rel.id}.json`}
                className="ed-btn is-sm"
              >
                <DownloadIcon size={13} />
                <span>{t('versions.downloadSnapshot', 'Download Snapshot JSON')}</span>
              </a>
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
      {releases.length === 0 && (
        <div className="ed-empty">
          {t('versions.empty', 'No frozen release snapshots recorded yet.')}
        </div>
      )}
    </div>
  );
};
