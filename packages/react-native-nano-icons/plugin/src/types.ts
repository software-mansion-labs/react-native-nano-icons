/**
 * Config for one icon set: input SVGs → one TTF + glyphmap.
 */
export interface IconSetConfig {
  /** Path to folder of SVG files (relative to project root). */
  inputDir: string;
  /** Font family name (used for TTF and glyphmap filenames). */
  fontFamily: string;
  /** Path where .ttf and .glyphmap.json will be saved. Defaults to a sibling nanoicons folder relative to inputDir. */
  outputDir?: string;
  /** Units per em (default 1024). */
  upm?: number;
  /** Safe zone inside UPM for glyphs (default 1020). */
  safeZone?: number;
  /** First Unicode codepoint for glyphs (default 0xe900). Hex string or number. */
  startUnicode?: number | string;
  /**
   * Delivery mode for the generated TTF. Defaults to `'static'`.
   *
   * - `'static'`: TTF is bundled into the native app.
   * - `'dynamic'`: TTF is excluded from native bundling - the host app is responsible for
   *   delivering it (e.g. via OTA) and registering it under the same font family name.
   */
  linking?: 'static' | 'dynamic';
}

/**
 * Config for one symbol set: input SVGs → `.symbolset` (or `.imageset` when
 * `multicolor`), linked into the iOS asset catalog for `UIImage(named:)`.
 */
export interface SymbolSetConfig {
  /** Folder of SVG files (relative to project root). */
  inputDir: string;
  /** Set name; defaults to the inputDir basename. */
  name?: string;
  /** Symbol name prefix (default "nano"): home.svg → "nano.home". */
  prefix?: string;
  /** Output dir; defaults to a sibling nanoicons folder next to inputDir. */
  outputDir?: string;
  /** Emit colored `.imageset` (original colors) instead of monochrome `.symbolset`. */
  multicolor?: boolean;
}

/** Result of building one symbol set. */
export interface BuiltSymbolSet {
  name: string;
  prefix: string;
  /** Directory containing the generated asset folders. */
  symbolsDir: string;
  /** The generated `.symbolset`/`.imageset` folders. */
  assetDirs: string[];
  /** Directory containing the generated Android VectorDrawable `.xml` files. */
  drawablesDir: string;
  /** The generated VectorDrawable `.xml` file paths. */
  drawableFiles: string[];
  manifestTsPath: string;
  symbolmapPath: string;
  symbols: Record<string, string>;
  /** Icon → Android drawable resource name (e.g. "home" → "nano_home"). */
  drawables: Record<string, string>;
}

/** plugins: [ [ "react-native-nano-icons", { iconSets: [...], symbolSets: [...] } ] ] */
export interface NanoIconsPluginOptions {
  iconSets?: IconSetConfig[];
  symbolSets?: SymbolSetConfig[];
}

/**
 * Result of building one icon set.
 */
export interface BuiltFont {
  fontFamily: string;
  ttfPath: string;
  glyphmapPath: string;
  linking: 'static' | 'dynamic';
}
