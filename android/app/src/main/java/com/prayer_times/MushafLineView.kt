package com.prayer_times

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.view.View
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.common.assets.ReactFontManager

/**
 * One line of the Ḥafṣ muṣḥaf, drawn with the pen.
 *
 * The line arrives as pieces in drawing order — right to left, the text is
 * RTL — each a run of glyphs in the page font or a gap the pen skips, with
 * an optional wash behind it and, for the marker's medallion, its own ink.
 * The pen starts at `penRight` and walks left by each run's measured advance
 * (Minikin's, the same shaper the platform's TextView uses, so a word is
 * exactly as wide here as it was there) or by the gap's width.
 *
 * Nothing here breaks or clips: a run a hair wider than expected lands a
 * hair further left, and the ink that overshoots the line's ends and its
 * metrics lands wherever the view has room for it — the view is sized by
 * JS to have that room (`lineInkPadding`, `lineInkSidePadding`). See
 * `src/quran/native/MushafLineView.ts` for why this exists.
 *
 * All positions are in dp from JS and scaled here.
 */
class MushafLineView(context: Context) : View(context) {
  var fontFamily: String = ""
    set(value) { field = value; invalidate() }
  var fontSize: Float = 0f
    set(value) { field = value; invalidate() }
  var color: Int = -0x1000000
    set(value) { field = value; invalidate() }
  var runs: ReadableArray? = null
    set(value) { field = value; invalidate() }
  var penRight: Float = 0f
    set(value) { field = value; invalidate() }
  var penBaseline: Float = 0f
    set(value) { field = value; invalidate() }
  var boxTop: Float = 0f
    set(value) { field = value; invalidate() }
  var boxHeight: Float = 0f
    set(value) { field = value; invalidate() }

  private val glyphPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
    textAlign = Paint.Align.LEFT
  }
  private val washPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

  init {
    // The view is transparent and never needs a hardware layer of its own.
    setWillNotDraw(false)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val pieces = runs ?: return
    if (fontSize <= 0f || fontFamily.isEmpty() || pieces.size() == 0) return
    val density = resources.displayMetrics.density
    // Resolved at draw time, not when the prop lands: the font store can
    // re-register a slot family with another page's file, and a page that
    // is on screen is pinned against that — but a lookup is a map read,
    // and it is the one thing that can never go stale.
    glyphPaint.typeface =
      ReactFontManager.getInstance().getTypeface(fontFamily, Typeface.NORMAL, context.assets)
    glyphPaint.textSize = fontSize * density
    glyphPaint.letterSpacing = 0f

    val top = boxTop * density
    val bottom = (boxTop + boxHeight) * density
    val y = penBaseline * density
    val count = pieces.size()

    // Two passes, washes then glyphs, so a swash that crosses into the
    // next word is drawn over its wash and not under it — which is how a
    // paragraph draws its span backgrounds too.
    var pen = penRight * density
    val lefts = FloatArray(count)
    val texts = arrayOfNulls<String>(count)
    for (i in 0 until count) {
      val piece: ReadableMap = pieces.getMap(i) ?: continue
      val advance: Float
      if (piece.hasKey("t") && !piece.isNull("t")) {
        val text = piece.getString("t") ?: ""
        texts[i] = text
        advance = glyphPaint.measureText(text)
      } else {
        advance = (if (piece.hasKey("g")) piece.getDouble("g").toFloat() else 0f) * density
      }
      val left = pen - advance
      lefts[i] = left
      if (piece.hasKey("w") && !piece.isNull("w")) {
        washPaint.color = piece.getInt("w")
        canvas.drawRect(left, top, pen, bottom, washPaint)
      }
      pen = left
    }
    for (i in 0 until count) {
      val text = texts[i] ?: continue
      val piece = pieces.getMap(i) ?: continue
      glyphPaint.color =
        if (piece.hasKey("i") && !piece.isNull("i")) piece.getInt("i") else color
      canvas.drawText(text, lefts[i], y, glyphPaint)
    }
  }
}
