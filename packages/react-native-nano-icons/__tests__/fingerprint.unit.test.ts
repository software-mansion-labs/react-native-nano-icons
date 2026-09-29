/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getFingerprintSync,
  type FingerprintInputs,
} from '../src/utils/fingerPrint';
import { fontToolchainVersions } from '../src/utils/packageVersion';

const SAMPLE_SVG = '<svg viewBox="0 0 24 24"><path d="M0 0L24 24"/></svg>';
const INPUTS: FingerprintInputs = {
  upm: 1024,
  safeZone: 1020,
  startUnicode: 0xe900,
  version: '1.0.0',
  toolchain: ['fonteditor-core@2.6.3', 'svg2ttf@6.0.3'],
};

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nano-fp-'));
}

describe('getFingerprintSync', () => {
  test('returns a 64-character hex string (SHA-256)', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      expect(getFingerprintSync(dir, INPUTS)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('same directory content produces same hash on repeated calls', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      const h1 = getFingerprintSync(dir, INPUTS);
      const h2 = getFingerprintSync(dir, INPUTS);
      expect(h1).toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('changing file content produces a different hash', () => {
    const dir = makeTmpDir();
    try {
      const file = path.join(dir, 'icon.svg');
      fs.writeFileSync(file, SAMPLE_SVG);
      const h1 = getFingerprintSync(dir, INPUTS);

      fs.writeFileSync(
        file,
        '<svg viewBox="0 0 24 24"><path d="M0 0L12 12"/></svg>'
      );
      const h2 = getFingerprintSync(dir, INPUTS);

      expect(h1).not.toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('renaming a file (same content, different name) produces a different hash', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'aaa.svg'), SAMPLE_SVG);
      const h1 = getFingerprintSync(dir, INPUTS);

      fs.unlinkSync(path.join(dir, 'aaa.svg'));
      fs.writeFileSync(path.join(dir, 'zzz.svg'), SAMPLE_SVG);
      const h2 = getFingerprintSync(dir, INPUTS);

      expect(h1).not.toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('adding an SVG file produces a different hash', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      const h1 = getFingerprintSync(dir, INPUTS);

      fs.writeFileSync(path.join(dir, 'icon2.svg'), SAMPLE_SVG);
      const h2 = getFingerprintSync(dir, INPUTS);

      expect(h1).not.toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('non-SVG files are ignored — hash is unchanged when a .txt file is added', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      const h1 = getFingerprintSync(dir, INPUTS);

      fs.writeFileSync(path.join(dir, 'readme.txt'), 'This should be ignored');
      const h2 = getFingerprintSync(dir, INPUTS);

      expect(h1).toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ['upm', { ...INPUTS, upm: 512 }],
    ['safeZone', { ...INPUTS, safeZone: 1000 }],
    ['startUnicode', { ...INPUTS, startUnicode: 0xf000 }],
    ['version', { ...INPUTS, version: '1.0.1' }],
    [
      'a toolchain version',
      { ...INPUTS, toolchain: ['fonteditor-core@2.6.4', 'svg2ttf@6.0.3'] },
    ],
  ] as const)('changing %s produces a different hash', (_, inputs) => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      expect(getFingerprintSync(dir, inputs)).not.toBe(
        getFingerprintSync(dir, INPUTS)
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fontToolchainVersions', () => {
  test('lists the installed version of every package that shapes the font', () => {
    expect(fontToolchainVersions()).toEqual([
      expect.stringMatching(/^@xmldom\/xmldom@\d+\.\d+\.\d+/),
      expect.stringMatching(/^cubic2quad@\d+\.\d+\.\d+/),
      expect.stringMatching(/^fonteditor-core@\d+\.\d+\.\d+/),
      expect.stringMatching(/^pathkit-wasm@\d+\.\d+\.\d+/),
      expect.stringMatching(/^svg2ttf@\d+\.\d+\.\d+/),
    ]);
  });

  test('reads packages that do not export their package.json', () => {
    const fonteditor = fontToolchainVersions().find((entry) =>
      entry.startsWith('fonteditor-core@')
    );
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          path.dirname(require.resolve('fonteditor-core')),
          '..',
          'package.json'
        ),
        'utf8'
      )
    ) as { version: string };
    expect(fonteditor).toBe(`fonteditor-core@${manifest.version}`);
  });
});
