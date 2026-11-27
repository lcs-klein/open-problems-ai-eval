import React, { useState } from 'react';
import { useLocale } from './i18n';

export interface FrontierPoint {
  k: number;
  objective: number;
  bridge_score?: number;
  avg_q1?: number;
  avg_q2?: number;
  avg_q3?: number;
  needs_coverage?: number;
  research_coverage?: number;
  label?: string;
}

export const FrontierChart: React.FC<{
  points: FrontierPoint[];
  title?: string;
  subtitle?: string;
  highlightKs?: number[];
  presetLabels?: Record<number, string>;
}> = ({
  points,
  title,
  subtitle,
  highlightKs = [35, 36, 48],
  presetLabels,
}) => {
  const { t } = useLocale();
  const resolvedTitle = title ?? t('chart.defaultTitle', 'Portfolio Size Trade-off · Composite Score F(S)');
  const resolvedSubtitle =
    subtitle ??
    t(
      'chart.defaultSubtitle',
      'Compare how overall quality and topic coverage change across portfolio sizes (K = 7 to 48). Click or hover any dot to inspect.'
    );
  const defaultFocus =
    points.find((p) => p.k === 48) ?? points[points.length - 1] ?? null;
  const [activeK, setActiveK] = useState<number | null>(defaultFocus?.k ?? null);

  if (!points.length) {
    return <p className="ed-muted ed-small">{t('chart.noPoints', 'No frontier points available.')}</p>;
  }

  const activePoint =
    points.find((p) => p.k === activeK) ?? points[points.length - 1];

  const width = 680;
  const height = 250;
  const padL = 56;
  const padR = 24;
  const padT = 22;
  const padB = 38;

  const minK = Math.min(...points.map((p) => p.k));
  const maxK = Math.max(...points.map((p) => p.k));
  const allVals = points.flatMap((p) =>
    p.bridge_score ? [p.objective, p.bridge_score] : [p.objective]
  );
  const minY = Math.floor(Math.min(...allVals) - 2);
  const maxY = Math.ceil(Math.max(...allVals) + 2);

  const sx = (k: number) =>
    padL + ((k - minK) / Math.max(1, maxK - minK)) * (width - padL - padR);
  const sy = (y: number) =>
    height - padB - ((y - minY) / Math.max(1, maxY - minY)) * (height - padT - padB);

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.k).toFixed(1)} ${sy(p.objective).toFixed(1)}`)
    .join(' ');

  const hasBridge = points.some((p) => typeof p.bridge_score === 'number' && p.bridge_score > 0);
  const bridgePathD = hasBridge
    ? points
        .filter((p) => typeof p.bridge_score === 'number' && p.bridge_score > 0)
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${sx(p.k).toFixed(1)} ${sy(p.bridge_score as number).toFixed(1)}`
        )
        .join(' ')
    : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((tVal) =>
    Math.round(minY + tVal * (maxY - minY))
  );

  return (
    <div className="ed-panel ed-stack" style={{ gap: '14px' }}>
      <div className="ed-between">
        <div>
          <h3 className="ed-panel-title" style={{ fontSize: '17px' }}>
            {resolvedTitle}
          </h3>
          <p className="ed-small ed-muted" style={{ marginTop: '4px' }}>
            {resolvedSubtitle}
          </p>
        </div>
        <div className="ed-chip-row">
          {highlightKs.map((hk) => (
            <button
              key={hk}
              type="button"
              className="ed-chip ed-mono"
              aria-pressed={activePoint.k === hk}
              onClick={() => setActiveK(hk)}
            >
              {presetLabels?.[hk] ?? `K=${hk}`}
            </button>
          ))}
        </div>
      </div>

      <div className="ed-crosswalk-legend" aria-label="Chart legend">
        <span className="ed-inline">
          <span className="ed-legend-line is-ink" aria-hidden="true" />
          <span>
            <strong>{t('chart.legend.expanded', 'Expanded F(S)')}</strong>{' '}
            {t('chart.legend.expandedDesc', '(current rubric + all coverage units, max 100)')}
          </span>
        </span>
        {hasBridge && (
          <span className="ed-inline">
            <span className="ed-legend-line is-dashed" aria-hidden="true" />
            <span>
              <strong>{t('chart.legend.bridge', 'Bridge baseline')}</strong>{' '}
              {t('chart.legend.bridgeDesc', '(earlier coverage dictionary, without added units)')}
            </span>
          </span>
        )}
        <span className="ed-inline">
          <span className="ed-legend-dot is-mod" aria-hidden="true" />
          <span>
            {t('chart.legend.refs', 'Key reference sizes')} ({highlightKs.map((k) => `K=${k}`).join(', ')})
          </span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label={resolvedTitle}
      >
        {yTicks.map((yv) => (
          <g key={yv}>
            <line
              x1={padL}
              y1={sy(yv)}
              x2={width - padR}
              y2={sy(yv)}
              stroke="#EAE8E1"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={sy(yv) + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="#8A8780"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            >
              {yv}
            </text>
          </g>
        ))}

        <line x1={padL} y1={padT} x2={padL} y2={height - padB} stroke="#CFCBC2" strokeWidth="1" />
        <line
          x1={padL}
          y1={height - padB}
          x2={width - padR}
          y2={height - padB}
          stroke="#CFCBC2"
          strokeWidth="1"
        />

        {hasBridge && (
          <path
            d={bridgePathD}
            fill="none"
            stroke="#A8A59D"
            strokeWidth="1.4"
            strokeDasharray="4 3"
          />
        )}
        <path d={pathD} fill="none" stroke="#141413" strokeWidth="2" />

        {activePoint && (
          <line
            x1={sx(activePoint.k)}
            y1={padT}
            x2={sx(activePoint.k)}
            y2={height - padB}
            stroke="#C96442"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.55"
          />
        )}

        {points.map((p) => {
          const isHi = highlightKs.includes(p.k);
          const isActive = activePoint.k === p.k;
          return (
            <g
              key={p.k}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setActiveK(p.k)}
              onClick={() => setActiveK(p.k)}
            >
              <circle cx={sx(p.k)} cy={sy(p.objective)} r={10} fill="transparent" />
              <circle
                cx={sx(p.k)}
                cy={sy(p.objective)}
                r={isActive ? 5.5 : isHi ? 4 : 2.3}
                fill={isActive || isHi ? '#C96442' : '#141413'}
                stroke={isActive ? '#FFFFFF' : 'none'}
                strokeWidth={isActive ? 1.8 : 0}
              />
            </g>
          );
        })}

        <text x={width / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="#8A8780">
          {t('chart.axisX', 'Number of selected Open Problems · K ({min}..{max})', { min: minK, max: maxK })}
        </text>
        <text
          x={14}
          y={height / 2}
          textAnchor="middle"
          fontSize="11"
          fill="#8A8780"
          transform={`rotate(-90 14 ${height / 2})`}
        >
          {t('chart.axisY', 'Composite score F(S) (max 100)')}
        </text>
      </svg>

      {activePoint && (
        <div className="ed-frontier-readout">
          <div className="ed-frontier-stat">
            <span className="ed-section-label">{t('chart.stat.size', 'Portfolio Size')}</span>
            <strong className="ed-mono">
              {t('chart.stat.sizeVal', 'K = {k} problems', { k: activePoint.k })}
            </strong>
          </div>
          <div className="ed-frontier-stat">
            <span className="ed-section-label">{t('chart.stat.expanded', 'Expanded F(S)')}</span>
            <strong className="ed-mono" style={{ color: 'var(--ed-accent)' }}>
              {activePoint.objective.toFixed(2)}{' '}
              <span className="ed-faint" style={{ fontWeight: 400, fontSize: '12px' }}>
                / 100
              </span>
            </strong>
          </div>
          {typeof activePoint.bridge_score === 'number' && activePoint.bridge_score > 0 && (
            <div className="ed-frontier-stat">
              <span className="ed-section-label">{t('chart.stat.bridge', 'Bridge Baseline')}</span>
              <strong className="ed-mono">
                {activePoint.bridge_score.toFixed(2)}{' '}
                <span className="ed-faint" style={{ fontWeight: 400, fontSize: '12px' }}>
                  / 100
                </span>
              </strong>
            </div>
          )}
          {typeof activePoint.needs_coverage === 'number' && (
            <div className="ed-frontier-stat">
              <span className="ed-section-label">
                {t('chart.stat.stakeholder', 'Stakeholder Coverage')}
              </span>
              <strong className="ed-mono">
                {(activePoint.needs_coverage * 100).toFixed(1)}%
              </strong>
            </div>
          )}
          {typeof activePoint.research_coverage === 'number' && (
            <div className="ed-frontier-stat">
              <span className="ed-section-label">
                {t('chart.stat.research', 'Research Coverage')}
              </span>
              <strong className="ed-mono">
                {(activePoint.research_coverage * 100).toFixed(1)}%
              </strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
