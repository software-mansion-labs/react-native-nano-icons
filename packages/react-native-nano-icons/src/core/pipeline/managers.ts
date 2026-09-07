import fs from 'node:fs/promises';
import { loadPathKit } from '../pathkit/load';
import { flattenSvg } from '../flatten/index';

export async function picoFromFile(
  hostFilePath: string,
  content?: string
): Promise<string> {
  const PathKit = await loadPathKit();
  const svgContent = content ?? (await fs.readFile(hostFilePath, 'utf-8'));
  return flattenSvg(svgContent, PathKit);
}
