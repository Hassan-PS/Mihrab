package com.prayer_times

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Calendar

/**
 * THE HERO, ON THE HOME SCREEN.
 *
 * The app's Today page opens on a sky drawn from the clock — night with
 * the moon in its phase, dawn, the day, sunset, dusk — with the next
 * prayer and the countdown to it at the foot. This widget is that hero,
 * lifted out: the same sky (SkyWidgetPainter is a port of the same model),
 * the same ink rule, the same three facts — which prayer, how long, what
 * time — and the city and the date where the hero has them.
 *
 * ── SIZES ─────────────────────────────────────────────────────────────
 *
 * Placed at 2×2 and resizable to 4×3. Every decision below is a function
 * of the size handed in (WidgetSizing gives one call per size the launcher
 * may show), never of a guess about "the current" size:
 *
 *   under 100dp tall   the countdown and the prayer's name; no city, no date
 *   under 150dp wide   the time drops off the countdown's line
 *   otherwise          city on top, "Fajr · 03:38" and the countdown at the
 *                      foot, the date under them; the sky's bodies in the
 *                      room between
 *
 * ── REFRESH ───────────────────────────────────────────────────────────
 *
 * The countdown is a Chronometer, so it ticks for free. The sky is drawn
 * at bind time and redrawn on the same signals as every other card here —
 * the half-hour `updatePeriodMillis`, the prayer-boundary alarm, unlock,
 * midnight. A passage is hours long; half an hour of a gradient is under
 * a fifth of the shortest of them.
 *
 * The countdown falls back to the placeholder when the payload has no
 * usable rows or has expired, the same as every other card.
 */
class PrayerWidgetSkyProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      PrayerWidgetProvider.ACTION_PRAYER_TIME_ELAPSED ->
        PrayerWidgetProvider.requestUpdate(context)
    }
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, responsiveViews(context, appWidgetManager, id))
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    appWidgetManager.updateAppWidget(appWidgetId, responsiveViews(context, appWidgetManager, appWidgetId))
  }

  companion object {
    private const val TAG = "MihrabWidget"

    /** Below this height the city and the date go; the countdown stays. */
    private const val SHORT_HEIGHT_DP = 100
    /** Below this width the clock time leaves the countdown's line. */
    private const val NARROW_WIDTH_DP = 150
    /** The card's own padding, dp — matches the layout. */
    private const val CARD_PADDING_DP = 12
    /** Roughly what the top line and the foot block occupy, dp, for the sky's bands. */
    private const val TOP_LINE_DP = 22
    private const val FOOT_BLOCK_DP = 66
    private const val FOOT_BLOCK_SHORT_DP = 48

    fun requestUpdate(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, PrayerWidgetSkyProvider::class.java))
      for (id in ids) mgr.updateAppWidget(id, responsiveViews(context, mgr, id))
    }

    /** One RemoteViews per size the launcher can show — see WidgetSizing. */
    private fun responsiveViews(context: Context, mgr: AppWidgetManager, appWidgetId: Int): RemoteViews =
      WidgetSizing.responsive(context, mgr, appWidgetId) { size ->
        buildViews(context, size.widthDp, size.heightDp)
      }

    fun buildViews(base: Context, widthDp: Int, heightDp: Int): RemoteViews {
      val context = PrayerWidgetProvider.localized(base)
      val views = RemoteViews(context.packageName, R.layout.prayer_widget_sky)
      val (bg, _) = PrayerWidgetProvider.resolvedColors(context)
      // The card under the sky: the user's background, so the corners and
      // the inset match every other Mihrab card while the sky is loading.
      WidgetCard.paint(views, bg)

      val open = PendingIntent.getActivity(
        context,
        0,
        Intent(Intent.ACTION_VIEW, Uri.parse("mihrab://today")).apply {
          setPackage(context.packageName)
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.widget_root, open)

      try {
        val root = PrayerWidgetProvider.payload(context)
        val day = root?.let { if (PrayerWidgetProvider.payloadHasExpired(it)) null else PrayerWidgetProvider.selectTodayDay(it) }
        if (root == null || day == null) {
          placeholder(views, context.getString(R.string.widget_placeholder_day), false)
          return views
        }
        bind(context, views, root, day, widthDp, heightDp)
      } catch (e: Exception) {
        Log.e(TAG, "sky widget render failed", e)
        placeholder(views, "${context.getString(R.string.widget_error)} (${e.javaClass.simpleName})", true)
      }
      return views
    }

    private fun placeholder(views: RemoteViews, message: String, isError: Boolean) {
      views.setViewVisibility(R.id.widget_content, View.GONE)
      views.setViewVisibility(R.id.widget_sky, View.GONE)
      views.setViewVisibility(R.id.widget_placeholder, View.VISIBLE)
      views.setTextViewText(R.id.widget_placeholder, message)
      views.setTextColor(R.id.widget_placeholder, Color.parseColor(if (isError) "#F87171" else "#9AA0A6"))
    }

    private data class Row(val key: String, val name: String, val time: String, val display: String)

    private fun rowsOf(day: JSONObject): List<Row> {
      val out = mutableListOf<Row>()
      fun add(o: JSONObject?) {
        if (o == null) return
        val key = o.optString("key", "")
        val time = o.optString("time", "")
        if (key.isEmpty() || time.isEmpty()) return
        val name = o.optString("name", "").trim().ifEmpty { o.optString("abbr", "").trim() }.ifEmpty { key }
        out.add(Row(key, name, time, o.optString("display", "").ifEmpty { time }))
      }
      val rows = day.optJSONArray("rows")
      if (rows != null) for (i in 0 until rows.length()) add(rows.optJSONObject(i))
      add(day.optJSONObject("sunriseRow"))
      val extra = day.optJSONArray("extraRows")
      if (extra != null) for (i in 0 until extra.length()) add(extra.optJSONObject(i))
      return out
    }

    private fun bind(
      context: Context,
      views: RemoteViews,
      root: JSONObject,
      day: JSONObject,
      widthDp: Int,
      heightDp: Int,
    ) {
      val rows = rowsOf(day)
      if (rows.isEmpty()) {
        placeholder(views, context.getString(R.string.widget_placeholder_day), false)
        return
      }
      views.setViewVisibility(R.id.widget_placeholder, View.GONE)
      views.setViewVisibility(R.id.widget_content, View.VISIBLE)
      views.setViewVisibility(R.id.widget_sky, View.VISIBLE)

      val cal = Calendar.getInstance()
      val nowMinutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
      val byKey = rows.associateBy { it.key.lowercase() }
      fun at(key: String): Int? = SkyWidgetPainter.minutesOf(byKey[key.lowercase()]?.time)

      // Tomorrow's Fajr closes tonight's sky — the next entry in `days[]`.
      val tomorrowFajr = tomorrow(root, day)?.optJSONArray("rows")?.let { arr ->
        var v: Int? = null
        for (i in 0 until arr.length()) {
          val o = arr.optJSONObject(i) ?: continue
          if (o.optString("key").equals("Fajr", ignoreCase = true)) v = SkyWidgetPainter.minutesOf(o.optString("time"))
        }
        v
      }
      val moment = SkyWidgetPainter.moment(
        at("Fajr"), at("Sunrise"), at("Asr"), at("Maghrib"), at("Isha"), tomorrowFajr, nowMinutes,
      )
      val frame = SkyWidgetPainter.frame(moment, System.currentTimeMillis())

      // ── The next event, the same walk the strip does ──────────────
      var next: Row? = null
      var nextMinutes = -1
      for (r in rows) {
        val m = SkyWidgetPainter.minutesOf(r.time) ?: continue
        if (m > nowMinutes && (nextMinutes < 0 || m < nextMinutes)) {
          next = r
          nextMinutes = m
        }
      }
      var minutesLeft: Int
      if (next != null) {
        minutesLeft = nextMinutes - nowMinutes
      } else {
        // After the last row of the day: the earliest row, tomorrow.
        var earliest: Row? = null
        var earliestMinutes = Int.MAX_VALUE
        for (r in rows) {
          val m = SkyWidgetPainter.minutesOf(r.time) ?: continue
          if (m < earliestMinutes) {
            earliest = r
            earliestMinutes = m
          }
        }
        next = earliest
        minutesLeft = if (earliest == null) -1 else earliestMinutes + 24 * 60 - nowMinutes
      }

      val short = heightDp in 1 until SHORT_HEIGHT_DP
      val narrow = widthDp in 1 until NARROW_WIDTH_DP

      // ── Ink, per line, from the sky at that line's height ─────────
      val inkTop = SkyWidgetPainter.inkAt(frame, 0.08f)
      val mutedTop = SkyWidgetPainter.mutedInkAt(frame, 0.08f)
      val inkFoot = SkyWidgetPainter.inkAt(frame, 0.82f)
      val mutedFoot = SkyWidgetPainter.mutedInkAt(frame, 0.82f)

      val location = root.optString("locationName", "").trim()
      views.setTextViewText(R.id.widget_location, location)
      views.setTextColor(R.id.widget_location, mutedTop)
      views.setViewVisibility(R.id.widget_location, if (short || location.isEmpty()) View.GONE else View.VISIBLE)

      val name = next?.name ?: ""
      val time = next?.display ?: ""
      views.setTextViewText(
        R.id.widget_next_name,
        when {
          name.isEmpty() -> ""
          narrow || time.isEmpty() -> name
          else -> "$name · $time"
        },
      )
      views.setTextColor(R.id.widget_next_name, mutedFoot)
      views.setViewVisibility(R.id.widget_next_name, if (name.isEmpty()) View.GONE else View.VISIBLE)

      if (minutesLeft >= 0) {
        val secondsIntoMinute = Calendar.getInstance().get(Calendar.SECOND)
        val base = android.os.SystemClock.elapsedRealtime() + minutesLeft * 60_000L - secondsIntoMinute * 1000L
        views.setChronometerCountDown(R.id.widget_remaining, true)
        views.setChronometer(R.id.widget_remaining, base, null, true)
        views.setViewVisibility(R.id.widget_remaining, View.VISIBLE)
      } else {
        views.setChronometer(R.id.widget_remaining, 0L, null, false)
        views.setViewVisibility(R.id.widget_remaining, View.GONE)
      }
      views.setTextColor(R.id.widget_remaining, inkFoot)
      // The countdown is the biggest thing on the card and scales with it.
      val countdownSp = when {
        short -> 26f
        heightDp >= 200 && widthDp >= 250 -> 44f
        else -> 34f
      }
      views.setTextViewTextSize(R.id.widget_remaining, TypedValue.COMPLEX_UNIT_SP, countdownSp)

      val dayLabel = day.optString("dayLabel", "").trim().ifEmpty { root.optString("dayLabel", "").trim() }
      val hijri = root.optJSONObject("hijri")?.optString("label", "")?.trim().orEmpty()
      val dateLine = listOf(dayLabel, hijri).filter { it.isNotEmpty() }.joinToString(" · ")
      views.setTextViewText(R.id.widget_date, dateLine)
      views.setTextColor(R.id.widget_date, mutedFoot)
      views.setViewVisibility(R.id.widget_date, if (short || dateLine.isEmpty()) View.GONE else View.VISIBLE)

      // ── The sky itself, at the card's size ────────────────────────
      val density = context.resources.displayMetrics.density
      val inset = context.resources.getDimension(R.dimen.widget_card_inset)
      val radius = context.resources.getDimension(R.dimen.widget_card_radius)
      // The bitmap is the card: the host view less the inset on each side.
      // 0 is a launcher that has not measured yet; a modest default keeps
      // the first draw a sky rather than nothing.
      val cardW = ((if (widthDp > 0) widthDp else 220) * density - 2 * inset).toInt().coerceAtLeast(1)
      val cardH = ((if (heightDp > 0) heightDp else 120) * density - 2 * inset).toInt().coerceAtLeast(1)
      val pad = CARD_PADDING_DP * density
      val topBand = pad + (if (short || location.isEmpty()) 0f else TOP_LINE_DP * density)
      val footBand = pad + (if (short) FOOT_BLOCK_SHORT_DP else FOOT_BLOCK_DP) * density
      views.setImageViewBitmap(
        R.id.widget_sky,
        SkyWidgetPainter.render(cardW, cardH, density, radius, frame, topBand, footBand),
      )
    }

    /** The entry in `days[]` after `day`, if the payload carries one. */
    private fun tomorrow(root: JSONObject, day: JSONObject): JSONObject? {
      val days = root.optJSONArray("days") ?: return null
      val key = day.optString("dateKey")
      for (i in 0 until days.length() - 1) {
        if (days.optJSONObject(i)?.optString("dateKey") == key) return days.optJSONObject(i + 1)
      }
      return null
    }
  }
}
