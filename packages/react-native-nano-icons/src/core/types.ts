export type NanoLogger = {
  start: (msg: string) => void;
  update: (msg: string) => void;
  succeed: (msg: string) => void;
  fail: (msg: string) => void;
  /** Only printed when level is 'verbose'. */
  info: (msg: string) => void;
  warn: (msg: string) => void;
};

export type GlyphLayer = [codepoint: number, color: string];
export type GlyphEntry = [adv: number, layers: GlyphLayer[]];
export type IconsMap = Record<string, GlyphEntry>;

/**
 * m - metadata,
 *   f - font family,
 *   u - units per em,
 *   z - safe zone,
 *   s - start unicode,
 *   h - hash,
 *   l - linking mode: 's' (static, bundled — default when absent) or 'd' (dynamic, OTA-delivered),
 * i - icons,
 *   adv - advance width,
 */
export type NanoGlyphMap = {
  m: { f: string; u: number; z: number; s: number; h?: string; l?: 's' | 'd' };
  i: IconsMap;
};

/** Accepts JSON-inferred types where arrays aren't tuples. */
export type NanoGlyphMapInput = {
  m: {
    f: string;
    u: number;
    z: number;
    s: number;
    h?: string;
    l?: 's' | 'd' | (string & {});
  };
  i: Record<string, readonly unknown[]>;
};
