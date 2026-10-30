import { memo, type CSSProperties } from 'react';
import * as ReactDOM from 'react-dom';
import type { NanoGlyphMapInput } from './core/types';
import type { IconComponent, IconProps } from './types';
import { areIconPropsEqual } from './utils/iconPropsEqual';
import { iconAccessibilityProps } from './utils/iconAccessibility';
import {
  resolveGlyphEntry,
  createCharCache,
  createLayerColorResolver,
  squareGlyphBox,
} from './utils/glyphRuntime';
import { configuredFontFamily } from './utils/fontIdentity';
import { loadFontFromDevServer } from './devServerFont.web';
import { resolveWebStyle } from './utils/webStyle';
import {
  BASE_CSS,
  BASE_HREF,
  ICON_CLASS,
  STYLE_HREF,
  STYLE_PRECEDENCE,
  followsTextColor,
  shortHash,
} from './utils/webCss';
import { registerWebFont, warnFontNotLoaded, webFontUrl } from './webFont';

export type { IconComponent, IconProps };

// Web renderer: uses inline <span> elements so icons flow out of the box (display: inline-block keeps width/height)
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
  const family = glyphMap.m.f;
  const fontBasename = configuredFontFamily(family);

  const fontFamily =
    family === fontBasename
      ? JSON.stringify(fontBasename)
      : `${JSON.stringify(family)}, ${JSON.stringify(fontBasename)}`;

  const unitsPerEm = glyphMap.m.u;
  const safeZone = glyphMap.m.z;
  const getChar = createCharCache();
  const fontUrl = webFontUrl(font);

  const fontFace = fontUrl && {
    href: `${STYLE_HREF}:${shortHash(`${fontBasename}:${fontUrl}`)}`,
    css: `@font-face{font-family:${JSON.stringify(fontBasename)};src:url(${JSON.stringify(fontUrl)});font-display:block}`,
  };

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (font != null && fontUrl === undefined) {
      warnFontNotLoaded(fontBasename);
    }
    if ((globalThis as { document?: unknown }).document !== undefined) {
      void loadFontFromDevServer(family);
    }
  }

  const Icon = memo(
    ({
      name,
      size,
      color,
      tintMode,
      frame,
      style,
      accessible,
      accessibilityLabel,
      accessibilityRole,
      accessibilityElementsHidden,
      importantForAccessibility,
      testID,
      className,
      ref,
    }: IconProps<keyof GM['i']>) => {
      const [adv, layers] = resolveGlyphEntry(glyphMap, name);
      const square = frame === 'square';

      if (fontUrl && !fontUrl.startsWith('data:')) {
        ReactDOM.preload?.(fontUrl, { as: 'font', crossOrigin: 'anonymous' });
      }

      const containerStyle = {
        '--nano-icon-ratio': square ? 1 : adv / unitsPerEm,
        fontFamily,
        ...(size === undefined ? null : { fontSize: size }),
        ...resolveWebStyle(style),
      } as CSSProperties;

      const inheritColor = color == null && followsTextColor(layers);
      const resolveColor = createLayerColorResolver(color, tintMode, layers);
      const box = square ? squareGlyphBox(adv, unitsPerEm, safeZone) : null;
      const layerBoxStyle: CSSProperties | undefined = box
        ? {
            fontSize: `${box.scale}em`,
            left: `calc(50% - ${adv / unitsPerEm / 2}em)`,
            bottom: 'calc(50% - 0.5em)',
          }
        : undefined;

      const accessibility = iconAccessibilityProps({
        accessible,
        accessibilityLabel,
        accessibilityRole,
        accessibilityElementsHidden,
        importantForAccessibility,
      });
      const isHidden =
        accessibility.accessible === false ||
        accessibility.accessibilityElementsHidden === true;
      const role =
        accessibility.accessibilityRole === 'image'
          ? 'img'
          : accessibility.accessibilityRole;

      return (
        <>
          <style href={BASE_HREF} precedence={STYLE_PRECEDENCE}>
            {BASE_CSS}
          </style>
          {fontFace ? (
            <style href={fontFace.href} precedence={STYLE_PRECEDENCE}>
              {fontFace.css}
            </style>
          ) : null}
          <span
            ref={ref as React.Ref<HTMLSpanElement>}
            className={className ? `${ICON_CLASS} ${className}` : ICON_CLASS}
            style={containerStyle}
            role={isHidden ? undefined : role}
            aria-label={
              isHidden ? undefined : accessibilityLabel || (name as string)
            }
            aria-hidden={isHidden || undefined}
            data-testid={testID}>
            {layers.map(([codepoint, srcColor], i) => (
              <span
                key={i}
                aria-hidden
                style={
                  inheritColor
                    ? layerBoxStyle
                    : {
                        ...layerBoxStyle,
                        color: resolveColor(i, srcColor) as string,
                      }
                }>
                {getChar(codepoint)}
              </span>
            ))}
          </span>
        </>
      );
    },
    areIconPropsEqual
  );

  Icon.displayName = `NanoIcon(${fontBasename})`;

  const IconComp = Icon as unknown as IconComponent<GM>;
  IconComp.loadFont = (override) => {
    const source = override ?? font;
    const url = webFontUrl(source);
    if (url) return registerWebFont(fontBasename, url);
    if (source != null && typeof __DEV__ !== 'undefined' && __DEV__) {
      warnFontNotLoaded(fontBasename);
    }
    return Promise.resolve();
  };
  return IconComp;
}
