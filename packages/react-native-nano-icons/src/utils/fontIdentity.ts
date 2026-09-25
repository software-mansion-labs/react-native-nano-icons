const BUILD_HASH_LENGTH = 8;
const BUILD_HASH = `[0-9a-f]{${BUILD_HASH_LENGTH}}`;
const BUILD_SUFFIX = new RegExp(`-${BUILD_HASH}$`);
const BUILD_FONT_FILE = new RegExp(`-${BUILD_HASH}\\.ttf$`);
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

export function buildFontFamily(fontFamily: string, inputHash: string): string {
  return `${fontFamily}-${inputHash.slice(0, BUILD_HASH_LENGTH)}`;
}

export function configuredFontFamily(family: string): string {
  return family.replace(BUILD_SUFFIX, '');
}

export function isFontFileOf(fontFamily: string, fileName: string): boolean {
  const escaped = fontFamily.replace(REGEX_SPECIALS, '\\$&');
  return new RegExp(`^${escaped}(-${BUILD_HASH})?\\.ttf$`).test(fileName);
}

export function isBuildFontFile(fileName: string): boolean {
  return BUILD_FONT_FILE.test(fileName);
}
