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
      invalidate()
    }
  }

  fun setFontSize(size: Float) {
    val sizeInPx = size * resources.displayMetrics.density
    if (paint.textSize != sizeInPx) {
      paint.textSize = sizeInPx
      invalidate()
    }
  }

  fun setCodepoints(values: IntArray) {
    codepoints = values
    invalidate()
  }

  fun setColors(values: IntArray) {
    colors = values
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (codepoints.isEmpty() || cachedTypeface == null) return

    canvas.save()
    canvas.clipRect(0f, 0f, width.toFloat(), height.toFloat())

    val baseline = -paint.fontMetrics.ascent

    // All layers drawn at the same position (stacked on each other)
    for (i in codepoints.indices) {
      val cp = codepoints[i]
      val color = if (i < colors.size) colors[i] else 0xFF000000.toInt()
      paint.color = color

      val text = String(Character.toChars(cp))
      canvas.drawText(text, 0f, baseline, paint)
    }

    canvas.restore()
  }
}
