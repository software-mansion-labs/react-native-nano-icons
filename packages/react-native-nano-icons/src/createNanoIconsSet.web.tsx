import { memo, useMemo, type CSSProperties } from 'react';
import type { NanoGlyphMapInput } from './core/types';
import type { IconComponent, IconProps } from './types';
import { shallowEqualColor } from './utils/shallowEqualColor';
import {
  DEFAULT_ICON_SIZE,
  resolveGlyphEntry,
  createCharCache,
  createLayerColorResolver,
} from './utils/glyphRuntime';

export type { IconComponent, IconProps };
export { shallowEqualColor };

// Web renderer: uses inline <span> elements so icons flow out of the box (display: inline-block keeps width/height)
export function createIconSet<GM extends NanoGlyphMapInput>(
  glyphMap: GM
): IconComponent<GM> {
  const fontBasename = glyphMap.m.f;
  const unitsPerEm = glyphMap.m.u;
  const getChar = createCharCache();

  const Icon = memo(
    ({
      name,
      size = DEFAULT_ICON_SIZE,
      color,
      style,
      accessible,
      accessibilityLabel,
      accessibilityRole = 'image',
      accessibilityElementsHidden,
      testID,
      ref,
    }: IconProps<keyof GM['i']>) => {
      const [adv, layers] = resolveGlyphEntry(glyphMap, name);
      const width = (adv / unitsPerEm) * size;

      const resolveColor = createLayerColorResolver(color);

      const containerStyle = useMemo<CSSProperties>(
        () => ({
          display: 'inline-block',
          position: 'relative',
          width,
          height: size,
          lineHeight: 0,
          verticalAlign: 'middle',
          ...(style as CSSProperties | undefined),
        }),
        [size, width, style]
      );

      const layerBaseStyle = useMemo<CSSProperties>(
        () => ({
          position: 'absolute',
          left: 0,
          bottom: 0,
          fontFamily: fontBasename,
          fontWeight: 'normal',
          fontStyle: 'normal',
          fontSize: size,
          lineHeight: 1,
          whiteSpace: 'pre',
        }),
        [size]
      );

      const isHidden = accessible === false || accessibilityElementsHidden;
      const role = accessibilityRole === 'image' ? 'img' : accessibilityRole;

      return (
        <span
          ref={ref as React.Ref<HTMLSpanElement>}
          style={containerStyle}
          role={isHidden ? undefined : role}
          aria-label={
            isHidden ? undefined : (accessibilityLabel ?? (name as string))
          }
          aria-hidden={isHidden || undefined}
          data-testid={testID}>
          {layers.map(([codepoint, srcColor], i) => {
            const layerColor = resolveColor(i, srcColor);
            return (
              <span
                key={i}
                aria-hidden
                style={{ ...layerBaseStyle, color: layerColor as string }}>
                {getChar(codepoint)}
              </span>
            );
          })}
        </span>
      );
    },
    (prev, next) =>
      prev.name === next.name &&
      prev.size === next.size &&
      prev.style === next.style &&
      shallowEqualColor(prev.color, next.color)
  );

  Icon.displayName = `NanoIcon(${fontBasename})`;

  // No-op on web: fonts come from CSS @font-face, nothing to load at runtime.
  const IconComp = Icon as unknown as IconComponent<GM>;
  IconComp.loadFont = () => Promise.resolve();
  return IconComp;
}
