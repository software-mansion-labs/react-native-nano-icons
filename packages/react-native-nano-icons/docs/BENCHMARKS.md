# Benchmark Methodology

## Test Scenario

Render 1,000 instances of the same icon in a `ScrollView`, measuring the time spent on the JS thread, UI (main) thread, and any main-thread microhangs during initial load.

## Device & Build Configuration

> **TODO**: Re-measure on a physical device. Current data was captured on an iOS simulator.

| Parameter | Value |
| :--- | :--- |
| Device | TBD (physical device) |
| OS | iOS TBD |
| Build type | Release |
| Architecture | New Architecture (Fabric) |
| React Native | 0.84.0 |

## Libraries Tested

| Library | Version | Rendering approach |
| :--- | :--- | :--- |
| `react-native-svg` | TBD | Native SVG view tree — parses XML per icon instance |
| `expo-image` | TBD | Async image decode with caching |
| `@expo/vector-icons` (IcoMoon) | TBD | Font glyph rendering via IcoMoon-generated fonts |
| `react-native-nano-icons` | TBD | Font glyph rendering with layered multicolor support |

## What is measured

- **JS Thread (ms)** — Time spent executing JavaScript to create and mount icon components.
- **UI Thread (ms)** — Time spent on the native main thread to render icon views.
- **Microhang (ms)** — Duration of main thread stalls during initial load that can cause visible UI freezes. See [Apple's documentation on understanding hangs](https://developer.apple.com/documentation/xcode/understanding-hangs-in-your-app).

All three phases are sequential: JS execution happens first, then UI thread rendering, then any decode/load stalls (microhang). This is why the chart uses stacked bars.

## How to Reproduce

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/software-mansion-labs/react-native-nano-icons.git
   cd react-native-nano-icons
   yarn install
   ```

2. Build the example app in release mode:
   ```bash
   cd examples/ExpoExample
   npx expo prebuild
   # Build for iOS release via Xcode, or:
   # npx expo run:ios --configuration Release
   ```

3. The example app contains separate screens for each library (`NanoIconsScreen`, `SVGIconsScreen`, `ExpoImageIconsScreen`, `ExpoVectorIconsScreen`). Each screen renders 1,000 icons in a ScrollView.

4. Use Instruments (iOS) or the React Native release profiler to capture thread timing. The example app includes a `useStopProfiling` hook from `react-native-release-profiler` for automated measurement.

## Raw Data

> **TODO**: Add raw timing data table after re-measuring on a physical device.

| Library | JS Thread (ms) | UI Thread (ms) | Microhang (ms) | Total (ms) |
| :--- | ---: | ---: | ---: | ---: |
| `react-native-svg` | — | — | — | — |
| `expo-image` | — | — | — | — |
| `@expo/vector-icons` | — | — | — | — |
| `react-native-nano-icons` | — | — | — | — |

## Notes

- Measurements should be taken on a physical device. Simulator results tend to be faster than real hardware due to host CPU/memory advantages.
- Results can vary between runs. Take the average of 3–5 runs.
- Ensure no other heavy processes are running on the device during measurement.
- The profiling hooks in the example app are currently commented out in screen components — uncomment them before measuring.
