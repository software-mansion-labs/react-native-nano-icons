package com.nanoicons

import android.graphics.Color
import com.facebook.react.bridge.ColorPropConverter
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType
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

  // Plain colors arrive pre-processed as ints; PlatformColor as a map. Resource-path
  // maps are forwarded unresolved so the view can re-resolve them when the theme
  // changes — resolving here would discard what that needs.
  @ReactProp(name = "colors")
  override fun setColors(view: NanoIconView, value: ReadableArray?) {
    if (value != null) {
      val size = value.size()
      val literals = IntArray(size)
      var paths: Array<Array<String>?>? = null
      for (i in 0 until size) {
        if (value.getType(i) == ReadableType.Map) {
          val map = value.getMap(i)
          val resourcePaths = map?.getArray("resource_paths")
          if (resourcePaths != null) {
            if (paths == null) paths = arrayOfNulls(size)
            paths[i] =
              Array(resourcePaths.size()) { resourcePaths.getString(it).orEmpty() }
          } else {
            // {space,r,g,b,a} wide-gamut form — theme-invariant, resolve once.
            literals[i] = ColorPropConverter.getColor(map, view.context, Color.BLACK)
          }
        } else {
          literals[i] = value.getInt(i)
        }
      }
      view.setColors(literals, paths)
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
