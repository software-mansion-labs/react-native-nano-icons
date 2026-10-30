/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { flattenSvg } from '../src/core/flatten/index';
import { loadPathKit } from '../src/core/pathkit/load';
import { mergeSameColorPaths } from '../src/core/glyph/merge';
import { parseFlattenedSvg, type ParsedPath } from '../src/core/glyph/parse';
import { preprocessSvg, validateSvg } from '../src/core/glyph/validate';

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
  }[];
};

type StageOutputs = {
  preprocessed: string;
  flattened: string;
  parsed: PathsSnapshot;
  merged: PathsSnapshot;
};

function snapshotPaths(viewBox: number[], paths: ParsedPath[]): PathsSnapshot {
  return {
    viewBox: [...viewBox],
    paths: paths.map((p) => ({
      d: p.d,
      fill: p.fill,
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

  const PathKit = await loadPathKit();

  const preprocessed = preprocessSvg(raw);

  const flattened = flattenSvg(preprocessed, PathKit);

  const { viewBox, paths } = parseFlattenedSvg(flattened) as {
    viewBox: number[];
    paths: ParsedPath[];
  };
  const parsed = snapshotPaths(viewBox, paths);

  const merged = snapshotPaths(viewBox, mergeSameColorPaths(paths, PathKit));

  return { preprocessed, flattened, parsed, merged };
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

  test('after flattenSvg', () => {
    expect(stages.flattened).toMatchSnapshot();
  });

  test('after parseFlattenedSvg', () => {
    expect(stages.parsed).toMatchSnapshot();
  });

  test('after mergeSameColorPaths', () => {
    expect(stages.merged).toMatchSnapshot();
  });
});
