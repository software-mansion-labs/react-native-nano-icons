import path from 'path';
import fs from 'fs';
import { inspect } from 'util';
import {
  runFontPipeline,
  type PreparedSvgCache,
  type SvgWorkerPool,
} from '../src/core/pipeline/index';
import { QUADRATIC_ERROR_BOUND_EM } from '../src/core/font/quadratic';
import type { NanoGlyphMap } from '../src/core/types';
import type { NanoLogger } from './logger';
import { staleLinkedFont } from './link';
import { buildsSameOutputs } from './sameOutputs';
import { fingerprintSvgDirSync } from '../src/utils/fingerPrint';
import {
  fontToolchainVersions,
  packageVersion,
} from '../src/utils/packageVersion';

export type IconSetConfig = {
  /** Path to folder of SVG files (relative to project root). */
  inputDir: string;
  /** Font family name (used for TTF and glyphmap filenames). */
  fontFamily?: string;
  /** Path where .ttf and .glyphmap.json will be saved. Defaults to a sibling nanoicons folder relative to inputDir. */
  outputDir?: string;
  /** Units per em (default 1024). */
  upm?: number;
  /** Safe zone inside UPM for glyphs (default upm * 1020 / 1024, i.e. 1020 at the default upm). Must not exceed upm. */
  safeZone?: number;
  /** Max distance between the font's quadratic curves and the SVG curves, as a fraction of the em (default 1/512). Must be positive. */
  curveTolerance?: number;
  /** First Unicode codepoint for glyphs (default 0xe900). Hex string or number. */
  startUnicode?: number | string;
  /** Linking type for the font (default 'static'). Static bundles the TTF, dynamic delivers it via OTA*/
  linking?: 'static' | 'dynamic';
  /** Also emit <fontFamily>.woff2 into outputDir for web (default false). Rebuilt with the TTF, never linked natively. */
  web?: boolean;
};

export type BuiltFont = {
  fontFamily: string;
  family: string;
  ttfPath: string;
  glyphmapPath: string;
  linking: 'static' | 'dynamic';
  woff2Path?: string;
};

export class IconSetBuildError extends Error {
  built: BuiltFont[];

  constructor(message: string, built: BuiltFont[]) {
    super(message);
    this.built = built;
  }
}

const DEFAULT_SAFE_ZONE_RATIO = 1;
const DEFAULT_UPM = 1024;
const DEFAULT_START_UNICODE = 0xe900;

type WebOutput = 'required' | 'forbidden' | 'ignored';

function webOutputFor(configured: boolean, withWeb: boolean): WebOutput {
  if (!configured) return 'forbidden';
  if (withWeb) return 'required';
  return 'ignored';
}

export type StaleSet = { name: string; reason: string };

const STALE_REASON = {
  missing: (file: string) => `${file} is missing`,
  invalidJson: (file: string) => `${file} is not valid JSON`,
  incomplete: (file: string) => `${file} is incomplete`,
  inputsChanged: 'its SVGs, options or installed versions changed',
  linkingChanged: (linking: 'static' | 'dynamic') =>
    `its linking changed to "${linking}"`,
  webOutputChanged: (enabled: boolean) =>
    `web output was turned ${enabled ? 'on' : 'off'}`,
} as const;

type OutputState = { family: string } | { staleBecause: string };

function currentOutput(set: ResolvedIconSet, logger?: NanoLogger): OutputState {
  const { fontFamily, ttfPath, glyphmapPath, woff2Path, webOutput } = set;
  const missing = [
    ttfPath,
    glyphmapPath,
    ...(webOutput === 'required' ? [woff2Path] : []),
  ].find((file) => !fs.existsSync(file));
  if (missing) {
    return { staleBecause: STALE_REASON.missing(path.basename(missing)) };
  }

  let glyphmap: NanoGlyphMap;
  try {
    glyphmap = JSON.parse(fs.readFileSync(glyphmapPath, 'utf8'));
  } catch {
    return {
      staleBecause: STALE_REASON.invalidJson(path.basename(glyphmapPath)),
    };
  }
  const storedHash: string | undefined = glyphmap?.m?.h;
  const storedFamily: string | undefined = glyphmap?.m?.f;
  const storedLinking: 'static' | 'dynamic' =
    glyphmap?.m?.l === 'd' ? 'dynamic' : 'static';
  const storedWeb = glyphmap?.m?.w === true;

  if (!storedHash || !storedFamily) {
    return {
      staleBecause: STALE_REASON.incomplete(path.basename(glyphmapPath)),
    };
  }
  if (storedHash !== set.inputHash) {
    return { staleBecause: STALE_REASON.inputsChanged };
  }
  if (storedLinking !== set.linking) {
    return { staleBecause: STALE_REASON.linkingChanged(set.linking) };
  }
  if (webOutput !== 'ignored' && storedWeb !== (webOutput === 'required')) {
    return { staleBecause: STALE_REASON.webOutputChanged(!storedWeb) };
  }

  const iconCount = Object.keys(glyphmap?.i ?? {}).length;
  logger?.succeed(
    `${fontFamily}.ttf is up to date [${iconCount} icon${
      iconCount === 1 ? '' : 's'
    }]`
  );
  return { family: storedFamily };
}

type ResolvedIconSet = {
  fontFamily: string;
  inputDir: string;
  outputDir: string;
  ttfPath: string;
  glyphmapPath: string;
  woff2Path: string;
  linking: 'static' | 'dynamic';
  web: boolean;
  webOutput: WebOutput;
  config: {
    fontFamily: string;
    upm: number;
    safeZone: number;
    curveTolerance: number;
    startUnicode: number;
    linking: 'static' | 'dynamic';
    web: boolean;
  };
  inputHash: string;
  svgHashByFile: Map<string, string>;
};

function resolveIconSet(
  set: IconSetConfig,
  projectRoot: string,
  withWeb: boolean,
  versions: { version: string; toolchain: readonly string[] }
): ResolvedIconSet {
  const inputDir = path.resolve(projectRoot, set.inputDir);
  const fontFamily = set.fontFamily ?? path.basename(inputDir);
  const linking: 'static' | 'dynamic' = set.linking ?? 'static';
  const web = (set.web ?? false) && withWeb;
  const webOutput = webOutputFor(set.web ?? false, withWeb);

  if (!fs.existsSync(inputDir)) {
    throw new Error(
      `[react-native-nano-icons] Input directory does not exist: ${inputDir} (from "${set.inputDir}")`
    );
  }

  const upm = set.upm ?? DEFAULT_UPM;
  const safeZone = set.safeZone ?? Math.round(upm * DEFAULT_SAFE_ZONE_RATIO);
  if (safeZone > upm) {
    throw new Error(
      `[react-native-nano-icons] safeZone (${safeZone}) of "${fontFamily}" must not exceed upm (${upm}).`
    );
  }
  const curveTolerance = set.curveTolerance ?? QUADRATIC_ERROR_BOUND_EM;
  if (!Number.isFinite(curveTolerance) || curveTolerance <= 0) {
    throw new Error(
      `[react-native-nano-icons] curveTolerance (${inspect(curveTolerance)}) of "${fontFamily}" must be a positive number.`
    );
  }

  const outputDir = set.outputDir
    ? path.resolve(projectRoot, set.outputDir)
    : path.join(path.dirname(inputDir), 'nanoicons');

  const config = {
    fontFamily,
    upm,
    safeZone,
    curveTolerance,
    startUnicode:
      set.startUnicode !== undefined
        ? typeof set.startUnicode === 'string'
          ? parseInt(set.startUnicode, 16)
          : set.startUnicode
        : DEFAULT_START_UNICODE,
    linking,
    web,
  };

  const { hash: inputHash, svgHashByFile } = fingerprintSvgDirSync(inputDir, {
    upm: config.upm,
    safeZone: config.safeZone,
    curveTolerance: config.curveTolerance,
    startUnicode: config.startUnicode,
    ...versions,
  });

  return {
    fontFamily,
    inputDir,
    outputDir,
    ttfPath: path.join(outputDir, `${fontFamily}.ttf`),
    glyphmapPath: path.join(outputDir, `${fontFamily}.glyphmap.json`),
    woff2Path: path.join(outputDir, `${fontFamily}.woff2`),
    linking,
    web,
    webOutput,
    config,
    inputHash,
    svgHashByFile,
  };
}

async function familyIfBuiltTheSame(
  set: ResolvedIconSet
): Promise<string | undefined> {
  const same = await buildsSameOutputs(
    set.outputDir,
    path.basename(set.glyphmapPath),
    (outputDir) =>
      runFontPipeline(
        set.config,
        { inputDir: set.inputDir, outputDir, tempDir: outputDir },
        { inputHash: set.inputHash, svgHashByFile: set.svgHashByFile }
      )
  );
  return same
    ? JSON.parse(fs.readFileSync(set.glyphmapPath, 'utf8')).m.f
    : undefined;
}

/**
 * The input fingerprint of each icon set: the value a build stores in its glyphmap as `m.h`.
 */
export function fingerprintIconSets(
  iconSets: IconSetConfig[],
  projectRoot: string
): { fontFamily: string; hash: string }[] {
  const versions = {
    version: packageVersion(),
    toolchain: fontToolchainVersions(),
  };
  return iconSets.map((set) => {
    const { fontFamily, inputHash } = resolveIconSet(
      set,
      projectRoot,
      true,
      versions
    );
    return { fontFamily, hash: inputHash };
  });
}

/**
 * Report the icon sets whose generated files are out of date, without writing anything to the project.
 * A set is out of date when a build would change its generated files. When only its input fingerprint changed,
 * the set is built into a temp dir and compared with them. With `appRoot`, a static set is also out of date
 * when its font linked into that app's android/ or ios/ project differs from the generated TTF.
 * With `existingOnly`, sets without a glyphmap are skipped.
 */
export async function checkAllFonts(
  iconSets: IconSetConfig[],
  projectRoot: string,
  options?: {
    logger?: NanoLogger;
    withWeb?: boolean;
    appRoot?: string;
    existingOnly?: boolean;
  }
): Promise<StaleSet[]> {
  const versions = {
    version: packageVersion(),
    toolchain: fontToolchainVersions(),
  };
  const stale: StaleSet[] = [];
  for (const set of iconSets) {
    const resolved = resolveIconSet(
      set,
      projectRoot,
      options?.withWeb ?? true,
      versions
    );
    if (options?.existingOnly && !fs.existsSync(resolved.glyphmapPath)) {
      continue;
    }
    let state = currentOutput(resolved, options?.logger);
    if (
      'staleBecause' in state &&
      state.staleBecause === STALE_REASON.inputsChanged
    ) {
      const family = await familyIfBuiltTheSame(resolved);
      if (family) {
        options?.logger?.succeed(
          `${resolved.fontFamily}.ttf is up to date: its inputs changed, but it builds the same`
        );
        state = { family };
      }
    }
    if ('staleBecause' in state) {
      options?.logger?.fail(
        `${resolved.fontFamily}.ttf is out of date: ${state.staleBecause}`
      );
      stale.push({ name: resolved.fontFamily, reason: state.staleBecause });
      continue;
    }
    if (options?.appRoot && resolved.linking === 'static') {
      const reason = staleLinkedFont(
        options.appRoot,
        state.family,
        resolved.ttfPath
      );
      if (reason) {
        options.logger?.fail(reason);
        stale.push({ name: resolved.fontFamily, reason });
      }
    }
  }
  return stale;
}

/**
 * Build TTF + glyphmap for all icon sets using a single PathKit instance.
 * Output is placed in a "nanoicons" folder next to each input dir (sibling to inputDir).
 * Skips generation for a set if that output folder already contains the expected .ttf and .glyphmap.json.
 */
export async function buildAllFonts(
  iconSets: IconSetConfig[],
  projectRoot: string,
  options?: {
    logger?: NanoLogger;
    keepOutputsOnFailure?: boolean;
    preparedSvgCache?: PreparedSvgCache;
    svgWorkerPool?: SvgWorkerPool;
    withWeb?: boolean;
  }
): Promise<BuiltFont[]> {
  const withWeb = options?.withWeb ?? true;
  const logger = options?.logger;
  const versions = {
    version: packageVersion(),
    toolchain: fontToolchainVersions(),
  };
  const results: BuiltFont[] = [];
  const failures: string[] = [];
  let allSkipped = true;

  for (let i = 0; i < iconSets.length; i++) {
    const resolved = resolveIconSet(
      iconSets[i]!,
      projectRoot,
      withWeb,
      versions
    );
    const {
      fontFamily,
      inputDir,
      outputDir,
      ttfPath,
      glyphmapPath,
      woff2Path,
      linking,
      web,
      webOutput,
      config,
      inputHash,
      svgHashByFile,
    } = resolved;

    const current = currentOutput(resolved, logger);
    if ('family' in current) {
      results.push({
        fontFamily,
        family: current.family,
        ttfPath,
        glyphmapPath,
        linking,
        ...(web ? { woff2Path } : {}),
      });
      continue;
    }

    allSkipped = false;
    const tempDir = path.join(projectRoot, '.temp_layers', fontFamily);

    logger?.start(`Building ${fontFamily} (${i + 1}/${iconSets.length})…`);

    if (webOutput === 'forbidden' && fs.existsSync(woff2Path)) {
      fs.unlinkSync(woff2Path);
    }

    let out;
    try {
      out = await runFontPipeline(
        config,
        { inputDir, outputDir, tempDir },
        {
          logger,
          inputHash,
          preparedSvgCache: options?.preparedSvgCache,
          svgWorkerPool: options?.svgWorkerPool,
          svgHashByFile,
        }
      );
    } catch (err) {
      if (!options?.keepOutputsOnFailure) {
        if (fs.existsSync(ttfPath)) fs.unlinkSync(ttfPath);
        if (fs.existsSync(glyphmapPath)) fs.unlinkSync(glyphmapPath);
        if (fs.existsSync(woff2Path)) fs.unlinkSync(woff2Path);
      }
      logger?.fail(err instanceof Error ? err.message : String(err));
      failures.push(fontFamily);
      continue;
    }

    if (webOutput === 'ignored' && fs.existsSync(woff2Path)) {
      fs.unlinkSync(woff2Path);
    }

    results.push({
      fontFamily,
      family: out.family,
      ttfPath: out.ttfPath,
      glyphmapPath: out.glyphmapPath,
      linking,
      ...(out.woff2Path ? { woff2Path: out.woff2Path } : {}),
    });
  }

  if (failures.length) {
    throw new IconSetBuildError(
      `${failures.length} icon set${
        failures.length === 1 ? '' : 's'
      } failed to build: ${failures.join(', ')}`,
      results
    );
  }

  if (allSkipped && results.length > 0) {
    logger?.succeed('Your icons are flight-tuned with react-native-nano-icons');
  }

  return results;
}
