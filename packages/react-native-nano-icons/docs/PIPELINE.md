# Nano Icons — Font Generation Pipeline

Complete documentation of how SVG icons are converted into a TrueType font + glyphmap.

---

## Overview

```
SVG files → flatten (PathKit-backed) → parse paths → same-color merge → placement → transform → SVG font XML → svg2ttf → metrics fix → .ttf + .glyphmap.json
```

The pipeline converts a directory of SVG icon files into:
- A **TrueType font** (`.ttf`) where each color layer of each icon is a separate glyph
- A **glyphmap** (`.glyphmap.json`) mapping icon names to codepoint/color layer arrays
- Optionally (`web: true`) a **WOFF2** (`.woff2`) wrapping the same TTF build for web, written in the same run

Multi-color icons are decomposed into layers: one glyph per color, rendered on top of each other at runtime.

---

## Entry Point

### CLI: `buildAllFonts(iconSets, projectRoot, options?)`

**File:** `cli/build.ts`

Takes an array of icon set configs, each specifying:

```typescript
{
  inputDir: string;                  // Path to SVG files
  fontFamily?: string;               // Font name (default: inputDir basename)
  outputDir?: string;                // Where .ttf/.glyphmap go
  upm?: number;                      // Units per em (default: 1024)
  safeZone?: number;                 // Safe zone for glyphs (default: 1020)
  startUnicode?: number | string;    // First codepoint (default: 0xe900)
  linking?: 'static' | 'dynamic';    // Native delivery mode (default: 'static')
  web?: boolean;                     // Also emit .woff2 (default: false)
}
```

For each icon set:

1. Resolves absolute paths
2. Computes SHA-256 fingerprint of all SVG inputs, the set config (`upm`, `safeZone`, `startUnicode`) and the library version
3. **Skips generation** if the existing glyphmap hash, linking and web flag (`m.w`) match the config and every expected file exists (incremental builds)
4. Deletes stale output files
5. Calls `runFontPipeline()` with resolved config and paths
6. Returns `{ fontFamily, family, ttfPath, glyphmapPath, linking, woff2Path? }` — `family` is `glyphMap.m.f`, the configured name plus the first 8 characters of the SHA-256 of the TTF built under the configured name; it is also the TTF's internal font name and the Android asset file name

---

## Runtime Initialization

### `loadPathKit()`

**File:** `src/core/pathkit/load.ts`

Loads **PathKit** (Skia's path geometry library, compiled to WASM) once and caches it:
- Requires `pathkit-wasm/bin/pathkit.js` + `pathkit.wasm`
- Provides: path parsing, boolean ops, simplify, transform, SVG roundtrip
- Single instance shared across all icon sets

### `src/core/pathkit/` — everything that talks to PathKit

- `types.ts` — `PathKitModule` / `PathKitPath` typings and the `Cmd` / `Point` verb-level types
- `contours.ts` — verb-level contour maths shared by the flattener and the winding
  helpers: contour splitting, signed area, curve sampling, ray-cast containment,
  orientation fixing, deterministic start-point rotation
- `winding.ts` — `analyzeWinding` / `pathDataWithWinding` (winding alignment for the
  merge, see 2e below), canonical / reversed winding for symbols

### `src/core/flatten/` — the SVG flattener

`flattenSvg(svgContent, PathKit)` turns any supported SVG into a flat
`<svg><defs/>{<path>}*</svg>` where every path is absolute, filled, nonzero and free of
transforms, groups, `<use>`, `<clipPath>` and strokes.

- `index.ts` — `flattenSvg` entry point
- `document.ts` — `SvgDocument`: parsed element tree, shape cache and tree sync,
  depth/breadth-first traversal (with transform / clip / inherited-attribute context),
  `viewBox`, `tolerance`, `url(#id)` lookup, serialization
- `stages.ts` — `flattenDocument(doc)`: the ordered list of stages below
- `stages/` — one file per concern, each a `(doc) => void`:
  - `discard.ts` — non-SVG namespaces, anonymous `<symbol>`, `<title>`/`<desc>`/`<metadata>`
  - `styles.ts` — `style=""` declarations → attributes
  - `nested-svg.ts` — nested `<svg>` → `<g transform>` plus a viewport `<clipPath>`
  - `use.ts` — `<use>` expansion
  - `clip-path.ts` — `clip-path="url(#…)"` → one unioned clip shape (used by traversal)
  - `stroke.ts` — stroke → filled outline path
  - `defs.ts` — gradient hoisting into a single id-sorted `<defs>`, orphan removal
  - `collapse.ts` — the main pass: inherit attributes, stroke, apply transform, intersect
    clips, hoist gradients, remove groups
  - `fill-rule.ts` — evenodd → nonzero via `removeOverlaps`
  - `opacity.ts` — fold `fill-opacity` / `stroke-opacity` into `opacity`
  - `shapes.ts` — shapes → paths, shorthand expansion, absolute coordinates, rounding,
    empty-subpath and unpainted-shape removal
  - `validate.ts` — structural check of the flattened tree
- `element.ts` — element-level helpers: tag predicates, group removal, transform
  composition, `url(#id)` and `viewBox` parsing
- `shape.ts` — shape model (`rect`/`circle`/`ellipse`/`line`/`polygon`/`polyline`→path),
  `mightPaint`, opacity normalization
- `path.ts` — `d`-string parsing (incl. compact arc flags), shorthand expansion,
  relative→absolute with subpath-start snapping, rounding
- `arcs.ts` / `transform.ts` / `geometry.ts` — arc→cubic conversion, `Affine2D`,
  exact half-even `round()` semantics
- `pathops.ts` — union / intersection / removeOverlaps / stroke / transform / area over
  PathKit, returning SVG command sequences with deterministic contour order
- `dom.ts` / `inherit.ts` — element tree + SVG attribute inheritance

Gradient normalization is intentionally skipped: the font pipeline never reads gradient
defs, fills keep their `url(#…)` strings.

### `src/core/glyph/` — flat SVG → font-ready layers

- `validate.ts` — `validateSvg` (reject `<mask>`, `<filter>`, `<image>`), `preprocessSvg` (inject `xmlns`)
- `parse.ts` — `parseFlattenedSvg`, opacity baking, moveto sanitizing, `shouldSkipPath`
- `merge.ts` — `mergeSameColorPaths`
- `placement.ts` — `computePlacement`, `transformPathForFont`

Regexes shared by `glyph/` and `font/` live in `src/utils/svgPatterns.ts`.

---

## Pipeline: `runFontPipeline(config, paths, options?)`

**File:** `src/core/pipeline/runFontPipeline.ts` (`runPipeline` is kept as an alias on the `./pipeline` export)

### Step 1: Read SVG files

Reads all `.svg` files from `inputDir`. Initializes an empty glyphmap and a `FontGlyph[]` accumulator.

### Step 2: For each SVG file — `prepareSvgLayers()`

**File:** `src/core/pipeline/prepare.ts` — steps 2a–2e; returns `{ viewBox, paths }` or `null` when the SVG is rejected.

#### 2a. Validate

**`validateSvg(rawContent)`** — rejects SVGs containing `<mask>`, `<filter>` or `<image>` (unsupported).

#### 2b. Preprocess

**`preprocessSvg(rawContent)`** — injects `xmlns="http://www.w3.org/2000/svg"` if missing.

#### 2c. Flatten

**`flattenSvg(preprocessed, PathKit)`**

A failure here is re-thrown as `Failed to flatten "<set>:<file>": …` with the original error as `cause`.

The flattener:
- Resolves `<use>` references
- Applies `<clipPath>` via boolean intersection
- Flattens transforms into absolute coordinates
- Converts strokes to fills
- Converts all shapes to `<path>` elements
- Resolves evenodd fills via `removeOverlaps()`

#### 2d. Parse flattened SVG

**`parseFlattenedSvg(flattenedSvg)`**

- Extracts `viewBox` (or defaults to `0 0 100 100`)
- For each `<path>`:
  - Extracts `d`, `fill`, `opacity`, `fill-opacity`
  - Bakes opacity into fill as `rgba(r,g,b,a)` via `calculateOpColor()`
  - Sanitizes paths missing initial moveto (prepends `M` from endpoint)
- Returns `{ viewBox, paths: [{ d, fill }] }`

#### 2e. Merge same-color paths

**`mergeSameColorPaths(parsed.paths, PathKit, logger)`**

Groups **consecutive** paths with identical `fill` and concatenates their `d` strings into a single compound path. This reduces glyph count. Under nonzero winding, paths wound opposite ways cancel where they overlap, so the winding of each path is aligned first (see [Same-Color Path Merging](#same-color-path-merging)).

Rules:
- Only merges **consecutive** same-color runs (preserves z-order)
- Reverses contours so that every outline in the run has the sign of the first path's outlines
- Keeps a path in its own layer when its contours touch or cross, a contour crosses itself, or a hole winds like its outline
- Uses simple string concatenation (`d1 + ' ' + d2`), **not** boolean union (which can corrupt complex geometry)

#### 2f. Compute placement

**`computePlacement({ upm, safeZone, viewBox })`**

```
scale    = safeZone / viewBox.height       // fit-to-height
padding  = (upm - safeZone) / 2            // symmetric padding
adv      = round(viewBox.width * scale + 2 * padding)   // advance width
xOff     = (adv - viewBox.width * scale) / 2            // center horizontally
yOff     = (upm - viewBox.height * scale) / 2           // center vertically
```

Returns `{ vx, vy, scale, xOff, yOff, adv }` — used for path transformation.

#### 2g. Transform paths and build glyphs

For each (merged) path that passes `shouldSkipPath()` (non-empty, non-transparent):

1. Assign codepoint: `currentUnicode++`
2. **Transform to font coordinates** via `transformPathForFont(PathKit, d, opts)`:
   - Combined affine: placement scaling + centering + **Y-axis flip** (SVG Y-down → font Y-up)
   - `x' = scale * (x - vx) + xOff`
   - `y' = upm - (scale * (y - vy) + yOff)`
   - Applied as single SkMatrix via PathKit
3. Build `FontGlyph { codepoint, advanceWidth, d }`
4. Build layer entry `[codepoint, fill]`

The Y-flip naturally converts SVG winding convention (outer=CCW) to TrueType convention (outer=CW).

#### 2h. Record in glyphmap

```typescript
glyphMap.i[iconName] = [advanceWidth, [[cp1, color1], [cp2, color2], ...]]
```

### Step 3: Write glyphmap JSON

Includes metadata:
```json
{
  "m": {
    "f": "FontFamily-1a2b3c4d", // runtime font family: configured name + first 8 chars of the built font's hash
    "u": 1024,          // upm
    "z": 1020,          // safeZone
    "s": 59648,         // startUnicode (0xe900)
    "h": "sha256...",   // optional fingerprint of SVGs + config + library version
    "l": "d"            // only for dynamic linking
  },
  "i": {
    "iconName": [advanceWidth, [[codepoint, "color"], ...]]
  }
}
```

### Step 4: Compile TTF

**`compileTtfFromGlyphs({ glyphs, fontName, upm, ascent, descent })`**

**File:** `src/core/font/compile.ts`

1. **Build SVG font XML** — constructs the XML string directly (no intermediate files):

```xml
<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "...">
<svg xmlns="http://www.w3.org/2000/svg">
<defs>
<font id="{fontName}" horiz-adv-x="{upm}">
  <font-face font-family="{fontName}" units-per-em="{upm}"
             ascent="{ascent}" descent="-{descent}"/>
  <missing-glyph horiz-adv-x="0"/>
  <glyph glyph-name="u{hex}" unicode="&#x{hex};"
         horiz-adv-x="{adv}" d="{pathData}"/>
  <!-- ... one <glyph> per FontGlyph -->
</font>
</defs>
</svg>
```

2. **Convert to TTF** via `svg2ttf(svgFontString)` — handles cubic-to-quadratic bezier conversion internally

3. **Fix metrics** via `forceTtfMetrics(buffer, upm, ascent, descent, lineGap)`:
   - Sets `head.unitsPerEm`
   - Sets `hhea` ascent/descent/lineGap
   - Sets `OS/2` Win and Typo metrics
   - **Sets USE_TYPO_METRICS flag** (bit 7 of `fsSelection`) — prevents vertical clipping on Windows/Android

4. **Name and write the `.ttf`**: with an input fingerprint, the TTF built under the configured name is hashed, and the font is built again under `<fontFamily>-<first 8 hex of that hash>`

5. With `web: true`, **encode the same buffer to WOFF2** via the encoder bundled with `fonteditor-core` and write `<fontFamily>.woff2` beside it

---

## Key Algorithms

### Containment-Based Winding

Traditional approach: "largest contour = outer, rest = holes". Breaks for:
- Two independent shapes (smaller one forced CW = invisible)
- 3+ nesting levels (bullseye: innermost island forced CW instead of CCW)

Our approach:
1. Approximate each contour as a polyline (sample curves at 8 points)
2. Get a representative point on each contour (midpoint of first segment)
3. For each pair (i, j): test if point_i is inside contour_j via **ray-casting**
4. Nesting depth of contour_i = count of containing contours
5. Even depth → CCW (outer), odd depth → CW (hole)

Complexity: O(n^2 * polyline_size), but n is typically 1–5 contours per glyph.

### Same-Color Path Merging

Consecutive paths with identical fill color are concatenated into a single compound path (`d1 + ' ' + d2`). This renders like drawing each path separately only when every filled region winds the same way:
- Under nonzero winding, overlapping same-direction contours just increase winding count (stays nonzero = filled)
- Overlapping contours wound opposite ways (+1 and −1) sum to 0, so the overlap is unfilled
- Non-overlapping contours render independently

So the winding of each path is aligned before joining (`src/core/pathkit/winding.ts`):
1. Approximate each contour as a polyline (sample curves at 8 points)
2. If two contours touch or cross, or a contour crosses itself, the path keeps its own layer. The segments are sorted by x, so only segments whose x ranges overlap are compared
3. Otherwise test one point of each contour against the other contours via **ray-casting**; nesting depth = count of containing contours
4. Outline sign = contour direction, flipped at odd depth. A hole that winds like its outline keeps the path in its own layer
5. Contours whose sign differs from the run's sign are reversed. The path's own fill does not change

## Font Metrics & Inline Text Alignment

### Font Metrics Design

The pipeline compiles icon fonts with **`ascent = UPM`** and **`descent = 0`** (see `runFontPipeline.ts`). This means:

- Glyphs fill the entire em square from baseline to top — no descender space
- At any `fontSize`, the glyph's visual height equals the font size
- `CTFontGetDescent` (iOS) / `paint.fontMetrics.descent` (Android) returns 0
- The native `_fitScale` is ≈ 1.0, and `_baselinePosition` is at the view's bottom edge

### React Native Inline Attachment Positioning

When a custom view is nested inside `<Text>`, React Native treats it as an inline attachment and positions it within the text line. The positioning formula changed between RN versions:

**RN ≤ 0.82 (`RCTTextLayoutManager.mm`):**
```objc
CGFloat baseline = [layoutManager locationForGlyphAtIndex:range.location].y;
frame = {{glyphRect.origin.x, glyphRect.origin.y + baseline - attachmentSize.height}, attachmentSize};
```
Uses the layout manager's baseline directly — the view's bottom aligns with the text baseline.

**RN ≥ 0.83 (`RCTTextLayoutManager.mm`):**
```objc
UIFont *font = [[textStorage attributedSubstringFromRange:range] attribute:NSFontAttributeName ...];
frame = {glyphRect.origin.x, glyphRect.origin.y + glyphRect.size.height - attachmentSize.height + font.descender};
```
For inline views (non-text attachments), `NSFontAttributeName` is nil at the attachment character index, so `font.descender` evaluates to 0 via ObjC nil messaging. The view's bottom edge therefore aligns with the bottom of `glyphRect`. Additionally, Fabric uses a two-pass measurement: the first pass determines attachment positions with initial (zero) bounds, then feeds those positions back as `NSTextAttachment.bounds.origin.y` in a second pass. This feedback loop shifts the final frame ~2–3 pt above the typographic descender line, making the actual distance from the frame bottom to the baseline smaller than `|UIFont.descender|`.

### Native Rendering Architecture

#### iOS — Standalone vs. Inline Drawing Paths

`NanoIconView` uses two distinct rendering paths depending on whether the icon is standalone or inline inside a `<Text>` component.

**Inline detection** is performed once on the first `layoutSubviews` call (when the full view hierarchy is assembled) by checking the nearest 3 ancestors for `RCTParagraphComponentView` via direct class name comparison. The result is cached in `_isInlineInText` and only re-evaluated on `didMoveToSuperview` (reparenting).

**Standalone icons** (the common case) draw directly in `NanoIconView`'s own `drawRect:`. No child views are created. `CTFontDrawGlyphs` renders glyph layers at the cached baseline position with a coordinate-flip transform to map CoreText's Y-up system to UIKit's Y-down frame.

**Inline icons** use a lazily-created `CALayer` sublayer whose `frame.origin.y` is shifted upward by the computed baseline offset. A `CALayer` is used instead of a `UIView` because it provides the necessary shifted pixel buffer without the overhead of a responder chain, hit testing, or accessibility tree. This allows the icon to overflow the Yoga frame without clipping (enabled by `clipsToBounds = NO` and an `updateClippedSubviewsWithClipRect:` no-op that prevents Fabric scroll clipping). The owning `NanoIconView` acts as the layer's delegate and draws glyphs via `drawLayer:inContext:`. The baseline offset is derived from the parent `RCTParagraphComponentView`'s `attributedText`: the parent font's `ascender`, effective `lineHeight` (respecting custom RN `lineHeight` via `NSParagraphStyle.maximumLineHeight`), and `NSBaselineOffsetAttributeName`. The offset is computed as the distance from the Yoga frame's bottom edge to the text baseline using `fmod(frameBottom, lineHeight)`, and clamped to zero when the icon is taller than the text line. The offset is cached and only recomputed on bounds changes.

**Font caching**: `CTFontRef` instances are shared via a process-wide static cache keyed by `(fontFamily, fontSize)`. Icons with the same font family and size reuse the same `CTFontRef` rather than each creating their own.

#### Android

Checks if `parent` is a `ReactTextView`. If so, reads the text layout paint's `fontMetrics.descent` and applies a compensating `canvas.translate` in `onDraw`. Standalone icons draw directly with no offset.

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `pathkit-wasm` | ^1.0.0 | Skia path geometry (WASM) |
| `svg2ttf` | ^6.0.3 | SVG font → TTF conversion |
| `fonteditor-core` | ^2.6.3 | TTF metric correction |
| `@xmldom/xmldom` | ^0.8.15 \|\| ^0.9.12 | XML DOM parsing in Node.js |

---

## File Map

```
src/core/
├── pipeline/
│   ├── runFontPipeline.ts  # per-file loop → placement → glyphs → TTF + glyphmap
│   ├── prepare.ts          # validate → preprocess → flatten → parse → merge
│   ├── config.ts           # PipelineConfig, PipelinePaths types, ensureDir
│   └── index.ts            # public ./pipeline surface (runFontPipeline + runPipeline alias)
├── pathkit/
│   ├── load.ts             # loadPathKit(): cached WASM instance
│   ├── types.ts            # PathKitModule, PathKitPath, Cmd, Point
│   ├── contours.ts         # verb-level contour maths, containment winding
│   └── winding.ts          # merge winding alignment, canonical / reversed winding
├── flatten/
│   ├── index.ts            # flattenSvg entry point
│   ├── document.ts         # SvgDocument: tree, shape cache, traversal, lookups
│   ├── stages.ts           # flattenDocument(): ordered stages
│   ├── stages/             # one file per stage (discard, styles, nested-svg, use,
│   │                       #   clip-path, stroke, defs, collapse, fill-rule, opacity,
│   │                       #   shapes, validate)
│   ├── element.ts          # element-level helpers
│   ├── shape.ts            # shape model, shapes→paths, mightPaint
│   ├── path.ts             # d-string parse/rewrite machinery
│   ├── pathops.ts          # command-seq boolean ops over PathKit
│   ├── arcs.ts             # arc → cubic conversion
│   ├── transform.ts        # Affine2D
│   ├── inherit.ts          # attribute inheritance
│   ├── dom.ts              # element tree + serializer
│   └── geometry.ts         # points, rects, half-even rounding
├── glyph/
│   ├── validate.ts         # validateSvg, preprocessSvg
│   ├── parse.ts            # parseFlattenedSvg, sanitizePathData, shouldSkipPath
│   ├── merge.ts            # mergeSameColorPaths
│   └── placement.ts        # computePlacement, transformPathForFont
├── font/
│   ├── compile.ts          # SVG font XML builder, TTF compilation
│   └── metrics.ts          # TTF metric correction (fonteditor-core)
└── types.ts                # glyphmap types, NanoLogger

src/utils/svgPatterns.ts    # shared SVG/XML regexes

cli/
├── build.ts                # buildAllFonts orchestrator
├── config.ts               # .nanoicons.json config loader
├── logger.ts               # Ora-based logger
├── link.ts                 # Bare RN linking
└── index.ts                # CLI exports
```
