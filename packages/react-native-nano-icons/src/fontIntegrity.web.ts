import type { FontIntegrityIssue, FontIntegrityStatus } from './fontIntegrity';

export type { FontIntegrityIssue, FontIntegrityStatus };

export function addFontIntegrityListener(
  _listener: (issue: FontIntegrityIssue, status: FontIntegrityStatus) => void
): () => void {
  return () => {};
}

export function getFontIntegrityIssues(): FontIntegrityIssue[] {
  return [];
}
