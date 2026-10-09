#pragma once

#include <ReactCommon/JavaTurboModule.h>
#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

#include <react/renderer/components/RNNanoIconsSpec/NanoIconViewComponentDescriptor.h>

namespace facebook::react {

class JSI_EXPORT NativeNanoIconsFontLoaderSpecJSI : public JavaTurboModule {
public:
  NativeNanoIconsFontLoaderSpecJSI(const JavaTurboModule::InitParams &params);
};

JSI_EXPORT
std::shared_ptr<TurboModule> RNNanoIconsSpec_ModuleProvider(const std::string &moduleName, const JavaTurboModule::InitParams &params);

} // namespace facebook::react
