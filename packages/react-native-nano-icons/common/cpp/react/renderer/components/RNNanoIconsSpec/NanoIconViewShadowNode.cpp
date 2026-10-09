#include "NanoIconViewShadowNode.h"

#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>

namespace facebook::react {

extern const char NanoIconViewComponentName[] = "NanoIconView";

Size NanoIconViewShadowNode::measureContent(
    const LayoutContext &layoutContext,
    const LayoutConstraints &layoutConstraints) const {
  const auto &props = getConcreteProps();
  const Float height =
      props.size * (props.allowFontScaling ? layoutContext.fontSizeMultiplier : 1);
  const Float width = props.unitsPerEm > 0
      ? height * static_cast<Float>(props.advanceWidth) / static_cast<Float>(props.unitsPerEm)
      : height;
  return layoutConstraints.clamp({width, height});
}

bool NanoIconViewShadowNode::shouldNewRevisionDirtyMeasurement(
    const ShadowNode & /*sourceShadowNode*/,
    const ShadowNodeFragment & /*fragment*/) const {
  return false;
}

void NanoIconViewShadowNode::completeClone(
    const ShadowNode &sourceShadowNode,
    const ShadowNodeFragment &fragment) {
  ConcreteViewShadowNode::completeClone(sourceShadowNode, fragment);
  if (fragment.props == nullptr) {
    return;
  }
  const auto &oldProps =
      static_cast<const NanoIconViewProps &>(*sourceShadowNode.getProps());
  const auto &newProps = getConcreteProps();
  if (oldProps.size != newProps.size ||
      oldProps.allowFontScaling != newProps.allowFontScaling ||
      oldProps.advanceWidth != newProps.advanceWidth ||
      oldProps.unitsPerEm != newProps.unitsPerEm) {
    dirtyLayout();
  }
}

} // namespace facebook::react
