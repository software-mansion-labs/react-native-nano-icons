# nano-icons-ios

Pure native Swift package (no React Native) that renders icons from a
generated icon font, using the same rendering strategy as
`react-native-nano-icons`.

## How rendering works

Icons are compiled into a TTF where each icon is one or more glyphs
("color layers"), plus a compact glyph map JSON describing every icon:

```json
{
  "m": { "f": "SWMIconsOutline", "u": 1024 },
  "i": { "Bell": [1024, [[59666, "#001A72"]]] }
}
```

- `m.f` — font family (must equal the TTF PostScript/full name)
- `m.u` — unitsPerEm
- each icon — advance width + ordered layers of `[codepoint, defaultColor]`

`NanoIconView` registers the TTF via `CTFontManagerRegisterFontsForURL`,
maps each layer's codepoint to a `CGGlyph` (surrogate pairs for codepoints
above `0xFFFF`), then draws all layers with `CTFontDrawGlyphs` at the same
baseline in a Y-flipped context. Multicolor icons come out of painter's-order
stacking of the layers. The glyph box is fit to the view with
`fitScale = bounds.height / (ascent + descent)` and the baseline sits at
`(0, descent)`. Rendered width is `advance / unitsPerEm * pointSize`.

## API

```swift
import NanoIcons

// registers the font + parses <name>.ttf / <name>.glyphmap.json from a bundle
let set = try NanoIconSet(named: "SWMIconsOutline")
// or explicit URLs: NanoIconSet(fontURL:glyphMapURL:)

// UIKit
let view = NanoIconView(set: set, name: "Bell", pointSize: 32)
view.iconColor = .systemRed  // nil = per-layer defaults from the glyph map

// SwiftUI
NanoIcon(set: set, name: "Bell", size: 32, color: .systemRed)
```

`NanoIconSet` caches a `CTFont` per size; the cache is unsynchronized, so
use a set from the main thread only.

## Regenerating fonts

The TTF + glyph map pairs are produced by the CLI in
`packages/react-native-nano-icons` (see its README / `src/cli`), which
compiles SVGs into an icon font and emits the matching `.glyphmap.json`.
Copy both files into your app bundle.

## Example + benchmark app

```sh
brew install xcodegen
cd example
xcodegen generate
xcodebuild -project NanoIconsExample.xcodeproj -scheme NanoIconsExample \
  -destination 'generic/platform=iOS Simulator' build
```

Then run `NanoIconsExample` in a simulator. Two tabs:

- **Gallery** — sample of SWMIconsOutline icons (default colors and
  recolored) plus MaterialIconsTwotone multicolor icons.
- **Benchmark** — renders a grid of 500/1000/2000 icons with either
  `NanoIconView` or `UIImageView` + SF Symbols and reports wall time from
  trigger to the next completed frame (CADisplayLink). Launching with the
  env var `AUTORUN_BENCH=1` (`SIMCTL_CHILD_AUTORUN_BENCH=1 xcrun simctl
  launch ...`) auto-runs the NanoIconView x1000 case, handy for automation.

## Building the library alone

```sh
xcodebuild -scheme NanoIcons -destination 'generic/platform=iOS Simulator' build
```
