#pragma once

#include <react/renderer/components/RNNanoIconsSpec/EventEmitters.h>
#include <react/renderer/components/RNNanoIconsSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <jsi/jsi.h>

namespace facebook::react {

JSI_EXPORT extern const char NanoIconViewComponentName[];

class JSI_EXPORT NanoIconViewShadowNode final
    : public ConcreteViewShadowNode<
          NanoIconViewComponentName,
          NanoIconViewProps,
          NanoIconViewEventEmitter> {
 public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;

  static ShadowNodeTraits BaseTraits() {
    auto traits = ConcreteViewShadowNode::BaseTraits();
    traits.set(ShadowNodeTraits::Trait::LeafYogaNode);
    traits.set(ShadowNodeTraits::Trait::MeasurableYogaNode);
    return traits;
  }

  Size measureContent(
      const LayoutContext &layoutContext,
      const LayoutConstraints &layoutConstraints) const override;

  void completeClone(
      const ShadowNode &sourceShadowNode,
      const ShadowNodeFragment &fragment) override;

 protected:
  bool shouldNewRevisionDirtyMeasurement(
      const ShadowNode &sourceShadowNode,
      const ShadowNodeFragment &fragment) const override;
};

} // namespace facebook::react
