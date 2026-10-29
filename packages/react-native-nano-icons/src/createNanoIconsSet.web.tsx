import { memo, type CSSProperties } from 'react';
import * as ReactDOM from 'react-dom';
import type { GlyphEntry, NanoGlyphMapInput } from './core/types';
import type { IconComponent, IconProps } from './types';
import { shallowEqualColor } from './utils/shallowEqualColor';
import {
  resolveGlyphEntry,
  createCharCache,
  createLayerColorResolver,
} from './utils/glyphRuntime';
import { configuredFontFamily } from './utils/fontIdentity';
import { loadFontFromDevServer } from './devServerFont.web';
import { warnRuntime } from './utils/runtimeLog';
import { resolveWebStyle } from './utils/webStyle';
import { registerWebFont, webFontUrl } from './webFont';

export type { IconComponent, IconProps };
export { shallowEqualColor };

const ICON_CLASS = 'nano-icon';
const STYLE_HREF = 'react-native-nano-icons';
const STYLE_PRECEDENCE = 'react-native-nano-icons';
const BASE_CSS =
  `:where(.${ICON_CLASS}){display:inline-block;position:relative;` +
  'width:calc(var(--nano-icon-ratio,1)*1em);height:1em;line-height:0;vertical-align:middle}' +
  `.${ICON_CLASS}>span{position:absolute;left:0;bottom:0;color:inherit;` +
  'font-family:inherit;font-size:inherit;font-weight:normal;font-style:normal;' +
  'line-height:1;white-space:pre}';

const TEXT_COLORS = new Set([
  'black',
  '#000',
  '#000f',
  '#000000',
  '#000000ff',
  'rgb(0,0,0)',
  'rgba(0,0,0,1)',
  'currentcolor',
]);

const followsTextColorByLayers = new WeakMap<GlyphEntry[1], boolean>();

function followsTextColor(layers: GlyphEntry[1]): boolean {
  let follows = followsTextColorByLayers.get(layers);
  if (follows === undefined) {
    follows = layers.every(([, srcColor]) =>
      TEXT_COLORS.has(srcColor.replace(/\s+/g, '').toLowerCase())
    );
    followsTextColorByLayers.set(layers, follows);
  }
  return follows;
}

function cssString(value: string): string {
  return JSON.stringify(value);
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

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
      ? cssString(fontBasename)
      : `${cssString(family)}, ${cssString(fontBasename)}`;
  const unitsPerEm = glyphMap.m.u;
  const getChar = createCharCache();
  const fontUrl = webFontUrl(font);
  const fontFace = fontUrl && {
    href: `${STYLE_HREF}:${shortHash(`${fontBasename}:${fontUrl}`)}`,
    css: `@font-face{font-family:${cssString(fontBasename)};src:url(${cssString(fontUrl)});font-display:block}`,
  };

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    if (font != null && fontUrl === undefined) {
      warnRuntime(
        `Icon font "${fontBasename}" is not loaded on web: pass its url, e.g. require("${fontBasename}.woff2") or { uri }.`
      );
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
      style,
      accessible,
      accessibilityLabel,
      accessibilityRole = 'image',
      accessibilityElementsHidden,
      testID,
      className,
      ref,
    }: IconProps<keyof GM['i']>) => {
      const [adv, layers] = resolveGlyphEntry(glyphMap, name);

      if (fontUrl && !fontUrl.startsWith('data:')) {
        ReactDOM.preload?.(fontUrl, { as: 'font', crossOrigin: 'anonymous' });
      }

      const containerStyle = {
        '--nano-icon-ratio': adv / unitsPerEm,
        fontFamily,
        ...(size === undefined ? null : { fontSize: size }),
        ...resolveWebStyle(style),
      } as CSSProperties;

      const inheritColor = color == null && followsTextColor(layers);
      const resolveColor = createLayerColorResolver(color, tintMode, layers);

      const isHidden = accessible === false || accessibilityElementsHidden;
      const role = accessibilityRole === 'image' ? 'img' : accessibilityRole;

      return (
        <>
          <style href={STYLE_HREF} precedence={STYLE_PRECEDENCE}>
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
              isHidden ? undefined : (accessibilityLabel ?? (name as string))
            }
            aria-hidden={isHidden || undefined}
            data-testid={testID}>
            {layers.map(([codepoint, srcColor], i) => (
              <span
                key={i}
                aria-hidden
                style={
                  inheritColor
                    ? undefined
                    : { color: resolveColor(i, srcColor) as string }
                }>
                {getChar(codepoint)}
              </span>
            ))}
          </span>
        </>
      );
    },
    (prev, next) =>
      prev.name === next.name &&
      prev.size === next.size &&
      prev.style === next.style &&
      prev.className === next.className &&
      prev.tintMode === next.tintMode &&
      shallowEqualColor(prev.color, next.color)
  );

  Icon.displayName = `NanoIcon(${fontBasename})`;

  const IconComp = Icon as unknown as IconComponent<GM>;
  IconComp.loadFont = (override) => {
    const url = webFontUrl(override ?? font);
    return url ? registerWebFont(fontBasename, url) : Promise.resolve();
  };
  return IconComp;
}
