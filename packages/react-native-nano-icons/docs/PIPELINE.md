# Nano Icons — Font Generation Pipeline

Complete documentation of how SVG icons are converted into a TrueType font + glyphmap.

---

## Overview

```
SVG files → picosvg (flatten) → parse paths → evenodd conversion → same-color merge → placement → transform → SVG font XML → svg2ttf → metrics fix → .ttf + .glyphmap.json
```

The pipeline converts a directory of SVG icon files into:
- A **TrueType font** (`.ttf`) where each color layer of each icon is a separate glyph
- A **glyphmap** (`.glyphmap.json`) mapping icon names to codepoint/color layer arrays

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
}
```

For each icon set:

1. Resolves absolute paths
2. Computes SHA-256 fingerprint of all SVG inputs
3. **Skips generation** if existing glyphmap hash matches (incremental builds)
4. Deletes stale output files
5. Calls `runPipeline()` with resolved config and paths
6. Returns `{ fontFamily, ttfPath, glyphmapPath }`

---

## Runtime Initialization

### PathKitManager (singleton)

**File:** `src/core/pipeline/managers.ts`

Loads **PathKit** (Skia's path geometry library, compiled to WASM):
- Requires `pathkit-wasm/bin/pathkit.js` + `pathkit.wasm`
- Provides: path parsing, boolean ops, simplify, transform, SVG roundtrip
- Single instance shared across all icon sets

### PyodideManager (singleton)

**File:** `src/core/pipeline/managers.ts`

Loads **Pyodide** (CPython compiled to WASM) and bootstraps picosvg:

1. Mounts Node.js filesystem at `/app`
2. Builds the **pathops backend** (`buildPathopsBackend(PathKit)`) — a JavaScript object that mimics the `skia-pathops` C++ Python bindings using PathKit
3. Registers it as Python module `_pathops_js`
4. Loads `pathops.py` shim (Python wrapper over `_pathops_js`)
5. Installs **picosvg** from a bundled `.whl` file (offline-first, PyPI fallback)
6. Imports `pathops` and `picosvg` into the Python runtime

The pathops shim (`src/core/shims/pathops.py`) provides: `Path`, `op()`, `FillType`, `PathVerb`, `PathOp`, etc. — just enough API surface for picosvg to work.

---

## Pipeline: `runPipeline(config, paths, options?)`

**File:** `src/core/pipeline/run.ts`

### Step 1: Read SVG files

Reads all `.svg` files from `inputDir`. Initializes an empty glyphmap and a `FontGlyph[]` accumulator.

### Step 2: For each SVG file

#### 2a. Validate

**`validateSvg(rawContent)`** — rejects SVGs containing `<mask>` or `<filter>` (unsupported).

#### 2b. Preprocess

**`preprocessSvg(rawContent)`** — injects `xmlns="http://www.w3.org/2000/svg"` if missing.

#### 2c. Pre-extract evenodd paths

**`extractOriginalEvenoddDs(preprocessed)`**

Finds all `<path>` elements with `fill-rule="evenodd"` or `clip-rule="evenodd"` and extracts their original `d` attribute strings **before picosvg processes them**.

**Why:** Picosvg internally calls `simplify()` via our PathKit shim, which can **drop contours** from multi-subpath evenodd paths. We preserve the originals and restore them after picosvg.

#### 2d. Flatten via picosvg

**`picoFromFile(filePath, preprocessed)`**

Runs picosvg's `SVG.fromstring(svg).topicosvg().tostring()` in the Pyodide Python runtime.

Picosvg:
- Resolves `<use>` references
- Applies `<clipPath>` via boolean intersection
- Flattens transforms into absolute coordinates
- Converts strokes to fills
- Converts all shapes to `<path>` elements
- Resolves evenodd via `remove_overlaps()` (but this is broken in our shim — see below)

#### 2e. Parse flattened SVG

**`parseFlattenedSvg(flattenedSvg)`**

- Extracts `viewBox` (or defaults to `0 0 100 100`)
- For each `<path>`:
  - Extracts `d`, `fill`, `fill-rule`, `opacity`, `fill-opacity`
  - Bakes opacity into fill as `rgba(r,g,b,a)` via `calculateOpColor()`
  - Sanitizes paths missing initial moveto (prepends `M` from endpoint)
- Returns `{ viewBox, paths: [{ d, fill, fillRule? }] }`

#### 2f. Restore original evenodd paths

**`restoreOriginalEvenoddDs(parsed.paths, originalEvenoddDs)`**

Replaces picosvg's (potentially damaged) evenodd path data with the preserved originals, matched by position (Nth evenodd path gets Nth original `d` string).

#### 2g. Convert evenodd to nonzero winding

**`convertEvenoddToWinding(PathKit, d)`**

For each path with `fillRule === 'evenodd'`:

1. Parse via `PathKit.FromSVGString(d)`
2. Set fill type to `EVENODD`
3. Call `simplify()` — resolves self-intersections respecting evenodd topology
4. Re-parse the simplified result to get raw commands
5. Split into individual contours
6. Sort contours by absolute area (big-to-small)
7. **Compute nesting depths** via ray-casting containment test:
   - For each contour, get a sample point on its boundary
   - Test if that point lies inside each other contour (ray-casting point-in-polygon)
   - Nesting depth = number of containing contours
8. **Fix winding direction**:
   - Even depth (0, 2, 4…) → CCW (outer / fill)
   - Odd depth (1, 3, 5…) → CW (hole / cutout)
   - Reverse contour if current direction doesn't match
9. Reconstruct `d` string from corrected commands

The path is also marked **`noMerge = true`** — compound paths with holes must not be concatenated with adjacent paths (their CW hole contours would cancel adjacent CCW contours via winding).

**Why the custom algorithm:** PathKit (WASM) does not expose Skia's `AsWinding()` function. Our pathops shim's `simplify(fix_winding=True)` only changes a fill-type flag without actually reversing contour directions. The containment-based algorithm properly handles: independent shapes, simple holes, and arbitrarily nested bullseye patterns.

#### 2h. Merge same-color paths

**`mergeSameColorPaths(parsed.paths, logger)`**

Groups **consecutive** paths with identical `fill` and concatenates their `d` strings into a single compound path. This reduces glyph count without any geometric risk — under nonzero winding, concatenation renders identically to drawing each path separately with the same color.

Rules:
- Only merges **consecutive** same-color runs (preserves z-order)
- Skips paths marked `noMerge` (evenodd-converted compound paths)
- Uses simple string concatenation (`d1 + ' ' + d2`), **not** boolean union (which can corrupt complex geometry)

#### 2i. Compute placement

**`computePlacement({ upm, safeZone, viewBox })`**

```
scale    = safeZone / viewBox.height       // fit-to-height
padding  = (upm - safeZone) / 2            // symmetric padding
adv      = round(viewBox.width * scale + 2 * padding)   // advance width
xOff     = (adv - viewBox.width * scale) / 2            // center horizontally
yOff     = (upm - viewBox.height * scale) / 2           // center vertically
```

Returns `{ vx, vy, scale, xOff, yOff, adv }` — used for path transformation.

#### 2j. Transform paths and build glyphs

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

#### 2k. Record in glyphmap

```typescript
glyphMap.i[iconName] = [advanceWidth, [[cp1, color1], [cp2, color2], ...]]
```

### Step 3: Write glyphmap JSON

Includes metadata:
```json
{
  "m": {
    "f": "FontFamily",
    "u": 1024,          // upm
    "z": 1020,          // safeZone
    "s": 59648,         // startUnicode (0xe900)
    "h": "sha256..."    // optional input fingerprint
  },
  "i": {
    "iconName": [advanceWidth, [[codepoint, "color"], ...]]
  }
}
```

### Step 4: Compile TTF

**`compileTtfFromGlyphs({ glyphs, outTtfPath, fontName, upm, ascent, descent })`**

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

4. **Write `.ttf` file**

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

Consecutive paths with identical fill color are concatenated into a single compound path (`d1 + ' ' + d2`). This is safe because:
- Under nonzero winding, overlapping same-direction contours just increase winding count (stays nonzero = filled)
- Non-overlapping contours render independently

**Exception:** Paths converted from evenodd (marked `noMerge`) must not be concatenated with other paths. Their CW hole contours would cancel adjacent paths' CCW contours, producing winding=0 (unfilled) in the overlap region.

### Evenodd Pre-Extraction

Picosvg's `simplify()` through the PathKit WASM shim can **drop contours** from multi-subpath evenodd paths (e.g., a 4-subpath 3D crate frame becomes 2 subpaths). The pipeline preserves the original `d` strings before picosvg and restores them after, ensuring all contours survive for proper winding conversion.

---

## Font Metrics & Inline Text Alignment

### Font Metrics Design

The pipeline compiles icon fonts with **`ascent = UPM`** and **`descent = 0`** (see `run.ts:252-254`). This means:

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
| `pyodide` | ^0.29.3 | Python runtime (WASM, for picosvg) |
| `picosvg` | 0.22.3 | SVG flattening (bundled .whl) |
| `svg2ttf` | ^6.0.3 | SVG font → TTF conversion |
| `fonteditor-core` | ^2.6.3 | TTF metric correction |
| `jsdom` | ^28.1.0 | DOM parsing in Node.js |

---

## File Map

```
src/core/
├── pipeline/
│   ├── run.ts          # Main pipeline orchestrator
│   ├── managers.ts     # PathKit + Pyodide singleton managers
│   ├── config.ts       # PipelineConfig, PipelinePaths types, ensureDir
│   └── index.ts        # Re-exports
├── svg/
│   ├── svg_dom.ts      # SVG parsing, evenodd extraction/restoration
│   ├── svg_pathops.ts  # PathKit backend, winding conversion, containment
│   └── layers.ts       # Glyph placement, path transform
├── font/
│   ├── compile.ts      # SVG font XML builder, TTF compilation
│   └── metrics.ts      # TTF metric correction (fonteditor-core)
├── shims/
│   ├── pathops.py      # Python skia-pathops shim (delegates to PathKit)
│   └── picosvg-*.whl   # Bundled picosvg wheel
└── types.ts            # Shared types (PathKitModule, GlyphLayer, etc.)

cli/
├── build.ts            # buildAllFonts orchestrator
├── config.ts           # .nanoicons.json config loader
├── logger.ts           # Ora-based logger
├── link.ts             # Bare RN linking
└── index.ts            # CLI exports
```
