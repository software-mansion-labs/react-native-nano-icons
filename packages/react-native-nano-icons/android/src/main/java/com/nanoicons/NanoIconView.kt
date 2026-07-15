package com.nanoicons

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.view.View
import com.facebook.react.common.assets.ReactFontManager

class NanoIconView(context: Context) : View(context) {

  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val fontMetrics = Paint.FontMetrics()
  private var codepoints: IntArray = intArrayOf()
  private var colors: IntArray = intArrayOf()
  private var cachedFontFamily: String? = null
  private var cachedTypeface: Typeface? = null
  // Cached String objects — rebuilt only when codepoints change
  private var cachedTexts: Array<String> = emptyArray()
  // Cached baseline — rebuilt when font, size, or bounds change
  private var cachedBaseline: Float = 0f

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
      fitPaintToBounds()
      invalidate()
    }
  }

  fun setFontSize(size: Float) {
    val sizeInPx = size * resources.displayMetrics.density
    if (paint.textSize != sizeInPx) {
      paint.textSize = sizeInPx
      fitPaintToBounds()
      invalidate()
    }
  }

  fun setCodepoints(values: IntArray) {
    codepoints = values
    cachedTexts = Array(values.size) { i -> String(Character.toChars(values[i])) }
    invalidate()
  }

  fun setColors(values: IntArray) {
    colors = values
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    fitPaintToBounds()
    invalidate()
  }

  // Scale the glyph em square to fill the view height (mirrors iOS _fitScale).
  // The view bounds — not the fontSize prop — carry the resolved size: JS sizes
  // the box to size * fontScale while the fontSize prop is the unscaled size,
  // so fitting to bounds is what applies allowFontScaling to the drawn glyph.
  private fun fitPaintToBounds() {
    val h = height.toFloat()
    if (h <= 0f || paint.textSize <= 0f) return
    paint.getFontMetrics(fontMetrics)
    val em = fontMetrics.descent - fontMetrics.ascent
    if (em > 0f) {
      paint.textSize = paint.textSize * h / em
      paint.getFontMetrics(fontMetrics)
    }
    // Bottom-anchor the baseline like iOS so ascent + descent spans the box.
    cachedBaseline = h - fontMetrics.descent
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
