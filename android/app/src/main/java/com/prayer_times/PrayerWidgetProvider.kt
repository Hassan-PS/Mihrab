package com.prayer_times

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import androidx.appcompat.R as AppCompatR
import androidx.core.graphics.ColorUtils
import com.google.android.material.R as MR
import com.google.android.material.color.MaterialColors
import org.json.JSONObject

class PrayerWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val json = prefs.getString(PREFS_KEY, null)
    val useDynamic = prefs.getString(PREFS_UI_STYLE_KEY, "fixed") == "dynamic"
    val oled = prefs.getBoolean(PREFS_UI_OLED, false)

    for (id in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.prayer_widget)
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
          context,
          useDynamic,
          oled,
          context.getString(R.string.widget_placeholder_day),
          isError = false,
        )
      } else {
        try {
          applyJson(views, context, json, useDynamic, oled)
        } catch (_: Exception) {
          showMessageOnly(
            views,
            context,
            useDynamic,
            oled,
            context.getString(R.string.widget_error),
            isError = true,
          )
        }
      }
      appWidgetManager.updateAppWidget(id, views)
    }
  }

  private fun isSystemDark(context: Context): Boolean {
    val mask = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    return mask == Configuration.UI_MODE_NIGHT_YES
  }

  private fun applyDynamicChrome(views: RemoteViews, context: Context, oled: Boolean) {
    val dark = isSystemDark(context)
    val base =
      if (oled && dark) {
        Color.BLACK
      } else {
        MaterialColors.getColor(context, MR.attr.colorSurface, Color.BLACK)
      }
    val alpha = (255 * 0.93f).toInt().coerceIn(0, 255)
    val bg = ColorUtils.setAlphaComponent(base, alpha)
    views.setInt(R.id.widget_root, "setBackgroundColor", bg)
    val dayMuted = MaterialColors.getColor(context, MR.attr.colorOnSurfaceVariant, Color.GRAY)
    views.setTextColor(R.id.widget_day, dayMuted)
  }

  private fun showMessageOnly(
    views: RemoteViews,
    context: Context,
    useDynamic: Boolean,
    oled: Boolean,
    message: String,
    isError: Boolean,
  ) {
    views.setViewVisibility(R.id.widget_content, View.GONE)
    views.setViewVisibility(R.id.widget_placeholder, View.VISIBLE)
    views.setTextViewText(R.id.widget_placeholder, message)
    if (useDynamic && !isError) {
      if (oled && isSystemDark(context)) {
        views.setInt(R.id.widget_root, "setBackgroundColor", Color.BLACK)
      } else {
        applyDynamicChrome(views, context, oled)
      }
      val c = MaterialColors.getColor(context, MR.attr.colorOnSurfaceVariant, Color.GRAY)
      views.setTextColor(R.id.widget_placeholder, c)
    } else {
      views.setInt(R.id.widget_root, "setBackgroundColor", Color.parseColor("#EE1A2230"))
      views.setTextColor(
        R.id.widget_placeholder,
        Color.parseColor(if (isError) "#F87171" else "#8B95A5"),
      )
    }
  }

  private fun applyJson(
    views: RemoteViews,
    context: Context,
    json: String,
    useDynamic: Boolean,
    oled: Boolean,
  ) {
    val o = JSONObject(json)
    views.setViewVisibility(R.id.widget_placeholder, View.GONE)
    views.setViewVisibility(R.id.widget_content, View.VISIBLE)

    if (useDynamic) {
      applyDynamicChrome(views, context, oled)
    } else {
      views.setInt(R.id.widget_root, "setBackgroundColor", Color.parseColor("#EE1A2230"))
      views.setTextColor(R.id.widget_day, Color.parseColor("#8B95A5"))
    }

    views.setTextViewText(R.id.widget_day, o.getString("dayLabel"))
    val rows = o.getJSONArray("rows")
    val nextKey =
      if (o.isNull("nextKey")) {
        null
      } else {
        o.optString("nextKey", "").trim().takeIf { it.isNotEmpty() }
      }

    val normalColor =
      if (useDynamic) {
        MaterialColors.getColor(context, MR.attr.colorOnSurface, Color.WHITE)
      } else {
        Color.parseColor("#E8ECF1")
      }
    val accentColor =
      if (useDynamic) {
        MaterialColors.getColor(context, AppCompatR.attr.colorPrimary, Color.BLUE)
      } else {
        Color.parseColor("#5B9FD4")
      }

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
      val col = if (highlight) accentColor else normalColor
      views.setTextColor(COL_LABELS[i], col)
      views.setTextColor(COL_TIMES[i], col)
    }
  }

  companion object {
    const val PREFS_NAME = "prayer_widget"
    const val PREFS_KEY = "payload_v1"
    const val PREFS_UI_STYLE_KEY = "widget_ui_style"
    const val PREFS_UI_OLED = "widget_oled"

    private val COL_WRAPPERS =
      intArrayOf(
        R.id.widget_col_0,
        R.id.widget_col_1,
        R.id.widget_col_2,
        R.id.widget_col_3,
        R.id.widget_col_4,
      )
    private val COL_LABELS =
      intArrayOf(
        R.id.widget_col_0_label,
        R.id.widget_col_1_label,
        R.id.widget_col_2_label,
        R.id.widget_col_3_label,
        R.id.widget_col_4_label,
      )
    private val COL_TIMES =
      intArrayOf(
        R.id.widget_col_0_time,
        R.id.widget_col_1_time,
        R.id.widget_col_2_time,
        R.id.widget_col_3_time,
        R.id.widget_col_4_time,
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
