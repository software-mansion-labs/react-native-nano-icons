# Nano Icons — SVG → Custom SF Symbol Pipeline

Complete documentation of how SVG icons are converted into Apple **custom SF Symbols** (`.symbolset` asset-catalog entries) for native bottom-tab bars and any other consumer of `UIImage(named:)` / SwiftUI `Image(_:)`.

---

## Overview

```
SVG files → flatten (PathKit-backed) → parse paths → evenodd conversion → same-color merge
          → [DIVERGENCE FROM FONT PIPELINE]
          → cap-band placement → symbol template SVG (3 variable sources + annotations)
          → <prefix>.<icon>.symbolset (template + Contents.json)
          → linked into the app's Images.xcassets
          → compiled by Xcode's actool into Assets.car
          → loaded natively by name: UIImage(named: "nano.home")
```

The pipeline converts a directory of SVG icon files into:

- One **`.symbolset`** per icon — a directory containing an SF Symbol **template SVG** and a `Contents.json`, placed inside the consuming app's asset catalog
- A **typed manifest** (`<set>.symbols.ts`) exporting a const map of icon names → symbol names
- A **symbolmap** (`<set>.symbolmap.json`) carrying the input fingerprint for incremental builds

Unlike the font pipeline (which produces glyphs *we* render via CoreText), symbol mode produces assets that **the OS renders**. The result is a first-class system symbol: native tinting, selected/unselected tab states, weight/scale configuration, a runtime `monochrome`/`original` rendering-mode switch, and automatic Liquid Glass treatment in iOS 26 tab bars — with zero runtime code in this library.

### Why this exists

Native bottom-tab libraries (react-native-screens `Tabs`, expo-router `NativeTabs`, react-navigation v8) render tab items natively — they cannot consume the icon font. Their icon APIs accept either built-in SF Symbol names or asset-catalog names. Symbol mode makes any SVG addressable through the second path:

```tsx
<NativeTabs.Trigger.Icon xcasset={TabIconsSymbols.home} />
```

---

## What Was Done (Change Summary)

| Area | Change |
|---|---|
| `src/core/pipeline/prepare.ts` | Shared per-file SVG stages (validate → flatten → parse → evenodd → merge). Both pipelines reuse identical preprocessing. |
| `src/core/symbols/template.ts` | **New.** SF Symbol template emitter: skeleton geometry, cap-band placement math, variant groups, margin guides, rendering-mode annotations. |
| `src/core/symbols/contents.ts` | **New.** `Contents.json` emitters (symbolset + catalog root). |
| `src/core/pipeline/runSymbolPipeline.ts` | **New.** Symbol pipeline orchestrator: per-icon symbolset emission, typed manifest, symbolmap. |
| `cli/buildSymbols.ts` | **New.** `buildAllSymbols()` — config resolution, fingerprint skip, mirrors `buildAllFonts`. |
| `cli/config.ts` | `.nanoicons.json` now accepts a top-level `symbolSets` array (either `iconSets` or `symbolSets` must be present). |
| `cli/link.ts` | **New** `linkBareSymbols()` + `copySymbolsetsIntoCatalog()` for bare RN iOS linking. |
| `scripts/cli.ts` | Bin entry builds + links symbol sets after fonts. |
| `plugin/src/buildSymbols.ts`, `plugin/src/withNanoIconsSymbolLinking.ts` | **New.** Expo config plugin path (`withDangerousMod`). |
| `plugin/src/types.ts`, `plugin/src/index.ts` | `SymbolSetConfig` / `BuiltSymbolSet` types; plugin options accept `symbolSets`. |
| `__tests__/symbols.e2e.test.ts` | **New.** Generation, annotations, manifest, fingerprint skip, catalog copy + stale cleanup, and a real `xcrun actool` compile gate (macOS-only, auto-skipped elsewhere). |
| `__tests__/link.unit.test.ts` | Added `linkBareSymbols` coverage (Images.xcassets path + pbxproj fallback). |

**No new dependencies were added.** The symbol pipeline reuses the existing toolchain end to end: the TypeScript flattener for flattening, PathKit for geometry, `@xmldom/xmldom` for parsing, the `xcode` package (already used for font linking) for the pbxproj fallback. Template emission is pure string assembly. Compilation/validation is done by Xcode's own `actool` at app build time.

---

## Configuration

### `.nanoicons.json` (bare RN) / Expo plugin options — same shape

```jsonc
{
  "iconSets": [ ... ],          // unchanged — font pipeline
  "symbolSets": [
    {
      "inputDir": "./assets/tab-icons",  // required
      "name": "tabicons",                // optional, default: inputDir basename
      "prefix": "nano",                  // optional, default: "nano"
      "outputDir": "./assets/nanoicons"  // optional, default: sibling "nanoicons" dir
    }
  ]
}
```

- **`prefix`** namespaces symbol names (`home.svg` → `nano.home`), preventing collisions with Apple's built-in symbol names (imagine shadowing `house`) and letting the linker safely clean up stale symbolsets it owns.
- **`data-nano-knockout="true"`** on a shape or group of an input SVG marks it as a knockout: a hole in monochrome, painted in its own fill in original (see [Layer resolution](#layer-resolution-knockouts--occlusion)). Without annotations, near-white details over ink are knockouts.
- **`name`** drives output filenames (`tabicons.symbols.ts`, `tabicons.symbolmap.json`, `tabicons.symbols/`) and the manifest export name (`TabiconsSymbols`).

### Outputs (per set)

```
<outputDir>/
├── <name>.symbols/
│   ├── <prefix>.<icon>.symbolset/
│   │   ├── <prefix>.<icon>.svg     # the symbol template
│   │   └── Contents.json
│   └── ...
├── <name>.drawables/
│   ├── <prefix>_<icon>.xml          # Android monochrome: one solid silhouette path
│   └── <prefix>_<icon>_original.xml # Android original: every layer with its fill
├── <name>.symbols.ts               # typed manifest (DX)
└── <name>.symbolmap.json           # { m: { p: prefix, h: sha256 }, s: { icon: symbolName } }
```

```typescript
// <name>.symbols.ts (generated)
export const TabiconsSymbols = {
  "home": "nano.home",
  "heart": "nano.heart",
  "heart.fill": "nano.heart.fill",
} as const;
export type TabiconsSymbolName = (typeof TabiconsSymbols)[keyof typeof TabiconsSymbols];
```

### `.fill` variant convention

iOS tab bars prefer a filled variant for the selected state, looked up by the `name` → `name.fill` naming convention. Ship `home.svg` *and* `home.fill.svg` and both symbolsets are generated — usable as explicit `default`/`selected` pairs:

```tsx
<NativeTabs.Trigger.Icon
  xcasset={{ default: TabiconsSymbols.heart, selected: TabiconsSymbols['heart.fill'] }}
/>
```

---

## Pipeline: `runSymbolPipeline(config, paths, options?)`

**File:** `src/core/pipeline/runSymbolPipeline.ts`

### Stage 1 — Shared SVG preparation (identical to the font pipeline)

**`prepareSvgLayers({ filePath, fileLabel, pathkit, logger })`** — **File:** `src/core/pipeline/prepare.ts`

This is the font pipeline's steps 2a–2h, extracted verbatim (see [PIPELINE.md](PIPELINE.md) for full detail):

1. **Validate** — reject `<mask>` / `<filter>`
2. **Preprocess** — ensure `xmlns`
3. **Flatten** (`src/core/flatten/`) — resolves `<use>`/`<clipPath>`/transforms, **converts strokes to fills**, everything becomes `<path>`
4. **Parse** — viewBox + per-path `{ d, fill, fillRule? }`, opacity baked into `rgba()` fills
5. **Convert evenodd to nonzero winding** (containment-based algorithm; converted paths marked `noMerge`)
6. **Merge consecutive same-color paths** into compound layers (z-order preserved)

Returns `{ viewBox, paths }` — z-ordered, same-color-merged, nonzero-winding **layers**.

This shared stage is exactly why symbol mode "falls out" of the existing architecture: a layer list with stable winding is simultaneously the input to glyph compilation *and* a valid SF Symbol layer structure. The two pipelines literally diverge at one variable.

> **Stroke handling for free:** Apple's template rules require *filled outlines only — no live strokes, no open paths*. Picosvg's stroke-to-fill conversion (step 4) means arbitrary stroke-based icon sets satisfy this without any symbol-specific code.

### Stage 2 — Divergence: template emission instead of font compilation

Where the font pipeline calls `transformPathForFont()` (Y-flip into font units) and accumulates `FontGlyph`s, the symbol pipeline:

1. Filters layers through `shouldSkipPath()` (drops empty/`fill:none` paths)
2. Calls **`buildSymbolTemplate({ layers, viewBox, descriptiveName })`**
3. Writes the `.symbolset` directory (template SVG + `Contents.json`)

No Y-flip — the template is itself an SVG (Y-down), so placement is a pure scale + translate.

---

## The Symbol Template

**File:** `src/core/symbols/template.ts`

### Anatomy

A custom SF Symbol template (version 3.0) is an SVG with three required top-level groups:

```
<svg width="800" height="600">
  <g id="Notes">      … human-readable labels, template-version marker …
  <g id="Guides">     … Capline/Baseline lines, H-reference glyph, margin guides …
  <g id="Symbols">
    <g id="Ultralight-S"> … paths …
    <g id="Regular-S">    … paths …
    <g id="Black-S">      … paths …
```

Geometry constants (validated against Xcode 26's `actool` and runtime rendering):

| Constant | Value | Meaning |
|---|---|---|
| Canvas | 800 × 600 | Compact skeleton (Apple's own export uses 3300×2200; the geometry is relative to guides, both compile) |
| `Capline-S` | y = 76 | Top of the Small-scale cap band |
| `Baseline-S` | y = 146 | Bottom of the cap band → **70-unit band height** |
| Variant columns | x = 265 / 465 / 665 | Centers for Ultralight-S / Regular-S / Black-S |
| Margin guides | `left/right-margin-<Weight>-S` | Vertical lines marking each variant's optical width |

### Placement math

```
scale = 70 / viewBox.height                  // fit-to-height into the cap band
if (viewBox.width * scale > 160)             // columns are 200 apart — clamp very
  scale = 160 / viewBox.width                // wide glyphs so variants can't overlap

tx = columnCenter − scaledWidth / 2          // center horizontally per column
ty = 76 + (70 − scaledHeight) / 2            // center vertically in the cap band
```

Each variant group gets a single affine `transform="matrix(s,0,0,s, tx − vx·s, ty − vy·s)"` (handles non-zero viewBox origins), and its margin guides are tightened to the scaled glyph bounds — the margins define the symbol's advance/optical box, analogous to the font pipeline's `advanceWidth`.

Fit-to-height mirrors `computePlacement()` in the font pipeline, so an icon set renders at consistent visual height in both output formats.

### Why three duplicated weight sources

A *variable* template requires exactly the `Ultralight-S`, `Regular-S`, `Black-S` sources; the system interpolates the other 24 weight/scale cells. Interpolation demands **point correspondence** — same path count, same point count, same start point, same winding across all three sources. Arbitrary SVGs can't provide hand-tuned weights, so we emit **the same paths into all three groups**:

- Point correspondence is trivially satisfied (identical geometry)
- `actool` compiles cleanly; the symbol renders the same design at every requested weight
- **Empirically required:** a Regular-S–only template is *rejected* by actool (`Symbol image file … must have a glyph for Regular weight Medium size`). Single-weight templates are not a thing; duplication is the correct degenerate form.

### Layer resolution: knockouts + occlusion

**File:** `src/core/symbols/layers.ts` → `resolveSymbolLayers()`

Monochrome rendering (what tab bars use) joins every layer into **one path** and fills it with the **nonzero winding rule**. Multicolor paints each layer on its own, back to front. Stacked SVG art breaks monochrome: a plate with light details painted on top becomes a solid block. The resolver turns such details into *knockouts*: holes in monochrome that multicolor still paints in their own fill.

1. **Which layers are knockouts.**
   - Annotated: any element with `data-nano-knockout` (it needs a value, e.g. `="true"`, to be valid XML) in the input SVG. On a group it applies to everything inside. When an icon has any annotation, only annotated layers are knockouts.
   - Automatic, when nothing is annotated: near-white layers (`r,g,b ≥ 240`, `α ≥ 0.9`) in an icon that also has non-white ink. An all-white icon has no knockouts.
2. **Occlusion.** Each layer is reduced to its visible region (path minus the union of layers above it). Ink layers are cut only by ink above them, never by a knockout, so ink stays whole under every knockout and no two ink layers overlap.
3. **Reversed winding.** A knockout's visible region is split against the monochrome silhouette beneath it:
   - The part over ink is emitted with **reversed winding**. In the monochrome join the ink beneath winds +1 there and the knockout −1, so the sum is 0: a hole. Multicolor paints the same part on top in the knockout's fill.
   - The part over nothing keeps normal winding and is drawn in both modes.

   Both parts go into one layer path, so multicolor shows no seam between them.
4. **Canonical winding.** Every layer of an icon with knockouts is re-oriented by contour containment (outer contours one direction, holes the other). PathKit's boolean ops return even-odd paths with arbitrary contour directions, and an SVG path string cannot carry the fill rule, so without this step a ring can turn into a filled shape under nonzero. Conic segments (from arcs) are converted to cubics first.

The resolver also returns the monochrome silhouette as one path. It feeds the Android monochrome drawable and the join check in the tests.

*Example:* the SWM logo (navy plate + white frame + white lettering). The plate stays whole and the frame and lettering become knockout layers. Tinted, it is an engraved silhouette with see-through text. In color, the text is white on navy on any background.

Icons without knockouts keep the plain occlusion path, so their output is unchanged.

**Annotation transport.** `data-*` attributes do not survive flattening. When an input contains `data-nano-knockout`, prep flattens a second copy in which the annotated elements' explicit fills and strokes are replaced by a marker color (`#fe01fe`), and tags every parsed path whose fill differs between the two flattens. If the two flattens disagree on the shape count (e.g. an annotated element whose paint is inherited as `none`), the annotations are ignored with a warning. Tagged paths are never merged with untagged paths of the same color.

Caveat: boolean subtraction along curved shared edges can leave hairline anti-aliasing seams between adjacent regions at very large render sizes; invisible at tab-bar sizes.

The package version and the toolchain versions are folded into the stored fingerprint, so upgrades invalidate cached outputs even when SVG inputs are unchanged.

### Color management: one asset, two rendering modes

The public API names the modes `monochrome` (one color, tinted by the host) and `original` (the asset's own colors). For SF Symbols `original` corresponds to Apple's **"multicolor"** rendering mode, which is why the layer classes below say `multicolor-N:custom` — that word is Apple's file format, not this library's API.

Monochrome rendering joins every layer into one nonzero-filled path in one color, regardless of class. No per-layer style can hide a layer in monochrome only (see the findings below). Knockouts are therefore expressed in geometry: a knockout layer winds against the ink beneath it, so the join has a hole there while multicolor still paints the layer.

What survives:

1. **Geometry** — the visible layers after occlusion. Identical in both modes.
2. **Knockouts** — holes in monochrome (the bar shows through), painted in their own fill in original.
3. **Fills** — each remaining layer's color, declared for the `original` (Apple: multicolor) mode. Fill opacity is kept: on iOS as an `opacity` property in the layer's multicolor rule (e.g. `.multicolor-0:custom {fill:#000000;opacity:0.3}`), on Android as `fillAlpha`.

Consequences for monochrome tinting are unchanged: side-by-side colored regions union into one shape, off-white tones (any channel below 240, or `α < 0.9`) are ink unless annotated, and gradients/patterns parse to black. The `original` mode shows those icons in their colors.

**Worked examples** (`examples/BareReactNativeExample`, `tabicons` set), tinted:

| Tab | Icon | Result | Why |
|---|---|---|---|
| **Mono** | `swm.svg` (navy plate + white frame/lettering) | ✅ engraved silhouette | white-over-navy → knockouts baked |
| **BlobFlag** | `AO.svg` (red top half + black bottom half + yellow/black emblem) | ❌ solid rectangle | all non-white ink; the two halves union to fill the box, the emblem fills the occlusion seam |
| **BlobWalk** | `person-walking.svg` (multicolor figure with off-white/grey detailing) | ❌ featureless silhouette | legibility is pure colour contrast; sub-threshold tones are drawn, not cut |

`usFlag.svg` is a deliberate *non*-example: its white stripes and stars **are** white-over-color knockouts, so it flattens to a recognizable striped silhouette — color management succeeds there for the same reason it fails for `AO`. Untinted, all four render in their own colors.

### Rendering-mode annotations

The template encodes rendering modes as per-layer CSS classes inside the one SVG (verified against actool and UIKit on iOS 26/27). `Contents.json` has no per-file rendering mode and a second SVG in the same slot is ignored by actool as an "unassigned child", so there is exactly one file.

```xml
<svg …>
  <style>
    .monochrome-0 {fill:#000000}
    .multicolor-0:custom {fill:#001A72}
    .monochrome-1 {fill:#000000}
    .multicolor-1:custom {fill:#FF0000}
  </style>
  …
  <g id="Regular-S" transform="matrix(…)">
    <path class="monochrome-0 multicolor-0:custom" d="…"/>
    <path class="monochrome-1 multicolor-1:custom" d="…"/>
  </g>
```

Rules the emitter follows, each one a verified failure mode otherwise (`multicolor` here is Apple's name for the `original` rendering mode):

- Every layer path gets `class="monochrome-N multicolor-N:custom"`, `N` = z-order index (back → front), unique per layer. Single-layer icons are annotated too.
- Custom colors are declared **only** in the `<style>` block placed right after the opening `<svg>` tag. `fill` attributes on the paths, `rgb()` fills, `custom-RRGGBB` suffixes and `SFSymbolsPreview…` classes are ignored by UIKit and render black — so layer paths carry no `fill` at all.
- Layer paths are **direct children** of the weight group. Any nested `<g>` inside `Ultralight-S`/`Regular-S`/`Black-S` breaks rendering (color layers vanish, knockouts fill in).
- The margin guides of every weight group equal the scaled glyph bounds, so the symbol is horizontally centered in its box; a guide left at a default width renders the glyph off-center in the tab bar.
- `Contents.json` keeps `symbol-rendering-intent: template`, so the default is tinted; the consumer selects the mode at runtime.

- A translucent layer's alpha goes into its multicolor rule as `opacity:<a>` (e.g. `.multicolor-0:custom {fill:#000000;opacity:0.3}`). The monochrome rule stays solid.
- A knockout layer gets the same classes as any other layer; only its winding differs (see [Layer resolution](#layer-resolution-knockouts--occlusion)).

Hierarchical/palette annotations are not emitted; those modes fall back to monochrome.

### Findings: what the template format can and cannot express

Measured in the Bare example (iOS 27 simulator, `<SFSymbol>` view and tab bar) and in the macOS render harness, with variants of the SWM logo on dark and green backgrounds, where a hole and white paint look different:

| Variant | Monochrome | Multicolor |
|---|---|---|
| Plate with the white details subtracted (holes only) | holes ✅ | holes, background shows through ❌ |
| Plate with holes + white layer, `.monochrome-1 {opacity:0}` | solid block ❌ | white ✅ |
| Plate with holes + white layer without a `monochrome-1` class | solid block ❌ | white ✅ |
| Full plate + white layer, `.monochrome-1 {-sfsymbols-clear-behind:true; opacity:0}` | solid block ❌ | white ✅ |
| **Full plate + white layer with reversed winding** | **holes ✅** | **white ✅** |

- Monochrome ignores per-layer styling and class membership. SF Symbols.app contains the string `monochrome-path-concatenation`, and the reversed-winding result fits: monochrome concatenates every layer path and fills the result with nonzero winding. This is not documented by Apple.
- The class grammar the app parses is `monochrome-N`, `multicolor-N:<name>`, `hierarchical-N:<name>` and `clearBehindLayer`. There is no per-mode erase class.
- `opacity` inside a `.multicolor-N:custom` rule is honored (iOS 18.6, 26.5, 27 and macOS 26.5), contrary to an earlier assumption that only `#RRGGBB` survives.

### Android: two drawables per icon

A VectorDrawable fills each `<path>` separately and never joins them, and the bar's tint paints every drawn pixel. Reversed winding therefore cannot make a hole, and one drawable cannot be a hole when tinted and painted when not. Each icon ships two drawables:

- `<prefix>_<icon>.xml` (monochrome): the silhouette as one solid black path. This also keeps translucent layers from showing at partial tint and avoids hairline seams where adjacent layers meet.
- `<prefix>_<icon>_original.xml` (original): every layer with its `fillColor` and `fillAlpha`.

### Runtime: `nativeNanoSymbol(name, renderingMode?, prefix?)`

`renderingMode` is `'monochrome'` (default) or `'original'`. The helper returns react-navigation's `Icon` shapes: `{ type: 'sfSymbol', name: '<prefix>.<name>', renderingMode }` on iOS and `{ type: 'image', source: { uri }, tinted }` on Android, where `uri` is `<prefix>_<name>` and `tinted: true` for monochrome, `<prefix>_<name>_original` and `tinted: false` for original. react-navigation's native bottom tabs pass the symbol's `renderingMode` to react-native-screens' `Tabs` (PR #4209), which applies `AlwaysTemplate` / `AlwaysOriginal` per slot on iOS, and map `tinted` to screens' Android `tinting` (`'tinted'` / `'original'`).

### `Contents.json`

**File:** `src/core/symbols/contents.ts`

```json
{
  "info": { "author": "xcode", "version": 1 },
  "properties": { "symbol-rendering-intent": "template" },
  "symbols": [{ "filename": "nano.home.svg", "idiom": "universal" }]
}
```

---

## Linking

Symbolsets must end up in an asset catalog **of the app target** (main bundle): tab libraries resolve names via `UIImage(named:)` against the main bundle, so shipping them in the library pod's `resource_bundles` would not work.

### Expo (config plugin)

**File:** `plugin/src/withNanoIconsSymbolLinking.ts`

A `withDangerousMod(['ios'])` writes the `.symbolset` folders into the **already-existing** `ios/<projectName>/Images.xcassets` during `expo prebuild`. The prebuild template creates and links that catalog, so **no pbxproj edits are needed** — actool compiles the new symbolsets automatically on the next build. Naturally idempotent under `prebuild --clean`. Build results are cached per process (`getOrBuildSymbols`, same pattern as fonts).

### Bare React Native (CLI)

**File:** `cli/link.ts` → `linkBareSymbols()`

1. **Primary path:** locate `ios/<App>/Images.xcassets` (present in the default RN template) and copy symbolsets in — again zero pbxproj changes.
2. **Fallback** (no Images.xcassets): create `ios/NanoIconsSymbols.xcassets` (with a root `Contents.json`) and register it once via the `xcode` package:
   `addResourceFile('NanoIconsSymbols.xcassets', { lastKnownFileType: 'folder.assetcatalog', sourceTree: '"<group>"', target })` — an asset catalog is a single *file reference* (compiled by actool), **not** a folder reference or per-file resources. Guarded by `hasFile()` for idempotency; failures degrade to a one-time manual instruction instead of a corrupted pbxproj.

### Stale-symbolset cleanup

`copySymbolsetsIntoCatalog()` first deletes catalog symbolsets whose names start with one of **our configured prefixes**, then copies the fresh set. Removed icons disappear from the catalog on the next build; user-owned symbolsets with other prefixes are untouched. This is why `prefix` is structural, not cosmetic.

### Incremental builds

`buildAllSymbols()` (**`cli/buildSymbols.ts`**) computes a SHA-256 input fingerprint (`fingerprintSymbolDirSync`: SVG names and contents, `prefix`, package and toolchain versions) and stores it in `<name>.symbolmap.json` (`m.h`). If the hash matches and every output exists, generation is skipped and the previous result is reconstructed from the symbolmap.

---

## Consumers

| Library | iOS mechanism | Custom symbols? |
|---|---|---|
| **react-native-screens `Tabs`** | `iconType: 'xcasset'` → `[UIImage imageNamed:]` (`RNSTabBarAppearanceCoordinator.mm`) | ✅ first-class (RNScreens ≥ 4.2x) |
| **expo-router `NativeTabs`** (SDK 55+) | `<Icon xcasset="…">` → RNScreens | ✅ — but see the bug below |
| **react-navigation v8** (alpha) | default bottom tabs wrap RNScreens | ✅ |
| **react-native-bottom-tabs** (Callstack) | SwiftUI `Image(systemName:)` only | ❌ — `systemName:` never resolves asset-catalog symbols; would need an upstream change |

The `xcasset` icon type (`imageNamed:`) always renders the template (tinted) mode. The runtime rendering-mode switch needs the `sfSymbol` icon type with `renderingMode`, which `nativeNanoSymbol()` returns.

Note there is **no automatic sf → xcasset fallback** in any library: the icon type is chosen explicitly in JS.

### Known issue: expo-router ≤ 56.2.8 xcasset conversion

`convertOptionsIconToScreensPropsIcon` (`expo-router/build/native-tabs/utils/optionsIconConverter.ios.js`) converts `xcasset` icons into `{ uri: name }` image sources handed to `RCTImageLoader` instead of RNScreens' native `xcasset` icon type. Two failure modes, both reproduced:

1. **Blank icons** — `RCTImageLoader` cannot resolve asset-catalog names (`The file "nano.home" couldn't be opened because there is no such file`).
2. **Crash** — `icon` and `selectedIcon` are converted with *each state's* icon color; if only one state has a color, one becomes `imageSource` and the other `templateSource` → `[RNScreens] icon and selectedIcon must be same type`.

**Fix (one line):** return `{ type: 'xcasset', name: icon.xcasset }` for xcasset icons. Committed in this repo as a Yarn patch — `.yarn/patches/expo-router-npm-56.2.8-*.patch` — applied to the Expo example via the `patch:` protocol in its `package.json`. Remove once fixed upstream. Direct RNScreens usage and react-navigation v8 are unaffected.

---

## Validation & Verification

### Headless compile gate (used in tests)

`actool` compiles and validates symbolsets as ordinary catalog members — there is no standalone validate mode, and **its exit code is 0 even on failure**; diagnostics must be parsed from output:

```sh
xcrun actool My.xcassets --compile /tmp/out \
  --platform iphoneos --minimum-deployment-target 15.0 --target-device iphone \
  --output-format human-readable-text --errors --warnings --notices
```

`__tests__/symbols.e2e.test.ts` runs this against pipeline output and asserts no `error:` lines + an `Assets.car` is produced (auto-skipped off macOS). Compiled symbols appear in `assetutil --info Assets.car` as `"AssetType": "Vector Glyph"` (4 renditions per symbol).

### What was empirically verified (Xcode 26.5, iOS 26.5 simulator)

- 3-source duplicated variable template compiles with zero diagnostics; Regular-S-only is rejected
- `NSImage/UIImage(named:)` loads the compiled symbol as a template image (`isTemplate == true`)
- Monochrome tint and `multicolor-N:custom` per-layer colors render correctly from the emitted class annotations + `<style>` block
- End-to-end in the Expo example (SDK 56): prebuild links symbolsets → app build compiles them → expo-router `NativeTabs` renders them tinted in the iOS 26 Liquid Glass tab bar, including the `heart`/`heart.fill` selected-state swap

### Knockout and rendering-mode matrix (Bare example, 2026-10)

Every symbol of the `tabicons` and `mcicon` sets in `monochrome`, `original`, the default and the `focused ? 'original' : 'monochrome'` switch, selected and unselected, against dark and green backgrounds:

| Target | Surface | Result |
|---|---|---|
| iOS 27, 26.5, 18.6 simulators | `<SFSymbol>` (monochrome / multicolor configuration) and react-native-screens tab bar (`AlwaysTemplate` / `AlwaysOriginal`) | knockouts are holes when tinted and painted in their fill in original; translucent layers keep their opacity |
| Android API 36 emulator | `<Image>` with each drawable and the native tab bar | monochrome drawable is a solid silhouette with holes (no partial tint, no seams); original drawable keeps fills, knockouts and alpha |

The tab-bar runs used react-native-screens with PR #4209 and react-navigation's bottom tabs mapping the icon fields to it.

### Quick macOS smoke harness (no app build)

Compile a catalog for `--platform macosx` into a minimal `.app` shell with a `swiftc` binary that calls `NSImage(named:)` + `withSymbolConfiguration` and writes PNGs — renders identically to iOS for symbol semantics. Useful for visually checking new emitter output in seconds.

---

## Performance

- **Generation**: per-icon prep runs in the same worker pool as the font pipeline (`src/core/pipeline/iconPool.ts`, one `prepareSymbol` task per SVG); the main thread only writes files. The symbol-specific work is string assembly — negligible. Incremental fingerprint skip avoids rebuilds entirely.
- **App build**: `actool` cost scales linearly on iOS (~3 s per 16 symbols on older measurements); tab icon sets are typically < 20 symbols. (Caution if ever shipping hundreds of symbols to **Mac Catalyst**, where actool has shown super-linear scaling.)
- **Disk**: compiled symbols are vector path data — ~0.8–1 kB per symbol in `Assets.car`.
- **Runtime**: rendering is fully owned by UIKit's symbol machinery (the same path as Apple's own symbols); name lookup is a hashed catalog lookup. Nothing from this library executes at runtime.

---

## Limitations

- **iOS only** for now. The same `symbolSets` entries are designed to later emit Android vector drawables (Android tabs tint drawables monochrome — same mental model).
- **Single weight** — all weights render the same design (interpolation needs hand-authored, point-compatible Ultralight/Black masters; not derivable from arbitrary SVGs).
- **Knockouts rely on undocumented behavior**: monochrome joining layers with nonzero winding (see the findings above). Verified on iOS 18.6, 26.5 and 27.
- **Hierarchical/palette modes are not annotated**; they fall back to monochrome.
- Same input constraints as the font pipeline: no `<mask>`/`<filter>`, `.svg` only.
- `react-native-bottom-tabs` unsupported (see Consumers).
- Liquid Glass (iOS 26) works with plain recompile; SF Symbols 7 *draw* animations (template 6.0 guide points) are out of scope.

---

## File Map (symbol-mode additions)

```
src/core/
├── pipeline/
│   ├── prepare.ts        # Shared SVG stages (extracted from runFontPipeline.ts; used by both pipelines)
├── pathkit/
│   └── winding.ts        # Canonical / reversed contour winding
│   ├── runSymbolPipeline.ts     # Symbol pipeline orchestrator + manifest/symbolmap emission
│   └── runFontPipeline.ts            # Font pipeline (now consumes prepare.ts; behavior unchanged)
├── symbols/
│   ├── template.ts       # Symbol template skeleton, placement math, rendering-mode annotations
│   ├── layers.ts         # Knockouts (reversed winding) + occlusion (PathKit)
│   ├── knockout.ts       # data-nano-knockout marker for the second flatten
│   ├── vectorDrawable.ts # Android VectorDrawable emitter
│   └── contents.ts       # Contents.json emitters (symbolset + catalog root)
cli/
├── buildSymbols.ts       # buildAllSymbols + fingerprint skip
├── config.ts             # .nanoicons.json: iconSets | symbolSets
└── link.ts               # linkBareSymbols, copySymbolsetsIntoCatalog
plugin/src/
├── buildSymbols.ts       # Expo build-once cache
└── withNanoIconsSymbolLinking.ts  # withDangerousMod → Images.xcassets
__tests__/
├── symbols.e2e.test.ts   # generation, annotations, manifest, skip, catalog copy, actool gate
└── symbolKnockout.unit.test.ts  # snapshots of template + both drawables, monochrome join checks
```

---

## References

- [Apple — Creating custom symbol images for your app](https://developer.apple.com/documentation/uikit/creating-custom-symbol-images-for-your-app)
- [WWDC21 — Create custom symbols](https://developer.apple.com/videos/play/wwdc2021/10250/) (template anatomy, path rules, point correspondence)
- [Apple HIG — SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)
- react-native-screens iOS tab icon resolution: `ios/tabs/RNSTabBarAppearanceCoordinator.mm`
- Template skeleton geometry cross-checked against [swhitty/SwiftDraw](https://github.com/swhitty/SwiftDraw) (zlib) and [snowball-tools/ConvertSVGToSFSymbol](https://github.com/snowball-tools/ConvertSVGToSFSymbol) (MIT)
