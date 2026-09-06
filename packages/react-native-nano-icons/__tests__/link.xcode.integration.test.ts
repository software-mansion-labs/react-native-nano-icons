/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as plist from 'plist';
import { linkBare } from '../cli/link';
import type { NanoLogger } from '../cli/logger';

const EXAMPLE_IOS = path.resolve(
  __dirname,
  '../../../examples/BareReactNativeExample/ios'
);

function makeLogger(): NanoLogger {
  return {
    start: jest.fn(),
    update: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
}

function setupProject(infoPlistSetting?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-real-'));
  const ios = path.join(root, 'ios');
  fs.mkdirSync(path.join(ios, 'BareReactNativeExample.xcodeproj'), {
    recursive: true,
  });
  let pbxproj = fs.readFileSync(
    path.join(EXAMPLE_IOS, 'BareReactNativeExample.xcodeproj/project.pbxproj'),
    'utf8'
  );
  if (infoPlistSetting) {
    pbxproj = pbxproj.replace(
      /INFOPLIST_FILE = [^;]+;/g,
      `INFOPLIST_FILE = ${infoPlistSetting};`
    );
  }
  fs.writeFileSync(
    path.join(ios, 'BareReactNativeExample.xcodeproj/project.pbxproj'),
    pbxproj
  );
  fs.mkdirSync(path.join(ios, 'BareReactNativeExample'), { recursive: true });
  fs.writeFileSync(
    path.join(ios, 'BareReactNativeExample', 'Info.plist'),
    fs.readFileSync(path.join(EXAMPLE_IOS, 'BareReactNativeExample/Info.plist'))
  );
  return root;
}

function font() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-real-font-'));
  const ttfPath = path.join(dir, 'RealFont.ttf');
  fs.writeFileSync(ttfPath, 'fake-ttf');
  return {
    fontFamily: 'RealFont',
    ttfPath,
    glyphmapPath: `${ttfPath}.json`,
    linking: 'static' as const,
  };
}

function uiAppFonts(p: string): string[] {
  const parsed = plist.parse(fs.readFileSync(p, 'utf8')) as Record<
    string,
    unknown
  >;
  return (parsed['UIAppFonts'] as string[]) ?? [];
}

test('real pbxproj — conventional INFOPLIST_FILE', async () => {
  const root = setupProject();
  const logger = makeLogger();
  await linkBare(root, [font()], logger);
  expect(
    uiAppFonts(path.join(root, 'ios/BareReactNativeExample/Info.plist'))
  ).toContain('RealFont.ttf');
  expect(logger.succeed).toHaveBeenCalledWith('Linked fonts → ios');
  const written = fs.readFileSync(
    path.join(root, 'ios/BareReactNativeExample.xcodeproj/project.pbxproj'),
    'utf8'
  );
  expect(written).toContain('Copy nanoicons fonts');
});

test('real pbxproj — custom INFOPLIST_FILE with $(SRCROOT)', async () => {
  const root = setupProject('"$(SRCROOT)/Resources/Custom-Info.plist"');
  const custom = path.join(root, 'ios/Resources/Custom-Info.plist');
  fs.mkdirSync(path.dirname(custom), { recursive: true });
  fs.writeFileSync(custom, plist.build({ CFBundleName: 'custom' }));
  const logger = makeLogger();

  await linkBare(root, [font()], logger);

  expect(uiAppFonts(custom)).toContain('RealFont.ttf');
  expect(
    uiAppFonts(path.join(root, 'ios/BareReactNativeExample/Info.plist'))
  ).not.toContain('RealFont.ttf');
  expect(logger.succeed).toHaveBeenCalledWith('Linked fonts → ios');
});

test('real pbxproj — the run script phase lands on the application target', async () => {
  const root = setupProject();
  await linkBare(root, [font()], makeLogger());
  const xcode = require('xcode') as typeof import('xcode');
  const p = xcode
    .project(
      path.join(root, 'ios/BareReactNativeExample.xcodeproj/project.pbxproj')
    )
    .parseSync();
  const appTarget = p.getTarget('com.apple.product-type.application')!;
  const phaseUuids = appTarget.target.buildPhases.map((b) => b.value);
  const shellPhases = p.hash.project.objects['PBXShellScriptBuildPhase']!;
  const names = phaseUuids
    .map((u) => shellPhases[u])
    .filter((o): o is Record<string, unknown> => typeof o === 'object')
    .map((o) => o['name']);
  expect(names).toContain('"Copy nanoicons fonts"');
});
