package com.nanoicons

import android.content.res.AssetManager
import android.graphics.Typeface
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.common.assets.ReactFontManager
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.ConcurrentHashMap

object NanoIconFonts {
  private val liveViews: MutableSet<NanoIconView> =
    Collections.newSetFromMap(WeakHashMap())
  private val registered: MutableSet<String> = ConcurrentHashMap.newKeySet()
  private val FONT_ASSET_EXTENSIONS = listOf(".ttf", ".otf")

  fun resolve(family: String, assets: AssetManager): Typeface? {
    val typeface =
      ReactFontManager.getInstance().getTypeface(family, Typeface.NORMAL, assets)
    val systemFallback = Typeface.create(family, Typeface.NORMAL)
    return if (typeface == null || typeface == systemFallback) null else typeface
  }

  fun isAvailable(family: String, assets: AssetManager): Boolean =
    family in registered ||
      FONT_ASSET_EXTENSIONS.any { isFontAsset(assets, "fonts/$family$it") }

  private fun isFontAsset(assets: AssetManager, path: String): Boolean =
    try {
      Typeface.createFromAsset(assets, path) != Typeface.DEFAULT
    } catch (e: RuntimeException) {
      false
    }

  fun track(view: NanoIconView) {
    liveViews.add(view)
  }

  fun register(family: String, typeface: Typeface) {
    ReactFontManager.getInstance().setTypeface(family, Typeface.NORMAL, typeface)
    registered.add(family)
    UiThreadUtil.runOnUiThread {
      for (view in liveViews.toList()) view.resolveFontIfMissing()
    }
  }
}
