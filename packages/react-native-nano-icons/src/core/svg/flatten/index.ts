// TypeScript port of picosvg's topicosvg() (Apache-2.0, Copyright 2020 Google LLC)
// backed by PathKit instead of Pyodide + skia-pathops.

import type { PathKitModule } from '../../types.js';
import { createPathOps } from './pathops.js';
import { PicoSVG } from './svg.js';

export function flattenSvg(svgContent: string, pathkit: PathKitModule): string {
  const ops = createPathOps(pathkit);
  const svg = PicoSVG.fromString(svgContent, ops);
  svg.topicosvg();
  return svg.toString();
}

export { PicoSVG } from './svg.js';
export { createPathOps, PathOpsError, type PathOps } from './pathops.js';
