package com.prayer_times

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.ContextThemeWrapper
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import org.json.JSONObject

private data class WidgetStyle(
  val bgOpacityPercent: Int,
  val highlightId: String,
  val highlightHex: String,
  val useDynamicHighlight: Boolean,
) {
  fun backgroundArgb(): Int {
    val a = (bgOpacityPercent.coerceIn(0, 100) * 255 / 100f).toInt().coerceIn(0, 255)
    return Color.argb(a, BASE_BG_R, BASE_BG_G, BASE_BG_B)
  }

  fun highlightColorInt(context: Context): Int {
    if (useDynamicHighlight) {
      return resolveDynamicHighlightColor(context)
    }
    if (highlightId.equals("custom", ignoreCase = true)) {
      val h = highlightHex.trim()
      if (h.matches(Regex("^#([0-9A-Fa-f]{6})$"))) {
        return try {
          Color.parseColor(h)
        } catch (_: Exception) {
          Color.parseColor("#46A081")
        }
      }
      return Color.parseColor("#46A081")
    }
    val hex =
      when (highlightId.lowercase()) {
        "green" -> "#46A081"
        "teal" -> "#4EC9B0"
        "blue" -> "#6BA3F5"
        "amber" -> "#E5C07B"
        else -> "#46A081"
      }
    return try {
      Color.parseColor(hex)
    } catch (_: Exception) {
      Color.parseColor("#46A081")
    }
  }
}

private fun resolveDynamicHighlightColor(context: Context): Int {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    try {
      return ContextCompat.getColor(context, android.R.color.system_accent1_600)
    } catch (_: Exception) {
      /* fall through */
    }
  }
  val wrapped = ContextThemeWrapper(context.applicationContext, R.style.AppTheme)
  val fallback = Color.parseColor("#46A081")
  val ta = wrapped.obtainStyledAttributes(intArrayOf(android.R.attr.colorPrimary))
  try {
    return ta.getColor(0, fallback)
  } finally {
    ta.recycle()
  }
}

private fun readWidgetStyle(prefs: SharedPreferences): WidgetStyle {
  val opacity = prefs.getInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, 88)
  val hid =
    prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, "green")?.trim()
      ?: "green"
  val hex =
    prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, "")?.trim()
      ?: ""
  val dynamic =
    prefs.getBoolean(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_DYNAMIC, false)
  return WidgetStyle(
    opacity.coerceIn(0, 100),
    hid.ifEmpty { "green" },
    hex,
    dynamic,
  )
}

/** Neutral dark surface (#1C1C1E), opacity from settings. */
private const val BASE_BG_R = 28
private const val BASE_BG_G = 28
private const val BASE_BG_B = 30

/**
 * Neutral dark widget: only the next prayer row uses an accent color.
 * Background opacity and accent are configurable from app settings (Android).
 */
open class PrayerWidgetProvider : AppWidgetProvider() {

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    // SCREEN_ON and WALLPAPER_CHANGED used to be listed here and in the
    // manifest. Neither can arrive: SCREEN_ON is documented as deliverable
    // only to a receiver registered with registerReceiver, and
    // WALLPAPER_CHANGED has been dead since API 16. Declaring them made the
    // refresh story look far better covered than it was, which is how four
    // widgets ended up with no working unattended refresh at all while the
    // manifest suggested six triggers each.
    when (intent.action) {
      Intent.ACTION_USER_PRESENT,
      Intent.ACTION_BOOT_COMPLETED,
      ACTION_PRAYER_TIME_ELAPSED -> requestUpdate(context)
    }
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    refreshAll(context, appWidgetManager, appWidgetIds)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    refreshAll(context, appWidgetManager, intArrayOf(appWidgetId))
  }

  companion object {
    private const val TAG = "MihrabWidget"

    const val PREFS_NAME = "prayer_widget"
    const val PREFS_KEY = "payload_v1"
    const val PREFS_UI_STYLE_KEY = "widget_ui_style"
    const val PREFS_UI_OLED = "widget_oled"
    const val PREFS_WIDGET_BG_OPACITY = "widget_bg_opacity"
    const val PREFS_WIDGET_HIGHLIGHT_ID = "widget_highlight_id"
    const val PREFS_WIDGET_HIGHLIGHT_HEX = "widget_highlight_hex"
    const val PREFS_WIDGET_HIGHLIGHT_DYNAMIC = "widget_highlight_dynamic"
    /** Internal broadcast fired by AlarmManager at each prayer time transition. */
    const val ACTION_PRAYER_TIME_ELAPSED = "com.prayer_times.ACTION_PRAYER_TIME_ELAPSED"

    private const val NEUTRAL_TEXT = "#E8EAED"
    private const val NEUTRAL_MUTED = "#9AA0A6"

    private val COL_WRAPPERS =
      intArrayOf(
        R.id.widget_col_0,
        R.id.widget_col_1,
        R.id.widget_col_2,
        R.id.widget_col_3,
        R.id.widget_col_4,
        R.id.widget_col_5,
        // Islamic Midnight and the Last Third — drawn only when the
        // user has turned them on, and never highlighted.
        R.id.widget_col_6,
        R.id.widget_col_7,
      )
    /**
     * The inner box each column's highlight is painted on.
     *
     * Not the column itself. The column fills the row's height so the strip
     * can absorb slack, and painting the pill there stretched it into a tall
     * rounded slab behind two lines of centred text. The box wraps its
     * contents, which is the shape the highlight is meant to be.
     *
     * Slots 6 and 7 are the night rows, which are never highlighted; their
     * ids are here only to keep the arrays the same length.
     */
    private val COL_BOXES =
      intArrayOf(
        R.id.widget_col_0_box,
        R.id.widget_col_1_box,
        R.id.widget_col_2_box,
        R.id.widget_col_3_box,
        R.id.widget_col_4_box,
        R.id.widget_col_5_box,
        R.id.widget_col_6_box,
        R.id.widget_col_7_box,
      )
    private val COL_LABELS =
      intArrayOf(
        R.id.widget_col_0_label,
        R.id.widget_col_1_label,
        R.id.widget_col_2_label,
        R.id.widget_col_3_label,
        R.id.widget_col_4_label,
        R.id.widget_col_5_label,
        // Islamic Midnight and the Last Third — drawn only when the
        // user has turned them on, and never highlighted.
        R.id.widget_col_6_label,
        R.id.widget_col_7_label,
      )
    private val COL_TIMES =
      intArrayOf(
        R.id.widget_col_0_time,
        R.id.widget_col_1_time,
        R.id.widget_col_2_time,
        R.id.widget_col_3_time,
        R.id.widget_col_4_time,
        R.id.widget_col_5_time,
        // Islamic Midnight and the Last Third — drawn only when the
        // user has turned them on, and never highlighted.
        R.id.widget_col_6_time,
        R.id.widget_col_7_time,
      )

    /**
     * The background and accent colours the user has configured, for widgets
     * declared in other files.
     *
     * Exposed rather than duplicated: the configure screen writes one set of
     * preferences and every widget this app draws has to look like the same
     * app. A second reader that fell behind on, say, the dynamic-accent flag
     * would show one widget in Material You and the one beside it in green.
     */
    fun resolvedColors(context: Context): Pair<Int, Int> {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val style = readWidgetStyle(prefs)
      return Pair(style.backgroundArgb(), style.highlightColorInt(context))
    }

    /** Directly push updated RemoteViews to the given widget IDs — no broadcast. */
    fun refreshAll(context: Context, appWidgetManager: AppWidgetManager, ids: IntArray) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val json = prefs.getString(PREFS_KEY, null)
      val style = readWidgetStyle(prefs)
      for (id in ids) {
        val views = buildViews(context, appWidgetManager, id, json, style)
        appWidgetManager.updateAppWidget(id, views)
      }
    }

    /**
     * Redraw EVERY widget this app draws, and re-arm the clock that will ask
     * again.
     *
     * It used to reach three providers and Log Today. Streak, Continue
     * Reading, Hijri and Tasbih were left out — and because the alarm below
     * is an explicit intent, their manifest `ACTION_PRAYER_TIME_ELAPSED`
     * filters never fired either. All four also carry
     * `updatePeriodMillis="0"`, on the reasoning that they change only when
     * the app changes them. That reasoning assumed the app's own pushes
     * reached them, and nothing did: a Streak widget alone on a home screen
     * had no unattended refresh of any kind, so its graph did not roll onto
     * a new day until something else woke the app.
     *
     * One entry point, every provider, every time. Called from the RN module
     * after a payload write, from the alarm, from boot, and from an app
     * update.
     */
    /**
     * The widget's size IN THE ORIENTATION IT IS BEING DRAWN IN.
     *
     * `OPTION_APPWIDGET_MIN_HEIGHT` is not "the height". The options bundle
     * carries a size for each orientation, and the pairing is only what the
     * names suggest for width: MIN/MAX_WIDTH are portrait and landscape,
     * but MIN/MAX_HEIGHT are LANDSCAPE and PORTRAIT — a widget is shorter
     * lying down than standing up, so the smaller height is the landscape
     * one. Reading MIN_HEIGHT on a phone held upright answers a question
     * nobody asked: how tall this card would be if the phone were turned
     * sideways.
     *
     * That is why STREAK vanished from a one-row card with room to spare.
     * The launcher reports minH=52 / maxH=99 for the 4x1 placement on a
     * 420dpi phone; the label was measured against 52, found wanting, and
     * only came back when the card was dragged tall enough that even the
     * landscape figure cleared the bar — which is exactly the "expand it and
     * the missing part appears" symptom.
     *
     * Ask the configuration which way up we are and read the matching pair.
     * Either number is 0 when the launcher has not measured yet.
     */
    fun sizeDp(
      context: Context,
      mgr: AppWidgetManager,
      appWidgetId: Int,
    ): Pair<Int, Int> {
      val opts = try {
        mgr.getAppWidgetOptions(appWidgetId)
      } catch (_: Exception) {
        null
      } ?: return Pair(0, 0)
      val landscape =
        context.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
      val width = opts.getInt(
        if (landscape) AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
        else AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,
        0,
      )
      val height = opts.getInt(
        if (landscape) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
        else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,
        0,
      )
      // A launcher that fills only the one pair still deserves an answer.
      return Pair(
        if (width > 0) width else opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0),
        if (height > 0) height else opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0),
      )
    }

    /** Where the "which device wrote these" marker lives. */
    private const val INSTALL_KEY = "widget_install_id"

    /**
     * Throw away taps that were queued on a DIFFERENT device.
     *
     * `prayer_widget.xml` is inside the `sharedpref` include in both backup
     * rule files, so a cloud restore or a device-to-device transfer carries
     * the widget's tap queues across with everything else. The log queue
     * survives that honestly enough — its entries name the date they belong
     * to, and the same person's prayers on the same days are the same facts.
     * The tasbih queue does not: its entries are counts, so a queue that had
     * already been drained on the old phone is counted a second time on the
     * new one, and the user's dhikr total quietly gains a few hundred beads
     * they never told anyone about.
     *
     * The payload itself is left alone deliberately: a restored one that has
     * gone stale is caught by `payloadHasExpired`, and one that has not is
     * still true.
     */
    fun dropQueuesFromAnotherDevice(context: Context) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val current = try {
        android.provider.Settings.Secure.getString(
          context.contentResolver,
          android.provider.Settings.Secure.ANDROID_ID,
        )
      } catch (_: Exception) {
        null
      } ?: return
      val seen = prefs.getString(INSTALL_KEY, null)
      if (seen == current) return
      // First run on this device — including the very first run ever, where
      // there is nothing to drop and this only writes the marker.
      prefs.edit()
        .remove(WidgetTasbihQueue.PREFS_QUEUE_KEY)
        .putString(INSTALL_KEY, current)
        .apply()
      if (seen != null) {
        Log.i(TAG, "Restored from another device — dropped the queued tasbih taps")
      }
    }

    fun requestUpdate(context: Context) {
      // FIRST, and outside everything that can fail. The chain that will ask
      // again must not be contingent on this round of drawing succeeding —
      // that contingency is exactly what used to make one bad payload
      // permanent.
      try {
        dropQueuesFromAnotherDevice(context)
      } catch (t: Throwable) {
        Log.w(TAG, "Could not check the restore marker", t)
      }
      try {
        armWidgetAlarms(context)
      } catch (t: Throwable) {
        Log.w(TAG, "Could not arm the widget alarms", t)
      }

      val mgr = AppWidgetManager.getInstance(context)
      val classes = arrayOf(
        PrayerWidgetProvider::class.java,
        PrayerWidgetSmallProvider::class.java,
        PrayerWidgetLargeProvider::class.java
      )
      // Each widget is drawn behind its own guard. They share a payload, and
      // a field one of them cannot cope with must cost that one card rather
      // than take the other five down with it — the failure iOS still has,
      // where a single Codable means one bad field blanks the lot.
      for (cls in classes) {
        draw(context) {
          val ids = mgr.getAppWidgetIds(ComponentName(context, cls))
          if (ids.isNotEmpty()) refreshAll(context, mgr, ids)
        }
      }
      // These draw from the same payload with their own layouts, their own
      // size rules and, for two of them, their own tap queue — so none can
      // go through refreshAll. Each is a no-op when none is placed.
      draw(context) { PrayerWidgetLogProvider.requestUpdate(context) }
      draw(context) { PrayerWidgetStreakProvider.requestUpdate(context) }
      draw(context) { PrayerWidgetReadingProvider.requestUpdate(context) }
      draw(context) { PrayerWidgetHijriProvider.requestUpdate(context) }
      draw(context) { PrayerWidgetTasbihProvider.requestUpdate(context) }
    }

    /** One widget's redraw, contained. */
    private inline fun draw(context: Context, block: () -> Unit) {
      try {
        block()
      } catch (t: Throwable) {
        Log.w(TAG, "A widget failed to redraw", t)
      }
    }

    /**
     * Arm the next-boundary and midnight alarms, from the payload alone.
     *
     * This used to sit at the bottom of `applyJson`, which made the whole
     * chain contingent on a prayer-times widget being placed AND on its
     * render succeeding. Neither is safe to assume. Someone whose home
     * screen holds only a Streak widget never armed a single alarm, so
     * nothing on their phone ever moved the widget onto a new day. And
     * because `buildViews` catches a throwing `applyJson` and falls back to
     * the error card, one bad payload killed the chain permanently — the
     * card could not refresh, and nothing was scheduled to ask it to.
     *
     * Arming from the payload instead means it runs whatever is placed and
     * whatever went wrong, and re-arms on every signal that reaches us.
     */
    fun armWidgetAlarms(context: Context) {
      scheduleMidnightRollover(context)

      val json = context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(PREFS_KEY, null) ?: return
      val next = try {
        nextBoundaryMillis(JSONObject(json))
      } catch (_: Exception) {
        null
      } ?: return

      val intent = Intent(context, PrayerWidgetProvider::class.java).apply {
        action = ACTION_PRAYER_TIME_ELAPSED
      }
      val pi = PendingIntent.getBroadcast(
        context, 1001, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val am = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
        am.setExact(android.app.AlarmManager.RTC, next, pi)
      } else {
        am.set(android.app.AlarmManager.RTC, next, pi)
      }
    }

    /**
     * When the card next says something different: the first prayer or
     * sunrise still ahead of us today, as epoch millis, or null when the day
     * has none left.
     *
     * Night rows are skipped for the same reason they are never the
     * headline — the widget is called Next Prayer, and Islamic Midnight is
     * not one.
     */
    private fun nextBoundaryMillis(o: JSONObject): Long? {
      val day = selectTodayDay(o)
      val rows = day?.optJSONArray("rows") ?: o.optJSONArray("rows") ?: return null
      val candidates = mutableListOf<org.json.JSONObject>()
      for (i in 0 until rows.length()) rows.optJSONObject(i)?.let { candidates.add(it) }
      (day?.optJSONObject("sunriseRow") ?: o.optJSONObject("sunriseRow"))
        ?.let { candidates.add(it) }

      val cal = java.util.Calendar.getInstance()
      val nowMinutes =
        cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE)
      var best: Int? = null
      for (row in candidates) {
        if (isNightKey(row.optString("key"))) continue
        val parts = row.optString("time").split(":")
        if (parts.size != 2) continue
        val h = parts[0].toIntOrNull() ?: continue
        val m = parts[1].toIntOrNull() ?: continue
        val mins = h * 60 + m
        if (mins > nowMinutes && (best == null || mins < best!!)) best = mins
      }
      val minutes = best ?: return null
      return (cal.clone() as java.util.Calendar).apply {
        set(java.util.Calendar.HOUR_OF_DAY, minutes / 60)
        set(java.util.Calendar.MINUTE, minutes % 60)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
      }.timeInMillis
    }

    /**
     * Below this the vertical six-row layout is squashed past legibility and
     * the horizontal strip is the honest rendering. Three launcher rows is
     * roughly 110dp; 100 leaves a little slack for launchers that report
     * their cells slightly short.
     */
    // 165dp, not 100. Every number in this block used to be compared against
    // the LANDSCAPE height, so they read like the card was half the size it
    // is: on a 420dpi phone the launcher reports 52dp for a one-row card that
    // is 99dp tall, and 116dp for a two-row card that is 210dp tall. The
    // constants were tuned by eye against those halved figures, so they
    // happened to land on the right row on the device they were tuned on and
    // on no promise at all anywhere else. Re-expressed as the real height,
    // measured at the same boundaries: one row 99, two 210, three 321,
    // four 432. Each threshold now sits mid-band.
    private const val ROWS_MIN_HEIGHT_DP = 165

    /**
     * Below this the strip does not fit and only the compact next-prayer
     * line does.
     *
     * The strip is three stacked sections — location, six two-line columns,
     * and the next-prayer footer. Squeezed into a single launcher row it
     * clipped the times off the columns entirely and left a row of labels
     * above a half-cut highlight pill, which is worse than not showing the
     * day at all. Measured on a 1080x2400 emulator: it needs about 90dp.
     *
     * 92, not the 145 it was. 145 sat mid-way between one launcher row and
     * two, which put a one-row card below the bar — so the widget that
     * opened at 4x1 drew the compact line and the six times only appeared
     * when it was dragged taller. The measurement above says the columns
     * and the next-prayer line fit in a row; what does not fit is the
     * header, and that is now its own threshold rather than a reason to
     * abandon the whole strip.
     */
    private const val STRIP_MIN_HEIGHT_DP = 92

    /**
     * Below this the strip drops its header — the city, the Hijri date and
     * the refresh glyph.
     *
     * A one-row card is 99dp of real height on a 420dpi phone, and about
     * 75 of that survives the padding. The columns need 42 and the
     * next-prayer line 28: the header's 16 is exactly what does not fit,
     * and it is also the least of the three. Nobody places a prayer-times
     * widget to be told which city they are in.
     *
     * Two rows is 210dp, so this threshold sits mid-band and the header
     * comes back the moment the card is dragged taller.
     */
    private const val STRIP_HEADER_MIN_HEIGHT_DP = 145

    /**
     * What the strip spends before the practice grid gets a say, in dp:
     * padding, the header line, the next-prayer footer, the divider and the
     * streak line above the graph. The times row and the grid share what is
     * left, weighted 1:2, which is where the two thirds below comes from.
     */
    private const val STRIP_CHROME_DP = 150

    /**
     * Three launcher cells of width. Below this the six-column strip gives
     * each column under 40dp, which is where the times start eliding, so a
     * tall-and-narrow widget stacks them into the list instead.
     */
    private const val STRIP_MIN_WIDTH_DP = 200

    /**
     * Which layout to draw.
     *
     * This used to be decided purely by WHICH PROVIDER CLASS the instance
     * belonged to, which meant a widget was frozen to whatever the user
     * happened to pick out of the picker. Drag the "large" one down to a
     * single row and it still tried to draw six vertical rows into it, and
     * the result was six unreadable slivers.
     *
     * So size gets a veto. The provider class still expresses the user's
     * INTENT — it is why they picked that entry — and is honoured whenever
     * the widget is big enough to honour it. It is only overridden downward,
     * when the space genuinely cannot hold what the class asks for. Nothing
     * gets promoted: a small widget stretched wide stays the compact line
     * rather than surprising someone with a layout they never chose.
     *
     * The useful side effect is that the three providers are now
     * interchangeable at render time, which is what any future collapse of
     * them into one picker entry needs.
     */
    private fun selectLayout(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
      providerName: String?,
    ): Int {
      val preferred = when (providerName) {
        PrayerWidgetSmallProvider::class.java.name -> R.layout.prayer_widget_small
        // The strip is the wide design at EVERY height now, per plan §2b:
        // 4x2 is header + strip + footer, 4x4 is the same with the practice
        // block underneath. It used to switch to the vertical two-column list
        // once it got tall, which is a different design from the one the plan
        // draws and left a void where the header belongs.
        //
        // The list survives for the narrow case only — under three cells wide
        // there is no room for six columns, and that is the one place the
        // plan's own layout rule asks for a list.
        else -> R.layout.prayer_widget_strip
      }
      if (preferred == R.layout.prayer_widget_small) return preferred

      // getAppWidgetOptions never returns null in practice, but a launcher
      // that has not measured the widget yet reports 0 — which must read as
      // "no opinion", not as "zero high", or every widget would collapse to
      // the compact line on first draw.
      val opts = try {
        appWidgetManager.getAppWidgetOptions(appWidgetId)
      } catch (_: Exception) {
        null
      }
      val landscape =
        context.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
      // MIN_HEIGHT is the LANDSCAPE height — see sizeDp. Every threshold
      // below is a real card height in dp now, which is a number that means
      // the same thing on a launcher whose cells are a different shape.
      val height = opts?.getInt(
        if (landscape) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
        else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,
        0,
      ) ?: 0
      val width = opts?.getInt(
        if (landscape) AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
        else AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,
        0,
      ) ?: 0
      if (height <= 0) return preferred

      return when {
        height < STRIP_MIN_HEIGHT_DP -> R.layout.prayer_widget_small
        // Narrow and tall: six columns will not fit across, so stack them.
        width in 1 until STRIP_MIN_WIDTH_DP && height >= ROWS_MIN_HEIGHT_DP ->
          R.layout.prayer_widget
        else -> preferred
      }
    }

    private fun buildViews(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
      json: String?,
      style: WidgetStyle,
    ): RemoteViews {
      val providerName = appWidgetManager.getAppWidgetInfo(appWidgetId)?.provider?.className
      val layoutId = selectLayout(context, appWidgetManager, appWidgetId, providerName)

      val views = RemoteViews(context.packageName, layoutId)

      val click = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      val pi =
        PendingIntent.getActivity(
          context, 0, click,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      views.setOnClickPendingIntent(R.id.widget_root, pi)

      val refreshIntent = Intent(context, PrayerWidgetProvider::class.java).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
      }
      val refreshPi = PendingIntent.getBroadcast(
        context, appWidgetId, refreshIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.widget_refresh_btn, refreshPi)

      if (json.isNullOrBlank()) {
        showMessageOnly(views, context.getString(R.string.widget_placeholder_day), isError = false, style)
      } else {
        try {
          val root = JSONObject(json)
          if (payloadHasExpired(root)) {
            // ASK, DON'T GUESS.
            //
            // Every other widget this app draws — on both platforms — refuses
            // to render a payload whose schedule no longer reaches today. This
            // one did not, and the failure was the worst kind available: past
            // the window `selectTodayDay` returns null, the code fell back to
            // the top-level single-day `rows`, and the card rendered whatever
            // day the app was last opened on AS TODAY, complete with a
            // live-ticking countdown computed against the current clock. Times
            // stated with that much confidence are worse than no times, and a
            // widget standing beside a Streak widget that correctly says "Open
            // Mihrab" while itself claiming a Fajr from three weeks ago is not
            // a widget anyone should trust with a prayer.
            showMessageOnly(
              views,
              context.getString(R.string.widget_placeholder_day),
              isError = false,
              style,
            )
          } else {
            applyJson(
              views,
              root,
              style,
              context,
              layoutId,
              measuredHeightDp(context, appWidgetManager, appWidgetId),
              measuredWidthDp(context, appWidgetManager, appWidgetId),
            )
          }
        } catch (_: Exception) {
          showMessageOnly(views, context.getString(R.string.widget_error), isError = true, style)
        }
      }
      return views
    }

    private fun showMessageOnly(
      views: RemoteViews,
      message: String,
      isError: Boolean,
      style: WidgetStyle,
    ) {
      views.setViewVisibility(R.id.widget_content, View.GONE)
      views.setViewVisibility(R.id.widget_placeholder, View.VISIBLE)
      views.setTextViewText(R.id.widget_placeholder, message)
      views.setInt(R.id.widget_root, "setBackgroundColor", style.backgroundArgb())
      views.setTextColor(
        R.id.widget_placeholder,
        Color.parseColor(if (isError) "#F87171" else NEUTRAL_MUTED),
      )
    }

    /** Today's local date as yyyy-MM-dd, matching the JS `dateKey` format. */
    private fun todayDateKey(): String {
      val cal = java.util.Calendar.getInstance()
      return String.format(
        java.util.Locale.US,
        "%04d-%02d-%02d",
        cal.get(java.util.Calendar.YEAR),
        cal.get(java.util.Calendar.MONTH) + 1,
        cal.get(java.util.Calendar.DAY_OF_MONTH),
      )
    }

    /**
     * Has this payload's schedule run out?
     *
     * The payload is only ever written from the foreground — there is no
     * background refresh on any platform — so it describes a window that
     * ends. This was reported on the Mac build, where an app installed from
     * Homebrew can sit unopened for weeks; a phone gets opened, so it is
     * rarer here, but "rarer" is not "never" and the consequences differ per
     * widget. Log Today is the one that matters: a stale payload still
     * carries a `today` block dated whenever the app was last opened, so it
     * would offer that day's prayers as today's AND queue a write against
     * that date. Putting a status on a day the user never touched is not a
     * cosmetic bug.
     *
     * True when there is no `days[]` at all: a payload from a build older
     * than the multi-day window cannot be checked and is by now certainly
     * older than this problem.
     */
    fun payloadHasExpired(o: JSONObject): Boolean {
      val days = o.optJSONArray("days") ?: return true
      if (days.length() == 0) return true
      val todayKey = todayDateKey()
      for (i in 0 until days.length()) {
        val key = days.optJSONObject(i)?.optString("dateKey") ?: continue
        // Lexicographic works on yyyy-MM-dd and avoids parsing 30 dates.
        if (key >= todayKey) return false
      }
      return true
    }

    /**
     * Does this payload's SINGLE-DAY content still describe today?
     *
     * `days[]` rolls; `today`, `hijri` and `dayLabel` do not — they are
     * stamped once, when the app last wrote the payload. `payloadHasExpired`
     * does not catch this, because it only asks whether the schedule still
     * reaches today, and a payload written three weeks ago with a thirty-day
     * window passes that test easily while every one of its single-day blocks
     * is three weeks old.
     *
     * Prefer the `today` block's own `dateKey`, which is exactly the day it
     * claims to be about. Fall back to the first `days[]` entry for payloads
     * that carry no `today` block at all.
     */
    private fun payloadDescribesToday(o: JSONObject): Boolean {
      val todayKey = todayDateKey()
      val stamped = o.optJSONObject("today")?.optString("dateKey")?.takeIf { it.isNotEmpty() }
      if (stamped != null) return stamped == todayKey
      val first = o.optJSONArray("days")?.optJSONObject(0)?.optString("dateKey")
      return first == todayKey
    }

    /** The entry in `days[]` that applies to the current local date, or null
     *  when there is no `days[]` / no match. */
    private fun selectTodayDay(o: JSONObject): JSONObject? {
      val days = o.optJSONArray("days") ?: return null
      if (days.length() == 0) return null
      val todayKey = todayDateKey()
      for (i in 0 until days.length()) {
        val day = days.optJSONObject(i) ?: continue
        if (day.optString("dateKey") == todayKey) return day
      }
      return null
    }

    /** Schedule a refresh just after the next local midnight so the widget
     *  rolls onto the next day's times by itself — even after Isha, when no
     *  further prayer remains today and the per-prayer alarm is not set.
     *  Inexact (and independent of the exact-alarm permission); ACTION_SCREEN_ON
     *  / ACTION_USER_PRESENT also refresh the widget when the user wakes the
     *  device, so this is a backstop rather than the sole rollover path. */
    private fun scheduleMidnightRollover(context: Context) {
      val midnight = java.util.Calendar.getInstance().apply {
        add(java.util.Calendar.DAY_OF_MONTH, 1)
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 30)
        set(java.util.Calendar.MILLISECOND, 0)
      }
      val intent = Intent(context, PrayerWidgetProvider::class.java).apply {
        action = ACTION_PRAYER_TIME_ELAPSED
      }
      val pi = PendingIntent.getBroadcast(
        context, 1002, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val am = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
      am.set(android.app.AlarmManager.RTC, midnight.timeInMillis, pi)
    }

    /**
     * Islamic Midnight and the Last Third as a pair on one line, plan §2b's
     * "Midnight 00:34 … Last third 02:22".
     *
     * On the strip they cannot be columns: eight across four launcher cells
     * is about 5pt type, which is the same argument the plan uses against a
     * monthly widget. On the list they ARE rows, drawn by the column binder
     * at slots 6 and 7, so this does nothing there.
     */
    private fun bindNightRow(
      views: RemoteViews,
      displayRows: List<org.json.JSONObject>,
      layoutId: Int,
    ) {
      if (layoutId != R.layout.prayer_widget_strip) return
      val night = displayRows.filter { isNightKey(it.optString("key")) }
      if (night.isEmpty()) {
        views.setViewVisibility(R.id.widget_night_row, View.GONE)
        return
      }
      views.setViewVisibility(R.id.widget_night_row, View.VISIBLE)
      fun label(o: org.json.JSONObject): String {
        val name = o.optString("name", "").trim().ifEmpty { o.optString("key") }
        return "$name ${o.optString("time")}"
      }
      views.setTextViewText(R.id.widget_night_left, label(night[0]))
      views.setTextViewText(
        R.id.widget_night_right,
        if (night.size > 1) label(night[1]) else "",
      )
      views.setViewVisibility(
        R.id.widget_night_right,
        if (night.size > 1) View.VISIBLE else View.GONE,
      )
    }

    /**
     * "2 of 5 logged today", plan §2's layout rule: at three cells of height
     * the list gains the night times AND a logged line.
     *
     * Hidden when the app has sent no `today` block, because five unlogged
     * prayers is a claim and an absent block is not evidence for it.
     */
    private fun bindLoggedLine(
      views: RemoteViews,
      payload: org.json.JSONObject,
      context: Context,
      layoutId: Int,
      describesToday: Boolean,
    ) {
      if (layoutId == R.layout.prayer_widget_small) return
      val today = if (describesToday) payload.optJSONObject("today") else null
      if (today == null) {
        views.setViewVisibility(R.id.widget_logged, View.GONE)
        return
      }
      views.setViewVisibility(R.id.widget_logged, View.VISIBLE)
      // The strip's line sits opposite the countdown on one row, where the
      // plan reads "2 of 5 logged"; the list has it under the location with
      // room to say which day it means.
      val res = if (layoutId == R.layout.prayer_widget_strip) {
        R.string.widget_logged_short
      } else {
        R.string.widget_logged_line
      }
      views.setTextViewText(
        R.id.widget_logged,
        context.getString(res, today.optInt("logged", 0), today.optInt("loggable", 5)),
      )
    }

    /**
     * The practice merge, plan §2b: at four cells tall there is room for the
     * whole day AND the record of it, which is the pair people check
     * together — what is next, and whether this week has held.
     *
     * Only on the list layout, only when the launcher says there is room, and
     * only when the app has actually sent a practice block. An absent block
     * is NOT a zero streak: on a home screen those look identical and mean
     * opposite things, so absent draws nothing at all.
     *
     * `widget_practice_row` exists only in prayer_widget.xml. RemoteViews
     * actions against an id the current layout does not contain are quiet
     * no-ops, so the layout check below is for readers rather than for
     * safety — but a reader who does not know that would be right to worry.
     */
    /**
     * The header, on a card with room for it. See STRIP_HEADER_MIN_HEIGHT_DP.
     *
     * Only the strip has this row; the list layout puts the same facts
     * somewhere else and is never drawn short enough for the question to
     * arise. A height of 0 is a launcher that has not measured yet, which
     * must not be read as "short" — the header would flicker away on every
     * first draw.
     */
    private fun bindStripHeader(views: RemoteViews, layoutId: Int, heightDp: Int) {
      if (layoutId != R.layout.prayer_widget_strip) return
      val show = !(heightDp in 1 until STRIP_HEADER_MIN_HEIGHT_DP)
      views.setViewVisibility(
        R.id.widget_header_row,
        if (show) View.VISIBLE else View.GONE,
      )
    }

    private fun bindPracticeStrip(
      views: RemoteViews,
      payload: org.json.JSONObject,
      style: WidgetStyle,
      context: Context,
      layoutId: Int,
      heightDp: Int,
      widthDp: Int,
    ) {
      if (layoutId == R.layout.prayer_widget_small) return
      val practice = payload.optJSONObject("practice")
      // Two tiers rather than one. The graph earns its place from three
      // launcher rows up; the month footer needs a fourth. Gating both on the
      // taller number is what left a third of a 4x3 empty.
      val show = practice != null && !(heightDp in 1 until GRID_MIN_HEIGHT_DP)
      val showFoot = show && !(heightDp in 1 until PRACTICE_MIN_HEIGHT_DP)
      val vis = if (show) View.VISIBLE else View.GONE
      // The divider goes with the block it separates. Leaving it behind is
      // how a widget ends up with a rule drawn across an empty gap.
      views.setViewVisibility(R.id.widget_practice_divider, vis)
      views.setViewVisibility(R.id.widget_practice_row, vis)
      views.setViewVisibility(R.id.widget_practice_grid, vis)
      views.setViewVisibility(
        R.id.widget_practice_foot,
        if (showFoot) View.VISIBLE else View.GONE,
      )
      if (!show || practice == null) return

      val accent = style.highlightColorInt(context)
      val streak = practice.optInt("streak", 0)
      // The plan draws "12  day streak · best 31": the number carries the
      // size and nothing else, and the words beside it stay muted. Putting
      // the unit in the big view too ("0 days") makes the eye read a phrase
      // where it should be reading one figure.
      views.setTextViewText(R.id.widget_practice_streak, streak.toString())
      views.setTextColor(
        R.id.widget_practice_streak,
        if (layoutId == R.layout.prayer_widget_strip) Color.parseColor(NEUTRAL_TEXT) else accent,
      )

      // The strip runs the unit inline with the rest ("12  day streak · Best
      // 31 · …"); the tall layout has a line of its own for it, next to the
      // number, the way the systemLarge mock sets it.
      val unit = context.resources.getQuantityString(
        R.plurals.widget_streak_day_label, streak, streak,
      )
      views.setTextViewText(R.id.widget_practice_unit, unit)

      val parts = mutableListOf<String>()
      if (layoutId == R.layout.prayer_widget_strip) parts.add(unit)
      val best = practice.optInt("bestStreak", 0)
      if (best > 0) parts.add(context.getString(R.string.widget_streak_best, best))
      parts.add(context.getString(R.string.widget_streak_logged, practice.optInt("loggedToday", 0)))
      val owed = practice.optInt("owed", 0)
      if (owed > 0) {
        parts.add(
          context.resources.getQuantityString(R.plurals.widget_streak_make_up, owed, owed),
        )
      }
      views.setTextViewText(R.id.widget_practice_second, parts.joinToString(" · "))

      // The plan's 4x4 draws fourteen weeks across the full width, not ten
      // squeezed beside the streak number.
      // The strip gives the grid the full width, so it gets fourteen weeks;
      // the tall layout sets it beside the streak number, where fourteen
      // columns would be slivers.
      val density = context.resources.displayMetrics.density
      val wide = layoutId == R.layout.prayer_widget_strip
      views.setImageViewBitmap(
        R.id.widget_practice_grid,
        PracticeGridBitmap.render(
          practice.optJSONArray("days"),
          // Twenty across the full width, eleven beside the streak number.
          // Fourteen used to be the widest the payload carried; it now
          // carries twenty, and fourteen left the right third of a 4x4
          // empty — seven rows of fourteen is a 2:1 shape in a box nearer
          // 3:1, and columns are the only axis that can give.
          // As many weeks as fill the box at full-size squares. The wide
          // layout gives the grid the card's width and roughly two thirds
          // of what is left below the strip; the tall one sets it beside
          // the streak number, in half the width.
          PracticeGridBitmap.weeksForBox(
            (if (wide) widthDp - 20 else (widthDp - 20) / 2),
            ((heightDp - STRIP_CHROME_DP) * 2) / 3,
            if (wide) 26 else 14,
          ),
          ((if (wide) 7 else 6) * density).toInt().coerceAtLeast(3),
          (2f * density).toInt().coerceAtLeast(1),
          accent,
          practice.optString("since").ifEmpty { null },
        ),
      )

      // "Sunnah 68% this month" opposite "6 fasts" — the two facts the plan
      // puts at the foot of the 4x4, and the only place either appears on a
      // home screen. Each is dropped rather than zeroed when the payload has
      // nothing to say: "Sunnah 0%" reads as a judgement, and an absent
      // figure reads as nothing at all, which is what it is.
      val sunnah = practice.optDouble("sunnahRate", Double.NaN)
      val sunnahText = if (sunnah.isNaN()) "" else context.getString(
        R.string.widget_practice_sunnah_month,
        Math.round(sunnah * 100).toInt(),
      )
      views.setTextViewText(R.id.widget_practice_sunnah, sunnahText)
      views.setViewVisibility(
        R.id.widget_practice_sunnah,
        if (sunnahText.isEmpty()) View.INVISIBLE else View.VISIBLE,
      )

      val fasts = practice.optInt("fastsThisMonth", 0)
      val fastsText = if (fasts <= 0) "" else context.resources.getQuantityString(
        R.plurals.widget_practice_fasts, fasts, fasts,
      )
      views.setTextViewText(R.id.widget_practice_fasts, fastsText)
      views.setViewVisibility(
        R.id.widget_practice_fasts,
        if (fastsText.isEmpty()) View.GONE else View.VISIBLE,
      )
    }

    /** Islamic Midnight / the Last Third: on the card, never the headline. */
    private fun isNightKey(key: String): Boolean =
      key.equals("Midnight", ignoreCase = true) || key.equals("Lastthird", ignoreCase = true)

    /**
     * Minutes-since-midnight of the earliest salāh (or Sunrise) on display,
     * for the after-Isha wrap. Sunrise counts — whatever comes first
     * tomorrow is what the countdown is for.
     */
    private fun firstRowMinutes(displayRows: List<org.json.JSONObject>): Int? {
      var earliest: Int? = null
      for (row in displayRows) {
        // Excluded here too, or the countdown aims at the Last Third while
        // the headline beside it says Fajr — the widget contradicting itself
        // on the same frame. Seen on an emulator at 23:56 before this line.
        if (isNightKey(row.optString("key"))) continue
        val parts = row.optString("time").split(":")
        if (parts.size != 2) continue
        val h = parts[0].toIntOrNull() ?: continue
        val m = parts[1].toIntOrNull() ?: continue
        val mins = h * 60 + m
        if (earliest == null || mins < earliest!!) earliest = mins
      }
      return earliest
    }

    /** The launcher's own measurement, or 0 when it has not measured yet. */
    private fun measuredHeightDp(
      context: Context,
      mgr: AppWidgetManager,
      appWidgetId: Int,
    ): Int = sizeDp(context, mgr, appWidgetId).second

    /** The same, across. The grid needs both to know how many weeks fit. */
    private fun measuredWidthDp(
      context: Context,
      mgr: AppWidgetManager,
      appWidgetId: Int,
    ): Int = sizeDp(context, mgr, appWidgetId).first

    /**
     * Four launcher rows. Below this the practice strip would eat the space
     * the prayer times need, and the times are why the widget is there.
     */
    private const val PRACTICE_MIN_HEIGHT_DP = 375

    /**
     * Where the streak line and the practice graph start appearing.
     *
     * Lower than PRACTICE_MIN_HEIGHT_DP, which now gates only the month
     * footer, because there was a whole band between them — a 4x3 — that
     * showed the strip, the two footer lines, and then nothing at all for the
     * bottom third of the card. Three launcher rows is enough to draw a
     * graph; it is not enough to draw a graph AND two more lines under it.
     */
    private const val GRID_MIN_HEIGHT_DP = 265

    /**
     * Bind the payload into whichever layout was chosen.
     *
     * Layout-agnostic by design: every layout it can be handed declares the
     * same ids, so this never needs to know which one it is filling — with
     * one exception now, the practice strip, which exists only in the list
     * layout and is passed `layoutId` rather than guessing.
     */
    private fun applyJson(
      views: RemoteViews,
      o: JSONObject,
      style: WidgetStyle,
      context: Context,
      layoutId: Int = R.layout.prayer_widget,
      heightDp: Int = 0,
      widthDp: Int = 0,
    ) {
      views.setViewVisibility(R.id.widget_placeholder, View.GONE)
      views.setViewVisibility(R.id.widget_content, View.VISIBLE)

      views.setInt(R.id.widget_root, "setBackgroundColor", style.backgroundArgb())

      val nextKey =
        if (o.isNull("nextKey")) {
          null
        } else {
          o.optString("nextKey", "").trim().takeIf { it.isNotEmpty() }
        }

      var nextPrayerName = o.optString("nextPrayerName", "")
      var nextPrayerTime = o.optString("nextPrayerTime", "")
      val locationName = o.optString("locationName", "")

      // Prefer the entry from the multi-day `days[]` schedule whose dateKey
      // matches the device's current local date. This is what lets the widget
      // roll onto the correct day's times on its own — previously `rows` was a
      // single-day snapshot that only refreshed when the app was reopened, so
      // the times went stale ~24h later. Falls back to the top-level single-day
      // fields when no `days[]` is present (older payloads) or none matches.
      val todayDay = selectTodayDay(o)
      val rows = todayDay?.optJSONArray("rows") ?: o.getJSONArray("rows")
      // sunriseRow is a separate object (not in `rows`) rendered at display slot 1.
      val sunriseRowObj = todayDay?.optJSONObject("sunriseRow") ?: o.optJSONObject("sunriseRow")

      // Build the ordered display list: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha
      val displayRows = mutableListOf<org.json.JSONObject>()
      if (rows.length() > 0) displayRows.add(rows.getJSONObject(0)) // Fajr at slot 0
      sunriseRowObj?.let { displayRows.add(it) }                     // Sunrise at slot 1
      for (i in 1 until rows.length()) displayRows.add(rows.getJSONObject(i)) // rest of salāh
      // ...then the night rows, after Isha. Absent entirely unless the user
      // turned them on — the payload only carries them when they are enabled,
      // so there is nothing to gate on here.
      val nightRows = todayDay?.optJSONArray("extraRows") ?: o.optJSONArray("extraRows")
      if (nightRows != null) {
        for (i in 0 until nightRows.length()) {
          nightRows.optJSONObject(i)?.let { displayRows.add(it) }
        }
      }

      // Dynamically calculate next event (prayer or sunrise) based on current time
      val cal = java.util.Calendar.getInstance()
      val currentMinutes = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE)

      var dynamicNextKey: String? = null
      var dynamicNextName = ""
      var dynamicNextTime = ""
      var nextUpdateMinutes = -1

      for (row in displayRows) {
        // Islamic Midnight and the Last Third are rows, never the headline —
        // the same rule `nightCanBeNext: false` applies on the JS side, and
        // this is where it has to be applied again, because `displayRows`
        // now contains them. Without this the left column reads "Islamic
        // Midnight" between Isha and midnight on any phone with the toggle
        // on, and the widget's own name is "next prayer".
        if (isNightKey(row.optString("key"))) continue
        val timeStr = row.getString("time")
        val parts = timeStr.split(":")
        if (parts.size == 2) {
          val h = parts[0].toIntOrNull() ?: continue
          val m = parts[1].toIntOrNull() ?: continue
          val rowMinutes = h * 60 + m
          if (rowMinutes > currentMinutes) {
            dynamicNextKey = row.getString("key")
            dynamicNextName = row.optString("name", "").trim()
              .ifEmpty { row.optString("abbr", "").trim() }
              .ifEmpty { dynamicNextKey!! }
            dynamicNextTime = timeStr
            nextUpdateMinutes = rowMinutes
            break
          }
        }
      }

      if (dynamicNextKey != null) {
        nextPrayerName = dynamicNextName
        nextPrayerTime = dynamicNextTime
      } else if (nextPrayerName.isEmpty() && nextKey != null) {
        for (row in displayRows) {
          if (row.getString("key") == nextKey) {
            nextPrayerName = row.optString("name", "").trim()
              .ifEmpty { row.optString("abbr", "").trim() }
              .ifEmpty { nextKey }
            nextPrayerTime = row.getString("time")
            break
          }
        }
      }
      val effectiveNextKey = dynamicNextKey ?: nextKey

      val normalColor = Color.parseColor(NEUTRAL_TEXT)
      val highlightColor = style.highlightColorInt(context)

      views.setTextViewText(R.id.widget_next_name, nextPrayerName)
      views.setViewVisibility(R.id.widget_next_name, if (nextPrayerName.isEmpty()) View.GONE else View.VISIBLE)

      views.setTextViewText(R.id.widget_next_time, nextPrayerTime)
      views.setViewVisibility(R.id.widget_next_time, if (nextPrayerTime.isEmpty()) View.GONE else View.VISIBLE)

      // On the strip the location shares a header line with the day, the way
      // the plan draws it ("Wed, 19 Aug · Makkah"), and the Hijri date sits
      // opposite. The list keeps the bare location it has always had.
      val headerText = if (layoutId == R.layout.prayer_widget_strip) {
        // The DAY'S OWN label, not the payload's.
        //
        // The times below this line roll with `days[]`; the top-level
        // `dayLabel` is stamped when the payload is written and never moves.
        // Read together, from day two onward the card stated one date above a
        // different day's times — the single most misleading thing a prayer
        // widget can do. Each entry in `days[]` already carries its own label;
        // it was simply never used.
        val day = (todayDay?.optString("dayLabel")?.trim().takeUnless { it.isNullOrEmpty() }
          ?: o.optString("dayLabel", "").trim())
        when {
          day.isEmpty() -> locationName
          locationName.isEmpty() -> day
          else -> "$day · $locationName"
        }
      } else {
        locationName
      }
      views.setTextViewText(R.id.widget_location, headerText)
      views.setViewVisibility(R.id.widget_location, if (headerText.isEmpty()) View.GONE else View.VISIBLE)

      // Both the Hijri date and "2 of 5 logged" describe the day the payload
      // was WRITTEN, and neither rolls the way `days[]` does. Once the card
      // has moved onto a later day they are simply someone else's facts, so
      // they go rather than mislead — the same call iOS makes in
      // `perDayPayload(isToday:)`. The dedicated Hijri and Log Today widgets
      // have their own, correctly gated, copies of both.
      val describesToday = payloadDescribesToday(o)
      val hijriLabel = if (!describesToday) "" else
        o.optJSONObject("hijri")?.optString("label", "")?.trim().orEmpty()
      views.setTextViewText(R.id.widget_hijri, hijriLabel)
      views.setViewVisibility(R.id.widget_hijri, if (hijriLabel.isEmpty()) View.GONE else View.VISIBLE)

      views.setTextColor(R.id.widget_next_name, normalColor)
      views.setTextColor(R.id.widget_next_time, highlightColor)
      views.setTextColor(R.id.widget_location, Color.parseColor(NEUTRAL_MUTED))

      // The countdown to the next event, ticked by the system.
      //
      // This used to be a string computed right here — "1h 54m" — which the
      // comment above it defended as "fresh whenever the user looks",
      // because the widget redraws on screen-on and at each prayer
      // transition. That is true and it was never badly wrong; it was also
      // frozen for anyone who looked at it for longer than a moment, and the
      // plan asks for a countdown "ticked by the system, not by us".
      //
      // A Chronometer is that, at zero refresh cost: hand it the moment the
      // next event lands and the view counts itself down. Chronometer is a
      // TextView, so the colour and visibility actions below are unchanged.
      //
      // `setChronometerCountDown` is API 24 and minSdk is 24.
      // Wraps past midnight. After Isha there is no row left today, and the
      // widget used to show no countdown at all until the small hours — six
      // silent hours, which is precisely the stretch where a home screen most
      // needs to say "Fajr, in six hours". The rows on display are already
      // tomorrow's by then (`selectTodayDay` rolls the day over), so the
      // first of them is the right target; it is just on the other side of
      // midnight. The same wrap the iOS ring does, for the same reason.
      val minutesLeft = when {
        nextUpdateMinutes != -1 && nextUpdateMinutes >= currentMinutes ->
          nextUpdateMinutes - currentMinutes
        else -> firstRowMinutes(displayRows)?.let { it + 24 * 60 - currentMinutes } ?: -1
      }
      if (minutesLeft >= 0) {
        // Base is on the elapsedRealtime clock, and the seconds of the
        // current minute have to come off it or the countdown is up to 59
        // seconds early — which is exactly long enough to show 00:00 while
        // the prayer has not arrived.
        val secondsIntoMinute = java.util.Calendar.getInstance().get(java.util.Calendar.SECOND)
        val base = android.os.SystemClock.elapsedRealtime() +
          minutesLeft * 60_000L - secondsIntoMinute * 1000L
        views.setChronometerCountDown(R.id.widget_remaining, true)
        views.setChronometer(
          R.id.widget_remaining,
          base,
          context.getString(R.string.widget_countdown_format),
          true,
        )
        views.setViewVisibility(R.id.widget_remaining, View.VISIBLE)
      } else {
        // Only reachable with no usable rows at all. Stopped as well as
        // hidden: a running Chronometer inside a hidden view is still a view
        // being invalidated once a second.
        views.setChronometer(R.id.widget_remaining, 0L, null, false)
        views.setViewVisibility(R.id.widget_remaining, View.GONE)
      }
      views.setTextColor(R.id.widget_remaining, Color.parseColor(NEUTRAL_MUTED))

      views.setViewVisibility(R.id.widget_times_row, View.VISIBLE)

      for (i in COL_LABELS.indices) {
        if (i >= displayRows.size) {
          views.setViewVisibility(COL_WRAPPERS[i], View.GONE)
          continue
        }
        val row = displayRows[i]
        val key = row.getString("key")
        val time = row.getString("time")
        val label = row.optString("name", "").trim()
          .ifEmpty { row.optString("abbr", "").trim() }
          .ifEmpty { key }
        val isNight = isNightKey(key)
        // A night row is never the headline. The payload will not name one as
        // `nextKey` for the widget (see nightCanBeNext on the JS side), and
        // this is the second guard: a widget called "next prayer" should not
        // count down to Islamic Midnight even if a stale payload says so.
        val highlight = !isNight && effectiveNextKey != null && effectiveNextKey == key
        val isSunrise = key.equals("Sunrise", ignoreCase = true)
        val col = when {
          highlight -> highlightColor
          // Secondary is what Sunrise has always been — on the card without
          // competing with the salāh — and it is what the night rows are too.
          isSunrise || isNight -> Color.parseColor(NEUTRAL_MUTED)
          else -> normalColor
        }

        views.setViewVisibility(COL_WRAPPERS[i], View.VISIBLE)
        views.setTextViewText(COL_LABELS[i], label)
        views.setTextViewText(COL_TIMES[i], time)
        views.setTextColor(COL_LABELS[i], col)
        views.setTextColor(COL_TIMES[i], col)

        if (highlight) {
          views.setInt(COL_BOXES[i], "setBackgroundResource", R.drawable.widget_row_highlight)
        } else {
          views.setInt(COL_BOXES[i], "setBackgroundResource", 0)
        }
      }

      bindNightRow(views, displayRows, layoutId)
      bindLoggedLine(views, o, context, layoutId, describesToday)
      bindStripHeader(views, layoutId, heightDp)
      bindPracticeStrip(views, o, style, context, layoutId, heightDp, widthDp)

      // The alarms are NOT armed here any more — see `armWidgetAlarms`. A
      // render is the wrong place to schedule from: it only happens when a
      // prayer-times widget is placed, and only when it succeeds.
    }
  }
}
