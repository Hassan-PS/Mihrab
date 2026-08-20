package com.prayer_times

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import org.json.JSONArray

/**
 * The practice graph, drawn once into a Bitmap.
 *
 * RemoteViews has a fixed view vocabulary and no loops: seventy squares means
 * seventy TextViews declared by hand in XML, each addressed by a generated id,
 * and every update crossing the process boundary as seventy separate actions.
 * A Bitmap is one action and one object, and the drawing is a dozen lines.
 *
 * Weeks are columns and days are rows, matching the in-app graph and the iOS
 * one — the eye reads a week as a vertical stripe in all three, so a habit
 * looks the same shape wherever it is seen.
 *
 * The ramp is the same one SwiftUI's PracticeGrid uses:
 * `alpha = 0.42 + 0.58 * (kept / 5)` on the accent, so one prayer is faintly
 * there rather than invisible and five is solid. A missed day is the danger
 * colour at low alpha — a different KIND of day, not a fainter good one.
 */
object PracticeGridBitmap {

  /** Days per column. Seven, because a week is what people count in. */
  private const val ROWS = 7

  private const val OWED_COLOR = "#F87171"

  /**
   * @param days   the payload's `practice.days` array, oldest first
   * @param weeks  how many columns to draw
   * @param cellPx square size in pixels
   * @param gapPx  space between squares
   */
  fun render(
    days: JSONArray?,
    weeks: Int,
    cellPx: Int,
    gapPx: Int,
    accent: Int,
  ): Bitmap {
    val width = weeks * cellPx + (weeks - 1) * gapPx
    val height = ROWS * cellPx + (ROWS - 1) * gapPx
    val bmp = Bitmap.createBitmap(
      width.coerceAtLeast(1),
      height.coerceAtLeast(1),
      Bitmap.Config.ARGB_8888,
    )
    val canvas = Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val radius = cellPx * 0.28f

    // The array is oldest-first and the grid is drawn oldest-first, so the
    // last cell is today — the same orientation as the app's own graph.
    val total = weeks * ROWS
    val n = days?.length() ?: 0
    val offset = n - total

    for (i in 0 until total) {
      val col = i / ROWS
      val row = i % ROWS
      val left = (col * (cellPx + gapPx)).toFloat()
      val top = (row * (cellPx + gapPx)).toFloat()
      val rect = RectF(left, top, left + cellPx, top + cellPx)

      val day = if (offset + i in 0 until n) days?.optJSONObject(offset + i) else null
      paint.color = colorFor(day, accent)
      canvas.drawRoundRect(rect, radius, radius, paint)
    }
    return bmp
  }

  /**
   * Three states and nothing else: a day with prayers kept, a day that owes
   * one, and a day with nothing recorded. A future day is the same as a day
   * with nothing recorded — drawing it any other way would claim the record
   * knows something about tomorrow.
   */
  private fun colorFor(day: org.json.JSONObject?, accent: Int): Int {
    if (day == null) return withAlpha(Color.parseColor("#9AA0A6"), 0.14f)
    if (day.optBoolean("m", false)) {
      return withAlpha(Color.parseColor(OWED_COLOR), 0.30f)
    }
    val kept = day.optInt("k", 0).coerceIn(0, 5)
    if (kept <= 0) return withAlpha(Color.parseColor("#9AA0A6"), 0.14f)
    val alpha = 0.42f + 0.58f * (kept / 5f)
    return withAlpha(accent, alpha)
  }

  private fun withAlpha(color: Int, alpha: Float): Int =
    Color.argb(
      (alpha.coerceIn(0f, 1f) * 255).toInt(),
      Color.red(color),
      Color.green(color),
      Color.blue(color),
    )
}
