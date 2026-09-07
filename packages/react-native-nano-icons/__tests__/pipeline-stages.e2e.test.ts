/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { picoFromFile, PathKitManager } from '../src/core/pipeline/managers';
import { mergeSameColorPaths, type ParsedPath } from '../src/core/pipeline/run';
import {
  preprocessSvg,
  parseFlattenedSvg,
  validateSvg,
  extractOriginalEvenoddDs,
  restoreOriginalEvenoddDs,
} from '../src/core/svg/svg_dom';
import { convertEvenoddToWinding } from '../src/core/svg/svg_pathops';

const TESTICONS_DIR = path.resolve(
  __dirname,
  '../../../examples/BareReactNativeExample/assets/testicons'
);

const ICONS = fs
  .readdirSync(TESTICONS_DIR)
  .filter((f) => f.toLowerCase().endsWith('.svg'))
  .sort((a, b) => a.localeCompare(b));

type PathsSnapshot = {
  viewBox: number[];
  paths: {
    d: string;
    fill: string | null;
    fillRule: 'evenodd' | null;
    noMerge: boolean;
  }[];
};

type StageOutputs = {
  preprocessed: string;
  flattened: string;
  parsed: PathsSnapshot;
  restored: PathsSnapshot;
  converted: PathsSnapshot;
  merged: PathsSnapshot;
};

function snapshotPaths(viewBox: number[], paths: ParsedPath[]): PathsSnapshot {
  return {
    viewBox: [...viewBox],
    paths: paths.map((p) => ({
      d: p.d,
      fill: p.fill,
      fillRule: p.fillRule ?? null,
      noMerge: p.noMerge ?? false,
    })),
  };
}

// hand copied from runPipeline - if changes there, update this too
async function computeStages(file: string): Promise<StageOutputs> {
  const abs = path.join(TESTICONS_DIR, file);
  const raw = fs.readFileSync(abs, 'utf8');

  const validation = validateSvg(raw);
  if (validation.valid === false) {
    throw new Error(`validateSvg rejected ${file}: ${validation.reason}`);
  }

  const PathKit = await PathKitManager.getInstance();

  const preprocessed = preprocessSvg(raw);
  const originalEvenoddDs = extractOriginalEvenoddDs(preprocessed);

  const flattened = await picoFromFile(abs, preprocessed);

  const { viewBox, paths } = parseFlattenedSvg(flattened) as {
    viewBox: number[];
    paths: ParsedPath[];
  };
  const parsed = snapshotPaths(viewBox, paths);

  if (originalEvenoddDs.length > 0) {
    restoreOriginalEvenoddDs(paths, originalEvenoddDs);
  }
  const restored = snapshotPaths(viewBox, paths);

  for (const p of paths) {
    if (p.fillRule === 'evenodd') {
      p.d = convertEvenoddToWinding(PathKit, p.d);
      delete p.fillRule;
      p.noMerge = true;
    }
  }
  const converted = snapshotPaths(viewBox, paths);

  const merged = snapshotPaths(viewBox, mergeSameColorPaths(paths));

  return { preprocessed, flattened, parsed, restored, converted, merged };
}

test('testicons corpus is present', () => {
  expect(ICONS.length).toBeGreaterThan(0);
});

describe.each(ICONS)('pipeline stages golden — %s', (file) => {
  let stages: StageOutputs;

  beforeAll(async () => {
    stages = await computeStages(file);
  }, 180_000);

  test('after preprocessSvg', () => {
    expect(stages.preprocessed).toMatchSnapshot();
  });

  test('after picoFromFile', () => {
    expect(stages.flattened).toMatchSnapshot();
  });

  test('after parseFlattenedSvg', () => {
    expect(stages.parsed).toMatchSnapshot();
  });

  test('after restoreOriginalEvenoddDs', () => {
    expect(stages.restored).toMatchSnapshot();
  });

  test('after convertEvenoddToWinding', () => {
    expect(stages.converted).toMatchSnapshot();
  });

  test('after mergeSameColorPaths', () => {
    expect(stages.merged).toMatchSnapshot();
  });
});
