package com.nanoicons

import android.graphics.Typeface
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import java.io.File
import java.io.InputStream
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.Charset

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
      val bytes = openStream(uri).use { it.readBytes() }
      val postScriptName = TtfNames.postScriptName(bytes)
      if (postScriptName != family) {
        promise.reject(
          "E_NANOICONS_FONT_MISMATCH",
          "Font name \"$postScriptName\" does not match family \"$family\". " +
            "The TTF PostScript name must equal glyphMap.m.f."
        )
        return
      }

      val cacheFile = File.createTempFile("nanoicon_", ".ttf", reactApplicationContext.cacheDir)
      cacheFile.writeBytes(bytes)
      val typeface = Typeface.createFromFile(cacheFile)
      NanoIconFonts.register(family, typeface)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject(
        "E_NANOICONS_FONT_REGISTER",
        "Failed to register font \"$family\" from $uri: ${e.message}",
        e
      )
    }
  }

  override fun isFontRegistered(family: String, promise: Promise) {
    val assets = reactApplicationContext.assets
    UiThreadUtil.runOnUiThread {
      promise.resolve(NanoIconFonts.resolve(family, assets) != null)
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

object TtfNames {
  private const val NAME_ID_POSTSCRIPT = 6

  fun postScriptName(bytes: ByteArray): String? {
    val buf = ByteBuffer.wrap(bytes)
    val numTables = buf.getShort(4).toInt() and 0xffff
    var nameOffset = -1
    for (i in 0 until numTables) {
      val record = 12 + i * 16
      val tag = String(bytes, record, 4, Charsets.US_ASCII)
      if (tag == "name") {
        nameOffset = buf.getInt(record + 8)
        break
      }
    }
    if (nameOffset < 0) return null

    val count = buf.getShort(nameOffset + 2).toInt() and 0xffff
    val stringsOffset = nameOffset + (buf.getShort(nameOffset + 4).toInt() and 0xffff)
    var postScript: String? = null
    for (i in 0 until count) {
      val record = nameOffset + 6 + i * 12
      val platformId = buf.getShort(record).toInt() and 0xffff
      val nameId = buf.getShort(record + 6).toInt() and 0xffff
      if (nameId != NAME_ID_POSTSCRIPT) continue
      val length = buf.getShort(record + 8).toInt() and 0xffff
      val offset = buf.getShort(record + 10).toInt() and 0xffff
      val charset: Charset =
        if (platformId == 1) Charsets.ISO_8859_1 else Charsets.UTF_16BE
      val value = String(bytes, stringsOffset + offset, length, charset)
      if (postScript == null || platformId == 3) postScript = value
    }
    return postScript
  }
}
