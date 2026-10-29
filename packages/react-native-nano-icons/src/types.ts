import type { ComponentRef, Ref } from 'react';
import type { ColorValue, TextProps, View, ViewProps } from 'react-native';
import type { NanoGlyphMapInput } from './core/types';
import type { TintMode } from './utils/glyphRuntime';

type ViewRef = ComponentRef<typeof View>;

export type IconProps<Name> = {
  /** Icon name: the SVG file name without `.svg`. */
  name: Name;
  /**
   * Icon height in points. Defaults to `12`, and on web to `1em`, so the icon
   * follows the CSS `font-size`.
   */
  size?: number;
  /**
   * One color, or one per layer. A shorter array repeats its last color.
   * Defaults to the original SVG's colors. On web, `currentColor` layers and icons
   * drawn only in black follow the CSS `color`.
   */
  color?: ColorValue | ColorValue[];
  /**
   * Which layers `color` applies to: every layer, or only those drawn with
   * `currentColor`.
   * @default 'all'
   */
  tintMode?: TintMode;
  /**
   * Label announced by screen readers. Without it, the icon is decorative and
   * hidden from screen readers, unless `accessible`, `accessibilityRole`,
   * `importantForAccessibility="yes"` or `accessibilityElementsHidden={false}`
   * exposes it. On web, an exposed icon without a label is named after `name`.
   */
  accessibilityLabel?: string;
  /**
   * Hides the icon from screen readers.
   * @platform `iOS` and `Web` only - no-op on Android.
   */
  accessibilityElementsHidden?: boolean;
  ref?: Ref<ViewRef>;
  /**
   * Forwarded to the container element on web.
   * @platform `Web` only - no-op on native.
   */
  className?: string;
} & Partial<
  Pick<TextProps, 'allowFontScaling'> &
    Pick<
      ViewProps,
      | 'style'
      | 'testID'
      | 'accessible'
      | 'accessibilityRole'
      | 'importantForAccessibility'
    >
>;

export type IconComponent<GM extends NanoGlyphMapInput> = React.FC<
  IconProps<keyof GM['i']>
> & {
  loadFont: (font?: number | string | { uri: string }) => Promise<void>;
};
