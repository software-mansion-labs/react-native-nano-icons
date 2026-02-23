import fs from 'node:fs';
import path from 'node:path';
import parseArgs from 'minimist';

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

export function readCliConfigAndPaths(argvRaw = process.argv.slice(2)): {
  config: PipelineConfig;
  paths: PipelinePaths;
} {
  const argv = parseArgs(argvRaw);
  const inputFolderName = argv._[0] as string | undefined;

  if (!inputFolderName) {
    console.error(
      '❌ Error: You must provide the input folder name as the first argument.'
    );
    console.log(
      'Usage: tsx src/core/build_wasm.ts <folder_name> [--upm 1024] [--safeZone 1020] [--startUnicode 0xe900]'
    );
    process.exit(1);
  }

  const inputDir = path.resolve(inputFolderName);
  const parentDir = path.dirname(inputDir);
  const outputDir = path.join(parentDir, 'nanoicons');
  const tempDir = path.join(process.cwd(), '.temp_layers');

  if (!fs.existsSync(inputDir)) {
    console.error(`❌ Error: Input directory "${inputDir}" does not exist.`);
    process.exit(1);
  }

  const config: PipelineConfig = {
    fontFamily: inputFolderName.split(path.sep).pop() || 'Icons',
    upm: Number(argv.upm ?? 1024),
    safeZone: Number(argv.safeZone ?? 1020),
    startUnicode: Number(
      argv.startUnicode ? parseInt(String(argv.startUnicode)) : 0xe900
    ),
  };

  return { config, paths: { inputDir, outputDir, tempDir } };
}

export function ensureEmptyDir(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** Create directory if it does not exist; do not remove existing contents (for shared output dirs). */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
