# react-native-nano-icons

**High-performance, build-time icon font generation for React Native & Expo.**

`react-native-nano-icons` automates the conversion of SVG directories into optimized, **multi-color-aware** native fonts and strictly typed TypeScript component factories. It leverages a WebAssembly-powered binary build pipeline to ensure pixel-perfect geometry and zero runtime overhead.

---

## 🚀 Usage

### 1. Installation

```bash
npm install react-native-nano-icons
```

### 2. Expo Configuration

The library uses an Expo Config Plugin to hook into the prebuild phase. This automatically generates the .ttf and corresponding glyph-map files and links them to the native iOS/Android projects.

`app.json`

```JSON
{
  "expo": {
    "plugins": [
      [
        "react-native-nano-icons",
        {
          "iconSets": [
            {
              "inputDir": "./assets/icons/user",
              "fontFamily": "UserIcons",
              "upm": 1024,
              "startUnicode": "0xe900"
            },
            {...anotherSet}, ...
          ]
        }
      ]
    ]
  }
}
```

The plugin accepts an object with an `iconSets` array, allowing you to generate multiple distinct fonts in a single build.

| Property       | Type     | Mandatory | Default        | Description                                                                                                                |
| :------------- | :------- | :-------- | :------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `inputDir`     | `string` | **Yes**   | —              | Path to the directory containing your `.svg` files (e.g., `./assets/icons/ui`).                                            |
| `fontFamily`   | `string` | No        | Folder Name    | The name of the generated font family and file. If omitted, the name of the `inputDir` folder is used (e.g., `ui`).        |
| `outputDir`    | `string` | No        | `../nanoicons` | Path where the `.ttf` and `.json` artifacts will be saved. Defaults to a sibling `nanoicons` folder relative to the input. |
| `upm`          | `number` | No        | `1024`         | Units Per Em. Defines the resolution of the font grid.                                                                     |
| `startUnicode` | `string` | No        | `0xe900`       | The starting Hex Unicode point for the first icon glyph.                                                                   |

**Default Path Behavior:**
If you do not specify an `outputDir` or `fontFamily`, the library attempts to keep your project organized by creating a sibling folder.

- **Input:** `./assets/icons/user`
- **Resulting Output:** `./assets/icons/nanoicons/user.ttf` & `user.glyphmap.json`
- **Resulting Component Name:** `user` (derived from folder name)

**Plugin layout (for contributors)**  
The Expo plugin lives under `plugin/src/`: `index.ts` wires the config and applies build + linking; `buildFonts.ts` runs the pipeline (one Pyodide/PathKit instance for the whole run); `linkFonts.ts` copies TTFs into iOS and Android like expo-font. The pipeline is in `src/core/pipeline/` and is reused by both the CLI and the plugin. The plugin skips font generation for an icon set if the corresponding output folder already exists and contains the expected `.ttf` and `.glyphmap.json` (a future version will use fingerprint diffing to rebuild only when inputs change). The package name is read from `package.json` everywhere; use `getPackageName()` (exported from the main package and used internally in the plugin) instead of hardcoding it.

### 3. Creating an Icon Set

Use the factory function to create a typed component for your specific icon set. This enables multiple distinct sets (e.g., "Outlined", "Solid", "Brand") within a single app.

`src/components/Icon.tsx`

```TypeScript
import { createNanoIconSet } from "react-native-nano-icons";
// auto-generated during build-time
import glyphMap from "../../assets/nanoicons/UserIcons.glyphmap.json";

const FONT_FAMILY = "UserIcons";

export const UserIcon = createNanoIconSet(glyphMap, {
  postScriptName: FONT_FAMILY,
  fontFileName: `${FONT_FAMILY}.ttf`,
});
```

### 4. Component Usage

The generated component supports standard `Text` props **excluding** `style.color | .fontWeight | .fontFamily`.

To manipulate the color(s) of the icon you should provide `colorPalette: ColorValue[]` (same type as [Expo LinearGradient](https://docs.expo.dev/versions/latest/sdk/linear-gradient/) `colors`).

The `name` prop corresponds to the original name of the svg file for a given icon.

```TypeScript
import { Icon } from './components/Icon';

export default function App() {
  return (
    // Renders the icon with its original multi-color layers from the SVG
    <Icon name="avatar-1" size={32} />

    // Overrides all color layers with the provided colors respectively
    <Icon name="avatar-1" size={24} colorPalette={["blue", "#ffffff", "#fc2930"]} />
  );
}
```

Your color icons can have as many colors as your original svg has, therefore you should experiment to establish which element of the array corresponds to the layer you aim to change the color of.
If the icon is single-color by design (which results in creating a single glyph during build-time) only the first element is took into consideration, and if the `colorPalette` array is too short - the last color is repeated.

You should always verify your icons visually.

---

# 💡 Architecture & Pipeline

## 1. The Problem: SVGs in React Native

Handling vector icons in React Native has historically been a trade-off between **performance**, **flexibility**, and **maintainability**.

As highlighted in [**"You might not need react-native-svg"**](https://blog.swmansion.com/you-might-not-need-react-native-svg-b5c65646d01f) by Software Mansion, the standard approaches have significant drawbacks:

- **`react-native-svg`**: While powerful, it is memory-heavy and computationally expensive. Parsing XML strings and constructing the shadow tree on the native side adds significant bridge overhead, especially for lists with hundreds of icons.
- **`expo-image` / PNGs**: Rendering is performant, but you lose vector scalability. Crucially, you cannot manipulate colors at runtime. Additionally, the asynchronous rendering pipeline often results in a split-second "blink" or layout shift when icons load.

**The Solution: Native Fonts**
Native text rendering is one of the most optimized pipelines in any OS. Rendering a character from a `.ttf` file is synchronous, memory-efficient, and roughly **3x faster** than rendering the equivalent path via `react-native-svg`.

## 2. Why Custom Color Mapping instead of COLRv1?

Standard Color Fonts (OpenType-SVG or COLRv1) might seem like the obvious choice, but they are currently unfit for cross-platform app development:

1.  **Platform Fragmentation:** COLRv1 is only supported on Android API 33+ (Android 13). iOS uses a completely different standard (SBIX or SVG-in-OT).
2.  **Rigidity:** Standard color fonts bake their palettes into the font file. Changing the color of a specific layer dynamically (e.g., _"change the user's shirt to blue but keep their face color"_) is notoriously difficult with standard native text APIs.

**Our Approach:**
We split multi-color SVGs into separate **monochrome glyphs** mapped to private-use Unicode points. The React Native component reassembles them using absolute positioning based on a generated glyph map. This gives us the speed of native text rendering with the flexibility to override any specific color layer dynamically via props.

## 3. Current build pipeline (overview)

End-to-end flow:

1. **SVG → flattened SVG (WASM)**  
   Each input SVG is processed by **picosvg** (Python) running inside **Pyodide**. We do **not** use nanoemoji or a separate font tool in Python. Instead, picosvg flattens transforms, resolves clipping paths via pathops, and simplifies paths. It uses a **PathKit (WASM)** backend for path operations: we expose a small JS bridge (`_pathops_js`) so picosvg's `pathops` calls are satisfied by **pathkit-wasm** (Skia PathOps in WASM). A single Pyodide + PathKit instance is reused for all icon sets in a run.

2. **Flattened SVG → glyph layers (Node)**  
   The flattened SVG string is parsed in Node (`src/core/pipeline/svg_dom.ts`). We compute placement (viewBox, safe zone, UPM), split paths by fill color, and write one small SVG per path segment into a temp directory (codepoints like `u+e900.svg`).

3. **Glyph SVGs → TTF + glyph map (Node)**  
   We use **svgicons2svgfont** (stream) and **svg2ttf** to produce the `.ttf`. The glyph map (icon name → list of `{ hex, color }`) is built in the pipeline and written as `[fontFamily].glyphmap.json`. Font metrics are normalized in `src/core/font/metrics.js`.

So: **Pyodide + picosvg + PathKit** handle only the "SVG → clean path data" step; all font assembly is done in Node with standard npm packages.

## 4. The geometry challenge: why pathops matters

Font engines (FreeType, CoreText) expect simple, closed contours (Bézier curves). They **do not** support:

- CSS Transforms (`transform="matrix(...)"`)
- Clipping paths (`<clipPath>`)
- Masks or Filters
- Even-Odd winding rules

Simple optimizers (e.g. **svgo**) mostly minify XML; they do not _recalculate_ geometry. **picosvg** (backed by Skia-style pathops) flattens transforms, resolves clips with boolean ops, and simplifies paths so the result is font-ready. The Pyodide + PathKit proof of concept showed that **this level of pathops is sufficient** for correct, production-quality glyphs.

## 5. Pyodide as proof of concept; target: pure TypeScript

The current pipeline uses **Pyodide** to run picosvg in the browser/Node so we can rely on battle-tested geometry without asking users to install Python or C++ toolchains. The aim is to **rewrite the SVG→flattened-and-normalized-path step in pure TypeScript**, while still leveraging Skia PathOps (e.g. pathkit-wasm or a future pure-TS/JS pathops that matches Skia's behavior). The Pyodide setup was the proof that pathops is the right level of abstraction; the long-term goal is a single JS/TS pipeline with no Python, with the same quality of output.

## Module system (ESM only)

This package is **ESM-only**: `package.json` has `"type": "module"`, so all `.js` files are treated as ES modules. Relative imports use the `.js` extension so the same code works under Node (e.g. the pipeline and Expo plugin) and Metro. The Expo plugin entry point is `app.plugin.js` (ESM with `export default`). There are no `.cjs`/`.mjs` variants—one format keeps things simple.

---

# 🚧 Current State & Roadmap

## 1. Current State

We have a **working pipeline** that runs entirely from npm (no local Python required):

- **SVG → flattened path data:** Pyodide runs **picosvg** (Python) with a **PathKit (WASM)** backend for pathops (`pathkit-wasm`). One Pyodide + PathKit instance is reused for all icon sets in a prebuild/run. We do **not** use nanoemoji; picosvg only flattens and simplifies geometry.
- **Font assembly:** Done in Node with **svgicons2svgfont** and **svg2ttf**. The pipeline writes per-path glyph SVGs to a temp dir, then compiles to `.ttf` and `[fontFamily].glyphmap.json`.
- **Expo Config Plugin:** `withNanoIcons` runs the pipeline during prebuild and links the generated TTFs into iOS/Android. Raw SVGs stay as build-time inputs only.

## 2. Roadmap

### Build optimization

- **Current:** Simple existence check per icon set (skip if `.ttf` and `.glyphmap.json` already exist in the output dir).
- **Future:** Fingerprinting (e.g. hash input SVG dir, compare to `.nanoicons.lock`) to rebuild only when inputs change.

### Pure TypeScript geometry (target)

The Pyodide + picosvg setup was a **proof of concept** that Skia-level pathops is sufficient for correct glyphs. The aim is to **rewrite the SVG→flattened-path step in pure TypeScript**, still leveraging Skia PathOps (e.g. pathkit-wasm or a future pure-TS pathops). That would remove the Python/WASM dependency while keeping the same output quality.

### Bare React Native

For projects not using Expo Prebuild: run the pipeline yourself (e.g. `runPipeline` from the pipeline module) and copy the generated `.ttf` files into `android/app/src/main/assets/fonts/` and into the iOS project (Resources + `UIAppFonts` in Info.plist).

### Testing

- **Visual regression:** Compare rendered React Native icons to original SVGs across devices/OS versions.

---

# License

This library is released under the **MIT License**. See [LICENSE](LICENSE) for the full text.

Third-party dependency licenses are listed in [LICENSES.md](LICENSES.md).
