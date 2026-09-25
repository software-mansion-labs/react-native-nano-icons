/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.mock('../src/core/pipeline/index');

import { buildAllFonts, type IconSetConfig } from '../cli/build';
import type { NanoLogger } from '../cli/logger';
import { getFingerprintSync } from '../src/utils/fingerPrint';
import * as packageVersionModule from '../src/utils/packageVersion';
import {
  fontToolchainVersions,
  packageVersion,
} from '../src/utils/packageVersion';
import { runFontPipeline } from '../src/core/pipeline/index';

const mockRunPipeline = runFontPipeline as jest.MockedFunction<
  typeof runFontPipeline
>;

const SAMPLE_SVG = '<svg viewBox="0 0 24 24"><path d="M0 0L24 24"/></svg>';
const FONT_FAMILY = 'TestFont';
const BUILT_FAMILY = `${FONT_FAMILY}-0123abcd`;
const STORED_FAMILY = `${FONT_FAMILY}-89efdcba`;
const DEFAULT_INPUTS = {
  upm: 1024,
  safeZone: 1020,
  startUnicode: 0xe900,
  version: packageVersion(),
  toolchain: fontToolchainVersions(),
};

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
  linking?: 'static' | 'dynamic',
  web?: boolean
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, `${fontFamily}.ttf`), 'fake');
  if (web) {
    fs.writeFileSync(path.join(outputDir, `${fontFamily}.woff2`), 'fake');
  }
  const m = {
    f: STORED_FAMILY,
    u: 1024,
    z: 1020,
    s: 0xe900,
    ...(hash !== undefined && { h: hash }),
    // only dynamic sets have l field, static have none
    ...(linking === 'dynamic' && { l: 'd' }),
    ...(web && { w: true }),
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
    inputHash = getFingerprintSync(inputDir, DEFAULT_INPUTS);

    mockRunPipeline.mockReset();
    mockRunPipeline.mockResolvedValue({
      ttfPath: path.join(outputDir, `${FONT_FAMILY}.ttf`),
      glyphmapPath: path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`),
      family: BUILT_FAMILY,
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

  test('a new font toolchain version rebuilds an otherwise unchanged set', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash);
    const toolchain = jest
      .spyOn(packageVersionModule, 'fontToolchainVersions')
      .mockReturnValue(
        fontToolchainVersions().map((entry) =>
          entry.startsWith('fonteditor-core@')
            ? 'fonteditor-core@999.0.0'
            : entry
        )
      );
    try {
      await buildAllFonts([makeIconSet()], os.tmpdir());
    } finally {
      toolchain.mockRestore();
    }
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
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

  test('stale outputs stay in place while runFontPipeline overwrites them', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, 'stale_hash_value');
    const ttfPath = path.join(outputDir, `${FONT_FAMILY}.ttf`);
    const glyphmapPath = path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`);

    let ttfExistedAtCallTime = false;
    let glyphmapExistedAtCallTime = false;

    mockRunPipeline.mockImplementation(async () => {
      ttfExistedAtCallTime = fs.existsSync(ttfPath);
      glyphmapExistedAtCallTime = fs.existsSync(glyphmapPath);
      return { ttfPath, glyphmapPath, family: BUILT_FAMILY };
    });

    await buildAllFonts([makeIconSet()], os.tmpdir());

    expect(ttfExistedAtCallTime).toBe(true);
    expect(glyphmapExistedAtCallTime).toBe(true);
  });

  test('stale outputs are deleted when the build fails', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, 'stale_hash_value');
    mockRunPipeline.mockRejectedValue(new Error('boom'));

    await expect(buildAllFonts([makeIconSet()], os.tmpdir())).rejects.toThrow();

    expect(fs.existsSync(path.join(outputDir, `${FONT_FAMILY}.ttf`))).toBe(
      false
    );
    expect(
      fs.existsSync(path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`))
    ).toBe(false);
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

  test('a built set reports the family returned by the pipeline', async () => {
    const [built] = await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(built!.family).toBe(BUILT_FAMILY);
  });

  test('a skipped set reports the family stored in its glyphmap', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash);
    const [built] = await buildAllFonts([makeIconSet()], os.tmpdir());
    expect(built!.family).toBe(STORED_FAMILY);
  });

  test('changing the config rebuilds despite unchanged SVGs', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash);
    await buildAllFonts([{ ...makeIconSet(), upm: 512 }], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
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
    inputHash = getFingerprintSync(inputDir, DEFAULT_INPUTS);

    mockRunPipeline.mockReset();
    mockRunPipeline.mockResolvedValue({
      ttfPath: path.join(outputDir, `${FONT_FAMILY}.ttf`),
      glyphmapPath: path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`),
      family: BUILT_FAMILY,
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

describe('buildAllFonts — web output', () => {
  let inputDir: string;
  let outputDir: string;
  let inputHash: string;
  let ttfPath: string;
  let glyphmapPath: string;
  let woff2Path: string;

  beforeEach(() => {
    inputDir = makeTmpDir();
    outputDir = makeTmpDir();
    writeSvgs(inputDir);
    inputHash = getFingerprintSync(inputDir, DEFAULT_INPUTS);
    ttfPath = path.join(outputDir, `${FONT_FAMILY}.ttf`);
    glyphmapPath = path.join(outputDir, `${FONT_FAMILY}.glyphmap.json`);
    woff2Path = path.join(outputDir, `${FONT_FAMILY}.woff2`);

    mockRunPipeline.mockReset();
    mockRunPipeline.mockImplementation(async (config) => ({
      ttfPath,
      glyphmapPath,
      family: BUILT_FAMILY,
      ...(config.web ? { woff2Path } : {}),
    }));
  });

  afterEach(() => {
    fs.rmSync(inputDir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  function makeIconSet(web?: boolean): IconSetConfig {
    return { inputDir, outputDir, fontFamily: FONT_FAMILY, web };
  }

  test('web defaults to false and yields no woff2Path', async () => {
    const [built] = await buildAllFonts([makeIconSet()], os.tmpdir());

    expect(built!.woff2Path).toBeUndefined();
    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ web: false }),
      expect.anything(),
      expect.anything()
    );
  });

  test('web: true is forwarded to runFontPipeline and reflected in BuiltFont', async () => {
    const [built] = await buildAllFonts([makeIconSet(true)], os.tmpdir());

    expect(built!.woff2Path).toBe(woff2Path);
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ web: true }),
      expect.anything(),
      expect.anything()
    );
  });

  test('an up-to-date web set is skipped and still reports its woff2Path', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash, 'static', true);

    const [built] = await buildAllFonts([makeIconSet(true)], os.tmpdir());

    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(built!.woff2Path).toBe(woff2Path);
  });

  test('a matching hash without m.w rebuilds when web is enabled', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash);
    await buildAllFonts([makeIconSet(true)], os.tmpdir());
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  test('a matching hash with m.w but no .woff2 file rebuilds', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash, 'static', true);
    fs.unlinkSync(woff2Path);

    await buildAllFonts([makeIconSet(true)], os.tmpdir());

    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  test('dropping web rebuilds and removes the stale .woff2 before the pipeline runs', async () => {
    writeFakeOutputs(outputDir, FONT_FAMILY, inputHash, 'static', true);

    let woff2ExistedAtCallTime = true;
    mockRunPipeline.mockImplementation(async () => {
      woff2ExistedAtCallTime = fs.existsSync(woff2Path);
      return { ttfPath, glyphmapPath, family: BUILT_FAMILY };
    });

    const [built] = await buildAllFonts([makeIconSet(false)], os.tmpdir());

    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
    expect(woff2ExistedAtCallTime).toBe(false);
    expect(built!.woff2Path).toBeUndefined();
  });

  test('a failing web build deletes the .woff2 with the other outputs', async () => {
    writeFakeOutputs(
      outputDir,
      FONT_FAMILY,
      'stale_hash_value',
      'static',
      true
    );
    mockRunPipeline.mockRejectedValue(new Error('boom'));

    await expect(
      buildAllFonts([makeIconSet(true)], os.tmpdir())
    ).rejects.toThrow();

    expect(fs.existsSync(ttfPath)).toBe(false);
    expect(fs.existsSync(glyphmapPath)).toBe(false);
    expect(fs.existsSync(woff2Path)).toBe(false);
  });
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
        family: 'Other-0123abcd',
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

describe('buildAllFonts — safeZone follows upm', () => {
  let inputDir: string;
  let outputDir: string;

  beforeEach(() => {
    inputDir = makeTmpDir();
    outputDir = makeTmpDir();
    writeSvgs(inputDir);
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

  async function pipelineConfigFor(extra: Partial<IconSetConfig>) {
    await buildAllFonts(
      [{ inputDir, outputDir, fontFamily: FONT_FAMILY, ...extra }],
      os.tmpdir()
    );
    return mockRunPipeline.mock.calls[0]![0];
  }

  test('the default upm keeps the default safeZone of 1020', async () => {
    expect(await pipelineConfigFor({})).toMatchObject({
      upm: 1024,
      safeZone: 1020,
    });
  });

  test('a custom upm scales the default safeZone', async () => {
    expect(await pipelineConfigFor({ upm: 512 })).toMatchObject({
      upm: 512,
      safeZone: 510,
    });
    mockRunPipeline.mockClear();
    expect(await pipelineConfigFor({ upm: 2048 })).toMatchObject({
      upm: 2048,
      safeZone: 2040,
    });
  });

  test('an explicit safeZone is kept', async () => {
    expect(await pipelineConfigFor({ upm: 512, safeZone: 480 })).toMatchObject({
      upm: 512,
      safeZone: 480,
    });
  });

  test('a safeZone larger than upm fails before building', async () => {
    await expect(
      buildAllFonts(
        [
          {
            inputDir,
            outputDir,
            fontFamily: FONT_FAMILY,
            upm: 512,
            safeZone: 1020,
          },
        ],
        os.tmpdir()
      )
    ).rejects.toThrow(
      '[react-native-nano-icons] safeZone (1020) of "TestFont" must not exceed upm (512).'
    );
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });
});
