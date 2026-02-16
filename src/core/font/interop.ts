// src/core/font/interop.ts
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function pickExport<T = any>(mod: any, keys: string[] = []): T {
  if (mod == null) return mod as T;
  if (mod.default) return mod.default as T;
  for (const k of keys) if (mod[k]) return mod[k] as T;
  return mod as T;
}

export const SVGIcons2SVGFontStream = pickExport<any>(
  require("svgicons2svgfont"),
  ["SVGIcons2SVGFontStream"],
);

export const svg2ttf = pickExport<any>(require("svg2ttf"));

const fonteditor = pickExport<any>(require("fonteditor-core"), ["Font"]);
export const Font = fonteditor?.Font ?? fonteditor;
