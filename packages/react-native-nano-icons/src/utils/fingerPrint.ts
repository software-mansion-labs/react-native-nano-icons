const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

export type FingerprintInputs = {
  upm: number;
  safeZone: number;
  startUnicode: number;
  version: string;
};

export function getFingerprintSync(
  dir: string,
  inputs: FingerprintInputs
): string {
  const files = fs
    .readdirSync(dir)
    .filter((f: string) => f.endsWith('.svg'))
    .sort();
  const hash = crypto.createHash('sha256');

  for (const file of files) {
    const filePath = path.join(dir, file);
    // Hash both path and content
    hash.update(file);
    hash.update(fs.readFileSync(filePath));
  }

  hash.update(
    JSON.stringify([
      inputs.upm,
      inputs.safeZone,
      inputs.startUnicode,
      inputs.version,
    ])
  );

  return hash.digest('hex');
}
