import {
  __resetFontIssuesForTests,
  getFontIntegrityIssues,
  recordIssue,
  type FontIntegrityIssue,
} from './fontIntegrityStore';
import { configuredFontFamily } from './utils/fontIdentity';

export {
  addFontIntegrityListener,
  getFontIntegrityIssues,
  resolveFontIssue,
  useFontIntegrityIssue,
  type FontIntegrityIssue,
  type FontIntegrityStatus,
} from './fontIntegrityStore';

type Linking = FontIntegrityIssue['linking'];

type DocumentFontFace = {
  family: string;
  status: string;
  loaded: Promise<unknown>;
};

type DocumentFonts = {
  forEach(callback: (face: DocumentFontFace) => void): void;
  addEventListener(type: 'loadingerror', listener: () => void): void;
};

const watched = new Map<string, Linking>();
let listeningTo: DocumentFonts | undefined;

function documentFonts(): DocumentFonts | undefined {
  return (globalThis as { document?: { fonts?: DocumentFonts } }).document
    ?.fonts;
}

function facesOf(fonts: DocumentFonts, family: string): DocumentFontFace[] {
  const names = [family, configuredFontFamily(family)];
  const faces: DocumentFontFace[] = [];
  fonts.forEach((face) => {
    if (names.includes(face.family.replace(/^["']|["']$/g, ''))) {
      faces.push(face);
    }
  });
  return faces;
}

export function reportFontLoadFailure(
  family: string,
  linking: Linking,
  cause: unknown
): void {
  const fonts = documentFonts();
  if (
    !fonts ||
    getFontIntegrityIssues().some((issue) => issue.family === family) ||
    facesOf(fonts, family).some(
      (face) => face.status === 'loaded' || face.status === 'loading'
    )
  ) {
    return;
  }
  recordIssue(
    family,
    linking,
    `Icon font "${configuredFontFamily(family)}" could not be loaded, so its icons will render blank. ` +
      'Check that its font url serves a valid font file.',
    cause
  );
}

function reportFailedFaces(fonts: DocumentFonts): void {
  for (const [family, linking] of watched) {
    const failed = facesOf(fonts, family).find(
      (face) => face.status === 'error'
    );
    failed?.loaded.catch((cause: unknown) =>
      reportFontLoadFailure(family, linking, cause)
    );
  }
}

export function watchFontLoadFailures(family: string, linking: Linking): void {
  const fonts = documentFonts();
  if (!fonts) return;
  watched.set(family, linking);
  if (listeningTo !== fonts) {
    listeningTo = fonts;
    fonts.addEventListener('loadingerror', () => reportFailedFaces(fonts));
  }
  reportFailedFaces(fonts);
}

export function __resetFontIntegrityForTests(): void {
  watched.clear();
  listeningTo = undefined;
  __resetFontIssuesForTests();
}
