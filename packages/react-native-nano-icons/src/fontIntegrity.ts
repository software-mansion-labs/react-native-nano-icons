import NanoIconsFontLoader from './specs/NativeNanoIconsFontLoader';
import { configuredFontFamily } from './utils/fontIdentity';
import { errorRuntime, warnRuntime } from './utils/runtimeLog';

export type FontIntegrityIssue = {
  fontFamily: string;
  family: string;
  linking: 'static' | 'dynamic';
  message: string;
};

type Listener = (issue: FontIntegrityIssue) => void;

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

function recordIssue(
  family: string,
  linking: 'static' | 'dynamic',
  message: string
): void {
  const issue: FontIntegrityIssue = {
    fontFamily: configuredFontFamily(family),
    family,
    linking,
    message,
  };
  issues.set(family, issue);
  if (__DEV__) warnRuntime(message);
  for (const listener of listeners) listener(issue);
}

export function addFontIntegrityListener(listener: Listener): () => void {
  listeners.add(listener);
  for (const issue of issues.values()) listener(issue);
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
