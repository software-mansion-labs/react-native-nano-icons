import { loadPyodide } from 'pyodide';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PathKitModule, PyodideModule } from '../types.js';
import { buildPathopsBackend } from '../svg/svg_pathops.js';

/** Package root (where package.json lives). */
function getPackageRoot(): string {
  // Compiled to lib/commonjs/src/core/pipeline/managers.js — 5 dirs up is package root.
  return path.resolve(__dirname, '../../../../..');
}

export class PathKitManager {
  private static instance: PathKitModule | null = null;

  static async getInstance(): Promise<PathKitModule> {
    if (this.instance) return this.instance;

    const PathKitInit = require('pathkit-wasm/bin/pathkit.js') as (
      opts: unknown
    ) => any;
    const pathkitJsPath = require.resolve(
      'pathkit-wasm/bin/pathkit.js'
    ) as string;
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

export class PyodideManager {
  private static instance: PyodideModule | null = null;

  static async getInstance(): Promise<PyodideModule> {
    if (this.instance) return this.instance;

    const pyodideAsmPath = require.resolve('pyodide/pyodide.asm.js') as string;
    const pyodideDir = path.dirname(pyodideAsmPath) + path.sep;

    const py = (await loadPyodide({
      indexURL: pyodideDir,
    })) as unknown as PyodideModule;
    py.mountNodeFS('/app', process.cwd());

    const PathKit = await PathKitManager.getInstance();
    py.registerJsModule('_pathops_js', buildPathopsBackend(PathKit));

    const pathopsPyPath = path.join(
      getPackageRoot(),
      'src',
      'core',
      'shims',
      'pathops.py'
    );

    const pathopsPy = await fs.readFile(pathopsPyPath, 'utf8');
    py.FS.writeFile('/pathops.py', pathopsPy);

    await py.loadPackage(['micropip', 'lxml'], { messageCallback: () => {} });

    await py.runPythonAsync(`
      import sys
      if "/" not in sys.path:
          sys.path.insert(0, "/")
          
      import micropip
      await micropip.install("picosvg", deps=False)
          
      import pathops
      import picosvg
    `);

    this.instance = py;
    return py;
  }

  static async picoFromFile(hostFilePath: string): Promise<string> {
    const py = await this.getInstance();

    const abs = path.resolve(hostFilePath);
    const rel = path.relative(process.cwd(), abs);
    const virtualPath = path.join('/app', rel).replaceAll('\\', '/');

    const out = py.runPython(`
      from picosvg.svg import SVG
      import os

      p = r"${virtualPath}"
      if not os.path.exists(p):
          raise FileNotFoundError(f"Could not find file at {p}")

      with open(p, "rb") as f:
          data = f.read()

      text = data.decode("utf-8-sig", errors="replace")
      svg = SVG.fromstring(text)
      pico = svg.topicosvg()
      pico.tostring(pretty_print=True)
    `);

    return out;
  }
}

export async function picoFromFile(hostFilePath: string): Promise<string> {
  return PyodideManager.picoFromFile(hostFilePath);
}
