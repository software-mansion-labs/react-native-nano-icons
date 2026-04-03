package com.nanoicons

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.view.View
import com.facebook.react.common.assets.ReactFontManager

class NanoIconView(context: Context) : View(context) {

  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var codepoints: IntArray = intArrayOf()
  private var colors: IntArray = intArrayOf()
  private var cachedFontFamily: String? = null
  private var cachedTypeface: Typeface? = null
  // Cached String objects — rebuilt only when codepoints change
  private var cachedTexts: Array<String> = emptyArray()
  // Cached baseline — rebuilt only when font or size changes
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
      updateBaseline()
      invalidate()
    }
  }

  fun setFontSize(size: Float) {
    val sizeInPx = size * resources.displayMetrics.density
    if (paint.textSize != sizeInPx) {
      paint.textSize = sizeInPx
      updateBaseline()
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

  private fun updateBaseline() {
    cachedBaseline = -paint.fontMetrics.ascent
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
