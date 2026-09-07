import path from 'node:path';
import fs from 'node:fs/promises';
import type { PathKitModule } from '../types.js';
import { flattenSvg } from '../svg/flatten/index.js';

export class PathKitManager {
  private static instance: PathKitModule | null = null;

  static async getInstance(): Promise<PathKitModule> {
    if (this.instance) return this.instance;

    const PathKitInit = require('pathkit-wasm/bin/pathkit.js') as (
      opts: unknown
    ) => any;
    const pathkitJsPath =
      require.resolve('pathkit-wasm/bin/pathkit.js') as string;
    const pathkitBinDir = path.dirname(pathkitJsPath);
    const pathkitWasmPath = path.join(pathkitBinDir, 'pathkit.wasm');

    const wasmBinary = await fs.readFile(pathkitWasmPath);

    const pkInit = PathKitInit({
      wasmBinary,
      locateFile: (file: string) => path.join(pathkitBinDir, file),
    });

    const PathKit: PathKitModule = await (typeof pkInit?.ready === 'function'
      ? pkInit.ready()
      : pkInit);
    this.instance = PathKit;
    return PathKit;
  }
}

// historical name: this used to run picosvg inside pyodide, now it's the
// TypeScript topicosvg port in ../svg/flatten
export async function picoFromFile(
  hostFilePath: string,
  content?: string
): Promise<string> {
  const PathKit = await PathKitManager.getInstance();
  const svgContent = content ?? (await fs.readFile(hostFilePath, 'utf-8'));
  return flattenSvg(svgContent, PathKit);
}
