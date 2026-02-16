/**
 * Config for one icon set: input SVGs → one TTF + glyphmap.
 */
export interface IconSetConfig {
  /** Path to folder of SVG files (relative to project root). */
  inputDir: string;
  /** Font family name (used for TTF and glyphmap filenames). */
  fontFamily: string;
  /** Units per em (default 1024). */
  upm?: number;
  /** Safe zone inside UPM for glyphs (default 896). */
  safeZone?: number;
  /** First Unicode codepoint for glyphs (default 0xe900). */
  startUnicode?: number;
}

/**
 * plugins: [ [ "react-native-nano-icons", { iconSets: [...] } ] ]
 */
export interface NanoIconsPluginOptions {
  iconSets: IconSetConfig[];
}

/**
 * Result of building one icon set.
 */
export interface BuiltFont {
  fontFamily: string;
  ttfPath: string;
  glyphmapPath: string;
}
