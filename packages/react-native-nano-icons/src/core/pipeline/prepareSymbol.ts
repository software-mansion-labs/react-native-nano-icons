import path from 'node:path';

import { shouldSkipPath } from '../glyph/parse';
import type { PathKitModule } from '../pathkit/types';
import { symbolsetContentsJson } from '../symbols/contents';
import { contentBounds, resolveSymbolLayers } from '../symbols/layers';
import { buildSymbolTemplate } from '../symbols/template';
import { buildVectorDrawableXml } from '../symbols/vectorDrawable';
import { collectingLogger, type IconLog } from './prepareIcon';
import { prepareSvgLayers } from './prepare';

export type SymbolTask = {
  kind: 'symbol';
  file: string;
  filePath: string;
  setName: string;
  prefix: string;
};

export type SymbolAsset = {
  assetName: string;
  assetDirName: string;
  svgFilename: string;
  svg: string;
  contents: string;
  vdXml: string;
  vdOriginalXml: string;
};

export type SymbolResult = {
  file: string;
  iconName: string;
  asset: SymbolAsset | null;
  logs: IconLog[];
  error: string | null;
};

export async function prepareSymbol(
  task: SymbolTask,
  pathkit: PathKitModule
): Promise<SymbolResult> {
  const logs: IconLog[] = [];
  const logger = collectingLogger(logs);
  const iconName = path.parse(task.file).name;
  const fileLabel = `${task.setName}:${task.file}`;
  const result: SymbolResult = {
    file: task.file,
    iconName,
    asset: null,
    logs,
    error: null,
  };

  logger.info(`Processing ${task.file}`);

  let prepared;
  try {
    prepared = await prepareSvgLayers({
      filePath: task.filePath,
      fileLabel,
      pathkit,
      logger,
      tagKnockouts: true,
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
  if (!prepared) return result;

  const drawable = prepared.paths.filter((p) => !shouldSkipPath(p.d, p.fill));

  if (drawable.length === 0) {
    logger.warn(`Skipping "${fileLabel}": no drawable paths`);
    return result;
  }

  const assetName = `${task.prefix}.${iconName}`;
  const svgFilename = `${assetName}.svg`;

  const { layers, monochrome } = resolveSymbolLayers(pathkit, drawable, {
    onKnockoutLayer: () =>
      logger.info(
        `    ⊖ Knockout layer: hole in monochrome, own fill in original`
      ),
  });
  const bounds =
    contentBounds(
      pathkit,
      layers.map((l) => l.d)
    ) ?? undefined;
  result.asset = {
    assetName,
    assetDirName: `${assetName}.symbolset`,
    svgFilename,
    svg: buildSymbolTemplate({
      layers,
      viewBox: prepared.viewBox,
      contentBounds: bounds,
      descriptiveName: assetName,
      logger,
    }),
    contents: symbolsetContentsJson(svgFilename),
    vdXml: buildVectorDrawableXml({
      layers: [{ d: monochrome, fill: null }],
      viewBox: prepared.viewBox,
      contentBounds: bounds,
    }),
    vdOriginalXml: buildVectorDrawableXml({
      layers,
      viewBox: prepared.viewBox,
      contentBounds: bounds,
    }),
  };

  return result;
}
