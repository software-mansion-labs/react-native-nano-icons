export type Point = readonly [number, number];

export type Cmd = readonly number[];

export type VerbMap = {
  MOVE: number;
  LINE: number;
  QUAD: number;
  CONIC: number;
  CUBIC: number;
  CLOSE: number;
};

export type WrappedPath = {
  p: PathKitPath;
  meta: { moves: Point[] };
};

export interface PathKitPath {
  delete?: () => void;

  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  quadTo: (x1: number, y1: number, x2: number, y2: number) => void;
  cubicTo: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number
  ) => void;
  close: () => void;

  simplify: () => void;
  toSVGString: () => string;
  toCmds: () => Cmd[];

  getBounds: () => {
    fLeft: number;
    fTop: number;
    fRight: number;
    fBottom: number;
  };

  getFillType?: () => number;
  setFillType: (t: number) => void;

  dash?: (on: number, off: number, phase: number) => void;
  stroke: (opts: {
    width: number;
    cap: number;
    join: number;
    miter_limit: number;
  }) => PathKitPath | null;

  transform: (
    a: number,
    c: number,
    e: number,
    b: number,
    d: number,
    f: number,
    g: number,
    h: number,
    i: number
  ) => void;
}

export interface PathKitModule {
  MOVE_VERB?: number;
  LINE_VERB?: number;
  QUAD_VERB?: number;
  CONIC_VERB?: number;
  CUBIC_VERB?: number;
  CLOSE_VERB?: number;

  FillType?: {
    EVENODD?: number;
    EVEN_ODD?: number;
    WINDING?: number;
    NONZERO?: number;
  };
  StrokeCap?: { BUTT?: number; ROUND?: number; SQUARE?: number };
  StrokeJoin?: { MITER?: number; ROUND?: number; BEVEL?: number };
  PathOp?: { UNION?: number; INTERSECT?: number; DIFFERENCE?: number };

  NewPath: (src?: PathKitPath) => PathKitPath;
  FromSVGString: (svg: string) => PathKitPath | null;
  MakeFromOp: (
    a: PathKitPath,
    b: PathKitPath,
    op: number
  ) => PathKitPath | null;
}

export type PyodideModule = {
  mountNodeFS: (mountpoint: string, hostPath: string) => void;
  registerJsModule: (name: string, mod: unknown) => void;
  loadPackage: (pkgs: string[]) => Promise<void>;
  runPythonAsync: (code: string) => Promise<unknown>;
  runPython: (code: string) => string;
  FS: { writeFile: (path: string, data: string) => void };
};

export type GlyphLayer = { codepoint: number; color: string };
export type GlyphEntry = { adv: number; layers: GlyphLayer[] };
export type IconsMap = Record<string, GlyphEntry>;
export type NanoGlyphMap = {
  meta: {
    fontFamily: string;
    upm: number;
    safeZone: number;
    startUnicode: number;
  };
  icons: IconsMap;
};
