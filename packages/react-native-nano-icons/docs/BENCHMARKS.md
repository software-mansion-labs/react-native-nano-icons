# Benchmarks

## Setup

1,000 icons rendered in a `ScrollView` on **iPhone 15 Pro**, iOS 18, Release build, New Architecture (Fabric), React Native 0.84.0. Averaged over **20 runs** per library.

Each library was tested in isolation — only one screen was registered on the `Icons` route in [`App.tsx`](../../../examples/NanoIconsBenchmarking/App.tsx) at a time, with the other imports commented out to avoid polluting the bundle:

```tsx
const RootStack = createNativeStackNavigator({
  initialRouteName: 'Home',
  screens: {
    Home: HomeScreen,
    Icons: NanoIconsScreen,
    // Icons: SVGIconsScreen,
    // Icons: ExpoImageIconsScreen,
    // Icons: ExpoVectorIconsScreen,
  },
});
```

Each screen pre-creates the icon array at module scope and renders it inside a `ScrollView`. For example, [`NanoIconsScreen.tsx`](../../../examples/NanoIconsBenchmarking/screens/NanoIconsScreen.tsx):

```tsx
const materialIcons = Object.keys(glyphMap.i) as (keyof typeof glyphMap.i)[];

const Icons = materialIcons.map(name => (
  <MaterialIcon key={name} name={name} size={52} />
));

export default function NanoIconsScreen() {
  return (
    <View>
      <ScrollView>{Icons}</ScrollView>
    </View>
  );
}
```

Other screens follow the same pattern: [`SVGIconsScreen.tsx`](../../../examples/NanoIconsBenchmarking/screens/SVGIconsScreen.tsx) uses `react-native-svg` components via `require.context`, [`ExpoImageIconsScreen.tsx`](../../../examples/NanoIconsBenchmarking/screens/ExpoImageIconsScreen.tsx) uses `expo-image` `<Image>`, and [`ExpoVectorIconsScreen.tsx`](../../../examples/NanoIconsBenchmarking/screens/ExpoVectorIconsScreen.tsx) uses `@expo/vector-icons` with an IcoMoon font.

Measurement was done with Xcode Instruments. The [`HomeScreen`](../../../examples/NanoIconsBenchmarking/screens/HomeScreen.tsx) button navigates to the icon screen, triggering the render being profiled.

## Results

| Library | JS Thread (ms) | Main Thread (ms) | Hang (ms) |
| :--- | ---: | ---: | ---: |
| `react-native-svg` | 192.03 | 292.15 | — |
| `expo-image` | 78.07 | 922.03 | 415.32 |
| `@expo/vector-icons` (IcoMoon) | 119.51 | 370.41 | 277.58 |
| **`react-native-nano-icons`** | **74.97** | **155.04** | **—** |

Times are absolute and include React Native screen navigation overhead (shared across all libraries).

- **JS Thread** — time executing JavaScript to create and mount components.
- **Main Thread** — native UI thread rendering time.
- **Hang** — main-thread stall during initial load ([Apple docs](https://developer.apple.com/documentation/xcode/understanding-hangs-in-your-app)). A dash means no hang was recorded.
