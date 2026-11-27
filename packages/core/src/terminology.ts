import type { TerminologyAlert, TerminologyRule } from './types';

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function checkTerminology(
  text: string,
  rules: TerminologyRule[]
): TerminologyAlert[] {
  const alerts: TerminologyAlert[] = [];
  if (!text.trim()) return alerts;

  for (const rule of rules) {
    for (const sub of rule.disallowed_substitutes) {
      const rx = new RegExp(`\\b${escapeRegExp(sub)}\\b`, 'i');
      const match = rx.exec(text);
      if (match) {
        alerts.push({
          rule_id: rule.id,
          locked_term: rule.locked_term,
          found_term: match[0],
          severity: rule.severity,
          paper_context: rule.paper_context,
          rationale: rule.rationale,
        });
      }
    }
  }
  return alerts;
}
