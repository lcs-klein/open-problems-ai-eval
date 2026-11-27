export interface PublicSanitizationReport {
  passed: boolean;
  hardViolations: string[];
  warnings: string[];
  hasCjk: boolean;
}

const FORBIDDEN_LITERALS = [
  'General_Problems_Explorer_INTERNAL',
  'Direct expert feedback, internal',
];

const HARD_FORBIDDEN_REGEXES: Array<{ label: string; rx: RegExp }> = [
  { label: 'Windows local user path', rx: /[A-Za-z]:\\{1,2}Users\\{1,2}[^\s"']+/i },
  { label: 'macOS local user path', rx: /\/Users\/[^/\s"']+\// },
  { label: 'Linux local user path', rx: /\/home\/[^/\s"']+\// },
];

const CJK_REGEX = /[\u4e00-\u9fff]+/;

/**
 * Checks a payload or text before publishing to public tables or responses.
 * Hard violations (internal markers, local paths) always fail.
 * CJK characters are flagged as warnings unless `strictCjk` is enabled.
 */
export function checkPublicSafe(
  payload: unknown,
  options: { strictCjk?: boolean } = {}
): PublicSanitizationReport {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hardViolations: string[] = [];
  const warnings: string[] = [];

  for (const literal of FORBIDDEN_LITERALS) {
    if (serialized.includes(literal)) {
      hardViolations.push(`Forbidden internal marker detected: ${literal}`);
    }
  }

  for (const { label, rx } of HARD_FORBIDDEN_REGEXES) {
    const match = rx.exec(serialized);
    if (match) {
      hardViolations.push(`Forbidden ${label} detected: ${match[0]}`);
    }
  }

  const cjkMatch = CJK_REGEX.exec(serialized);
  const hasCjk = Boolean(cjkMatch);
  if (hasCjk) {
    const msg = `CJK characters detected ("${cjkMatch![0].slice(0, 24)}"): verify this is not internal bilingual feedback.`;
    if (options.strictCjk) {
      hardViolations.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  return {
    passed: hardViolations.length === 0,
    hardViolations,
    warnings,
    hasCjk,
  };
}
