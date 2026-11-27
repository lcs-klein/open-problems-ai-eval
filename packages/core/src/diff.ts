import type { OpenProblem, ProblemEdit, ReviewDiffPayload } from './types';

export function createReviewDiffPayload(
  reviewerName: string,
  edits: Record<string, ProblemEdit>
): ReviewDiffPayload {
  return {
    schema_version: 2,
    reviewer_name: reviewerName.trim() || 'Anonymous Co-author',
    exported_at: new Date().toISOString(),
    edits,
  };
}

export function parseReviewDiffPayload(raw: string): ReviewDiffPayload {
  const parsed = JSON.parse(raw) as ReviewDiffPayload;
  if (!parsed || typeof parsed !== 'object' || !parsed.edits || typeof parsed.edits !== 'object') {
    throw new Error('Invalid Review Diff JSON: missing "edits" map.');
  }
  return {
    schema_version: parsed.schema_version ?? 2,
    reviewer_name: String(parsed.reviewer_name || 'Imported Reviewer'),
    exported_at: String(parsed.exported_at || new Date().toISOString()),
    edits: parsed.edits,
  };
}

export function applyEditsToProblems(
  baseProblems: OpenProblem[],
  edits: Record<string, ProblemEdit>
): Array<OpenProblem & { _editAction?: 'added' | 'modified' | 'deleted' }> {
  const result: Array<OpenProblem & { _editAction?: 'added' | 'modified' | 'deleted' }> =
    baseProblems.map((p) => {
      const edit = edits[p.id];
      if (!edit) return p;
      if (edit.action === 'deleted') {
        return { ...p, _editAction: 'deleted' };
      }
      if (edit.action === 'modified' && edit.after) {
        return {
          ...p,
          ...edit.after,
          lineage: {
            ...p.lineage,
            ...(edit.after.lineage ?? {}),
            why_changed: edit.why_changed || p.lineage.why_changed,
          },
          _editAction: 'modified',
        };
      }
      return p;
    });

  for (const edit of Object.values(edits)) {
    if (edit.action === 'added' && edit.after) {
      result.push({
        ...(edit.after as OpenProblem),
        _editAction: 'added',
      });
    }
  }

  return result;
}
