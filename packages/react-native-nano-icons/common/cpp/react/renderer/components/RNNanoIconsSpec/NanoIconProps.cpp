#include "NanoIconProps.h"

#include <react/renderer/core/PropsMacros.h>
#include <react/renderer/core/propsConversions.h>
#include <yoga/style/StyleSizeLength.h>

namespace facebook::react {

namespace {

bool rawPropIsSet(const RawProps &rawProps, const char *name, bool sourceValue) {
  const auto *rawValue = rawProps.at(name, nullptr, nullptr);
  if (rawValue == nullptr) {
    return sourceValue;
  }
  return rawValue->hasValue();
}

} // namespace

NanoIconProps::NanoIconProps(
    const PropsParserContext &context,
    const NanoIconProps &sourceProps,
    const RawProps &rawProps)
    : ViewProps(context, sourceProps, rawProps),
      fontFamily(convertRawProp(context, rawProps, "fontFamily", sourceProps.fontFamily, {})),
      codepoints(convertRawProp(context, rawProps, "codepoints", sourceProps.codepoints, {})),
      colors(convertRawProp(context, rawProps, "colors", sourceProps.colors, {})),
      color(convertRawProp(context, rawProps, "color", sourceProps.color, {})),
      tintLayers(convertRawProp(context, rawProps, "tintLayers", sourceProps.tintLayers, {})),
      size(convertRawProp(context, rawProps, "size", sourceProps.size, {0.0})),
      fontScale(convertRawProp(context, rawProps, "fontScale", sourceProps.fontScale, {1.0})),
      advanceWidth(convertRawProp(context, rawProps, "advanceWidth", sourceProps.advanceWidth, {0})),
      unitsPerEm(convertRawProp(context, rawProps, "unitsPerEm", sourceProps.unitsPerEm, {0})),
      squareGlyphScale(convertRawProp(context, rawProps, "squareGlyphScale", sourceProps.squareGlyphScale, {0.0})),
      hasStyleWidth(rawPropIsSet(rawProps, "width", sourceProps.hasStyleWidth)),
      hasStyleHeight(rawPropIsSet(rawProps, "height", sourceProps.hasStyleHeight)) {
  applyGlyphDimensions();
}

void NanoIconProps::setProp(
    const PropsParserContext &context,
    RawPropsPropNameHash hash,
    const char *propName,
    const RawValue &value) {
  ViewProps::setProp(context, hash, propName, value);
  switch (hash) {
    case CONSTEXPR_RAW_PROPS_KEY_HASH("width"):
      hasStyleWidth = value.hasValue();
      applyGlyphDimensions();
      break;
    case CONSTEXPR_RAW_PROPS_KEY_HASH("height"):
      hasStyleHeight = value.hasValue();
      applyGlyphDimensions();
      break;
  }
}

void NanoIconProps::applyGlyphDimensions() {
  const Float height = size * fontScale;
  const Float width = squareGlyphScale <= 0 && unitsPerEm > 0
      ? height * static_cast<Float>(advanceWidth) / static_cast<Float>(unitsPerEm)
      : height;
  if (!hasStyleWidth) {
    yogaStyle.setDimension(yoga::Dimension::Width, yoga::StyleSizeLength::points(width));
  }
  if (!hasStyleHeight) {
    yogaStyle.setDimension(yoga::Dimension::Height, yoga::StyleSizeLength::points(height));
  }
}

#ifdef RN_SERIALIZABLE_STATE
ComponentName NanoIconProps::getDiffPropsImplementationTarget() const {
  return "NanoIconView";
}

folly::dynamic NanoIconProps::getDiffProps(const Props *prevProps) const {
  static const auto defaultProps = NanoIconProps();
  const NanoIconProps *oldProps = prevProps == nullptr
      ? &defaultProps
      : static_cast<const NanoIconProps *>(prevProps);
  if (this == oldProps) {
    return folly::dynamic::object();
  }
  folly::dynamic result = HostPlatformViewProps::getDiffProps(prevProps);

  if (fontFamily != oldProps->fontFamily) {
    result["fontFamily"] = fontFamily;
  }
  if (codepoints != oldProps->codepoints) {
    result["codepoints"] = toDynamic(codepoints);
  }
  if (colors != oldProps->colors) {
    result["colors"] = toDynamic(colors);
  }
  if (color != oldProps->color) {
    result["color"] = *color;
  }
  if (tintLayers != oldProps->tintLayers) {
    result["tintLayers"] = toDynamic(tintLayers);
  }
  if ((size != oldProps->size) && !(std::isnan(size) && std::isnan(oldProps->size))) {
    result["size"] = size;
  }
  if ((fontScale != oldProps->fontScale) && !(std::isnan(fontScale) && std::isnan(oldProps->fontScale))) {
    result["fontScale"] = fontScale;
  }
  if (advanceWidth != oldProps->advanceWidth) {
    result["advanceWidth"] = advanceWidth;
  }
  if (unitsPerEm != oldProps->unitsPerEm) {
    result["unitsPerEm"] = unitsPerEm;
  }
  if ((squareGlyphScale != oldProps->squareGlyphScale) && !(std::isnan(squareGlyphScale) && std::isnan(oldProps->squareGlyphScale))) {
    result["squareGlyphScale"] = squareGlyphScale;
  }
  return result;
}
#endif

} // namespace facebook::react
