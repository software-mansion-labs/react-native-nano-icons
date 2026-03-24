/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.mock('../src/core/pipeline/index.js');

import { buildAllFonts, type IconSetConfig } from '../cli/build';
import { getFingerprintSync } from '../src/utils/fingerPrint';
import { runPipeline } from '../src/core/pipeline/index';

const mockRunPipeline = runPipeline as jest.MockedFunction<typeof runPipeline>;

const SAMPLE_SVG = '<svg viewBox="0 0 24 24"><path d="M0 0L24 24"/></svg>';
const FONT_FAMILY = 'TestFont';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nano-build-'));
}

function writeSvgs(dir: string): void {
  fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
}

function writeFakeOutputs(
  outputDir: string,
  fontFamily: string,
  hash?: string
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, `${fontFamily}.ttf`), 'fake');
  const m = {
    f: fontFamily,
    u: 1024,
    z: 1020,
    s: 0xe900,
    ...(hash !== undefined && { h: hash }),
  };
  fs.writeFileSync(
    path.join(outputDir, `${fontFamily}.glyphmap.json`),
    JSON.stringify({ m, i: {} })
  );
}

describe('buildAllFonts — skip/rebuild logic', () => {
  let inputDir: string;
  let outputDir: string;
  let inputHash: string;

  beforeEach(() => {
    inputDir = makeTmpDir();
    outputDir = makeTmpDir();
    writeSvgs(inputDir);
    inputHash = getFingerprintSync(inputDir);

    mockRunPipeline.mockReset();
    mockRunPipeline.mockResolvedValue({
      ttfPath: path.join(outputDir, `${FONT_FAMILY}.ttf`),
      glyphmapPath: path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`),
    });
  });

  afterEach(() => {
    fs.rmSync(inputDir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  function makeIconSet(): IconSetConfig {
    return { inputDir, outputDir, fontFamily: FONT_FAMILY };
  }

  test('runPipeline is called when no output files exist', async () => {
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  test('runPipeline is not called when output files exist with matching hash', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash);
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  test('runPipeline is called when output files exist with non-matching hash', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, 'stale_hash_value');
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  test('stale TTF and glyphmap are deleted before runPipeline is called', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, 'stale_hash_value');
    const ttfPath = path.join(outputDir, `${FONT_FAMILY}.ttf`);
    const glyphmapPath = path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`);

    let ttfExistedAtCallTime = true;
    let glyphmapExistedAtCallTime = true;

    mockRunPipeline.mockImplementation(async () => {
      ttfExistedAtCallTime = fs.existsSync(ttfPath);
      glyphmapExistedAtCallTime = fs.existsSync(glyphmapPath);
      return { ttfPath, glyphmapPath };
    });

    await buildAllFonts([makeIconSet()], os.tmpdir());

    expect(ttfExistedAtCallTime).toBe(false);
    expect(glyphmapExistedAtCallTime).toBe(false);
  });

  test('runPipeline is called when output files exist but meta.hash is absent', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY); // no hash argument
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  test('inputHash is passed to runPipeline', async () => {
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ inputHash })
    );
  });
});
