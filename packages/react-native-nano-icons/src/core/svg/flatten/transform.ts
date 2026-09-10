// Ported from picosvg svg_transform.py (Apache-2.0, Copyright 2020 Google LLC)

import type { Pt, Rect } from './geometry.js';
import { almostEqual, ntos, rectEmpty } from './geometry.js';

// 2D affine transform, viewed as a matrix:
//
// a   c   e
// b   d   f
export class Affine2D {
  constructor(
    readonly a: number,
    readonly b: number,
    readonly c: number,
    readonly d: number,
    readonly e: number,
    readonly f: number
  ) {}

  private static readonly _identity = new Affine2D(1, 0, 0, 1, 0, 0);
  private static readonly _degenerate = new Affine2D(0, 0, 0, 0, 0, 0);
  private static readonly _flipY = new Affine2D(1, 0, 0, -1, 0, 0);

  static identity(): Affine2D {
    return Affine2D._identity;
  }

  static degenerate(): Affine2D {
    return Affine2D._degenerate;
  }

  static flipY(): Affine2D {
    return Affine2D._flipY;
  }

  static fromString(rawTransform: string): Affine2D {
    return parseSvgTransform(rawTransform);
  }

  values(): [number, number, number, number, number, number] {
    return [this.a, this.b, this.c, this.d, this.e, this.f];
  }

  equals(other: Affine2D): boolean {
    return (
      this.a === other.a &&
      this.b === other.b &&
      this.c === other.c &&
      this.d === other.d &&
      this.e === other.e &&
      this.f === other.f
    );
  }

  toString(): string {
    const [tx, ty] = this.getTranslate();
    if (this.equals(Affine2D.identity().translate(tx, ty))) {
      return `translate(${[tx, ty].map(ntos).join(', ')})`;
    }
    return `matrix(${this.values().map(ntos).join(' ')})`;
  }

  // product self × other: maps by other before applying self
  matMul(other: Affine2D): Affine2D {
    return new Affine2D(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f
    );
  }

  matrix(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): Affine2D {
    return this.matMul(new Affine2D(a, b, c, d, e, f));
  }

  translate(tx: number, ty = 0): Affine2D {
    if (tx === 0 && ty === 0) {
      return this;
    }
    return this.matrix(1, 0, 0, 1, tx, ty);
  }

  getTranslate(): [number, number] {
    return [this.e, this.f];
  }

  getScale(): [number, number] {
    return [this.a, this.d];
  }

  scale(sx: number, sy?: number): Affine2D {
    if (sy === undefined) {
      sy = sx;
    }
    return this.matrix(sx, 0, 0, sy, 0, 0);
  }

  // angle in radians
  rotate(a: number, cx = 0.0, cy = 0.0): Affine2D {
    return this.translate(cx, cy)
      .matrix(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0)
      .translate(-cx, -cy);
  }

  // angle in radians
  skewx(a: number): Affine2D {
    return this.matrix(1, 0, Math.tan(a), 1, 0, 0);
  }

  // angle in radians
  skewy(a: number): Affine2D {
    return this.matrix(1, Math.tan(a), 0, 1, 0, 0);
  }

  determinant(): number {
    return this.a * this.d - this.b * this.c;
  }

  isDegenerate(): boolean {
    return Math.abs(this.determinant()) <= Number.EPSILON;
  }

  inverse(): Affine2D {
    if (this.equals(Affine2D.identity())) {
      return this;
    } else if (this.isDegenerate()) {
      return Affine2D.degenerate();
    }
    const det = this.determinant();
    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const e = -a * this.e - c * this.f;
    const f = -b * this.e - d * this.f;
    return new Affine2D(a, b, c, d, e, f);
  }

  mapPoint(p: Pt): Pt {
    return {
      x: this.a * p.x + this.c * p.y + this.e,
      y: this.b * p.x + this.d * p.y + this.f,
    };
  }

  // like mapPoint but treats translation as zero
  mapVector(v: Pt): Pt {
    return {
      x: this.a * v.x + this.c * v.y,
      y: this.b * v.x + this.d * v.y,
    };
  }

  // merged transform equivalent to applying transforms left-to-right
  static composeLtr(affines: readonly Affine2D[]): Affine2D {
    let result = Affine2D.identity();
    for (let i = affines.length - 1; i >= 0; i--) {
      result = result.matMul(affines[i]!);
    }
    return result;
  }

  almostEquals(
    other: Affine2D,
    tolerance = 1e-9 // DEFAULT_ALMOST_EQUAL_TOLERANCE
  ): boolean {
    const v1 = this.values();
    const v2 = other.values();
    return v1.every((v, i) => almostEqual(v, v2[i]!, tolerance));
  }

  private static readonly _ALIGN_VALUES = new Set([
    'none',
    'xminymin',
    'xminymid',
    'xminymax',
    'xmidymin',
    'xmidymid',
    'xmidymax',
    'xmaxymin',
    'xmaxymid',
    'xmaxymax',
  ]);

  private static readonly _MEET_OR_SLICE = new Set(['meet', 'slice']);

  // scale and translate src Rect onto dst Rect, honoring preserveAspectRatio
  // https://www.w3.org/TR/SVG/coords.html#ComputingAViewportsTransform
  static rectToRect(
    src: Rect,
    dst: Rect,
    preserveAspectRatio = 'none'
  ): Affine2D {
    if (rectEmpty(src)) {
      return Affine2D.identity();
    }
    if (rectEmpty(dst)) {
      return new Affine2D(0, 0, 0, 0, 0, 0);
    }

    let sx = dst.w / src.w;
    let sy = dst.h / src.h;

    const normalized = preserveAspectRatio.toLowerCase().trim();
    const spaceIdx = normalized.indexOf(' ');
    const align = spaceIdx === -1 ? normalized : normalized.slice(0, spaceIdx);
    const meetOrSlice =
      spaceIdx === -1 ? '' : normalized.slice(spaceIdx + 1).trim();
    if (
      !Affine2D._ALIGN_VALUES.has(align) ||
      (meetOrSlice && !Affine2D._MEET_OR_SLICE.has(meetOrSlice))
    ) {
      throw new Error(`Invalid preserveAspectRatio: ${preserveAspectRatio}`);
    }

    if (align !== 'none') {
      sx = sy = meetOrSlice.includes('slice')
        ? Math.max(sx, sy)
        : Math.min(sx, sy);
    }

    let tx = dst.x - src.x * sx;
    let ty = dst.y - src.y * sy;

    if (align.includes('xmid')) {
      tx += (dst.w - src.w * sx) / 2;
    } else if (align.includes('xmax')) {
      tx += dst.w - src.w * sx;
    }
    if (align.includes('ymid')) {
      ty += (dst.h - src.h * sy) / 2;
    } else if (align.includes('ymax')) {
      ty += dst.h - src.h * sy;
    }

    return new Affine2D(sx, 0, 0, sy, tx, ty);
  }
}

const RADIAN_ARG_OPS = new Set(['rotate', 'skewx', 'skewy']);

export function parseSvgTransform(rawTransform: string): Affine2D {
  let transform = Affine2D.identity();

  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rawTransform)) !== null) {
    const op = match[1]!.toLowerCase();
    const args = match[2]!
      .trim()
      .split(/\s*[,\s]\s*/)
      .map((p) => parseFloat(p));
    if (RADIAN_ARG_OPS.has(op)) {
      args[0] = (args[0]! * Math.PI) / 180;
    }
    switch (op) {
      case 'matrix':
        transform = transform.matrix(
          args[0]!,
          args[1]!,
          args[2]!,
          args[3]!,
          args[4]!,
          args[5]!
        );
        break;
      case 'translate':
        transform = transform.translate(args[0]!, args[1]);
        break;
      case 'scale':
        transform = transform.scale(args[0]!, args[1]);
        break;
      case 'rotate':
        transform = transform.rotate(args[0]!, args[1], args[2]);
        break;
      case 'skewx':
        transform = transform.skewx(args[0]!);
        break;
      case 'skewy':
        transform = transform.skewy(args[0]!);
        break;
    }
  }

  return transform;
}
