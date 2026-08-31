# Nano Icons — SVG → Custom SF Symbol Pipeline

Complete documentation of how SVG icons are converted into Apple **custom SF Symbols** (`.symbolset` asset-catalog entries) for native bottom-tab bars and any other consumer of `UIImage(named:)` / SwiftUI `Image(_:)`.

---

## Overview

```
SVG files → picosvg (flatten) → parse paths → evenodd conversion → same-color merge
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

Unlike the font pipeline (which produces glyphs *we* render via CoreText), symbol mode produces assets that **the OS renders**. The result is a first-class system symbol: native tinting, selected/unselected tab states, weight/scale configuration, hierarchical/palette rendering modes, and automatic Liquid Glass treatment in iOS 26 tab bars — with zero runtime code in this library.

### Why this exists

Native bottom-tab libraries (react-native-screens `Tabs`, expo-router `NativeTabs`, react-navigation v8) render tab items natively — they cannot consume the icon font. Their icon APIs accept either built-in SF Symbol names or asset-catalog names. Symbol mode makes any SVG addressable through the second path:

```tsx
<NativeTabs.Trigger.Icon xcasset={TabIconsSymbols.home} />
```

---

## What Was Done (Change Summary)

| Area | Change |
|---|---|
| `src/core/pipeline/prepare.ts` | **New.** Shared per-file SVG stages (validate → picosvg → parse → evenodd → merge) extracted from `runFontPipeline.ts` so both pipelines reuse identical preprocessing. `runFontPipeline.ts` behavior is unchanged. |
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

**No new dependencies were added.** The symbol pipeline reuses the existing toolchain end to end: Pyodide/picosvg for flattening, PathKit for geometry, `jsdom` for parsing, the `xcode` package (already used for font linking) for the pbxproj fallback. Template emission is pure string assembly. Compilation/validation is done by Xcode's own `actool` at app build time.

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
- **`name`** drives output filenames (`tabicons.symbols.ts`, `tabicons.symbolmap.json`, `tabicons.symbols/`) and the manifest export name (`TabiconsSymbols`).

### Outputs (per set)

```
<outputDir>/
├── <name>.symbols/
│   ├── <prefix>.<icon>.symbolset/
│   │   ├── <prefix>.<icon>.svg     # the symbol template
│   │   └── Contents.json
│   └── ...
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

**`prepareSvgLayers({ filePath, fileLabel, PathKit, logger })`** — **File:** `src/core/pipeline/prepare.ts`

This is the font pipeline's steps 2a–2h, extracted verbatim (see [PIPELINE.md](PIPELINE.md) for full detail):

1. **Validate** — reject `<mask>` / `<filter>`
2. **Preprocess** — ensure `xmlns`
3. **Pre-extract evenodd `d` strings** (picosvg's simplify can drop contours)
4. **Flatten via picosvg** (Pyodide) — resolves `<use>`/`<clipPath>`/transforms, **converts strokes to fills**, everything becomes `<path>`
5. **Parse** — viewBox + per-path `{ d, fill, fillRule? }`, opacity baked into `rgba()` fills
6. **Restore evenodd originals**, then **convert to nonzero winding** (containment-based algorithm; converted paths marked `noMerge`)
7. **Merge consecutive same-color paths** into compound layers (z-order preserved)

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

### Layer resolution: erase baking + occlusion knockout

**File:** `src/core/svg/svg_pathops.ts` → `resolveSymbolLayers()`

Symbol layers **blend** (paint-over), and monochrome rendering — what tab bars use — draws the **union** of all layers in one color. Stacked SVG art breaks under this model: a solid plate with light details painted on top becomes a featureless blob. Two geometric transforms fix it before template emission:

1. **Erase baking.** Near-white layers (`r,g,b ≥ 240`, `α ≥ 0.9`) painted over darker geometry are the canonical *knockout* idiom in logo art — they map to Apple's per-layer erase semantics, which we bake: the white layer is **subtracted from every layer below it and not emitted**. Guards: an all-white icon is never erased (it's figure on transparent ground), and a white layer that overlaps nothing beneath it stays drawn.
   *Example:* the SWM logo (navy plate + white frame + white lettering) resolves to a single navy layer with the frame line and "software mansion" knocked out — the classic engraved tab-icon silhouette, instead of a solid blob.
2. **Occlusion knockout.** Every remaining layer is reduced to its **visible region** (path minus the union of layers above it, via PathKit `DIFFERENCE`/`UNION`), so hierarchical/palette modes tint distinct regions instead of overlapping paint. Fully-hidden layers are dropped.

Caveat: boolean subtraction along curved shared edges can leave hairline anti-aliasing seams between adjacent regions at very large render sizes; invisible at tab-bar sizes.

The generator version (`GENERATOR_VERSION` in `cli/buildSymbols.ts`) is folded into the stored fingerprint, so emitter changes invalidate cached outputs even when SVG inputs are unchanged.

### Color management: what survives flattening, and when it blobs

A monochrome `.symbolset` carries **no color**. The original fills are used only as *signals* during resolution and are then discarded — the emitted template has path geometry and `class` annotations but no `fill` at all. Exactly three things survive:

1. **Geometry** — the silhouette after erase baking + occlusion.
2. **White knockouts** — near-white-over-darker regions become holes (the only color semantic that is baked).
3. **Z-order → tier** — layer stacking drives the `hierarchical-N:<tier>` annotations (≤ 3 distinct tiers).

Everything else about color is gone. This works **only for the white-knockout logo idiom** (a solid shape with near-white details cut out of it). Art that relies on color any other way flattens to a single tinted **blob** — the union of all ink in one color:

- **Side-by-side colored regions** (no overlap, no white) union into one solid shape. The whole point of the icon is lost.
- **Off-white / light-grey details** (any channel `< 240`, or `α < 0.9`) fall below the knockout threshold → drawn as ink, not cut out.
- **Dark-on-light cutouts** (a dark detail meant to read as a hole) are ink, never a knockout — only *white*-on-darker is recognized.
- **Gradients / patterns** (`fill="url(#…)"`) and unknown fills parse to black (`parseColor`), so they become opaque ink.

To keep an icon's actual colors, set `multicolor: true` (the colored-symbol path below) or, for app content, use the font pipeline's `<NanoIcon>`.

**Worked examples** (`examples/BareReactNativeExample`, monochrome `tabicons` set):

| Tab | Icon | Result | Why |
|---|---|---|---|
| **Mono** | `swm.svg` (navy plate + white frame/lettering) | ✅ engraved silhouette | white-over-navy → knockouts baked |
| **BlobFlag** | `AO.svg` (red top half + black bottom half + yellow/black emblem) | ❌ solid rectangle | all non-white ink; the two halves union to fill the box, the emblem fills the occlusion seam |
| **BlobWalk** | `person-walking.svg` (multicolor figure with off-white/grey detailing) | ❌ featureless silhouette | legibility is pure colour contrast; sub-threshold tones are drawn, not cut |

`usFlag.svg` is a deliberate *non*-example: its white stripes and stars **are** white-over-color knockouts, so it flattens to a recognizable striped silhouette — color management succeeds there for the same reason it fails for `AO`.

### Rendering-mode annotations (multicolor → hierarchical/palette layers)

The resolved z-ordered layers map onto Apple's symbol layer system via plain `class` attributes on paths (no SF Symbols.app involved):

```xml
<!-- 2-layer icon (e.g. a twotone heart): back layer first -->
<path class="monochrome-0 hierarchical-0:secondary" d="…"/>
<path class="monochrome-1 hierarchical-1:primary"   d="…"/>
```

- Layer index = z-order (back → front); the **front-most layer is `primary`**, then `secondary`, `tertiary` going back (extra back layers share `tertiary`)
- Single-layer icons are emitted **plain** (no classes) — a pure tintable template glyph
- Verified at runtime: hierarchical rendering applies tiered opacity per layer; palette rendering (`SymbolConfiguration(paletteColors:)`) colors layers independently

Original SVG *colors* are dropped for symbols — they are template images; color is supplied at render time by the system (tab tint) or by the consumer (palette/hierarchical configuration). To keep an icon's **original colors**, use the colored-symbol path below instead.

### Colored ("avatar") symbols: `multicolor: true`

A monochrome symbol is always template-tinted by `UITabBar` (the native convention). When a symbolSet sets `multicolor: true`, the pipeline emits the **colored symbol** as a plain vector `.imageset` instead of a `.symbolset`, so the icon renders in its **original colors** in the bar.

Why this works (verified, Xcode 26 / iOS 26):
- A regular imageset with `Contents.json` `properties: { "template-rendering-intent": "original" }` makes `[UIImage imageNamed:]` return an image whose `renderingMode == .alwaysOriginal`. `UITabBar` honors that and shows the image in full color — **no native patch** (RNScreens' `xcasset` type already just calls `imageNamed:`). Spike-confirmed: a navy/orange/white icon rendered colored in the bar while monochrome symbols stayed tinted.
- This is distinct from the *symbol* `symbol-rendering-intent: original`, which is symbol-only and **is** ignored by the bar — that earlier dead end was the wrong property, not proof the bar can't show color.

**Emitter** (`src/core/symbols/coloredSymbol.ts`, `buildColoredSymbolSvg`): the prepared layers are serialized straight to a plain SVG with their **original fills and z-order** (normal paint-over — no symbol knockout/erase). Fills are normalized via `parseColor` to `fill="rgb(r,g,b)"` + `fill-opacity` (SVG has no valid `rgba()` fill). The asset uses the source viewBox; iOS aspect-fits it into the tab slot. Vector data is preserved (`preserves-vector-representation: true`) so it stays crisp at any size.

Trade-offs, by design:
- **No per-state tint** — a colored (`.alwaysOriginal`) image looks the same selected and unselected (avatar style). Use the `.fill` convention to ship a distinct selected asset if needed.
- For *exact* original colors in app **content** (not tabs), the font pipeline's `<NanoIcon>` is lossless.
- The flag participates in the build fingerprint (`:mcN`), so toggling it regenerates outputs.
- **Name collision:** a monochrome set and a colored set must not share `prefix` + icon name — both compile to the same asset-catalog name. The linker's stale-cleanup spans both `.symbolset` and `.imageset`, so flipping a set's `multicolor` correctly replaces its assets.

### `Contents.json`

**File:** `src/core/symbols/contents.ts`

Symbol (`.symbolset`):
```json
{
  "info": { "author": "xcode", "version": 1 },
  "properties": { "symbol-rendering-intent": "template" },
  "symbols": [{ "filename": "nano.home.svg", "idiom": "universal" }]
}
```

Colored image (`.imageset`, `multicolor: true`):
```json
{
  "images": [{ "filename": "nano.home.svg", "idiom": "universal" }],
  "info": { "author": "xcode", "version": 1 },
  "properties": { "preserves-vector-representation": true, "template-rendering-intent": "original" }
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

`buildAllSymbols()` (**`cli/buildSymbols.ts`**) computes the same SHA-256 input fingerprint as the font pipeline (`getFingerprintSync`) and stores it in `<name>.symbolmap.json` (`m.h`). If the hash matches and every output exists, generation is skipped and the previous result is reconstructed from the symbolmap.

---

## Consumers

| Library | iOS mechanism | Custom symbols? |
|---|---|---|
| **react-native-screens `Tabs`** | `iconType: 'xcasset'` → `[UIImage imageNamed:]` (`RNSTabBarAppearanceCoordinator.mm`) | ✅ first-class (RNScreens ≥ 4.2x) |
| **expo-router `NativeTabs`** (SDK 55+) | `<Icon xcasset="…">` → RNScreens | ✅ — but see the bug below |
| **react-navigation v8** (alpha) | default bottom tabs wrap RNScreens | ✅ |
| **react-native-bottom-tabs** (Callstack) | SwiftUI `Image(systemName:)` only | ❌ — `systemName:` never resolves asset-catalog symbols; would need an upstream change |

Both `.symbolset` (monochrome) and `.imageset` (colored, `multicolor: true`) are consumed identically via the `xcasset` icon type — `imageNamed:` resolves either by name.

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
- Monochrome tint, hierarchical tiers, and palette per-layer colors all render correctly from hand-authored class annotations
- End-to-end in the Expo example (SDK 56): prebuild links symbolsets → app build compiles them → expo-router `NativeTabs` renders them tinted in the iOS 26 Liquid Glass tab bar, including the `heart`/`heart.fill` selected-state swap

### Quick macOS smoke harness (no app build)

Compile a catalog for `--platform macosx` into a minimal `.app` shell with a `swiftc` binary that calls `NSImage(named:)` + `withSymbolConfiguration` and writes PNGs — renders identically to iOS for symbol semantics. Useful for visually checking new emitter output in seconds.

---

## Performance

- **Generation**: shares the already-initialized Pyodide/PathKit singletons with the font pipeline; the symbol-specific work is string assembly — negligible. Incremental fingerprint skip avoids rebuilds entirely.
- **App build**: `actool` cost scales linearly on iOS (~3 s per 16 symbols on older measurements); tab icon sets are typically < 20 symbols. (Caution if ever shipping hundreds of symbols to **Mac Catalyst**, where actool has shown super-linear scaling.)
- **Disk**: compiled symbols are vector path data — ~0.8–1 kB per symbol in `Assets.car`.
- **Runtime**: rendering is fully owned by UIKit's symbol machinery (the same path as Apple's own symbols); name lookup is a hashed catalog lookup. Nothing from this library executes at runtime.

---

## Limitations

- **iOS only** for now. The same `symbolSets` entries are designed to later emit Android vector drawables (Android tabs tint drawables monochrome — same mental model).
- **Single weight** — all weights render the same design (interpolation needs hand-authored, point-compatible Ultralight/Black masters; not derivable from arbitrary SVGs).
- **Monochrome symbols are tinted by the bar** (native convention). For original colors set `multicolor: true` → colored `.imageset`; colored icons don't tint per selected/unselected state.
- Same input constraints as the font pipeline: no `<mask>`/`<filter>`, `.svg` only.
- `react-native-bottom-tabs` unsupported (see Consumers).
- Liquid Glass (iOS 26) works with plain recompile; SF Symbols 7 *draw* animations (template 6.0 guide points) are out of scope.

---

## File Map (symbol-mode additions)

```
src/core/
├── pipeline/
│   ├── prepare.ts        # Shared SVG stages (extracted from runFontPipeline.ts; used by both pipelines)
│   ├── runSymbolPipeline.ts     # Symbol pipeline orchestrator + manifest/symbolmap emission
│   └── runFontPipeline.ts            # Font pipeline (now consumes prepare.ts; behavior unchanged)
├── symbols/
│   ├── template.ts       # Symbol template skeleton, placement math, hierarchical annotations
│   ├── coloredSymbol.ts  # Colored symbol SVG emitter → .imageset (multicolor: true)
│   └── contents.ts       # Contents.json emitters (symbolset + imageset + catalog root)
cli/
├── buildSymbols.ts       # buildAllSymbols + fingerprint skip
├── config.ts             # .nanoicons.json: iconSets | symbolSets
└── link.ts               # linkBareSymbols, copySymbolsetsIntoCatalog
plugin/src/
├── buildSymbols.ts       # Expo build-once cache
└── withNanoIconsSymbolLinking.ts  # withDangerousMod → Images.xcassets
__tests__/
└── symbols.e2e.test.ts   # generation, annotations, manifest, skip, catalog copy, actool gate
```

---

## References

- [Apple — Creating custom symbol images for your app](https://developer.apple.com/documentation/uikit/creating-custom-symbol-images-for-your-app)
- [WWDC21 — Create custom symbols](https://developer.apple.com/videos/play/wwdc2021/10250/) (template anatomy, path rules, point correspondence)
- [Apple HIG — SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)
- react-native-screens iOS tab icon resolution: `ios/tabs/RNSTabBarAppearanceCoordinator.mm`
- Template skeleton geometry cross-checked against [swhitty/SwiftDraw](https://github.com/swhitty/SwiftDraw) (zlib) and [snowball-tools/ConvertSVGToSFSymbol](https://github.com/snowball-tools/ConvertSVGToSFSymbol) (MIT)
