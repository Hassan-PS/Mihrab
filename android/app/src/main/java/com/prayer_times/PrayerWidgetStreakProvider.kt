package com.prayer_times

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Streak & Practice — the Log screen's four stat tiles, minus three.
 *
 * A SEPARATE receiver rather than a size of the prayer-times widget. The 4x4
 * prayer widget already carries the graph, which is right for someone who
 * wants both facts together; this is for someone who wants only this one and
 * should not have to put a prayer table on their home screen to get it.
 *
 * The graph is a Bitmap (see PracticeGridBitmap). RemoteViews has no loops,
 * so seventy cells as views would mean seventy generated ids and seventy
 * actions crossing the process boundary on every update.
 *
 * Draws nothing but the placeholder when the payload has no `practice`
 * block. An absent block is not a zero streak: on a home screen those look
 * identical and mean opposite things.
 */
class PrayerWidgetStreakProvider : AppWidgetProvider() {

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_USER_PRESENT,
      Intent.ACTION_SCREEN_ON,
      Intent.ACTION_BOOT_COMPLETED,
      PrayerWidgetProvider.ACTION_PRAYER_TIME_ELAPSED -> requestUpdate(context)
    }
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, buildViews(context, id, appWidgetManager))
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle,
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    appWidgetManager.updateAppWidget(appWidgetId, buildViews(context, appWidgetId, appWidgetManager))
  }

  companion object {

    fun requestUpdate(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, PrayerWidgetStreakProvider::class.java))
      for (id in ids) mgr.updateAppWidget(id, buildViews(context, id, mgr))
    }

    private fun practice(context: Context): JSONObject? {
      val raw = context
        .getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        .getString(PrayerWidgetProvider.PREFS_KEY, null) ?: return null
      return try {
        val root = JSONObject(raw)
        // A streak from a payload written weeks ago is a claim about weeks
        // the app has not seen. See PrayerWidgetProvider.payloadHasExpired.
        if (PrayerWidgetProvider.payloadHasExpired(root)) null
        else root.optJSONObject("practice")
      } catch (_: Exception) {
        null
      }
    }

    fun buildViews(context: Context, appWidgetId: Int, mgr: AppWidgetManager): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.prayer_widget_streak)
      val (background, accent) = PrayerWidgetProvider.resolvedColors(context)
      views.setInt(R.id.widget_root, "setBackgroundColor", background)

      val pr = practice(context)
      if (pr == null) {
        views.setViewVisibility(R.id.widget_content, View.GONE)
        views.setViewVisibility(R.id.widget_placeholder, View.VISIBLE)
        views.setTextViewText(
          R.id.widget_placeholder,
          context.getString(R.string.widget_placeholder_open_app),
        )
        views.setOnClickPendingIntent(R.id.widget_root, openLogIntent(context))
        return views
      }

      views.setViewVisibility(R.id.widget_placeholder, View.GONE)
      views.setViewVisibility(R.id.widget_content, View.VISIBLE)

      val streak = pr.optInt("streak", 0)
      views.setTextViewText(R.id.streak_title, context.getString(R.string.widget_streak_title))
      views.setTextViewText(R.id.streak_value, streak.toString())
      views.setTextColor(R.id.streak_value, accent)
      views.setTextViewText(
        R.id.streak_unit,
        context.resources.getQuantityString(R.plurals.widget_streak_days, streak, streak),
      )
      views.setTextViewText(R.id.streak_second, secondLine(context, pr))

      val owed = pr.optInt("owed", 0)
      if (owed > 0) {
        views.setViewVisibility(R.id.streak_owed, View.VISIBLE)
        views.setTextViewText(
          R.id.streak_owed,
          context.resources.getQuantityString(R.plurals.widget_streak_make_up, owed, owed),
        )
      } else {
        views.setViewVisibility(R.id.streak_owed, View.GONE)
      }

      val fasts = pr.optInt("fastsThisMonth", 0)
      if (fasts > 0) {
        views.setViewVisibility(R.id.streak_fasts, View.VISIBLE)
        views.setTextViewText(
          R.id.streak_fasts,
          context.resources.getQuantityString(R.plurals.widget_streak_fasts, fasts, fasts),
        )
      } else {
        views.setViewVisibility(R.id.streak_fasts, View.GONE)
      }

      // Ten weeks at 4x2, five at 2x2 — measured, not assumed. A grid sized
      // for the wide case and drawn into the narrow one is what makes cells
      // 4px and the whole thing a texture rather than a record.
      val widthDp = mgr.getAppWidgetOptions(appWidgetId)
        .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
      val weeks = if (widthDp >= 220) 10 else 5
      val density = context.resources.displayMetrics.density
      val cell = (7 * density).toInt().coerceAtLeast(3)
      val gap = (2 * density).toInt().coerceAtLeast(1)
      views.setImageViewBitmap(
        R.id.streak_grid,
        PracticeGridBitmap.render(pr.optJSONArray("days"), weeks, cell, gap, accent),
      )

      views.setOnClickPendingIntent(R.id.widget_root, openLogIntent(context))
      return views
    }

    /** "Best 31 · 2 of 5 today · Sunnah 68%", dropping the empty halves. */
    private fun secondLine(context: Context, pr: JSONObject): String {
      val parts = mutableListOf<String>()
      val best = pr.optInt("bestStreak", 0)
      if (best > 0) parts.add(context.getString(R.string.widget_streak_best, best))
      parts.add(context.getString(R.string.widget_streak_logged, pr.optInt("loggedToday", 0)))
      val rate = pr.optDouble("sunnahRate", 0.0)
      if (rate > 0) {
        parts.add(context.getString(R.string.widget_streak_sunnah, Math.round(rate * 100).toInt()))
      }
      return parts.joinToString(" · ")
    }

    /**
     * Opens the Log, through the same mihrab:// route the iOS widgets use.
     *
     * A VIEW intent rather than a bare launcher intent so the app lands on
     * the Log rather than on whatever screen it was last showing — which is
     * the entire reason a streak widget is worth tapping.
     */
    private fun openLogIntent(context: Context): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("mihrab://log")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(
        context,
        3100,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}
