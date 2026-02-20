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
            },
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

#### Bare React Native (no Expo)

Bare apps don’t have a prebuild step, so you run the same pipeline via the CLI and ship the built fonts into the native project yourself:

1. **Config** – At the app root, add a `.nanoicons.json` with the same `iconSets` shape as the Expo plugin (see table above). Paths in `inputDir` are relative to the app root.
2. **Build and link** – From the app root run:
   ```sh
   npx react-native-nano-icons
   ```
   This builds each icon set (output goes to a `nanoicons` folder next to each `inputDir`, e.g. `./assets/nanoicons/`), then links them: on Android it copies `.ttf` files into `android/app/src/main/assets/fonts`; on iOS it stages fonts in `ios/nanoicons-fonts/`, updates `Info.plist` (`UIAppFonts`), and adds a **Run Script** build phase named **"Copy nanoicons fonts"** that copies those fonts into the app bundle at build time (no manual Xcode step).
3. **Use the icons** – Create an icon set component that imports the generated `.glyphmap.json` (see _Creating an Icon Set_). Your JS bundle and native build will then use the same font and glyphmap paths.

You can add a script to `package.json` for convenience, e.g. `"nanoicons": "react-native-nano-icons"`, and run `npm run nanoicons` whenever you add or change SVGs.

### 3. Creating an Icon Set

Use the factory function to create a typed component for your specific icon set. This enables multiple distinct sets (e.g., "Outlined", "Solid", "Brand") within a single app.

`src/components/Icon.tsx`

```TypeScript
import { createNanoIconSet } from "react-native-nano-icons";
// auto-generated during build-time
import glyphMap from "../../assets/nanoicons/UserIcons.glyphmap.json";

export const UserIcon = createNanoIconSet(glyphMap);
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

    // Renders icon inline within a paragraph
    <Text>
      User <Icon name="avatar-1" size={24}  /> liked your photo!
    </Text>
  );
}
```

Your color icons can have as many colors as your original svg has, therefore you should experiment to establish which element of the array corresponds to the layer you aim to change the color of.
If the icon is single-color by design (which results in creating a single glyph during build-time) only the first element is took into consideration, and if the `colorPalette` array is too short - the last color is repeated.

You should always verify your icons visually.

---

# 💡 Architecture & Pipeline

see [MOTIVATION.md](packages/react-native-nano-icons/docs/MOTIVATION.md)

---

# License

This library is released under the **MIT License**. See [LICENSE](LICENSE) for the full text.

Third-party dependency licenses are listed in [LICENSES.md](LICENSES.md).

roadmap :

- inline icons (not selectable) [done]
- fingerprint?
- babel plugin: replace glyphmap signs in bundle time
- native text component - lighter?
- codepoint instead of hex in gh [done]
- add meta data to glypmap to simplyfy icon component factory [done]
- simplyfi docs to min example + details
- exclude input svg assets from bundle
