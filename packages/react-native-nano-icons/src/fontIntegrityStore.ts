import * as React from 'react';
import { configuredFontFamily } from './utils/fontIdentity';
import { warnRuntime } from './utils/runtimeLog';

export type FontIntegrityIssue = {
  fontFamily: string;
  family: string;
  linking: 'static' | 'dynamic';
  message: string;
  /** The error behind a dynamic font failure or a web font load failure, when there is one. */
  cause?: unknown;
};

export type FontIntegrityStatus = 'found' | 'resolved';

type Listener = (
  issue: FontIntegrityIssue,
  status: FontIntegrityStatus
) => void;

const issues = new Map<string, FontIntegrityIssue>();
const listeners = new Set<Listener>();

export function causeDetail(cause: unknown): unknown[] {
  return cause === undefined ? [] : [cause];
}

export function recordIssue(
  family: string,
  linking: 'static' | 'dynamic',
  message: string,
  cause?: unknown,
  notifyLater = false
): void {
  const issue: FontIntegrityIssue = {
    fontFamily: configuredFontFamily(family),
    family,
    linking,
    message,
    ...(cause === undefined ? {} : { cause }),
  };
  issues.set(family, issue);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    warnRuntime(message, ...causeDetail(cause));
  }
  if (!notifyLater) {
    for (const listener of listeners) listener(issue, 'found');
    return;
  }
  const subscribed = [...listeners];
  void Promise.resolve().then(() => {
    for (const listener of subscribed) {
      if (listeners.has(listener)) listener(issue, 'found');
    }
  });
}

export function resolveFontIssue(family: string): void {
  const issue = issues.get(family);
  if (!issue) return;
  issues.delete(family);
  for (const listener of listeners) listener(issue, 'resolved');
}

export function addFontIntegrityListener(listener: Listener): () => void {
  listeners.add(listener);
  for (const issue of issues.values()) listener(issue, 'found');
  return () => {
    listeners.delete(listener);
  };
}

export function getFontIntegrityIssues(): FontIntegrityIssue[] {
  return [...issues.values()];
}

function subscribe(onChange: () => void): () => void {
  const listener: Listener = () => onChange();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFontIntegrityIssue(
  family: string
): FontIntegrityIssue | undefined {
  return React.useSyncExternalStore(
    subscribe,
    () => issues.get(family),
    () => undefined
  );
}

export function __resetFontIssuesForTests(): void {
  issues.clear();
  listeners.clear();
}
