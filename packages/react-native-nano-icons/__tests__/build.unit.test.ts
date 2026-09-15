/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.mock('../src/core/pipeline/index');

import { buildAllFonts, type IconSetConfig } from '../cli/build';
import type { NanoLogger } from '../cli/logger';
import { getFingerprintSync } from '../src/utils/fingerPrint';
import { runFontPipeline } from '../src/core/pipeline/index';

const mockRunPipeline = runFontPipeline as jest.MockedFunction<
  typeof runFontPipeline
>;

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
  hash?: string,
  linking?: 'static' | 'dynamic'
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, `${fontFamily}.ttf`), 'fake');
  const m = {
    f: fontFamily,
    u: 1024,
    z: 1020,
    s: 0xe900,
    ...(hash !== undefined && { h: hash }),
    // only dynamic sets have l field, static have none
    ...(linking === 'dynamic' && { l: 'd' }),
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

  test('runFontPipeline is called when no output files exist', async () => {
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  test('runFontPipeline is not called when output files exist with matching hash', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash);
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  test('a set that is already up to date still reports itself', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash);
    const glyphmapPath = path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`);
    const glyphmap = JSON.parse(fs.readFileSync(glyphmapPath, 'utf8'));
    glyphmap.i = { a: [0, []], b: [0, []] };
    fs.writeFileSync(glyphmapPath, JSON.stringify(glyphmap));

    const reported: string[] = [];
    const logger: NanoLogger = {
      start: () => {},
      update: () => {},
      succeed: (msg) => reported.push(msg),
      info: () => {},
      warn: () => {},
      fail: () => {},
    };

    await buildAllFonts([makeIconSet()], os.tmpdir(), { logger });

    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(reported).toContain('TestFont.ttf is up to date [2 icons]');
  });

  test('a single cached icon is not pluralised', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash);
    const glyphmapPath = path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`);
    const glyphmap = JSON.parse(fs.readFileSync(glyphmapPath, 'utf8'));
    glyphmap.i = { a: [0, []] };
    fs.writeFileSync(glyphmapPath, JSON.stringify(glyphmap));

    const reported: string[] = [];
    await buildAllFonts([makeIconSet()], os.tmpdir(), {
      logger: {
        start: () => {},
        update: () => {},
        succeed: (msg) => reported.push(msg),
        info: () => {},
        warn: () => {},
        fail: () => {},
      },
    });

    expect(reported).toContain('TestFont.ttf is up to date [1 icon]');
  });

  test('runFontPipeline is called when output files exist with non-matching hash', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, 'stale_hash_value');
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  test('stale TTF and glyphmap are deleted before runFontPipeline is called', async () => {
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

  test('runFontPipeline is called when output files exist but meta.hash is absent', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY); // no hash argument
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  test('inputHash is passed to runFontPipeline', async () => {
    await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ inputHash })
    );
  });
});

describe('buildAllFonts — linking mode', () => {
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

  function makeIconSet(linking?: 'static' | 'dynamic'): IconSetConfig {
    return { inputDir, outputDir, fontFamily: FONT_FAMILY, linking };
  }

  test('linking defaults to "static" when omitted', async () => {
    const [built] = await buildAllFonts([makeIconSet()], os.tmpdir());

    expect(built!.linking).toBe('static');
    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ linking: 'static' }),
      expect.anything(),
      expect.anything()
    );
  });

  test('linking "dynamic" is forwarded to runFontPipeline and reflected in BuiltFont', async () => {
    const [built] = await buildAllFonts([makeIconSet('dynamic')], os.tmpdir());

    expect(built!.linking).toBe('dynamic');
    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ linking: 'dynamic' }),
      expect.anything(),
      expect.anything()
    );
  });

  test('unchanged dynamic build (matching hash + l:"d") is skipped', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash, 'dynamic');

    const [built] = await buildAllFonts([makeIconSet('dynamic')], os.tmpdir());

    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(built!.linking).toBe('dynamic');
  });

  // Changing only the linking mode (SVGs unchanged → matching hash) must still
  // rebuild, otherwise the stored glyphmap keeps the wrong l value
  test.each([
    ['static', 'dynamic'],
    ['dynamic', 'static'],
  ] as const)(
    'switching %s → %s rebuilds despite a matching hash',
    async (from, to) => {
      writeFakeOutputs(outputDir, FONT_FAMILY, inputHash, from);
      await buildAllFonts([makeIconSet(to)], os.tmpdir());
      expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    }
  );
});

describe('buildAllFonts — failure reporting', () => {
  let inputDir: string;
  let outputDir: string;

  beforeEach(() => {
    inputDir = makeTmpDir();
    outputDir = makeTmpDir();
    writeSvgs(inputDir);
    mockRunPipeline.mockReset();
  });

  afterEach(() => {
    fs.rmSync(inputDir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  function collectingLogger(failed: string[]): NanoLogger {
    return {
      start: () => {},
      update: () => {},
      succeed: () => {},
      info: () => {},
      warn: () => {},
      fail: (msg) => failed.push(msg),
    };
  }

  test('a failing set is reported as it fails, not once the run is over', async () => {
    const failed: string[] = [];
    const summary =
      '2 of 3 icons in [TestFont] could not be converted: a.svg, b.svg';
    mockRunPipeline.mockRejectedValue(new Error(summary));

    await expect(
      buildAllFonts(
        [{ inputDir, outputDir, fontFamily: FONT_FAMILY }],
        os.tmpdir(),
        {
          logger: collectingLogger(failed),
        }
      )
    ).rejects.toThrow('1 icon set failed to build: TestFont');

    expect(failed).toEqual([summary]);
  });

  test('several failing sets are named together', async () => {
    const otherDir = makeTmpDir();
    writeSvgs(otherDir);
    mockRunPipeline.mockRejectedValue(new Error('boom'));

    await expect(
      buildAllFonts(
        [
          { inputDir, outputDir, fontFamily: FONT_FAMILY },
          { inputDir: otherDir, outputDir, fontFamily: 'Other' },
        ],
        os.tmpdir(),
        { logger: collectingLogger([]) }
      )
    ).rejects.toMatchObject({
      message: '2 icon sets failed to build: TestFont, Other',
      built: [],
    });
    fs.rmSync(otherDir, { recursive: true, force: true });
  });

  test('a failing set does not stop the sets after it, and the error carries what built', async () => {
    const otherDir = makeTmpDir();
    writeSvgs(otherDir);
    mockRunPipeline
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        ttfPath: path.join(outputDir, 'Other.ttf'),
        glyphmapPath: path.join(outputDir, 'Other.glyphmap.json'),
      });

    await expect(
      buildAllFonts(
        [
          { inputDir, outputDir, fontFamily: FONT_FAMILY },
          { inputDir: otherDir, outputDir, fontFamily: 'Other' },
        ],
        os.tmpdir(),
        { logger: collectingLogger([]) }
      )
    ).rejects.toMatchObject({
      message: '1 icon set failed to build: TestFont',
      built: [expect.objectContaining({ fontFamily: 'Other' })],
    });

    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
    fs.rmSync(otherDir, { recursive: true, force: true });
  });
});
