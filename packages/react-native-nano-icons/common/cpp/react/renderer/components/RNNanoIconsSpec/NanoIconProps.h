#pragma once

#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/graphics/Color.h>
#include <vector>

namespace facebook::react {

// Why this class exists instead of the codegen NanoIconViewProps.
// 1. The icon box must be an explicit width/height in the Yoga style. A parent
//    row with the default alignItems: 'stretch' stretches every child to the
//    row height unless the child has explicit dimensions; a measure function
//    does not count, Yoga ignores it in the stretch pass.
// 2. Those dimensions must be stored on the Props object. On every update RN
//    copies the style from Props onto the Yoga node, so values written to the
//    node directly would be wiped and cause a re-layout each time.
// 3. The codegen class only parses what JS sent and is final, so it cannot be
//    extended. This class repeats that parsing and adds one step: compute
//    width and height from size, fontScale and the glyph advance ratio, or a
//    square box when squareGlyphScale is set, and store them in the style
//    unless the user style already sets them.
class NanoIconProps final : public ViewProps {
 public:
  NanoIconProps() = default;
  NanoIconProps(
      const PropsParserContext &context,
      const NanoIconProps &sourceProps,
      const RawProps &rawProps);

  void setProp(
      const PropsParserContext &context,
      RawPropsPropNameHash hash,
      const char *propName,
      const RawValue &value);

  std::string fontFamily{};
  std::vector<int> codepoints{};
  std::vector<SharedColor> colors{};
  SharedColor color{};
  std::vector<int> tintLayers{};
  Float size{0.0};
  Float fontScale{1.0};
  int advanceWidth{0};
  int unitsPerEm{0};
  Float squareGlyphScale{0.0};
  bool hasStyleWidth{false};
  bool hasStyleHeight{false};

#ifdef RN_SERIALIZABLE_STATE
  ComponentName getDiffPropsImplementationTarget() const override;

  folly::dynamic getDiffProps(const Props *prevProps) const override;
#endif

 private:
  void applyGlyphDimensions();
};

} // namespace facebook::react
