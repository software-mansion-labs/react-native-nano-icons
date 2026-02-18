// eslint-disable-next-line import/no-extraneous-dependencies
import React, { forwardRef, type Ref } from "react";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  Platform,
  Text,
  View,
  type ViewProps,
  type ColorValue,
  type TextProps,
} from "react-native";
import { GlyphEntry, NanoGlyphMap } from "./core/types";

const DEFAULT_ICON_SIZE = 12;

export type IconProps<Name> = TextProps & {
  name: Name;
  size?: number;
  colorPalette?: ColorValue[];
  innerRef?: Ref<Text>;
};

export type IconComponent<GM extends NanoGlyphMap> = React.FC<
  TextProps & {
    name: keyof GM["icons"];
    size?: number;
    colorPalette?: ColorValue[];
    innerRef?: Ref<Text>;
  } & React.RefAttributes<Text>
>;

export function createIconSet<GM extends NanoGlyphMap>(
  glyphMap: GM,
): IconComponent<GM> {
  const fontBasename = glyphMap.meta.fontFamily;

  const fontReference = Platform.select({
    windows: `/Assets/${fontBasename}`,
    android: fontBasename,
    default: fontBasename,
  });

  const styleOverrides: TextProps["style"] = {
    fontFamily: fontReference,
    fontWeight: "normal",
    fontStyle: "normal",
    position: "absolute",
    includeFontPadding: false,
  };

  const resolveEntry = (name: keyof GM["icons"]): GlyphEntry => {
    return (
      glyphMap.icons[name as string] ?? {
        adv: glyphMap.meta.upm,
        layers: [{ codepoint: 63, color: "black" }], // "?"
      }
    );
  };

  const Icon = ({
    name,
    size = DEFAULT_ICON_SIZE,
    colorPalette,
    style,
    allowFontScaling = false,
    innerRef,
    ...props
  }: IconProps<keyof GM["icons"]>) => {
    const entry = resolveEntry(name);
    const layers = entry.layers ?? [];

    const width = (entry.adv / glyphMap.meta.upm) * size;

    const containerProps: ViewProps = {
      style: {
        width,
        height: size,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      },
    };

    const lastPaletteColor = colorPalette?.length
      ? colorPalette[colorPalette.length - 1]
      : undefined;

    return (
      <View ref={innerRef as any} {...containerProps}>
        {layers.map(({ codepoint, color: srcColor }, i) => {
          const layerColor =
            colorPalette?.[i] ?? lastPaletteColor ?? srcColor ?? "black";

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

  const WrappedIcon = forwardRef<Text, IconProps<keyof GM["icons"]>>(
    (props, ref) => <Icon innerRef={ref} {...props} />,
  );
  WrappedIcon.displayName = `Icon(${fontBasename})`;

  return WrappedIcon;
}
