// eslint-disable-next-line import/no-extraneous-dependencies
import React, { forwardRef, type Ref, useEffect } from "react";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  Platform,
  Text,
  View,
  ViewProps,
  type ColorValue,
  type TextProps,
} from "react-native";
import {
  DEFAULT_ICON_SIZE,
  isDynamicLoadingEnabled,
  createIconSourceCache,
  dynamicLoader,
  getImageSource as getImageSourceImpl,
  getImageSourceSync as getImageSourceSyncImpl,
} from "@react-native-vector-icons/common";
import type { FontSource } from "@react-native-vector-icons/common";

type ValueData = { uri: string; scale: number };
type GetImageSourceSyncIconFunc<GM> = (
  name: GM,
  size?: number,
  color?: ColorValue,
) => ValueData | undefined;
type GetImageSourceIconFunc<GM> = (
  name: GM,
  size?: number,
  color?: ColorValue,
) => Promise<ValueData | undefined>;

export type IconProps<T> = TextProps & {
  name: T;
  size?: number;
  /** Override colors per layer; first element for single-color icons; last color is repeated if array is short. */
  colorPalette?: ColorValue[];
  innerRef?: Ref<Text>;
};

export type GlyphEntry = { hex: string; color: string };

type GlyphMap = Record<string, GlyphEntry[]>;

export type IconComponent<GM extends GlyphMap> = React.FC<
  TextProps & {
    name: keyof GM;
    size?: number;
    /** Override colors per layer; first element for single-color icons; last color is repeated if array is short. */
    colorPalette?: ColorValue[];
    innerRef?: Ref<Text>;
  } & React.RefAttributes<Text>
> & {
  getImageSource: GetImageSourceIconFunc<keyof GM>;
  getImageSourceSync: GetImageSourceSyncIconFunc<keyof GM>;
};

export type CreateIconSetOptions = {
  postScriptName: string;
  fontFileName: string;
  fontSource?: FontSource;
  fontStyle?: TextProps["style"];
};

export function createIconSet<GM extends GlyphMap>(
  glyphMap: GM,
  postScriptName: string,
  fontFileName: string,
  fontStyle?: TextProps["style"],
): IconComponent<GM>;
export function createIconSet<GM extends GlyphMap>(
  glyphMap: GM,
  options: CreateIconSetOptions,
): IconComponent<GM>;
export function createIconSet<GM extends GlyphMap>(
  glyphMap: GM,
  postScriptNameOrOptions: string | CreateIconSetOptions,
  fontFileNameParam?: string,
  fontStyleParam?: TextProps["style"],
): IconComponent<GM> {
  const { postScriptName, fontFileName, fontStyle } =
    typeof postScriptNameOrOptions === "string"
      ? {
          postScriptName: postScriptNameOrOptions,
          fontFileName: fontFileNameParam,
          fontStyle: fontStyleParam,
        }
      : postScriptNameOrOptions;

  const fontBasename = fontFileName
    ? fontFileName.replace(/\.(otf|ttf)$/, "")
    : postScriptName;

  const fontReference = Platform.select({
    windows: `/Assets/${fontFileName}#${postScriptName}`,
    android: fontBasename,
    default: postScriptName,
  });

  const styleOverrides: TextProps["style"] = {
    fontFamily: fontReference,
    fontWeight: "normal",
    fontStyle: "normal",
    position: "absolute",
    includeFontPadding: false,
    textAlignVertical: "center",
  };

  // TODO: get rid of this and adjust getImageSource(..) to adopt resolveLayeredGlyph
  const resolveGlyph = (name: keyof GM): string => {
    const glyph = glyphMap[name]?.[0]?.hex || "?";

    if (typeof glyph === "number") {
      return String.fromCodePoint(glyph);
    }

    return glyph;
  };

  const resolveLayeredGlyph = (name: keyof GM): GlyphEntry[] => {
    return glyphMap[name] ?? [{ hex: "?", color: "black" }];
  };

  const Icon = ({
    name,
    size = DEFAULT_ICON_SIZE,
    colorPalette,
    style,
    children,
    allowFontScaling = false,
    innerRef,
    ...props
  }: IconProps<keyof GM>) => {
    const [isFontLoaded, setIsFontLoaded] = React.useState(
      isDynamicLoadingEnabled() ? dynamicLoader.isLoaded(fontReference) : true,
    );
    const layeredGlyph =
      isFontLoaded && name
        ? resolveLayeredGlyph(name)
        : [{ hex: "", color: "black" }];

    // biome-ignore lint/correctness/useExhaustiveDependencies: the dependencies never change
    useEffect(() => {
      let isMounted = true;

      if (
        !isFontLoaded &&
        typeof postScriptNameOrOptions === "object" &&
        typeof postScriptNameOrOptions.fontSource !== "undefined"
      ) {
        dynamicLoader
          .loadFontAsync(fontReference, postScriptNameOrOptions.fontSource)
          .finally(() => {
            if (isMounted) {
              setIsFontLoaded(true);
            }
          });
      }
      return () => {
        isMounted = false;
      };
    }, []);

    const newProps: TextProps = {
      ...props,
      allowFontScaling,
    };

    const containerProps: ViewProps = {
      style: {
        borderWidth: 1,
        borderColor: "cyan",
        width: size,
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
      <View ref={innerRef} {...containerProps}>
        {layeredGlyph.map(({ hex, color: glyphSourceColor }, i) => {
          const layerColor =
            colorPalette?.[i] ?? lastPaletteColor ?? glyphSourceColor;
          return (
            <Text
              key={hex}
              selectable={false}
              {...newProps}
              style={[
                style,
                styleOverrides,
                fontStyle,
                {
                  fontSize: size,
                  color: layerColor,
                },
              ]}
            >
              {JSON.parse(`"${hex}"`)}
            </Text>
          );
        })}
      </View>
    );
  };

  const WrappedIcon = forwardRef<Text, IconProps<keyof typeof glyphMap>>(
    (props, ref) => <Icon innerRef={ref} {...props} />,
  );
  WrappedIcon.displayName = `Icon(${postScriptName})`;

  const imageSourceCache = createIconSourceCache();

  const getImageSource: GetImageSourceIconFunc<keyof GM> = async (
    name,
    size,
    color,
  ) => {
    if (
      typeof postScriptNameOrOptions === "object" &&
      typeof postScriptNameOrOptions.fontSource !== "undefined"
    ) {
      await dynamicLoader.loadFontAsync(
        fontReference,
        postScriptNameOrOptions.fontSource,
      );
    }
    return getImageSourceImpl(
      imageSourceCache,
      fontReference,
      resolveGlyph(name),
      size,
      color,
    );
  };

  const getImageSourceSync: GetImageSourceSyncIconFunc<keyof GM> = (
    name,
    size,
    color,
  ) =>
    getImageSourceSyncImpl(
      imageSourceCache,
      fontReference,
      resolveGlyph(name),
      size,
      color,
    );

  const IconNamespace = Object.assign(WrappedIcon, {
    getImageSource,
    getImageSourceSync,
  });

  return IconNamespace;
}
