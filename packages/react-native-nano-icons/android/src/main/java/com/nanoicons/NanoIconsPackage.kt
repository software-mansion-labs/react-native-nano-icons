package com.nanoicons

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class NanoIconsPackage : BaseReactPackage() {

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = listOf(NanoIconViewManager())

  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext
  ): NativeModule? =
    when (name) {
      NanoIconsFontLoaderModule.NAME -> NanoIconsFontLoaderModule(reactContext)
      else -> null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        NanoIconsFontLoaderModule.NAME to
          ReactModuleInfo(
            NanoIconsFontLoaderModule.NAME,
            NanoIconsFontLoaderModule.NAME,
            false, // canOverrideExistingModule
            false, // needsEagerInit
            false, // isCxxModule
            true // isTurboModule
          )
      )
    }
}
