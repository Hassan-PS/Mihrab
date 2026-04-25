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
class PrayerWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val json = prefs.getString(PREFS_KEY, null)
    val style = readWidgetStyle(prefs)

    for (id in appWidgetIds) {
      updateAppWidget(context, appWidgetManager, id, prefs, json, style)
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val json = prefs.getString(PREFS_KEY, null)
    val style = readWidgetStyle(prefs)
    updateAppWidget(context, appWidgetManager, appWidgetId, prefs, json, style)
  }

  private fun updateAppWidget(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    prefs: SharedPreferences,
    json: String?,
    style: WidgetStyle
  ) {
    val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
    val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
    
    // If minHeight < 100, we assume it's a 1-row or 2-row widget, so use horizontal layout.
    // Otherwise, use the vertical stack layout.
    val isHorizontal = minHeight > 0 && minHeight < 100
    val layoutId = if (isHorizontal) R.layout.prayer_widget_horizontal else R.layout.prayer_widget

    val views = RemoteViews(context.packageName, layoutId)
    val click = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pi =
      PendingIntent.getActivity(
        context,
        0,
        click,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    views.setOnClickPendingIntent(R.id.widget_root, pi)

    if (json.isNullOrBlank()) {
      showMessageOnly(
        views,
        context.getString(R.string.widget_placeholder_day),
        isError = false,
        style,
      )
    } else {
      try {
        applyJson(views, json, style, context, isHorizontal)
      } catch (_: Exception) {
        showMessageOnly(views, context.getString(R.string.widget_error), isError = true, style)
      }
    }
    appWidgetManager.updateAppWidget(appWidgetId, views)
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

    val rows = o.getJSONArray("rows")

    // Fallback for old cached payloads that don't have nextPrayerName/Time
    if (nextPrayerName.isEmpty() && nextKey != null) {
      for (i in 0 until rows.length()) {
        val row = rows.getJSONObject(i)
        if (row.getString("key") == nextKey) {
          nextPrayerName = row.optString("abbr", "").trim().ifEmpty { nextKey }
          nextPrayerTime = row.getString("time")
          break
        }
      }
    }

    val normalColor = Color.parseColor(NEUTRAL_TEXT)
    val highlightColor = style.highlightColorInt(context)

    views.setTextViewText(R.id.widget_next_name, nextPrayerName)
    views.setTextViewText(R.id.widget_next_time, nextPrayerTime)
    views.setTextViewText(R.id.widget_location, locationName)

    views.setTextColor(R.id.widget_next_name, normalColor)
    views.setTextColor(R.id.widget_next_time, highlightColor)
    views.setTextColor(R.id.widget_location, Color.parseColor(NEUTRAL_MUTED))

    views.setViewVisibility(R.id.widget_times_row, View.VISIBLE)

    for (i in COL_LABELS.indices) {
      if (i >= rows.length()) {
        views.setViewVisibility(COL_WRAPPERS[i], View.GONE)
        continue
      }
      val row = rows.getJSONObject(i)
      val key = row.getString("key")
      val time = row.getString("time")
      val label =
        row.optString("abbr", "").trim().ifEmpty {
          key
        }
      val highlight = nextKey != null && nextKey == key

      views.setViewVisibility(COL_WRAPPERS[i], View.VISIBLE)
      views.setTextViewText(COL_LABELS[i], label)
      views.setTextViewText(COL_TIMES[i], time)
      val col = if (highlight) highlightColor else normalColor
      views.setTextColor(COL_LABELS[i], col)
      views.setTextColor(COL_TIMES[i], col)

      if (!isHorizontal) {
        if (highlight) {
          views.setInt(COL_WRAPPERS[i], "setBackgroundResource", R.drawable.widget_row_highlight)
        } else {
          views.setInt(COL_WRAPPERS[i], "setBackgroundResource", 0)
        }
      }
    }
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

    fun requestUpdate(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val cn = ComponentName(context, PrayerWidgetProvider::class.java)
      val ids = mgr.getAppWidgetIds(cn)
      if (ids.isEmpty()) {
        return
      }
      val intent =
        Intent(context, PrayerWidgetProvider::class.java).apply {
          action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
      context.sendBroadcast(intent)
    }
  }
}
