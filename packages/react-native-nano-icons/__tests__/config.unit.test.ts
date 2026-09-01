/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveConfigPath, CONFIG_FILENAME } from '../cli/config';

function makeTmpDir(): string {
  // realpathSync resolves macOS /var → /private/var so path assertions match.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nano-cfg-')));
}

function writeConfig(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, CONFIG_FILENAME);
  fs.writeFileSync(
    configPath,
    JSON.stringify({ iconSets: [{ inputDir: './icons' }] })
  );
  return configPath;
}

describe('resolveConfigPath', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('explicit path accepts a directory or a direct file', () => {
    const configDir = path.join(root, 'config');
    const configPath = writeConfig(configDir);

    expect(resolveConfigPath({ explicit: configDir, startDir: root })).toEqual({
      configPath,
      configRoot: configDir,
    });
    expect(resolveConfigPath({ explicit: configPath, startDir: root })).toEqual(
      {
        configPath,
        configRoot: configDir,
      }
    );
  });

  test('searches upward when no explicit path is given', () => {
    const configPath = writeConfig(root);
    const deep = path.join(root, 'android', 'app', 'src');
    fs.mkdirSync(deep, { recursive: true });

    expect(resolveConfigPath({ startDir: deep })).toEqual({
      configPath,
      configRoot: root,
    });
  });

  test('throws a helpful error when nothing is found', () => {
    expect(() => resolveConfigPath({ startDir: root })).toThrow(
      /Could not locate/
    );
  });
});
