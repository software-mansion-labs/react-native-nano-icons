import { memo, useMemo } from 'react';
import { UIManager, View } from 'react-native';
import type { ColorValue } from 'react-native';
import type { NanoGlyphMapInput, GlyphEntry } from './core/types';
import type { IconComponent, IconProps } from './types';
import { areIconPropsEqual } from './utils/iconPropsEqual';
import { iconAccessibilityProps } from './utils/iconAccessibility';
import { useFontScale } from './utils/fontScale';
import { validateLayerColor } from './utils/validateLayerColor';
import {
  DEFAULT_ICON_SIZE,
  resolveGlyphEntry,
  createLayerColorResolver,
  tintableLayers,
} from './utils/glyphRuntime';
import NanoIconViewNative from './specs/NanoIconViewNativeComponent';
import {
  createJSIconSet,
  warnIfLinkingMismatch,
} from './createNanoIconsSet.shared';
import { loadDynamicFont, useDynamicFontPending } from './loadDynamicFont';
import {
  checkFontIntegrity,
  isFontMismatch,
  reportDynamicFontLoadFailure,
  reportFontMismatch,
} from './fontIntegrity';

export type { IconComponent, IconProps };

const HAS_NATIVE_IMPL = UIManager.hasViewManagerConfig('NanoIconView');

async function loadFontFromDevServer(family: string): Promise<boolean> {
  if (__DEV__) {
    const dev = require('./devServerFont') as typeof import('./devServerFont');
    return dev.loadFontFromDevServer(family);
  }
  return false;
}

async function ensureStaticFont(family: string): Promise<void> {
  await loadFontFromDevServer(family);
  await checkFontIntegrity(family, 'static');
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
  const linking = glyphMap.m.l === 'd' ? 'dynamic' : 'static';
  if (managed) {
    void loadDynamicFont(fontFamilyBasename, font).then(
      () => checkFontIntegrity(fontFamilyBasename, linking),
      async (err) => {
        if (await loadFontFromDevServer(fontFamilyBasename)) return;
        if (isFontMismatch(err)) {
          reportFontMismatch(fontFamilyBasename, linking);
        } else {
          void reportDynamicFontLoadFailure(fontFamilyBasename, err);
        }
      }
    );
  } else if (linking === 'static') {
    void ensureStaticFont(fontFamilyBasename);
  }

  // Pre-compute per-icon static data (codepoints, default colors) once at set creation
  // Avoids layers.map() per icon mount, and keeps the array identity stable so
  // React Native's prop diff skips re-running processColorArray on re-render.
  const codepointsCache = new Map<string, readonly number[]>();
  const defaultColorsCache = new Map<string, readonly ColorValue[]>();

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
  ): readonly ColorValue[] {
    let colors = defaultColorsCache.get(name);
    if (!colors) {
      colors = layers.map(([, srcColor], i) =>
        validateLayerColor(srcColor, name, i)
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
      tintMode,
      style,
      allowFontScaling = true,
      accessible,
      accessibilityLabel,
      accessibilityRole,
      accessibilityElementsHidden,
      importantForAccessibility,
      testID,
      ref,
    }: IconProps<keyof GM['i']>) => {
      const fontScale = useFontScale(allowFontScaling);
      const [adv, layers] = resolveGlyphEntry(glyphMap, name);
      const scaledSize = size * fontScale;
      const width = (adv / unitsPerEm) * scaledSize;

      const pending = useDynamicFontPending(managed, fontFamilyBasename);

      const nameStr = name as string;
      const codepoints = getCodepoints(nameStr, layers);

      const layerColors = useMemo(() => {
        // Fast path: no custom color — use pre-computed defaults
        if (color === undefined || color === null) {
          return getDefaultColors(nameStr, layers);
        }
        const resolveColor = createLayerColorResolver(color, tintMode, layers);
        return layers.map(([, srcColor], i) =>
          validateLayerColor(resolveColor(i, srcColor), nameStr, i)
        );
      }, [nameStr, color, tintMode]);

      const accessibility = iconAccessibilityProps({
        accessible,
        accessibilityLabel,
        accessibilityRole,
        accessibilityElementsHidden,
        importantForAccessibility,
      });

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
            {...accessibility}
            testID={testID}
          />
        );
      }
      return (
        <NanoIconViewNative
          ref={ref}
          fontFamily={fontFamilyBasename}
          codepoints={codepoints}
          colors={layerColors}
          tintLayers={tintableLayers(layers, tintMode)}
          size={size}
          fontScale={fontScale}
          advanceWidth={adv}
          unitsPerEm={unitsPerEm}
          style={style}
          {...accessibility}
          testID={testID}
        />
      );
    },
    areIconPropsEqual
  );

  Icon.displayName = `NanoIcon(${fontFamilyBasename})`;

  const IconComp = Icon as unknown as IconComponent<GM>;
  IconComp.loadFont = (override) =>
    glyphMap.m.l === 'd'
      ? loadDynamicFont(fontFamilyBasename, override ?? font, { force: true })
      : Promise.resolve();
  return IconComp;
}
