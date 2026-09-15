import { useSyncExternalStore } from 'react';
import { Image, Platform } from 'react-native';
import NanoIconsFontLoader from './specs/NativeNanoIconsFontLoader';

/**
 * Runtime registration of dynamically-linked (`l:"d"`) fonts.
 */

type FontStatus = 'loading' | 'ready' | 'error';

const statusByFamily = new Map<string, FontStatus>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function setStatus(family: string, status: FontStatus): void {
  statusByFamily.set(family, status);
  emit();
}

export function getFontStatus(family: string): FontStatus | undefined {
  return statusByFamily.get(family);
}

/** A font source: a require()'d module, an { uri }, or a path/uri string. */
export type FontSource = number | string | { uri: string };

export function resolveFontUri(font: unknown): string {
  if (typeof font === 'number') {
    const source = Image.resolveAssetSource(font);
    if (!source?.uri) {
      throw new Error(
        '[react-native-nano-icons] Could not resolve the font asset to a uri.'
      );
    }
    return source.uri;
  }
  if (typeof font === 'string') return font;
  if (
    font != null &&
    typeof font === 'object' &&
    typeof (font as { uri?: unknown }).uri === 'string'
  ) {
    return (font as { uri: string }).uri;
  }
  throw new Error(
    '[react-native-nano-icons] Unsupported font source. Pass require("Foo.ttf"), { uri }, or a path string.'
  );
}

async function register(family: string, uri: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Browser FontFace API. Typed loosely so this compiles under both the RN-only
    // lib config and a DOM-aware app config without depending on the DOM lib.
    const g = globalThis as unknown as {
      FontFace?: new (
        family: string,
        source: string
      ) => {
        load(): Promise<unknown>;
      };
      document?: { fonts?: { add(face: unknown): void } };
    };
    if (!g.FontFace || !g.document?.fonts) {
      throw new Error(
        '[react-native-nano-icons] FontFace API unavailable; cannot load dynamic font on this platform.'
      );
    }
    const face = new g.FontFace(family, `url(${uri})`);
    await face.load();
    g.document.fonts.add(face);
    return;
  }

  if (!NanoIconsFontLoader) {
    throw new Error(
      '[react-native-nano-icons] Native font loader is unavailable (Expo Go or module not built). ' +
        'Load the font yourself, or use a development/production build.'
    );
  }
  await NanoIconsFontLoader.registerFont(family, uri);
}

/**
 * Register `font` under `family`. Concurrent calls share one in-flight load.
 * Once settled, a later call retries after an error or no-ops if already
 * registered — unless `opts.force` re-registers (used by the explicit `loadFont`).
 */
export function loadDynamicFont(
  family: string,
  font: unknown,
  opts?: { force?: boolean }
): Promise<void> {
  // Dedupe concurrent calls.
  const existing = inFlight.get(family);
  if (existing) return existing;

  // Already registered → skip, unless the caller forces a reload.
  if (!opts?.force && statusByFamily.get(family) === 'ready') {
    return Promise.resolve();
  }

  setStatus(family, 'loading');

  const run = async (): Promise<void> => {
    try {
      await register(family, resolveFontUri(font));
      setStatus(family, 'ready');
    } catch (err) {
      setStatus(family, 'error');
      throw err;
    }
  };

  const tracked = run();

  // Release the slot once settled so later calls can retry/reload
  inFlight.set(
    family,
    (async () => {
      try {
        await tracked;
      } catch {
        // status already reflects the failure
      } finally {
        inFlight.delete(family);
      }
    })()
  );

  return tracked;
}

/**
 * Subscribe a component to a family's load state. Returns `true` while a managed
 * font is still loading (so the icon should hide), `false` otherwise (ready,
 * errored, or not managed by us).
 */
export function useDynamicFontPending(
  managed: boolean,
  family: string
): boolean {
  const status = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (managed ? statusByFamily.get(family) : undefined),
    () => undefined
  );
  return managed && status === 'loading';
}

/** Test-only: reset module state between tests. */
export function __resetDynamicFontsForTests(): void {
  statusByFamily.clear();
  inFlight.clear();
  listeners.clear();
}
