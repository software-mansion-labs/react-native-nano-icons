import { memo, useMemo } from 'react';
import { PixelRatio, UIManager, processColor } from 'react-native';
import type { NanoGlyphMapInput, GlyphEntry } from './core/types';
import type { IconComponent, IconProps } from './types';
import { shallowEqualColor } from './utils/shallowEqualColor';
import NanoIconViewNative from './specs/NanoIconViewNativeComponent';
import { createJSIconSet } from './createNanoIconsSet.shared';

export type { IconComponent, IconProps };
export { shallowEqualColor };

const DEFAULT_ICON_SIZE = 12;

const HAS_NATIVE_IMPL = UIManager.hasViewManagerConfig('NanoIconView');

export function createIconSet<GM extends NanoGlyphMapInput>(
  glyphMap: GM
): IconComponent<GM> {
  if (!HAS_NATIVE_IMPL) {
    return createJSIconSet(glyphMap);
  }

  const fontFamilyBasename = glyphMap.m.f;
  const unitsPerEm = glyphMap.m.u;

  const resolveEntry = (name: keyof GM['i']): GlyphEntry => {
    return (glyphMap.i[name as string] ?? [
      unitsPerEm,
      [[63, 'black']],
    ]) as GlyphEntry;
  };

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
      testID,
      ref,
    }: IconProps<keyof GM['i']>) => {
      const fontScale = allowFontScaling ? PixelRatio.getFontScale() : 1;
      const [adv, layers] = resolveEntry(name);
      const scaledSize = size * fontScale;
      const width = (adv / unitsPerEm) * scaledSize;

      const colorArray = Array.isArray(color) ? color : [color];
      const lastPaletteColor = colorArray?.length
        ? colorArray[colorArray.length - 1]
        : undefined;

      const codepoints = useMemo(
        () => layers.map(([cp]) => cp),

        [name]
      );

      const processedColors = useMemo(
        () =>
          layers.map(([, srcColor], i) => {
            const layerColor =
              colorArray?.[i] ?? lastPaletteColor ?? srcColor ?? 'black';
            return (processColor(layerColor) ?? 0xff000000) as number;
          }),

        [name, color]
      );

      const nativeStyle = useMemo(
        () => [{ width, height: scaledSize }, style],
        [scaledSize, width, style]
      );

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

  return Icon;
}
