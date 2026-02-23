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
import type { GlyphEntry, NanoGlyphMap } from './core/types';

const DEFAULT_ICON_SIZE = 12;

type ViewRef = ComponentRef<typeof View>;

export type IconProps<Name> = TextProps & {
  name: Name;
  size?: number;
  colorPalette?: ColorValue[];
  innerRef?: Ref<ViewRef>;
};

export type IconComponent<GM extends NanoGlyphMap> = React.FC<
  TextProps & {
    name: keyof GM['icons'];
    size?: number;
    colorPalette?: ColorValue[];
    innerRef?: Ref<ViewRef>;
  } & React.RefAttributes<ViewRef>
>;

export function createIconSet<GM extends NanoGlyphMap>(
  glyphMap: GM
): IconComponent<GM> {
  const fontBasename = glyphMap.meta.fontFamily;

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

  const resolveEntry = (name: keyof GM['icons']): GlyphEntry => {
    return (
      glyphMap.icons[name as string] ?? {
        adv: glyphMap.meta.upm,
        layers: [{ codepoint: 63, color: 'black' }], // "?"
      }
    );
  };

  const Icon = ({
    name,
    size = DEFAULT_ICON_SIZE,
    colorPalette,
    style,
    allowFontScaling = true,
    innerRef,
    ...props
  }: IconProps<keyof GM['icons']>) => {
    const { fontScale } = useWindowDimensions();

    const entry = resolveEntry(name);
    const layers = entry.layers ?? [];

    const scaledSize = allowFontScaling ? size * fontScale : size;
    const width = (entry.adv / glyphMap.meta.upm) * scaledSize;

    const containerProps: ViewProps = {
      style: {
        height: scaledSize,
        width,
        bottom: 0,
      },
    };

    const lastPaletteColor = colorPalette?.length
      ? colorPalette[colorPalette.length - 1]
      : undefined;

    return (
      <View
        nativeID={`nano-icon-container-${String(name)}`}
        ref={innerRef}
        {...containerProps}
      >
        {layers.map(({ codepoint, color: srcColor }, i) => {
          const layerColor =
            colorPalette?.[i] ?? lastPaletteColor ?? srcColor ?? 'black';

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
              ]}
            >
              {String.fromCodePoint(codepoint)}
            </Text>
          );
        })}
      </View>
    );
  };

  const WrappedIcon = forwardRef<ViewRef, IconProps<keyof GM['icons']>>(
    (props, ref) => <Icon innerRef={ref} {...props} />
  );

  WrappedIcon.displayName = `NanoIcon(${fontBasename})`;

  return WrappedIcon;
}
