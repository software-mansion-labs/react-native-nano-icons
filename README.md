<div align="center">

![Nano Icons (light mode)](packages/react-native-nano-icons/docs/img/logo-nanoicons-default.svg#gh-light-mode-only)
![Nano Icons (dark mode)](packages/react-native-nano-icons/docs/img/logo-nanoicons-inverted.svg#gh-dark-mode-only)

<br>
</div>

# High-performance, build-time icon font generation for React Native & Expo.

`react-native-nano-icons` automates the conversion of SVG directories into optimized, **multi-color-aware** native fonts and strictly typed TypeScript component factories. It leverages a WebAssembly-powered skia pathops binary build pipeline to recaculate your vectors into a glyph-friendly manner ensuring pixel-perfect geometry and zero runtime overhead.

 <picture>                          
    <source media="(prefers-color-scheme: dark)"         
  srcset="packages/react-native-nano-icons/docs/img/nano-
  icons-graph-light-inverted.svg">
    <source media="(prefers-color-scheme: light)"        
  srcset="packages/react-native-nano-icons/docs/img/nano-
  icons-graph-light-default.svg">                        
    <img alt="Nano Icons Graph"                          
  src="packages/react-native-nano-icons/docs/img/nano-ico
  ns-graph-light-default.svg" height="300">
  </picture>

<details>
<summary>Repo Navigation</summary>
This repository is a Yarn workspaces monorepo containing the library package and example apps.

##### Package

- **Library source:** [`packages/react-native-nano-icons/`](packages/react-native-nano-icons/)

##### Examples

- **Bare React Native app:** [`examples/BareReactNativeExample/`](examples/BareReactNativeExample/)
- **Expo app:** [`examples/ExpoExample/`](examples/ExpoExample/)
</details>

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

| Property       | Type     | Required | Default        | Description                                                                                                                |
| :------------- | :------- | :------- | :------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `inputDir`     | `string` | **Yes**  | —              | Path to the directory containing your `.svg` files (e.g., `./assets/icons/ui`).                                            |
| `fontFamily`   | `string` | No       | Folder Name    | The name of the generated font family and file. If omitted, the name of the `inputDir` folder is used (e.g., `ui`).        |
| `outputDir`    | `string` | No       | `../nanoicons` | Path where the `.ttf` and `.json` artifacts will be saved. Defaults to a sibling `nanoicons` folder relative to the input. |
| `upm`          | `number` | No       | `1024`         | Units Per Em. Defines the resolution of the font grid.                                                                     |
| `startUnicode` | `string` | No       | `0xe900`       | The starting Hex Unicode point for the first icon glyph.                                                                   |

  <details>
  <summary>Default Dir Path Behavior</summary>
  If you do not specify an `outputDir` or `fontFamily`, the library attempts to keep your project organized by creating a   sibling folder.

- **Input:** `./assets/icons/user`
- **Resulting Output:** `./assets/icons/nanoicons/user.ttf` & `user.glyphmap.json`
  </details>
  </details>

#### 2.2 Bare React Native/React Native Web (no Expo)

Bare apps don’t have a prebuild step, so you run the same pipeline via the CLI yourself:

1. **Config** – Add a `.nanoicons.json` with the same `iconSets` shape as the Expo plugin (see "All iconSets Entry Plugin Options" above) to your project.
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
   npx react-native-nano-icons --path path/to/.nanoicons.json
   ```

   This works exactly like the config plugin, removing any necessity for manual Xcode/Android Studio font linking steps.

> [!NOTE]
> Linking the font on web is just as straightforward as always and does not require any other actions then usual font addition does.

> [!TIP]
> Run `EXPO_DEBUG=1 npx expo prebuild` or `npx react-native-nano-icons --verbose` to get font build-time logs.

### 3. Creating an Icon Set Component

Use the factory function to create a fully typed component for your specific icon set.

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
      <UserIcon name="avatar-1" size={32} />

      // Overrides all color layers with the provided colors respectively
      <UserIcon name="avatar-1" size={24} colorPalette={["blue", "#ffffff", "#fc2930"]} />

      // Renders icon inline within a paragraph
      <Text>
        User <UserIcon name="avatar-1" size={12}  /> liked your photo!
      </Text>
    </>
  );
}
```

Your color icon can have as many colors as your original svg has, therefore you should experiment to establish which element of the array corresponds to the layer you aim to change the color of.
If the icon is single-color by design (which results in creating a single glyph during build-time) only the first element is took into consideration, and if the `colorPalette` array is too short - the last color is repeated.

> [!IMPORTANT]
> **You should always verify your icons visually.**

### 5. Font Regeneration

The script detects changes in path and contents of the SVGs in your input directory based on a fingerprint hash. Had anything changed (i.e. file names, svg attributes/contents), or the output font files had been deleted, a given icon-set is regenerated during `prebuild` or manual script run.

---

## License

`react-native-nano-icons` is released under the **MIT License**. See [LICENSE](LICENSE) for the full text.

---

## Nano Icons are created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=react-native-nano-icons-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).

<!-- automd:contributors author="software-mansion" -->

Made by [@software-mansion](https://github.com/software-mansion) 💛
<br><br>
<a href="https://github.com/software-mansion-labs/react-native-nano-icons/graphs/contributors">
<img src="https://contrib.rocks/image?repo=software-mansion-labs/react-native-nano-icons" />
</a>
