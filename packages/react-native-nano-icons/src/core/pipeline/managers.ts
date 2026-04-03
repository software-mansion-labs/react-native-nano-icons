import { loadPyodide } from 'pyodide';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PathKitModule, PyodideModule } from '../types.js';
import { buildPathopsBackend } from '../svg/svg_pathops.js';

/** Package root (where package.json lives). */
function getPackageRoot(): string {
  // Compiled to lib/commonjs/src/core/pipeline/ — 5 dirs up is package root.
  // Running from source (Jest/ts-node) in src/core/pipeline/ — 3 dirs up is package root.
  return __dirname.includes(`${path.sep}lib${path.sep}`)
    ? path.resolve(__dirname, '../../../../..')
    : path.resolve(__dirname, '../../..');
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

    // Resolve local picosvg wheel path for offline-first installation.
    const picosvgWhlDir = path.join(
      getPackageRoot(),
      'src',
      'core',
      'shims'
    );
    const picosvgWhl = (await fs.readdir(picosvgWhlDir))
      .find((f) => f.startsWith('picosvg-') && f.endsWith('.whl'));
    const localWhlUrl = picosvgWhl
      ? `file://${path.join(picosvgWhlDir, picosvgWhl)}`
      : null;

    py.globals.set('_picosvg_local_whl', localWhlUrl);

    await py.runPythonAsync(`
      import sys
      if "/" not in sys.path:
          sys.path.insert(0, "/")

      import micropip

      _whl = _picosvg_local_whl
      if _whl:
          try:
              await micropip.install(_whl, deps=False)
          except Exception:
              await micropip.install("picosvg", deps=False)
      else:
          await micropip.install("picosvg", deps=False)

      import pathops
      import picosvg
    `);

    this.instance = py;
    return py;
  }

  static async picoFromFile(
    hostFilePath: string,
    content?: string
  ): Promise<string> {
    const py = await this.getInstance();
    const svgContent = content ?? (await fs.readFile(hostFilePath, 'utf-8'));
    py.globals.set('_svg_content', svgContent);
    const out = py.runPython(`
      from picosvg.svg import SVG
      svg = SVG.fromstring(_svg_content)
      pico = svg.topicosvg()
      pico.tostring(pretty_print=True)
    `);
    return out;
  }
}

export async function picoFromFile(
  hostFilePath: string,
  content?: string
): Promise<string> {
  return PyodideManager.picoFromFile(hostFilePath, content);
}
