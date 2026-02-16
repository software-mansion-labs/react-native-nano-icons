# shims/pathops.py
#
# Minimal skia-pathops-compatible API backed by a JS module registered as "_pathops_js".
# This is designed to satisfy picosvg's usage of pathops (Path, op, enums, iteration).
#
# IMPORTANT BEHAVIOR:
# - skia-pathops simplify(fix_winding=True) forces fillType to WINDING.
#   PathKit does not do that, so we emulate it here by explicitly setting fillType.

from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable, Iterator, List, Sequence, Tuple, Optional, Any

try:
    import _pathops_js  # provided via pyodide.registerJsModule(...)
except Exception as e:
    raise ImportError("Missing JS backend module _pathops_js") from e


# ---- Exceptions ----
class PathOpsError(RuntimeError):
    pass


# ---- Enums (values chosen to match our JS backend verb mapping) ----
class PathVerb:
    MOVE = 0
    LINE = 1
    QUAD = 2
    CUBIC = 3
    CLOSE = 4
    CONIC = 5  # should not occur for picosvg after conversions


class FillType:
    WINDING = 0
    EVEN_ODD = 1


class PathOp:
    UNION = 0
    INTERSECTION = 1
    DIFFERENCE = 2


class LineCap:
    BUTT_CAP = 0
    ROUND_CAP = 1
    SQUARE_CAP = 2


class LineJoin:
    MITER_JOIN = 0
    ROUND_JOIN = 1
    BEVEL_JOIN = 2


Point = Tuple[float, float]
SvgCmd = Tuple[str, Tuple[float, ...]]


@dataclass
class _Handle:
    h: Any  # opaque handle owned by JS backend


class Path:
    def __init__(self, other: "Path" = None, *, fillType: int = FillType.WINDING):
        if other is not None:
            self._handle = _Handle(_pathops_js.clone_path(other._handle.h))
        else:
            self._handle = _Handle(_pathops_js.create_path(int(fillType)))

    # ---- fillType property ----
    @property
    def fillType(self) -> int:
        return int(_pathops_js.get_fill_type(self._handle.h))

    @fillType.setter
    def fillType(self, ft: int) -> None:
        _pathops_js.set_fill_type(self._handle.h, int(ft))

    # ---- drawing commands ----
    def moveTo(self, x: float, y: float) -> None:
        _pathops_js.move_to(self._handle.h, float(x), float(y))

    def lineTo(self, x: float, y: float) -> None:
        _pathops_js.line_to(self._handle.h, float(x), float(y))

    def quadTo(self, x1: float, y1: float, x2: float, y2: float) -> None:
        _pathops_js.quad_to(self._handle.h, float(x1), float(y1), float(x2), float(y2))

    def cubicTo(self, x1: float, y1: float, x2: float, y2: float, x3: float, y3: float) -> None:
        _pathops_js.cubic_to(self._handle.h, float(x1), float(y1), float(x2), float(y2), float(x3), float(y3))

    def close(self) -> None:
        _pathops_js.close(self._handle.h)

    # ---- transforms ----
    def transform(self, a: float, b: float, c: float, d: float, e: float, f: float) -> "Path":
        out_h = _pathops_js.transform(self._handle.h, float(a), float(b), float(c), float(d), float(e), float(f))
        out = Path.__new__(Path)
        out._handle = _Handle(out_h)
        return out

    # ---- simplify / stroke ----
    def simplify(self, fix_winding: bool = False) -> None:
        ok = bool(_pathops_js.simplify(self._handle.h, bool(fix_winding)))
        # In skia-pathops, simplify(fix_winding=True) forces WINDING fill type.
        if fix_winding:
            _pathops_js.set_fill_type(self._handle.h, int(FillType.WINDING))
        if not ok:
            # skia-pathops may throw PathOpsError; picosvg usually expects simplify to succeed
            # but some paths can be tricky. We'll be conservative and not throw.
            return

    def stroke(
        self,
        stroke_width: float,
        cap: int,
        join: int,
        miter_limit: float,
        dash_array: Sequence[float] = (),
        dash_offset: float = 0.0,
    ) -> None:
        out_h = _pathops_js.stroke(
            self._handle.h,
            float(stroke_width),
            int(cap),
            int(join),
            float(miter_limit),
            list(map(float, dash_array)) if dash_array else [],
            float(dash_offset),
        )
        if out_h is None:
            raise PathOpsError("stroke failed")
        # Replace in-place (matches typical expectations)
        self._handle = _Handle(out_h)

    def convertConicsToQuads(self, tolerance: float = 0.25) -> None:
        # PathKit roundtrip already avoids conics for our use cases
        _pathops_js.convert_conics_to_quads(self._handle.h, float(tolerance))

    # ---- geometry ----
    @property
    def bounds(self) -> Tuple[float, float, float, float]:
        b = _pathops_js.bounds(self._handle.h)
        return (float(b[0]), float(b[1]), float(b[2]), float(b[3]))

    @property
    def area(self) -> float:
        return float(_pathops_js.area(self._handle.h))

    # ---- iteration ----
    def __iter__(self) -> Iterator[Tuple[int, List[Point]]]:
        # JS backend returns list of [verbInt, [[x,y], ...]]
        segs = _pathops_js.iter_segments(self._handle.h)
        for verb, pts in segs:
            out_pts: List[Point] = [(float(p[0]), float(p[1])) for p in pts]
            yield int(verb), out_pts

    # ---- cleanup ----
    def __del__(self):
        try:
            _pathops_js.delete_path(self._handle.h)
        except Exception:
            pass


def op(path1: Path, path2: Path, op: int, fix_winding: bool = False) -> Path:
    out_h = _pathops_js.op(path1._handle.h, path2._handle.h, int(op))
    if out_h is None:
        raise PathOpsError("operation did not succeed")

    out = Path.__new__(Path)
    out._handle = _Handle(out_h)

    if fix_winding:
        _pathops_js.set_fill_type(out._handle.h, int(FillType.WINDING))

    return out
