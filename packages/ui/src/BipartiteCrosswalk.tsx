import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OpenProblem, OriginalItem } from '@opae/core';
import { AlertCircleIcon } from './Icons';

export interface CrosswalkProblem extends OpenProblem {
  _editAction?: 'added' | 'modified' | 'deleted';
}

interface LineSpec {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'primary' | 'related' | 'added' | 'modified' | 'deleted';
  highlighted: boolean;
}

interface BipartiteCrosswalkProps {
  originals: OriginalItem[];
  problems: CrosswalkProblem[];
  selectedId: string | null;
  selectedSide: 'left' | 'right' | null;
  mobileColumn?: 'left' | 'right';
  scrollTrigger?: { side: 'left' | 'right'; id: string; nonce: number } | null;
  onSelectOriginal: (id: string) => void;
  onSelectProblem: (id: string) => void;
}

export const BipartiteCrosswalk: React.FC<BipartiteCrosswalkProps> = ({
  originals,
  problems,
  selectedId,
  selectedSide,
  mobileColumn = 'right',
  scrollTrigger,
  onSelectOriginal,
  onSelectProblem,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [lines, setLines] = useState<LineSpec[]>([]);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

  const recompute = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const nextLines: LineSpec[] = [];

    for (const prob of problems) {
      const rightEl = rightRefs.current[prob.id];
      if (!rightEl || rightEl.offsetParent === null) continue;
      const rRect = rightEl.getBoundingClientRect();
      const x2 = rRect.left - rootRect.left;
      const y2 = rRect.top - rootRect.top + rRect.height / 2;

      const preds = prob.lineage?.predecessors ?? [];
      const related = prob.lineage?.related ?? [];

      const pushLink = (origId: string, baseKind: 'primary' | 'related') => {
        const leftEl = leftRefs.current[origId];
        if (!leftEl || leftEl.offsetParent === null) return;
        const lRect = leftEl.getBoundingClientRect();
        const x1 = lRect.right - rootRect.left;
        const y1 = lRect.top - rootRect.top + lRect.height / 2;

        let kind: LineSpec['kind'] = baseKind;
        if (prob._editAction === 'deleted') kind = 'deleted';
        else if (prob._editAction === 'added') kind = 'added';
        else if (prob._editAction === 'modified') kind = 'modified';

        const highlighted =
          (selectedSide === 'right' && selectedId === prob.id) ||
          (selectedSide === 'left' && selectedId === origId);

        nextLines.push({
          key: `${origId}->${prob.id}-${baseKind}`,
          x1,
          y1,
          x2,
          y2,
          kind,
          highlighted,
        });
      };

      preds.forEach((p) => pushLink(p, 'primary'));
      related.forEach((r) => pushLink(r, 'related'));
    }

    setSvgSize({ w: root.scrollWidth, h: root.scrollHeight });
    setLines(nextLines);
  }, [problems, selectedId, selectedSide]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, originals, mobileColumn]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => recompute());
      ro.observe(root);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [recompute]);

  useEffect(() => {
    if (!scrollTrigger) return;
    const el =
      scrollTrigger.side === 'left'
        ? leftRefs.current[scrollTrigger.id]
        : rightRefs.current[scrollTrigger.id];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scrollTrigger]);

  const strokeFor = (l: LineSpec) => {
    if (l.kind === 'deleted') return '#A63A32';
    if (l.kind === 'added') return '#3D6B52';
    if (l.kind === 'modified') return '#C96442';
    if (l.highlighted) return '#141413';
    return l.kind === 'related' ? '#A8A59D' : '#5C5A55';
  };

  return (
    <div className="ed-stack" style={{ gap: '12px' }}>
      <div className="ed-crosswalk-legend">
        <span className="ed-inline">
          <span className="ed-legend-line is-solid" />
          <span>Primary inheritance</span>
        </span>
        <span className="ed-inline">
          <span className="ed-legend-line is-dashed" />
          <span>Thematic relation</span>
        </span>
        <span className="ed-inline">
          <span className="ed-legend-dot is-add" />
          <span>Added</span>
        </span>
        <span className="ed-inline">
          <span className="ed-legend-dot is-mod" />
          <span>Modified</span>
        </span>
        <span className="ed-inline">
          <span className="ed-legend-dot is-del" />
          <span>Marked delete</span>
        </span>
      </div>

      <div ref={containerRef} className="ed-crosswalk">
        <svg className="ed-crosswalk-svg" width={svgSize.w} height={svgSize.h} aria-hidden="true">
          {lines.map((l) => {
            const midX = (l.x1 + l.x2) / 2;
            const d = `M ${l.x1} ${l.y1} C ${midX} ${l.y1}, ${midX} ${l.y2}, ${l.x2} ${l.y2}`;
            const dash = l.kind === 'related' || l.kind === 'deleted' ? '4 4' : undefined;
            const opacity = selectedId ? (l.highlighted ? 0.94 : 0.12) : 0.36;
            const width = l.highlighted ? 2.2 : 1.25;
            return (
              <path
                key={l.key}
                d={d}
                fill="none"
                stroke={strokeFor(l)}
                strokeWidth={width}
                strokeDasharray={dash}
                opacity={opacity}
              />
            );
          })}
        </svg>

        <div className={`ed-crosswalk-col ${mobileColumn === 'right' ? 'ed-mobile-hidden' : ''}`}>
          <div className="ed-col-header">
            <span>Manuscript Originals</span>
            <span className="ed-mono">{originals.length}</span>
          </div>
          {originals.map((orig) => {
            const id = orig.legacy_id || orig.id;
            const isSel = selectedSide === 'left' && selectedId === id;
            return (
              <button
                key={id}
                type="button"
                ref={(el) => {
                  leftRefs.current[id] = el;
                }}
                className={`ed-card ${isSel ? 'is-selected' : ''}`}
                onClick={() => onSelectOriginal(id)}
              >
                <div className="ed-card-meta">
                  <span className="ed-mono ed-code">{id}</span>
                  {orig.statement_status && (
                    <span className="ed-faint" style={{ fontSize: '11.5px' }}>
                      {orig.statement_status}
                    </span>
                  )}
                </div>
                <div className="ed-card-title">{orig.title}</div>
                {orig.disposition && (
                  <p className="ed-card-excerpt">{orig.disposition}</p>
                )}
              </button>
            );
          })}
          {originals.length === 0 && (
            <div className="ed-empty">No manuscript originals match the current filter.</div>
          )}
        </div>

        <div className={`ed-crosswalk-col ${mobileColumn === 'left' ? 'ed-mobile-hidden' : ''}`}>
          <div className="ed-col-header">
            <span>Working Open Problems</span>
            <span className="ed-mono">{problems.length}</span>
          </div>
          {problems.map((prob) => {
            const isSel = selectedSide === 'right' && selectedId === prob.id;
            const editCls = prob._editAction ? `is-edit-${prob._editAction}` : '';
            const editTagCls =
              prob._editAction === 'added'
                ? 'is-add'
                : prob._editAction === 'deleted'
                  ? 'is-del'
                  : 'is-accent';
            return (
              <button
                key={prob.id}
                type="button"
                ref={(el) => {
                  rightRefs.current[prob.id] = el;
                }}
                className={`ed-card ${isSel ? 'is-selected' : ''} ${editCls}`}
                onClick={() => onSelectProblem(prob.id)}
              >
                <div className="ed-card-meta">
                  <div className="ed-inline">
                    <span className="ed-mono ed-code">{prob.id}</span>
                    <span className="ed-sep">·</span>
                    <span className="ed-mono ed-faint">
                      {prob.paper_section_id === 'UNALIGNED_PROPOSAL'
                        ? 'New proposal'
                        : `§ ${prob.paper_section_id}`}
                    </span>
                  </div>
                  <div className="ed-inline">
                    {prob.terminology_alerts.length > 0 && (
                      <span className="ed-tag is-accent">
                        <AlertCircleIcon size={12} />
                        <span>{prob.terminology_alerts.length} term</span>
                      </span>
                    )}
                    {prob._editAction && (
                      <span className={`ed-tag ${editTagCls}`}>
                        {prob._editAction}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ed-card-title">{prob.title}</div>
                {(prob.provenance.author_type === 'human' ||
                  prob.lineage.justification_status === 'needs_human_justification') && (
                  <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                    {prob.provenance.author_type === 'human' && (
                      <span className="ed-tag is-add">Human retained</span>
                    )}
                    {prob.lineage.justification_status === 'needs_human_justification' && (
                      <span className="ed-tag">Needs rationale</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
          {problems.length === 0 && (
            <div className="ed-empty">No Open Problems match the current filter.</div>
          )}
        </div>
      </div>
    </div>
  );
};
