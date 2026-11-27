import React from 'react';
import type { AuthorType, GovernanceStatus, TerminologyAlert } from '@opae/core';
import { AlertCircleIcon, EditIcon } from './Icons';

export const RUBRIC_SHORT = ['Relevance', 'Openness', 'Clarity', 'Impact', 'Value'];

export const GOVERNANCE_LABELS: Record<GovernanceStatus, string> = {
  draft: 'Draft',
  screening_recommendation: 'Screening Recommendation',
  under_human_review: 'Under Human Review',
  moderator_approved: 'Moderator Approved',
  rejected: 'Rejected',
};

export const AUTHOR_LABELS: Record<AuthorType, string> = {
  human: 'Human Retained',
  ai_assisted: 'AI-Assisted Draft',
  machine_generated: 'Machine Generated',
};

export function applyTerminologyFixes(text: string, alerts: TerminologyAlert[]): string {
  let out = text;
  for (const alert of alerts) {
    const escaped = alert.found_term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`\\b${escaped}\\b`, 'gi');
    out = out.replace(rx, (match) => {
      if (match[0] && match[0] === match[0].toUpperCase()) {
        return alert.locked_term.charAt(0).toUpperCase() + alert.locked_term.slice(1);
      }
      return alert.locked_term;
    });
  }
  return out;
}

export const GovernanceBadge: React.FC<{ status: GovernanceStatus }> = ({ status }) => (
  <span className={`ed-tag ${status === 'moderator_approved' ? 'is-ink' : ''}`}>
    {GOVERNANCE_LABELS[status] ?? status}
  </span>
);

export const AuthorTypeBadge: React.FC<{ type: AuthorType }> = ({ type }) => (
  <span className={`ed-tag ${type === 'human' ? 'is-add' : ''}`}>
    {AUTHOR_LABELS[type] ?? type}
  </span>
);

export const ScorePills: React.FC<{ scores: number[] }> = ({ scores }) => (
  <div className="ed-rubric-grid" aria-label="Five-dimension rubric scores">
    {scores.map((s, idx) => (
      <div
        key={idx}
        className="ed-rubric-cell"
        title={`Q${idx + 1} ${RUBRIC_SHORT[idx] ?? ''}: ${s}/4`}
      >
        <div className="ed-rubric-top ed-mono">
          <span>Q{idx + 1}</span>
          <strong>{s}/4</strong>
        </div>
        <div className="ed-rubric-dim">{RUBRIC_SHORT[idx] ?? ''}</div>
        <div className="ed-rubric-track">
          <div
            className={`ed-rubric-fill ${s <= 2 ? 'is-low' : ''}`}
            style={{ width: `${Math.min(100, Math.max(0, (s / 4) * 100))}%` }}
          />
        </div>
      </div>
    ))}
  </div>
);

export const TerminologyAlertsPanel: React.FC<{
  alerts: TerminologyAlert[];
  onFixTerms?: () => void;
  fixLabel?: string;
}> = ({ alerts, onFixTerms, fixLabel = 'Propose Term Fix' }) => {
  if (!alerts.length) return null;
  return (
    <div className="ed-term-callout" role="alert">
      <div className="ed-term-head">
        <span className="ed-inline">
          <AlertCircleIcon size={15} />
          <span>Terminology Lock ({alerts.length})</span>
        </span>
        {onFixTerms ? (
          <button type="button" className="ed-btn is-accent-outline is-sm" onClick={onFixTerms}>
            <EditIcon size={12} />
            <span>{fixLabel}</span>
          </button>
        ) : (
          <span className="ed-mono" style={{ fontSize: '11.5px' }}>
            Manuscript Priority
          </span>
        )}
      </div>
      {alerts.map((a, idx) => (
        <div key={`${a.rule_id}-${idx}`} style={{ display: 'grid', gap: '4px' }}>
          <div className="ed-term-diff">
            <span className="ed-term-old">{a.found_term}</span>
            <span>→</span>
            <span className="ed-term-new">{a.locked_term}</span>
            <span
              className="ed-muted"
              style={{ fontFamily: 'var(--ed-font-sans)', fontSize: '12px' }}
            >
              {a.paper_context}
            </span>
          </div>
          <p className="ed-muted" style={{ fontSize: '12.5px', lineHeight: 1.5 }}>
            {a.rationale}
          </p>
        </div>
      ))}
    </div>
  );
};
