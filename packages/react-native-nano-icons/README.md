# react-native-nano-icons

**High-performance, build-time icon font generation for React Native & Expo.**

`react-native-nano-icons` automates the conversion of SVG directories into optimized, **multi-color-aware** native fonts and strictly typed TypeScript component factories. It leverages a WebAssembly-powered skia pathops binary build pipeline to ensure pixel-perfect geometry and zero runtime overhead.

---

## 🧩 Platforms Supported

- [x] iOS
- [x] Android
- [x] Web

> [!NOTE]
> `<filter>` and `<mask>` are not yet supported, due to native fonts' glyph limitations.
> In order to leverage those features, use [`react-native-svg`](https://github.com/software-mansion/react-native-svg) or [`expo-image`](https://docs.expo.dev/versions/latest/sdk/image/)

## 🚀 Usage

### 1. Installation

```bash
npm install react-native-nano-icons
```

### 2. Configuration

#### 2.1. Expo

The library uses an Expo Config Plugin to hook into the prebuild phase. This automatically generates the `.ttf` and corresponding `glyphmap` files and links them to the native iOS/Android project's assets.

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
              "inputDir": "./assets/icons/user"
            }
          ]
        }
      ]
    ]
  }
}
```

<details>
<summary>All iconSets Entry Plugin Options</summary>

The plugin accepts an object with an `iconSets` array, allowing you to generate multiple distinct fonts in a single build.

| Property       | Type     | Mandatory | Default        | Description                                                                                                                |
| :------------- | :------- | :-------- | :------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `inputDir`     | `string` | **Yes**   | —              | Path to the directory containing your `.svg` files (e.g., `./assets/icons/ui`).                                            |
| `fontFamily`   | `string` | No        | Folder Name    | The name of the generated font family and file. If omitted, the name of the `inputDir` folder is used (e.g., `ui`).        |
| `outputDir`    | `string` | No        | `../nanoicons` | Path where the `.ttf` and `.json` artifacts will be saved. Defaults to a sibling `nanoicons` folder relative to the input. |
| `upm`          | `number` | No        | `1024`         | Units Per Em. Defines the resolution of the font grid.                                                                     |
| `startUnicode` | `string` | No        | `0xe900`       | The starting Hex Unicode point for the first icon glyph.                                                                   |

  <details>
  <summary>Default Dir Path Behavior</summary>
  If you do not specify an `outputDir` or `fontFamily`, the library attempts to keep your project organized by creating a   sibling folder.

- **Input:** `./assets/icons/user`
- **Resulting Output:** `./assets/icons/nanoicons/user.ttf` & `user.glyphmap.json`
  </details>
</details>

#### 2.2 Bare React Native (no Expo)

Bare apps don’t have a prebuild step, so you run the same pipeline via the CLI and ship the built fonts into the native project yourself:

1. **Config** – At the app root, add a `.nanoicons.json` with the same `iconSets` shape as the Expo plugin (see "All iconSets Entry Plugin Options above").
   <details>
    <summary>.nanoicons.json example</summary>
    
    ```JSON
    {
      "iconSets": [
        {
          "inputDir": "./assets/icons/user"
        }
      ]
    }
    ```
    
    </details>

2. **Build and link** – From the app root run:

   ```sh
   npx react-native-nano-icons
   ```

   This works exactly like the config plugin, removing any necessity for manual Xcode/Android Studio steps.

### 3. Creating an Icon Set Component

Use the factory function to create a fully typed component for your specific icon set. This enables multiple distinct sets (e.g., "Outlined", "Solid", "Brand") within a single app.

`src/components/UserIcon.tsx`

```TypeScript
import { createNanoIconSet } from "react-native-nano-icons";
// auto-generated during build-time in outputDir
import glyphMap from "../../assets/nanoicons/UserIcons.glyphmap.json";

export const UserIcon = createNanoIconSet(glyphMap);
```

### 4. Component Usage

The generated component supports standard `Text` props **excluding** `style.color | .fontWeight | .fontFamily`.

To manipulate the color(s) of the icon you should provide `colorPalette: ColorValue[]`.

The `name` prop corresponds to **the original name of the svg file** for a given icon.

```TypeScript
import { Text } from 'react-native'
import { UserIcon } from './components/UserIcon';

export default function App() {
  return (
    <>
      // Renders the icon with its original multi-color layers from the SVG
      <Icon name="avatar-1" size={32} />

      // Overrides all color layers with the provided colors respectively
      <Icon name="avatar-1" size={24} colorPalette={["blue", "#ffffff", "#fc2930"]} />

      // Renders icon inline within a paragraph
      <Text>
        User <Icon name="avatar-1" size={12}  /> liked your photo!
      </Text>
    </>
  );
}
```

Your color icons can have as many colors as your original svg has, therefore you should experiment to establish which element of the array corresponds to the layer you aim to change the color of.
If the icon is single-color by design (which results in creating a single glyph during build-time) only the first element is took into consideration, and if the `colorPalette` array is too short - the last color is repeated.

### 5. Font Regeneration

The script detects changes in path and contents of the SVGs in your input directory based on a fingerprint hash. If anything changed, or the output font files are deleted, a given icon-set is regenerated.

> [!IMPORTANT]
> **You should always verify your icons visually.**

---

## 💡 Architecture & Pipeline & Examples

see [MOTIVATION.md](docs/MOTIVATION.md)

---

## License

`react-native-nano-icons` is released under the **MIT License**. See [LICENSE](LICENSE) for the full text.

---

Built by [Software Mansion](https://swmansion.com/).

[<img width="128" height="69" alt="Software Mansion Logo" src="https://github.com/user-attachments/assets/f0e18471-a7aa-4e80-86ac-87686a86fe56" />](https://swmansion.com/)
