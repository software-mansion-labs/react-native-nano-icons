import fs from 'node:fs';

export type PipelineConfig = {
  fontFamily: string;
  upm: number;
  safeZone: number;
  startUnicode: number;
};

export type PipelinePaths = {
  inputDir: string;
  outputDir: string;
  tempDir: string;
};

export function ensureEmptyDir(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** Create directory if it does not exist; do not remove existing contents (for shared output dirs). */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
