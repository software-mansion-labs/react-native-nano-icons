const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

export type FingerprintInputs = {
  upm: number;
  safeZone: number;
  startUnicode: number;
  version: string;
  toolchain: readonly string[];
};

export type SymbolFingerprintInputs = {
  prefix: string;
  version: string;
  toolchain: readonly string[];
};

export type SvgDirFingerprint = {
  hash: string;
  svgHashByFile: Map<string, string>;
};

export function getFingerprintSync(
  dir: string,
  inputs: FingerprintInputs
): string {
  return fingerprintSvgDirSync(dir, inputs).hash;
}

export function fingerprintSvgDirSync(
  dir: string,
  inputs: FingerprintInputs
): SvgDirFingerprint {
  return hashSvgDir(dir, [
    inputs.upm,
    inputs.safeZone,
    inputs.startUnicode,
    inputs.version,
    inputs.toolchain,
  ]);
}

export function fingerprintSymbolDirSync(
  dir: string,
  inputs: SymbolFingerprintInputs
): SvgDirFingerprint {
  return hashSvgDir(dir, [
    'symbol',
    inputs.prefix,
    inputs.version,
    inputs.toolchain,
  ]);
}

function hashSvgDir(dir: string, settings: unknown[]): SvgDirFingerprint {
  const files = fs
    .readdirSync(dir)
    .filter((f: string) => f.endsWith('.svg'))
    .sort();
  const hash = crypto.createHash('sha256');
  const svgHashByFile = new Map<string, string>();

  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath);
    // Hash both path and content
    hash.update(file);
    hash.update(content);
    svgHashByFile.set(
      file,
      crypto.createHash('sha256').update(content).digest('hex')
    );
  }

  hash.update(JSON.stringify(settings));

  return { hash: hash.digest('hex'), svgHashByFile };
}
