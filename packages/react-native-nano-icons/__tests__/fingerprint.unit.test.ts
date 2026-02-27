/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getFingerprintSync } from '../src/utils/fingerPrint';

const SAMPLE_SVG = '<svg viewBox="0 0 24 24"><path d="M0 0L24 24"/></svg>';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nano-fp-'));
}

describe('getFingerprintSync', () => {
  test('returns a 64-character hex string (SHA-256)', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      expect(getFingerprintSync(dir)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('same directory content produces same hash on repeated calls', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      const h1 = getFingerprintSync(dir);
      const h2 = getFingerprintSync(dir);
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
      const h1 = getFingerprintSync(dir);

      fs.writeFileSync(
        file,
        '<svg viewBox="0 0 24 24"><path d="M0 0L12 12"/></svg>'
      );
      const h2 = getFingerprintSync(dir);

      expect(h1).not.toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('renaming a file (same content, different name) produces a different hash', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'aaa.svg'), SAMPLE_SVG);
      const h1 = getFingerprintSync(dir);

      fs.unlinkSync(path.join(dir, 'aaa.svg'));
      fs.writeFileSync(path.join(dir, 'zzz.svg'), SAMPLE_SVG);
      const h2 = getFingerprintSync(dir);

      expect(h1).not.toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('adding an SVG file produces a different hash', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      const h1 = getFingerprintSync(dir);

      fs.writeFileSync(path.join(dir, 'icon2.svg'), SAMPLE_SVG);
      const h2 = getFingerprintSync(dir);

      expect(h1).not.toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('non-SVG files are ignored — hash is unchanged when a .txt file is added', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'icon.svg'), SAMPLE_SVG);
      const h1 = getFingerprintSync(dir);

      fs.writeFileSync(path.join(dir, 'readme.txt'), 'This should be ignored');
      const h2 = getFingerprintSync(dir);

      expect(h1).toBe(h2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
