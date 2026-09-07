import type { PathKitModule } from '../pathkit/types';
import { createPathOps } from './pathops';
import { PicoSVG } from './svg';

export function flattenSvg(svgContent: string, pathkit: PathKitModule): string {
  const ops = createPathOps(pathkit);
  const svg = PicoSVG.fromString(svgContent, ops);
  svg.topicosvg();
  return svg.toString();
}

export { PicoSVG } from './svg';
export { createPathOps, PathOpsError, type PathOps } from './pathops';
