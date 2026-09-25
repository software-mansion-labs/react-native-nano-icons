import NanoIconsFontLoader from './nativeFontLoader';
import { configuredFontFamily } from './utils/fontIdentity';
import { errorRuntime, LOG_PREFIX, warnRuntime } from './utils/runtimeLog';

export type FontIntegrityIssue = {
  fontFamily: string;
  family: string;
  linking: 'static' | 'dynamic';
  message: string;
  /** The error behind a dynamic font failure, when there is one. */
  cause?: unknown;
};

export type FontIntegrityStatus = 'found' | 'resolved';

type Listener = (
  issue: FontIntegrityIssue,
  status: FontIntegrityStatus
) => void;

const checked = new Set<string>();
const issues = new Map<string, FontIntegrityIssue>();
const listeners = new Set<Listener>();
let staleBinaryReported = false;

function hasNativeCheck(): boolean {
  return typeof NanoIconsFontLoader?.isFontRegistered === 'function';
}

export function isFontRegistered(family: string): Promise<boolean> {
  if (!NanoIconsFontLoader || !hasNativeCheck()) return Promise.resolve(false);
  return NanoIconsFontLoader.isFontRegistered(family);
}

export async function checkFontIntegrity(
  family: string,
  linking: 'static' | 'dynamic'
): Promise<void> {
  if (!NanoIconsFontLoader || checked.has(family)) return;
  checked.add(family);

  if (!hasNativeCheck()) {
    if (!staleBinaryReported) {
      staleBinaryReported = true;
      errorRuntime(
        'The app binary was built with an older version of react-native-nano-icons. Rebuild the app.'
      );
    }
    return;
  }

  if (await isFontRegistered(family)) return;

  recordIssue(
    family,
    linking,
    `Icon font "${configuredFontFamily(family)}" is missing or out of date, so its icons will render blank. ` +
      'Regenerate the icon fonts with the react-native-nano-icons CLI.'
  );
}

export const FONT_MISMATCH_CODE = 'E_NANOICONS_FONT_MISMATCH';

export function isFontMismatch(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === FONT_MISMATCH_CODE;
}

export const FONT_SOURCE_CODE = 'E_NANOICONS_FONT_SOURCE';

function isFontSourceError(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === FONT_SOURCE_CODE;
}

export function reportFontMismatch(
  family: string,
  linking: 'static' | 'dynamic'
): void {
  recordIssue(
    family,
    linking,
    `Icon font "${configuredFontFamily(family)}" does not match its glyphmap, so its icons will render blank. ` +
      'Regenerate the icon fonts with the react-native-nano-icons CLI and deliver the .ttf together with its .glyphmap.json.'
  );
}

export function reportMissingDynamicFont(family: string): Promise<void> {
  return reportDynamicFontIssue(
    family,
    `Icon font "${configuredFontFamily(family)}" is built with dynamic linking but no font was passed to createNanoIconSet, ` +
      'so its icons will render blank until a font is registered under the family name in glyphMap.m.f.'
  );
}

export function reportDynamicFontLoadFailure(
  family: string,
  cause: unknown
): Promise<void> {
  const name = configuredFontFamily(family);
  const message = isFontSourceError(cause)
    ? `Icon font "${name}" has no usable font source, so its icons will render blank. ` +
      `Pass require("${name}.ttf") or { uri } to createNanoIconSet.`
    : `Icon font "${name}" could not be loaded: ${describeCause(cause)} Its icons will render blank. ` +
      'Make sure the .ttf is delivered with your update.';

  return reportDynamicFontIssue(family, message, cause);
}

function describeCause(cause: unknown): string {
  const text = (cause instanceof Error ? cause.message : String(cause)).replace(
    `${LOG_PREFIX} ✖ `,
    ''
  );
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

async function reportDynamicFontIssue(
  family: string,
  message: string,
  cause?: unknown
): Promise<void> {
  if (await isFontRegistered(family)) return;
  if (NanoIconsFontLoader) {
    recordIssue(family, 'dynamic', message, cause);
  } else if (__DEV__) {
    warnRuntime(message, ...causeDetail(cause));
  }
}

function causeDetail(cause: unknown): unknown[] {
  return cause === undefined ? [] : [cause];
}

function recordIssue(
  family: string,
  linking: 'static' | 'dynamic',
  message: string,
  cause?: unknown
): void {
  const issue: FontIntegrityIssue = {
    fontFamily: configuredFontFamily(family),
    family,
    linking,
    message,
    ...(cause === undefined ? {} : { cause }),
  };
  issues.set(family, issue);
  if (__DEV__) warnRuntime(message, ...causeDetail(cause));
  for (const listener of listeners) listener(issue, 'found');
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

export function __resetFontIntegrityForTests(): void {
  staleBinaryReported = false;
  checked.clear();
  issues.clear();
  listeners.clear();
}
