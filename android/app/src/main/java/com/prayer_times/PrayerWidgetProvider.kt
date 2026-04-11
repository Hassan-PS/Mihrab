package com.prayer_times

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Home screen widget uses a fixed dark green theme (aligned with launcher icon),
 * not the in-app dynamic / Material palette.
 */
class PrayerWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val json = prefs.getString(PREFS_KEY, null)

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
          context.getString(R.string.widget_placeholder_day),
          isError = false,
        )
      } else {
        try {
          applyJson(views, json)
        } catch (_: Exception) {
          showMessageOnly(views, context.getString(R.string.widget_error), isError = true)
        }
      }
      appWidgetManager.updateAppWidget(id, views)
    }
  }

  private fun showMessageOnly(views: RemoteViews, message: String, isError: Boolean) {
    views.setViewVisibility(R.id.widget_content, View.GONE)
    views.setViewVisibility(R.id.widget_placeholder, View.VISIBLE)
    views.setTextViewText(R.id.widget_placeholder, message)
    views.setInt(R.id.widget_root, "setBackgroundColor", Color.parseColor(WIDGET_BG))
    views.setTextColor(
      R.id.widget_placeholder,
      Color.parseColor(if (isError) "#F87171" else WIDGET_MUTED),
    )
  }

  private fun applyJson(views: RemoteViews, json: String) {
    val o = JSONObject(json)
    views.setViewVisibility(R.id.widget_placeholder, View.GONE)
    views.setViewVisibility(R.id.widget_content, View.VISIBLE)

    views.setInt(R.id.widget_root, "setBackgroundColor", Color.parseColor(WIDGET_BG))
    views.setTextColor(R.id.widget_day, Color.parseColor(WIDGET_MUTED))

    views.setTextViewText(R.id.widget_day, o.getString("dayLabel"))
    val rows = o.getJSONArray("rows")
    val nextKey =
      if (o.isNull("nextKey")) {
        null
      } else {
        o.optString("nextKey", "").trim().takeIf { it.isNotEmpty() }
      }

    val normalColor = Color.parseColor(WIDGET_TEXT)
    val highlightColor = Color.parseColor(WIDGET_HIGHLIGHT_GREEN)

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
    }
  }

  companion object {
    const val PREFS_NAME = "prayer_widget"
    const val PREFS_KEY = "payload_v1"
    const val PREFS_UI_STYLE_KEY = "widget_ui_style"
    const val PREFS_UI_OLED = "widget_oled"

    /** @color/ic_launcher_background #143628 with ~93% opacity (ARGB). */
    private const val WIDGET_BG = "#EE143628"

    private const val WIDGET_TEXT = "#E8ECF1"
    private const val WIDGET_MUTED = "#8B95A5"
    /** Softer green on dark, in the same family as the launcher icon. */
    private const val WIDGET_HIGHLIGHT_GREEN = "#6BC98A"

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
