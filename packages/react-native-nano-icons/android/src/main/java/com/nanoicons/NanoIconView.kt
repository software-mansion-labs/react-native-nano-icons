package com.nanoicons

import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.view.View
import com.facebook.react.bridge.ColorPropConverter
import com.facebook.react.common.assets.ReactFontManager

class NanoIconView(context: Context) : View(context) {

  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val fontMetrics = Paint.FontMetrics()
  private var codepoints: IntArray = intArrayOf()
  private var colors: IntArray = intArrayOf()
  // Unresolved layer colors: literal ARGB, plus resource paths for the entries that
  // depend on the theme (PlatformColor). Kept so they can be re-resolved on a
  // configuration change — the props are not re-sent for that.
  private var literalColors: IntArray = intArrayOf()
  private var colorPaths: Array<Array<String>?>? = null
  private var cachedFontFamily: String? = null
  private var cachedTypeface: Typeface? = null
  // Cached String objects — rebuilt only when codepoints change
  private var cachedTexts: Array<String> = emptyArray()
  // Cached baseline — rebuilt when font, size, or bounds change
  private var cachedBaseline: Float = 0f
  // Derived from the loaded font's metrics; recomputed on typeface change.
  private var textSizeFactor = 0f
  private var baselineFactor = 0f

  init {
    // Transparent background, no default drawing
    setBackgroundColor(0x00000000)
  }

  fun setFontFamily(fontFamily: String) {
    if (fontFamily != cachedFontFamily) {
      cachedFontFamily = fontFamily
      cachedTypeface = ReactFontManager.getInstance()
        .getTypeface(fontFamily, Typeface.NORMAL, context.assets)
      paint.typeface = cachedTypeface
      updateFontFactors()
      fitToBounds()
      invalidate()
    }
  }

  fun setFontSize(size: Float) {
    // Only seeds a size for use before the first layout; bounds win after that.
    paint.textSize = size * resources.displayMetrics.density
    if (textSizeFactor <= 0f) updateFontFactors()
    fitToBounds()
    invalidate()
  }

  fun setCodepoints(values: IntArray) {
    codepoints = values
    cachedTexts = Array(values.size) { i -> String(Character.toChars(values[i])) }
    invalidate()
  }

  fun setColors(literals: IntArray, paths: Array<Array<String>?>?) {
    literalColors = literals
    colorPaths = paths
    resolveColors()
    invalidate()
  }

  // Resolve theme-dependent entries against this view's current context; literal
  // entries pass through untouched.
  private fun resolveColors() {
    val paths = colorPaths
    if (paths == null) {
      colors = literalColors
      return
    }
    colors = IntArray(literalColors.size) { i ->
      val entry = paths[i] ?: return@IntArray literalColors[i]
      entry.firstNotNullOfOrNull { ColorPropConverter.resolveResourcePath(context, it) }
        ?: Color.BLACK
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (colorPaths == null) return
    resolveColors()
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    fitToBounds()
    invalidate()
  }

  private fun updateFontFactors() {
    val ts = paint.textSize
    if (cachedTypeface == null || ts <= 0f) return
    paint.getFontMetrics(fontMetrics)
    val band = fontMetrics.descent - fontMetrics.ascent
    if (band <= 0f) return
    textSizeFactor = ts / band
    baselineFactor = 1f - fontMetrics.descent / band
  }

  // Font scale is derived from the bounds, not from the fontSize prop.
  private fun fitToBounds() {
    val h = height.toFloat()
    if (h <= 0f || textSizeFactor <= 0f) return
    cachedBaseline = h * baselineFactor
    val size = h * textSizeFactor
    if (paint.textSize != size) paint.textSize = size
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (cachedTexts.isEmpty() || cachedTypeface == null) return

    canvas.save()
    canvas.clipRect(0f, 0f, width.toFloat(), height.toFloat())

    // All layers drawn at the same position (stacked on each other)
    for (i in cachedTexts.indices) {
      val color = if (i < colors.size) colors[i] else 0xFF000000.toInt()
      paint.color = color
      canvas.drawText(cachedTexts[i], 0f, cachedBaseline, paint)
    }

    canvas.restore()
  }
}
