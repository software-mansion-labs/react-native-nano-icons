import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Whether `build`, run into a temp dir, writes the same files as those in `outputDir`.
 * In `mapFile` the stored input fingerprint `m.h` is ignored.
 */
export async function buildsSameOutputs(
  outputDir: string,
  mapFile: string,
  build: (tempDir: string) => Promise<unknown>
): Promise<boolean> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-check-'));
  try {
    await build(tempDir);
    return fs
      .readdirSync(tempDir)
      .every((entry) =>
        sameEntry(
          path.join(tempDir, entry),
          path.join(outputDir, entry),
          mapFile
        )
      );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function sameEntry(built: string, existing: string, mapFile: string): boolean {
  if (!fs.existsSync(existing)) return false;
  if (fs.statSync(built).isDirectory()) {
    if (!fs.statSync(existing).isDirectory()) return false;
    const entries = fs.readdirSync(built).sort();
    return (
      entries.join('\n') === fs.readdirSync(existing).sort().join('\n') &&
      entries.every((entry) =>
        sameEntry(path.join(built, entry), path.join(existing, entry), mapFile)
      )
    );
  }
  if (path.basename(built) === mapFile) {
    return withoutInputHash(built) === withoutInputHash(existing);
  }
  return fs.readFileSync(built).equals(fs.readFileSync(existing));
}

function withoutInputHash(file: string): string {
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete map?.m?.h;
  return JSON.stringify(map);
}
