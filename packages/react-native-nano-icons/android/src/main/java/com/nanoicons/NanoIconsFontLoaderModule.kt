package com.nanoicons

import android.graphics.Typeface
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.assets.ReactFontManager
import java.io.File
import java.io.InputStream
import java.net.URL

/**
 * Registers a dynamically-linked (OTA) font at runtime so the NanoIconView can
 * resolve it by family name via ReactFontManager — the same registry RN fonts use.
 *
 * Reads the bytes at `uri` (file:// / http(s):// / content:// / plain path),
 * writes them to a cache file, builds a Typeface, and registers it under `family`.
 * Caching/versioning of remote fonts is intentionally out of scope.
 */
class NanoIconsFontLoaderModule(reactContext: ReactApplicationContext) :
  NativeNanoIconsFontLoaderSpec(reactContext) {

  override fun getName(): String = NAME

  override fun registerFont(family: String, uri: String, promise: Promise) {
    try {
      val cacheFile = File.createTempFile("nanoicon_", ".ttf", reactApplicationContext.cacheDir)
      openStream(uri).use { input ->
        cacheFile.outputStream().use { output -> input.copyTo(output) }
      }

      val typeface = Typeface.createFromFile(cacheFile)
      ReactFontManager.getInstance().setTypeface(family, Typeface.NORMAL, typeface)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(
        "E_NANOICONS_FONT_REGISTER",
        "Failed to register font \"$family\" from $uri: ${e.message}",
        e
      )
    }
  }

  private fun openStream(uri: String): InputStream =
    when {
      uri.startsWith("content://") ->
        reactApplicationContext.contentResolver.openInputStream(Uri.parse(uri))
          ?: throw IllegalStateException("Cannot open content uri: $uri")
      uri.startsWith("file://") ||
        uri.startsWith("http://") ||
        uri.startsWith("https://") -> URL(uri).openStream()
      else -> {
        val resources = reactApplicationContext.resources
        val resId =
          resources.getIdentifier(uri, "raw", reactApplicationContext.packageName)
        if (resId != 0) resources.openRawResource(resId) else File(uri).inputStream()
      }
    }

  companion object {
    const val NAME = "NanoIconsFontLoader"
  }
}
