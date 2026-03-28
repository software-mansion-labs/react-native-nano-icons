import { forwardRef, type ComponentRef, type Ref } from 'react';
import {
  Platform,
  Text,
  View,
  type ViewProps,
  type ColorValue,
  type TextProps,
  useWindowDimensions,
} from 'react-native';
import type { NanoGlyphMapInput, GlyphEntry } from './core/types';

const DEFAULT_ICON_SIZE = 12;

type ViewRef = ComponentRef<typeof View>;

export type IconProps<Name> = TextProps & {
  name: Name;
  size?: number;
  color?: ColorValue | ColorValue[];
  innerRef?: Ref<ViewRef>;
  style?: Omit<
    TextProps['style'],
    | 'fontFamily'
    | 'fontWeight'
    | 'fontStyle'
    | 'position'
    | 'includeFontPadding'
    | 'color'
  >;
};

export type IconComponent<GM extends NanoGlyphMapInput> = React.FC<
  TextProps & {
    name: keyof GM['i'];
    size?: number;
    color?: ColorValue | ColorValue[];
    innerRef?: Ref<ViewRef>;
    style?: Omit<
      TextProps['style'],
      | 'fontFamily'
      | 'fontWeight'
      | 'fontStyle'
      | 'position'
      | 'includeFontPadding'
      | 'color'
    >;
  } & React.RefAttributes<ViewRef>
>;

export function createIconSet<GM extends NanoGlyphMapInput>(
  glyphMap: GM
): IconComponent<GM> {
  const fontBasename = glyphMap.m.f;

  const fontReference = Platform.select({
    windows: `/Assets/${fontBasename}`,
    android: fontBasename,
    default: fontBasename,
  });

  const styleOverrides: TextProps['style'] = {
    fontFamily: fontReference,
    fontWeight: 'normal',
    fontStyle: 'normal',
    position: 'absolute',
    includeFontPadding: false,
    bottom: 0,
  };

  const resolveEntry = (name: keyof GM['i']): GlyphEntry => {
    return (glyphMap.i[name as string] ?? [
      glyphMap.m.u,
      [[63, 'black']],
    ]) as GlyphEntry;
  };

  const Icon = ({
    name,
    size = DEFAULT_ICON_SIZE,
    color,
    style,
    allowFontScaling = true,
    innerRef,
    ...props
  }: IconProps<keyof GM['i']>) => {
    const { fontScale } = useWindowDimensions();

    const [adv, layers] = resolveEntry(name);

    const scaledSize = allowFontScaling ? size * fontScale : size;
    const width = (adv / glyphMap.m.u) * scaledSize;

    const containerProps: ViewProps = {
      style: {
        height: scaledSize,
        width,
        bottom: 0,
      },
    };

    const colorArray = Array.isArray(color) ? color : [color];

    const lastPaletteColor = colorArray?.length
      ? colorArray[colorArray.length - 1]
      : undefined;

    return (
      <View
        nativeID={`nano-icon-container-${String(name)}`}
        ref={innerRef}
        {...containerProps}>
        {layers.map(([codepoint, srcColor], i) => {
          const layerColor =
            colorArray?.[i] ?? lastPaletteColor ?? srcColor ?? 'black';

          return (
            <Text
              key={`${codepoint}-${i}`}
              selectable={false}
              {...props}
              allowFontScaling={allowFontScaling}
              style={[
                style,
                styleOverrides,
                {
                  fontSize: size,
                  color: layerColor,
                },
              ]}>
              {String.fromCodePoint(codepoint)}
            </Text>
          );
        })}
      </View>
    );
  };

  const WrappedIcon = forwardRef<ViewRef, IconProps<keyof GM['i']>>(
    (props, ref) => <Icon innerRef={ref} {...props} />
  );

  WrappedIcon.displayName = `NanoIcon(${fontBasename})`;

  return WrappedIcon;
}
