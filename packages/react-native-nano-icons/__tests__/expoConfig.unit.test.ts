/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadDynamicSetsFromAppConfig } from '../cli/expoConfig';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'nanoicons-expo-config-'))
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeModule(dir: string, name: string, source: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, main: 'index.js' })
  );
  fs.writeFileSync(path.join(dir, 'index.js'), source);
}

function writeFakeExpoConfig(dir: string, marker: string): void {
  writeModule(
    dir,
    '@expo/config',
    `exports.getConfig = (projectRoot) => ({
      exp: {
        plugins: [
          ['react-native-nano-icons', { iconSets: [
            { inputDir: 'static', fontFamily: 'Static' },
            { inputDir: '${marker}', fontFamily: 'Dynamic', linking: 'dynamic' },
          ] }],
        ],
      },
    });`
  );
}

function writeExpo(dir: string): void {
  writeModule(dir, 'expo', 'module.exports = {};');
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(
    path.join(dir, 'config', 'index.js'),
    "module.exports = require('@expo/config');"
  );
}

function dynamicInputDirs(appRoot: string): string[] {
  return loadDynamicSetsFromAppConfig(appRoot).map((set) => set.inputDir);
}

test('app-local node_modules (workspace without hoisting)', () => {
  const app = path.join(root, 'app');
  writeFakeExpoConfig(
    path.join(app, 'node_modules', '@expo', 'config'),
    'app-local'
  );
  expect(dynamicInputDirs(app)).toEqual(['app-local']);
});

test('hoisted to the monorepo root', () => {
  const app = path.join(root, 'apps', 'mobile');
  fs.mkdirSync(app, { recursive: true });
  writeFakeExpoConfig(
    path.join(root, 'node_modules', '@expo', 'config'),
    'hoisted'
  );
  expect(dynamicInputDirs(app)).toEqual(['hoisted']);
});

test('pnpm isolated layout: @expo/config reachable only through expo', () => {
  const store = path.join(
    root,
    'node_modules',
    '.pnpm',
    'expo@54',
    'node_modules'
  );
  writeExpo(path.join(store, 'expo'));
  writeFakeExpoConfig(path.join(store, '@expo', 'config'), 'pnpm');
  const app = path.join(root, 'apps', 'mobile');
  fs.mkdirSync(path.join(app, 'node_modules'), { recursive: true });
  fs.symlinkSync(
    path.join(store, 'expo'),
    path.join(app, 'node_modules', 'expo'),
    'dir'
  );

  expect(() => require.resolve('@expo/config', { paths: [app] })).toThrow();
  expect(dynamicInputDirs(app)).toEqual(['pnpm']);
});

test("the app's expo/config wins over another @expo/config", () => {
  const app = path.join(root, 'app');
  writeExpo(path.join(app, 'node_modules', 'expo'));
  writeFakeExpoConfig(
    path.join(app, 'node_modules', 'expo', 'node_modules', '@expo', 'config'),
    'from-expo'
  );
  writeFakeExpoConfig(
    path.join(app, 'node_modules', '@expo', 'config'),
    'standalone'
  );
  expect(dynamicInputDirs(app)).toEqual(['from-expo']);
});

test('nothing installed names the app root and the --path remedy', () => {
  const app = path.join(root, 'app');
  fs.mkdirSync(app);
  expect(() => loadDynamicSetsFromAppConfig(app)).toThrow(
    `Could not find expo/config or @expo/config from ${app}`
  );
  expect(() => loadDynamicSetsFromAppConfig(app)).toThrow(
    'pass --path <app root>'
  );
});
