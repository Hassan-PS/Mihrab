package com.prayer_times

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.util.Log
import android.util.SizeF
import android.widget.RemoteViews
import kotlin.math.roundToInt

/**
 * ONE RemoteViews THAT IS RIGHT AT EVERY SIZE THE LAUNCHER MAY SHOW.
 *
 * ── THE BUG CLASS THIS ENDS ────────────────────────────────────────────
 *
 * Every widget here decides what to draw from its size: whether the header
 * fits, whether the graph appears, how big the times can be. Until now
 * each provider read that size out of `getAppWidgetOptions` at draw time
 * and produced ONE RemoteViews for it. Two things are wrong with that, and
 * both have reached users:
 *
 *   • The options carry a size per ORIENTATION, paired under names that
 *     read like a range (MIN/MAX). A card drawn upright from the landscape
 *     height lost its header; a card drawn for portrait and then rotated
 *     kept the wrong variant until the next redraw — and the launcher does
 *     not redraw on rotation, it re-lays-out what it was given.
 *   • Some launchers (EMUI among them) hand out sizes the provider was
 *     never tuned against, and a threshold that is "mid-band" on a Pixel
 *     lands on the wrong side of a row there.
 *
 * Android 12 fixed this at the platform: a provider can hand the launcher
 * a MAP from sizes to RemoteViews, one for each size the widget can take
 * (`OPTION_APPWIDGET_SIZES`), and the launcher picks the entry for the size
 * it is actually drawing — per orientation, per resize, without asking the
 * provider again. The provider's job becomes a pure function of (width,
 * height), which is what every `bind*` here already was.
 *
 * ── HOW TO USE ────────────────────────────────────────────────────────
 *
 *     appWidgetManager.updateAppWidget(id, WidgetSizing.responsive(context, mgr, id) { size ->
 *       buildViews(context, ..., size.widthDp, size.heightDp)
 *     })
 *
 * On API 31+ with sizes reported, `render` runs once per size (at most 16,
 * the platform's cap) and the launcher does the choosing. Otherwise it
 * runs once, for the single best guess `PrayerWidgetProvider.sizeDp` makes
 * — the pre-12 behaviour, unchanged.
 *
 * `render` MUST be a pure function of its size argument: no reading the
 * options bundle, no `sizeDp`, inside it. A render that peeks at the
 * options for the "current" size defeats the whole mechanism.
 */
object WidgetSizing {
  data class Size(val widthDp: Int, val heightDp: Int)

  /** The platform caps the map at this many entries. */
  private const val MAX_SIZES = 16

  fun responsive(
    context: Context,
    mgr: AppWidgetManager,
    appWidgetId: Int,
    render: (Size) -> RemoteViews,
  ): RemoteViews {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val sizes = sizesFor(mgr, appWidgetId)
      // One line per draw, so a "wrong variant" report can be read against
      // the sizes the launcher actually offered. Debug level: silent in a
      // release logcat unless asked for.
      Log.d(PrayerWidgetProvider.WIDGET_LOG_TAG, "sizes for widget $appWidgetId: $sizes")
      if (sizes.isNotEmpty()) {
        // Distinct dp sizes only: two SizeF that round to the same dp would
        // draw the same card twice, and the map is keyed on the SizeF the
        // launcher will look up, so the ORIGINAL SizeF stays the key.
        val map = LinkedHashMap<SizeF, RemoteViews>()
        val seen = HashSet<Size>()
        for (s in sizes) {
          if (map.size >= MAX_SIZES) break
          val size = Size(s.width.roundToInt(), s.height.roundToInt())
          if (size.widthDp <= 0 || size.heightDp <= 0) continue
          if (!seen.add(size)) continue
          map[s] = render(size)
        }
        if (map.size == 1) return map.values.first()
        if (map.isNotEmpty()) return RemoteViews(map)
      }
    }
    val (w, h) = PrayerWidgetProvider.sizeDp(context, mgr, appWidgetId)
    return render(Size(w, h))
  }

  /**
   * The sizes the launcher says this widget can be shown at, in dp. Empty
   * when the launcher does not report them (a pre-12 launcher on a 12+
   * phone, or one that has not measured yet).
   */
  private fun sizesFor(mgr: AppWidgetManager, appWidgetId: Int): List<SizeF> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return emptyList()
    val opts = try {
      mgr.getAppWidgetOptions(appWidgetId)
    } catch (_: Exception) {
      null
    } ?: return emptyList()
    @Suppress("DEPRECATION")
    val list: ArrayList<SizeF>? = try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        opts.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES, SizeF::class.java)
      } else {
        opts.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES)
      }
    } catch (_: Exception) {
      null
    }
    return list ?: emptyList()
  }
}
