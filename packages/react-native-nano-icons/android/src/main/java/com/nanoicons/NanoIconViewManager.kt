package com.nanoicons

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.NanoIconViewManagerDelegate
import com.facebook.react.viewmanagers.NanoIconViewManagerInterface

@ReactModule(name = NanoIconViewManager.REACT_CLASS)
class NanoIconViewManager :
  SimpleViewManager<NanoIconView>(),
  NanoIconViewManagerInterface<NanoIconView> {

  private val delegate: ViewManagerDelegate<NanoIconView> =
    NanoIconViewManagerDelegate(this)

  companion object {
    const val REACT_CLASS = "NanoIconView"
  }

  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(reactContext: ThemedReactContext): NanoIconView =
    NanoIconView(reactContext)

  override fun getDelegate(): ViewManagerDelegate<NanoIconView> = delegate

  @ReactProp(name = "fontFamily")
  override fun setFontFamily(view: NanoIconView, value: String?) {
    if (value != null) {
      view.setFontFamily(value)
    }
  }

  @ReactProp(name = "codepoints")
  override fun setCodepoints(view: NanoIconView, value: ReadableArray?) {
    if (value != null) {
      val arr = IntArray(value.size())
      for (i in 0 until value.size()) {
        arr[i] = value.getInt(i)
      }
      view.setCodepoints(arr)
    }
  }

  @ReactProp(name = "colors")
  override fun setColors(view: NanoIconView, value: ReadableArray?) {
    if (value != null) {
      val arr = IntArray(value.size())
      for (i in 0 until value.size()) {
        arr[i] = value.getInt(i)
      }
      view.setColors(arr)
    }
  }

  @ReactProp(name = "fontSize", defaultFloat = 12f)
  override fun setFontSize(view: NanoIconView, value: Float) {
    view.setFontSize(value)
  }

  @ReactProp(name = "advanceWidth", defaultInt = 0)
  override fun setAdvanceWidth(view: NanoIconView, value: Int) {
    // Used for sizing on JS side; native view uses Canvas layout
  }

  @ReactProp(name = "unitsPerEm", defaultInt = 0)
  override fun setUnitsPerEm(view: NanoIconView, value: Int) {
    // Used for sizing on JS side; native view uses Canvas layout
  }

  @ReactProp(name = "iconWidth", defaultFloat = 0f)
  override fun setIconWidth(view: NanoIconView, value: Float) {
    // Width set via style from JS
  }

  @ReactProp(name = "iconHeight", defaultFloat = 0f)
  override fun setIconHeight(view: NanoIconView, value: Float) {
    // Height set via style from JS
  }
}
