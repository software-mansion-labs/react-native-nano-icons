/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  runFontPipeline,
  type PipelineConfig,
} from '../src/core/pipeline/index';
import type { NanoGlyphMap } from '../src/core/types';

const TESTICONS_DIR = path.resolve(
  __dirname,
  '../../../examples/BareReactNativeExample/assets/testicons'
);
const ICONS = ['usFlag.svg', 'person-walking.svg', 'star.svg'];

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

async function build(options: Partial<PipelineConfig>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-options-'));
  dirs.push(root);
  const inputDir = path.join(root, 'in');
  fs.mkdirSync(inputDir);
  for (const icon of ICONS) {
    fs.copyFileSync(path.join(TESTICONS_DIR, icon), path.join(inputDir, icon));
  }
  const result = await runFontPipeline(
    {
      fontFamily: 'Options',
      upm: 1024,
      safeZone: 1024,
      startUnicode: 0xe900,
      linking: 'static',
      ...options,
    },
    {
      inputDir,
      outputDir: path.join(root, 'out'),
      tempDir: path.join(root, 'tmp'),
    }
  );
  return {
    glyphMap: JSON.parse(
      fs.readFileSync(result.glyphmapPath, 'utf8')
    ) as NanoGlyphMap,
    ttfSize: fs.statSync(result.ttfPath).size,
  };
}

const advances = ({ glyphMap }: { glyphMap: NanoGlyphMap }) =>
  Object.fromEntries(
    Object.entries(glyphMap.i).map(([name, [adv]]) => [name, adv])
  );

test('a lower curveTolerance stores more curve segments', async () => {
  const standard = await build({});
  const fine = await build({ curveTolerance: 1 / 8192 });
  expect(fine.ttfSize).toBeGreaterThan(standard.ttfSize);
  expect(advances(fine)).toEqual(advances(standard));
});
