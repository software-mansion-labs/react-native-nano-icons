#pragma once

#include <react/renderer/components/RNNanoIconsSpec/EventEmitters.h>
#include <react/renderer/components/RNNanoIconsSpec/NanoIconProps.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <jsi/jsi.h>

namespace facebook::react {

JSI_EXPORT extern const char NanoIconViewComponentName[];

class JSI_EXPORT NanoIconViewShadowNode final
    : public ConcreteViewShadowNode<
          NanoIconViewComponentName,
          NanoIconProps,
          NanoIconViewEventEmitter> {
 public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;

  static ShadowNodeTraits BaseTraits() {
    auto traits = ConcreteViewShadowNode::BaseTraits();
    traits.set(ShadowNodeTraits::Trait::LeafYogaNode);
    return traits;
  }
};

} // namespace facebook::react
