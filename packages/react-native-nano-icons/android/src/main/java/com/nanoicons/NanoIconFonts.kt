package com.nanoicons

import android.content.res.AssetManager
import android.graphics.Typeface
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.assets.ReactFontManager
import java.util.Collections
import java.util.WeakHashMap

object NanoIconFonts {
  private val liveViews: MutableSet<NanoIconView> =
    Collections.newSetFromMap(WeakHashMap())

  fun resolve(family: String, assets: AssetManager): Typeface? {
    val typeface =
      ReactFontManager.getInstance().getTypeface(family, Typeface.NORMAL, assets)
    val systemFallback = Typeface.create(family, Typeface.NORMAL)
    return if (typeface == null || typeface == systemFallback) null else typeface
  }

  fun track(view: NanoIconView) {
    liveViews.add(view)
  }

  fun register(family: String, typeface: Typeface) {
    ReactFontManager.getInstance().setTypeface(family, Typeface.NORMAL, typeface)
    UiThreadUtil.runOnUiThread {
      for (view in liveViews.toList()) view.resolveFontIfMissing()
    }
  }
}
