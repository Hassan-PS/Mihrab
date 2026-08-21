package com.prayer_times

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import java.util.Calendar
import org.json.JSONArray
import org.json.JSONObject

/**
 * The practice graph, drawn once into a Bitmap.
 *
 * RemoteViews has a fixed view vocabulary and no loops: seventy squares means
 * seventy TextViews declared by hand in XML, each addressed by a generated id,
 * and every update crossing the process boundary as seventy separate actions.
 * A Bitmap is one action and one object, and the drawing is a dozen lines.
 *
 * THE GRID IS A CALENDAR, NOT A LIST. `practice.days` is SPARSE — the payload
 * writer omits days with nothing recorded and stamps every entry it does send
 * with its own date (`d`), because a dense ninety-eight-day array costs more
 * than the payload budget allows. This used to walk the array positionally and
 * pack entry `i` into cell `i`, which is only ever right for an unbroken run:
 * one skipped day slid every square after it one place along, and the widget
 * drew a record the Log screen had never shown. Look the day up by its date,
 * the way iOS's PracticeGrid does, and a gap is a gap.
 *
 * Weeks are columns and days are rows, MONDAY FIRST — the order the in-app
 * heatmap uses, chosen there so Mondays and Thursdays (the sunnah fast days)
 * sit in the first and fourth rows rather than straddling a column boundary.
 * The eye reads a week as a vertical stripe in the app and in the widget, so a
 * habit is the same shape in both.
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

  /** The muted grey, for days that have not happened yet. */
  private const val FUTURE_COLOR = "#9AA0A6"

  /**
   * A RemoteViews carrying bitmaps has to cross a Binder transaction, and
   * the AppWidget host applies its own ceiling on top of that — OEMs vary,
   * and the failure is the whole widget refusing to draw rather than a
   * warning. Ten weeks of 7dp cells is ~150 KB at 2.75x and ~300 KB at 4x,
   * and there are two of these in a 4x4. Clamping the cell keeps the pair
   * comfortably inside the budget on any density, at the cost of a grid
   * that stops growing on the very densest screens — where it is already
   * more pixels than the eye is using.
   */
  private const val MAX_CELL_PX = 14

  /**
   * @param days   the payload's `practice.days` array, sparse, each entry
   *               carrying its own `d` date key
   * @param weeks  how many columns to draw, ending with the week containing
   *               today
   * @param cellPx square size in pixels, clamped to MAX_CELL_PX
   * @param gapPx  space between squares
   * @param now    the moment the grid describes — injectable so the shape can
   *               be asserted against a fixed date
   */
  @JvmOverloads
  fun render(
    days: JSONArray?,
    weeks: Int,
    cellPx: Int,
    gapPx: Int,
    accent: Int,
    now: Calendar = Calendar.getInstance(),
  ): Bitmap {
    @Suppress("NAME_SHADOWING") val cellPx = cellPx.coerceIn(3, MAX_CELL_PX)
    @Suppress("NAME_SHADOWING") val gapPx = gapPx.coerceIn(1, 4)
    @Suppress("NAME_SHADOWING") val weeks = weeks.coerceAtLeast(1)
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

    val byDate = indexByDate(days)
    val todayKey = keyOf(now)
    // The Monday of the week containing today. Calendar.MONDAY is 2 and the
    // week runs 1..7 from Sunday, so (dow + 5) % 7 is days since Monday.
    val cursor = (now.clone() as Calendar).apply {
      set(Calendar.HOUR_OF_DAY, 12)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      add(Calendar.DAY_OF_YEAR, -((get(Calendar.DAY_OF_WEEK) + 5) % 7))
      // Back to the first column's Monday.
      add(Calendar.DAY_OF_YEAR, -7 * (weeks - 1))
    }

    for (col in 0 until weeks) {
      for (row in 0 until ROWS) {
        val key = keyOf(cursor)
        val left = (col * (cellPx + gapPx)).toFloat()
        val top = (row * (cellPx + gapPx)).toFloat()
        val rect = RectF(left, top, left + cellPx, top + cellPx)
        // A date key is YYYY-MM-DD, so string order IS date order.
        val future = key > todayKey
        paint.color = colorFor(if (future) null else byDate[key], future, accent)
        canvas.drawRoundRect(rect, radius, radius, paint)
        cursor.add(Calendar.DAY_OF_YEAR, 1)
      }
    }
    return bmp
  }

  /**
   * `days` keyed by its own date stamp.
   *
   * An entry without a usable `d` is dropped rather than guessed at: a day
   * drawn in the wrong square is worse than a day not drawn, because it is
   * indistinguishable from a real one.
   */
  private fun indexByDate(days: JSONArray?): Map<String, JSONObject> {
    if (days == null || days.length() == 0) return emptyMap()
    val out = HashMap<String, JSONObject>(days.length())
    for (i in 0 until days.length()) {
      val day = days.optJSONObject(i) ?: continue
      val key = day.optString("d")
      if (key.length == 10) out[key] = day
    }
    return out
  }

  /** Local YYYY-MM-DD, matching the payload's own day keys. */
  private fun keyOf(cal: Calendar): String = String.format(
    "%04d-%02d-%02d",
    cal.get(Calendar.YEAR),
    cal.get(Calendar.MONTH) + 1,
    cal.get(Calendar.DAY_OF_MONTH),
  )

  /**
   * Four states and nothing else: a day with prayers kept, a day that owes
   * one, a day with nothing recorded, and a day that has not happened. A
   * future day is drawn FAINTER than an empty past one rather than the same,
   * because "you did not pray on Sunday" is a claim the record cannot make
   * about a Sunday that is still two days away.
   */
  private fun colorFor(day: JSONObject?, future: Boolean, accent: Int): Int {
    if (future) return withAlpha(Color.parseColor(FUTURE_COLOR), 0.08f)
    // The empty square is the palest step of the SAME ramp, not grey — the
    // app's heatmap makes the same choice, and for the same reason: grey
    // reads as a failed day, and this graph does not grade anyone.
    if (day == null) return withAlpha(accent, 0.10f)
    if (day.optBoolean("m", false)) {
      return withAlpha(Color.parseColor(OWED_COLOR), 0.30f)
    }
    val kept = day.optInt("k", 0).coerceIn(0, 5)
    if (kept <= 0) return withAlpha(accent, 0.10f)
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
