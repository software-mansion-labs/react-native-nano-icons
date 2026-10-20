import { runtimeError } from './utils/runtimeLog';

type FontFaceLike = { load(): Promise<unknown> };

type BrowserGlobals = {
  FontFace?: new (
    family: string,
    source: string,
    descriptors?: { display?: string }
  ) => FontFaceLike;
  document?: { fonts?: { add(face: FontFaceLike): void } };
};

const registered = new Set<string>();

export function webFontUrl(font: unknown): string | undefined {
  if (typeof font === 'string') return font;
  if (
    font != null &&
    typeof font === 'object' &&
    typeof (font as { uri?: unknown }).uri === 'string'
  ) {
    return (font as { uri: string }).uri;
  }
  return undefined;
}

export function isWebFontRegistered(family: string): boolean {
  return registered.has(family);
}

export async function registerWebFont(
  family: string,
  url: string
): Promise<void> {
  const g = globalThis as BrowserGlobals;
  if (!g.FontFace || !g.document?.fonts) {
    throw runtimeError('FontFace API unavailable; cannot load the icon font.');
  }
  const face = new g.FontFace(family, `url(${JSON.stringify(url)})`, {
    display: 'block',
  });
  await face.load();
  g.document.fonts.add(face);
  registered.add(family);
}

export function __resetWebFontsForTests(): void {
  registered.clear();
}
