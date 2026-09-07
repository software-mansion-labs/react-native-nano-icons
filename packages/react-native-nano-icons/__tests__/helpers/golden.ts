// Corpus + pipeline harness for the golden e2e tests: one named fixture per SVG

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runFontPipeline } from '../../src/core/pipeline/index';
import type { NanoGlyphMap, NanoLogger } from '../../src/core/types';

const TEST_ICONS = path.resolve(__dirname, '../../test_icons');

export type CorpusIcon = {
  feature: string;
  abs: string;
  file: string;
  name: string;
  expectRejected?: boolean;
};

function icon(
  feature: string,
  rel: string,
  expectRejected = false
): CorpusIcon {
  const file = path.basename(rel);
  return {
    feature,
    abs: path.join(TEST_ICONS, rel),
    file,
    name: file.replace(/\.svg$/i, ''),
    expectRejected,
  };
}

export const CURATED: CorpusIcon[] = [
  icon('outline', 'swm_icons/outline/Air.svg'),
  icon('outline', 'swm_icons/outline/Alarm.svg'),
  icon('outline', 'swm_icons/outline/ArrowCircleDown.svg'),
  icon('duotone', 'swm_icons/duotone/Alarm.svg'),
  icon('duotone', 'swm_icons/duotone/Dislike.svg'),
  icon('duotone', 'swm_icons/duotone/EyeOpen.svg'),
  icon('curved', 'swm_icons/curved/Air.svg'),
  icon('curved', 'swm_icons/curved/Alarm.svg'),
  icon('broken', 'swm_icons/broken/Air.svg'),
  icon('broken', 'swm_icons/broken/Alarm.svg'),
  icon('evenodd', 'material_icons/baseline/barcode.svg'),
  icon('evenodd', 'material_icons/baseline/qrcode.svg'),
  icon('opacity', 'material_icons/twotone/10k.svg'),
  icon('clippath', 'clippath/teest.svg'),
  icon('sanitize', 'sanatize_examples/elephant.svg'),
  icon('nested', 'nested/swm-walker.svg'),
  icon('nested', 'nested/swm-walker-overlay.svg'),
];

export const REJECTED: CorpusIcon[] = [icon('mask', 'mask/Avatar.svg', true)];

export const PIPELINE = {
  upm: 1000,
  safeZone: 800,
  startUnicode: 0xe000,
  linking: 'static',
} as const;

export type RunResult = {
  glyphmap: NanoGlyphMap;
  ttfPath: string;
  outputDir: string;
  tempDir: string;
  warnings: string[];
};

function quietLogger(warnings: string[]): NanoLogger {
  return {
    start: () => {},
    update: () => {},
    succeed: () => {},
    fail: () => {},
    info: () => {},
    warn: (msg) => warnings.push(msg),
  };
}

export async function runOnIcons(opts: {
  fontFamily: string;
  icons: { abs: string; file: string }[];
}): Promise<RunResult> {
  const inputDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-gold-in-'));
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-gold-out-'));
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nano-gold-tmp-'));
  const warnings: string[] = [];

  try {
    // codepoints follow readdir order, so copy sorted to keep runs deterministic
    const sorted = [...opts.icons].sort((a, b) => a.file.localeCompare(b.file));
    for (const { abs, file } of sorted) {
      await fsp.copyFile(abs, path.join(inputDir, file));
    }

    await runFontPipeline(
      { ...PIPELINE, fontFamily: opts.fontFamily },
      { inputDir, outputDir, tempDir },
      { logger: quietLogger(warnings) }
    );

    const glyphmap = JSON.parse(
      await fsp.readFile(
        path.join(outputDir, `${opts.fontFamily}.glyphmap.json`),
        'utf8'
      )
    ) as NanoGlyphMap;

    return {
      glyphmap,
      ttfPath: path.join(outputDir, `${opts.fontFamily}.ttf`),
      outputDir,
      tempDir,
      warnings,
    };
  } finally {
    await fsp.rm(inputDir, { recursive: true, force: true });
  }
}

export function cleanup(...dirs: (string | undefined)[]): void {
  for (const dir of dirs) {
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
