package com.prayer_times

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.os.Build
import android.os.Bundle
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
          Color.parseColor("#6BC98A")
        }
      }
      return Color.parseColor("#6BC98A")
    }
    val hex =
      when (highlightId.lowercase()) {
        "green" -> "#6BC98A"
        "teal" -> "#4EC9B0"
        "blue" -> "#6BA3F5"
        "amber" -> "#E5C07B"
        else -> "#6BC98A"
      }
    return try {
      Color.parseColor(hex)
    } catch (_: Exception) {
      Color.parseColor("#6BC98A")
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
  val fallback = Color.parseColor("#6BC98A")
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
    when (intent.action) {
      Intent.ACTION_USER_PRESENT,
      Intent.ACTION_SCREEN_ON,
      Intent.ACTION_WALLPAPER_CHANGED,
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
      )
    private val COL_LABELS =
      intArrayOf(
        R.id.widget_col_0_label,
        R.id.widget_col_1_label,
        R.id.widget_col_2_label,
        R.id.widget_col_3_label,
        R.id.widget_col_4_label,
        R.id.widget_col_5_label,
      )
    private val COL_TIMES =
      intArrayOf(
        R.id.widget_col_0_time,
        R.id.widget_col_1_time,
        R.id.widget_col_2_time,
        R.id.widget_col_3_time,
        R.id.widget_col_4_time,
        R.id.widget_col_5_time,
      )

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

    /** Called from RN native module after writing new payload to SharedPreferences. */
    fun requestUpdate(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val classes = arrayOf(
        PrayerWidgetProvider::class.java,
        PrayerWidgetSmallProvider::class.java,
        PrayerWidgetLargeProvider::class.java
      )
      for (cls in classes) {
        val cn = ComponentName(context, cls)
        val ids = mgr.getAppWidgetIds(cn)
        if (ids.isNotEmpty()) refreshAll(context, mgr, ids)
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
      val isSmall = providerName == PrayerWidgetSmallProvider::class.java.name
      val isLarge = providerName == PrayerWidgetLargeProvider::class.java.name
      
      val layoutId = if (isSmall) {
        R.layout.prayer_widget_small
      } else if (isLarge) {
        R.layout.prayer_widget
      } else {
        R.layout.prayer_widget_horizontal
      }

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
          val isHorizontal = layoutId == R.layout.prayer_widget_horizontal
          applyJson(views, json, style, context, isHorizontal)
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

    /** Find the entry in the multi-day `days[]` schedule that applies to the
     *  current local date, or null when there is no `days[]` / no match. */
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

    private fun applyJson(views: RemoteViews, json: String, style: WidgetStyle, context: Context, isHorizontal: Boolean) {
      val o = JSONObject(json)
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

      // Dynamically calculate next event (prayer or sunrise) based on current time
      val cal = java.util.Calendar.getInstance()
      val currentMinutes = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE)

      var dynamicNextKey: String? = null
      var dynamicNextName = ""
      var dynamicNextTime = ""
      var nextUpdateMinutes = -1

      for (row in displayRows) {
        val timeStr = row.getString("time")
        val parts = timeStr.split(":")
        if (parts.size == 2) {
          val h = parts[0].toIntOrNull() ?: continue
          val m = parts[1].toIntOrNull() ?: continue
          val rowMinutes = h * 60 + m
          if (rowMinutes > currentMinutes) {
            dynamicNextKey = row.getString("key")
            dynamicNextName = row.optString("abbr", "").trim().ifEmpty { dynamicNextKey!! }
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
            nextPrayerName = row.optString("abbr", "").trim().ifEmpty { nextKey }
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

      views.setTextViewText(R.id.widget_location, locationName)
      views.setViewVisibility(R.id.widget_location, if (locationName.isEmpty()) View.GONE else View.VISIBLE)

      views.setTextColor(R.id.widget_next_name, normalColor)
      views.setTextColor(R.id.widget_next_time, highlightColor)
      views.setTextColor(R.id.widget_location, Color.parseColor(NEUTRAL_MUTED))

      views.setViewVisibility(R.id.widget_times_row, View.VISIBLE)

      for (i in COL_LABELS.indices) {
        if (i >= displayRows.size) {
          views.setViewVisibility(COL_WRAPPERS[i], View.GONE)
          continue
        }
        val row = displayRows[i]
        val key = row.getString("key")
        val time = row.getString("time")
        val label = row.optString("abbr", "").trim().ifEmpty { key }
        val highlight = effectiveNextKey != null && effectiveNextKey == key
        val isSunrise = key.equals("Sunrise", ignoreCase = true)
        val col = when {
          highlight -> highlightColor
          isSunrise -> Color.parseColor(NEUTRAL_MUTED)
          else -> normalColor
        }

        views.setViewVisibility(COL_WRAPPERS[i], View.VISIBLE)
        views.setTextViewText(COL_LABELS[i], label)
        views.setTextViewText(COL_TIMES[i], time)
        views.setTextColor(COL_LABELS[i], col)
        views.setTextColor(COL_TIMES[i], col)

        if (highlight) {
          views.setInt(COL_WRAPPERS[i], "setBackgroundResource", R.drawable.widget_row_highlight)
        } else {
          views.setInt(COL_WRAPPERS[i], "setBackgroundResource", 0)
        }
      }

      // Schedule next update using AlarmManager — targets all widget providers.
      if (nextUpdateMinutes != -1) {
        val updateTime = java.util.Calendar.getInstance().apply {
          set(java.util.Calendar.HOUR_OF_DAY, nextUpdateMinutes / 60)
          set(java.util.Calendar.MINUTE, nextUpdateMinutes % 60)
          set(java.util.Calendar.SECOND, 0)
        }
        val intent = Intent(context, PrayerWidgetProvider::class.java).apply {
          action = ACTION_PRAYER_TIME_ELAPSED
        }
        val pi = PendingIntent.getBroadcast(context, 1001, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && alarmManager.canScheduleExactAlarms()) {
          alarmManager.setExact(android.app.AlarmManager.RTC, updateTime.timeInMillis, pi)
        } else {
          alarmManager.set(android.app.AlarmManager.RTC, updateTime.timeInMillis, pi)
        }
      }

      // Always arm the next-midnight rollover so the widget advances to the
      // next day's times even when no more prayers remain today (post-Isha).
      scheduleMidnightRollover(context)
    }
  }
}
