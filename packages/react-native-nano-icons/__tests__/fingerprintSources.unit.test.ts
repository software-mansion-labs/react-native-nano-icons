/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mockFindPluginOptions = jest.fn();

jest.mock('../cli/expoConfig', () => ({
  findPluginOptions: (...args: unknown[]) => mockFindPluginOptions(...args),
}));

import { nanoIconsFingerprintSources } from '../cli/fingerprint';
import {
  fingerprintSymbolDirSync,
  getFingerprintSync,
} from '../src/utils/fingerPrint';
import {
  fontToolchainVersions,
  packageVersion,
} from '../src/utils/packageVersion';

const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0L24 24"/></svg>';

describe('nanoIconsFingerprintSources', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-fingerprint-'));
    for (const dir of ['static', 'dynamic', 'symbols']) {
      fs.mkdirSync(path.join(projectRoot, dir));
      fs.writeFileSync(path.join(projectRoot, dir, 'icon.svg'), SVG);
    }
    mockFindPluginOptions.mockReturnValue({
      iconSets: [
        { inputDir: './static', fontFamily: 'Static' },
        { inputDir: './dynamic', fontFamily: 'Dynamic', linking: 'dynamic' },
      ],
      symbolSets: [{ inputDir: './symbols', name: 'tabs' }],
    });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test('static icon sets and symbol sets add their build fingerprints, dynamic sets are left out', () => {
    const versions = {
      version: packageVersion(),
      toolchain: fontToolchainVersions(),
    };
    expect(nanoIconsFingerprintSources(projectRoot)).toEqual([
      {
        type: 'contents',
        id: 'react-native-nano-icons:iconSet:Static',
        contents: getFingerprintSync(path.join(projectRoot, 'static'), {
          upm: 1024,
          safeZone: 1024,
          curveTolerance: 1 / 512,
          startUnicode: 0xe900,
          ...versions,
        }),
        reasons: ['react-native-nano-icons'],
      },
      {
        type: 'contents',
        id: 'react-native-nano-icons:symbolSet:tabs',
        contents: fingerprintSymbolDirSync(path.join(projectRoot, 'symbols'), {
          prefix: 'nano',
          ...versions,
        }).hash,
        reasons: ['react-native-nano-icons'],
      },
    ]);
    expect(mockFindPluginOptions).toHaveBeenCalledTimes(1);
    expect(mockFindPluginOptions).toHaveBeenCalledWith(projectRoot);
  });

  test('editing an SVG of a static set changes its source', () => {
    const before = nanoIconsFingerprintSources(projectRoot);
    fs.writeFileSync(path.join(projectRoot, 'static', 'icon.svg'), `${SVG} `);
    const after = nanoIconsFingerprintSources(projectRoot);

    expect(after[0]!.contents).not.toBe(before[0]!.contents);
    expect(after[1]).toEqual(before[1]);
  });

  test('editing an SVG of a dynamic set changes nothing', () => {
    const before = nanoIconsFingerprintSources(projectRoot);
    fs.writeFileSync(path.join(projectRoot, 'dynamic', 'icon.svg'), `${SVG} `);

    expect(nanoIconsFingerprintSources(projectRoot)).toEqual(before);
  });

  test('a changed option of a static set changes its source', () => {
    const before = nanoIconsFingerprintSources(projectRoot);
    mockFindPluginOptions.mockReturnValue({
      iconSets: [{ inputDir: './static', fontFamily: 'Static', upm: 2048 }],
    });

    expect(nanoIconsFingerprintSources(projectRoot)[0]!.contents).not.toBe(
      before[0]!.contents
    );
  });

  test.each([
    ['the plugin is not configured', undefined],
    ['the plugin has no options', {}],
  ])('there are no sources when %s', (_label, options) => {
    mockFindPluginOptions.mockReturnValue(options);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(nanoIconsFingerprintSources(projectRoot)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test('a dynamic set is not read', () => {
    fs.rmSync(path.join(projectRoot, 'dynamic'), { recursive: true });

    expect(
      nanoIconsFingerprintSources(projectRoot).map((source) => source.id)
    ).toEqual([
      'react-native-nano-icons:iconSet:Static',
      'react-native-nano-icons:symbolSet:tabs',
    ]);
  });

  test('a set that cannot be read gives no sources and a warning', () => {
    fs.rmSync(path.join(projectRoot, 'static'), { recursive: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(nanoIconsFingerprintSources(projectRoot)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      `[react-native-nano-icons] No fingerprint sources added: [react-native-nano-icons] Input directory does not exist: ${path.join(
        projectRoot,
        'static'
      )} (from "./static")`
    );
    warn.mockRestore();
  });
});
