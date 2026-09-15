import { memo, useMemo } from 'react';
import { PixelRatio, UIManager, View, processColor } from 'react-native';
import type { NanoGlyphMapInput, GlyphEntry } from './core/types';
import type { IconComponent, IconProps } from './types';
import { shallowEqualColor } from './utils/shallowEqualColor';
import {
  DEFAULT_ICON_SIZE,
  resolveGlyphEntry,
  createLayerColorResolver,
} from './utils/glyphRuntime';
import NanoIconViewNative from './specs/NanoIconViewNativeComponent';
import {
  createJSIconSet,
  warnIfLinkingMismatch,
} from './createNanoIconsSet.shared';
import { loadDynamicFont, useDynamicFontPending } from './loadDynamicFont';

export type { IconComponent, IconProps };
export { shallowEqualColor };

const HAS_NATIVE_IMPL = UIManager.hasViewManagerConfig('NanoIconView');

// Shared processColor cache — avoids redundant color parsing for repeated
// color strings like "black", "rgba(0,0,0,0.3)" across thousands of icons
const processedColorCache = new Map<string, number>();
function cachedProcessColor(color: string): number {
  let result = processedColorCache.get(color);
  if (result === undefined) {
    result = (processColor(color) ?? 0xff000000) as number;
    processedColorCache.set(color, result);
  }
  return result;
}

export function createIconSet<GM extends NanoGlyphMapInput>(
  glyphMap: GM
): IconComponent<GM>;
export function createIconSet<GM extends NanoGlyphMapInput>(
  glyphMap: GM,
  font: unknown
): IconComponent<GM>;
export function createIconSet<GM extends NanoGlyphMapInput>(
  glyphMap: GM,
  font?: unknown
): IconComponent<GM> {
  if (!HAS_NATIVE_IMPL) {
    return createJSIconSet(glyphMap, font);
  }

  const fontFamilyBasename = glyphMap.m.f;
  const unitsPerEm = glyphMap.m.u;
  warnIfLinkingMismatch(fontFamilyBasename, glyphMap.m.l, font);

  // dynamically linked font - register and hide icons until ready
  const managed = glyphMap.m.l === 'd' && font != null;
  if (managed) {
    void loadDynamicFont(fontFamilyBasename, font).catch((err) => {
      if (__DEV__)
        console.warn(
          `[react-native-nano-icons] Failed to load dynamic font "${fontFamilyBasename}".`,
          err
        );
    });
  }

  // Pre-compute per-icon static data (codepoints, default colors) once at set creation
  // Avoids layers.map() + processColor per icon mount
  const codepointsCache = new Map<string, readonly number[]>();
  const defaultColorsCache = new Map<string, readonly number[]>();

  function getCodepoints(
    name: string,
    layers: GlyphEntry[1]
  ): readonly number[] {
    let cp = codepointsCache.get(name);
    if (!cp) {
      cp = layers.map(([c]) => c);
      codepointsCache.set(name, cp);
    }
    return cp;
  }

  function getDefaultColors(
    name: string,
    layers: GlyphEntry[1]
  ): readonly number[] {
    let colors = defaultColorsCache.get(name);
    if (!colors) {
      colors = layers.map(([, srcColor]) =>
        cachedProcessColor(srcColor ?? 'black')
      );
      defaultColorsCache.set(name, colors);
    }
    return colors;
  }

  const Icon = memo(
    ({
      name,
      size = DEFAULT_ICON_SIZE,
      color,
      style,
      allowFontScaling = true,
      accessible,
      accessibilityLabel,
      accessibilityRole = 'image',
      accessibilityElementsHidden,
      importantForAccessibility,
      testID,
      ref,
    }: IconProps<keyof GM['i']>) => {
      const fontScale = allowFontScaling ? PixelRatio.getFontScale() : 1;
      const [adv, layers] = resolveGlyphEntry(glyphMap, name);
      const scaledSize = size * fontScale;
      const width = (adv / unitsPerEm) * scaledSize;

      const pending = useDynamicFontPending(managed, fontFamilyBasename);

      const nameStr = name as string;
      const codepoints = getCodepoints(nameStr, layers);

      const processedColors = useMemo(() => {
        // Fast path: no custom color — use pre-computed defaults
        if (color === undefined || color === null) {
          return getDefaultColors(nameStr, layers);
        }
        const resolveColor = createLayerColorResolver(color);
        return layers.map(([, srcColor], i) =>
          cachedProcessColor(resolveColor(i, srcColor) as string)
        );
      }, [nameStr, color]);

      const nativeStyle = useMemo(
        () => [{ width, height: scaledSize }, style],
        [scaledSize, width, style]
      );

      // Hide-until-ready: while the dynamic font is registering, render a
      // placeholder. The native view mounts only once the font is registered.
      if (pending) {
        return (
          <View
            ref={ref}
            style={nativeStyle}
            accessible={accessible}
            accessibilityRole={accessibilityRole}
            accessibilityLabel={accessibilityLabel ?? (name as string)}
            accessibilityElementsHidden={accessibilityElementsHidden}
            importantForAccessibility={importantForAccessibility}
            testID={testID}
          />
        );
      }

      return (
        <NanoIconViewNative
          ref={ref}
          fontFamily={fontFamilyBasename}
          codepoints={codepoints}
          colors={processedColors}
          fontSize={size}
          advanceWidth={adv}
          unitsPerEm={unitsPerEm}
          iconWidth={width}
          iconHeight={scaledSize}
          style={nativeStyle}
          accessible={accessible}
          accessibilityRole={accessibilityRole}
          accessibilityLabel={accessibilityLabel ?? (name as string)}
          accessibilityElementsHidden={accessibilityElementsHidden}
          importantForAccessibility={importantForAccessibility}
          testID={testID}
        />
      );
    },
    (prev, next) =>
      prev.name === next.name &&
      prev.size === next.size &&
      prev.allowFontScaling === next.allowFontScaling &&
      prev.style === next.style &&
      shallowEqualColor(prev.color, next.color)
  );

  Icon.displayName = `NanoIcon(${fontFamilyBasename})`;

  const IconComp = Icon as unknown as IconComponent<GM>;
  IconComp.loadFont = (override) =>
    glyphMap.m.l === 'd'
      ? loadDynamicFont(fontFamilyBasename, override ?? font, { force: true })
      : Promise.resolve();
  return IconComp;
}
