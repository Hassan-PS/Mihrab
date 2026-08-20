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
 * Log Today — the one widget that changes what the app IS from the home
 * screen rather than being a better way to read something already readable.
 *
 * Five chips, one per salāh. Tapping a due one records it; tapping it again
 * within the undo window takes it back. Everything else opens the app: the
 * widget can express "prayed on time" and nothing more, and a control that
 * silently records a status the user did not choose is worse than one that
 * hands them the screen where they can choose it.
 *
 * ── What it draws, and from where ─────────────────────────────────────
 *
 * Two sources, merged. The `today` block of the payload is what the JOURNAL
 * says, and the queue is what has been TAPPED since the app last ran. A chip
 * is ticked if either says so, which is what lets the tick land on the tap
 * instead of on the next app launch. See widgetLogQueue.ts for why the tap
 * cannot write the journal directly.
 */
class PrayerWidgetLogProvider : AppWidgetProvider() {

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_USER_PRESENT,
      Intent.ACTION_SCREEN_ON,
      Intent.ACTION_BOOT_COMPLETED,
      PrayerWidgetProvider.ACTION_PRAYER_TIME_ELAPSED -> requestUpdate(context)
      ACTION_LOG_TAP -> handleTap(context, intent)
    }
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, buildViews(context, id))
    }
  }

  companion object {
    const val ACTION_LOG_TAP = "com.prayer_times.ACTION_WIDGET_LOG_TAP"
    const val EXTRA_PRAYER = "prayer"

    private const val NEUTRAL_TEXT = "#E8EAED"
    private const val NEUTRAL_MUTED = "#9AA0A6"

    private val CHIPS = intArrayOf(
      R.id.log_chip_0, R.id.log_chip_1, R.id.log_chip_2, R.id.log_chip_3, R.id.log_chip_4,
    )
    private val NAMES = intArrayOf(
      R.id.log_name_0, R.id.log_name_1, R.id.log_name_2, R.id.log_name_3, R.id.log_name_4,
    )
    private val TIMES = intArrayOf(
      R.id.log_time_0, R.id.log_time_1, R.id.log_time_2, R.id.log_time_3, R.id.log_time_4,
    )
    private val CELLS = intArrayOf(
      R.id.log_cell_0, R.id.log_cell_1, R.id.log_cell_2, R.id.log_cell_3, R.id.log_cell_4,
    )

    fun requestUpdate(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val cn = ComponentName(context, PrayerWidgetLogProvider::class.java)
      val ids = mgr.getAppWidgetIds(cn)
      for (id in ids) mgr.updateAppWidget(id, buildViews(context, id))
    }

    /**
     * Record a tap and redraw immediately.
     *
     * The redraw is the point: nothing has been written to the journal yet
     * and will not be until the app next runs, so the only feedback the user
     * gets is this one. It has to be instant and it has to be right.
     */
    private fun handleTap(context: Context, intent: Intent) {
      val prayer = intent.getStringExtra(EXTRA_PRAYER) ?: return
      if (!WidgetLogQueue.PRAYERS.contains(prayer)) return
      // The date comes from the payload's `today` block rather than from the
      // clock, so a tap and the chip it was drawn under always agree about
      // which day they mean.
      val date = payloadToday(context)?.optString("dateKey").orEmpty()
      if (date.isEmpty()) return
      WidgetLogQueue.tap(context, date, prayer)
      requestUpdate(context)
    }

    private fun payloadRoot(context: Context): JSONObject? {
      val raw = context
        .getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        .getString(PrayerWidgetProvider.PREFS_KEY, null)
        ?: return null
      return try {
        JSONObject(raw)
      } catch (_: Exception) {
        null
      }
    }

    /**
     * The payload's `today` block, or null when the app has not sent one.
     *
     * Absent is the normal state on any app version older than this, and it
     * means "we do not know what has been logged" — which must render as the
     * placeholder, not as five unlogged prayers. Five empty chips is a claim.
     */
    private fun payloadToday(context: Context): JSONObject? =
      payloadRoot(context)?.optJSONObject("today")

    private fun buildViews(context: Context, appWidgetId: Int): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.prayer_widget_log)
      val (bg, accent) = PrayerWidgetProvider.resolvedColors(context)
      views.setInt(R.id.widget_root, "setBackgroundColor", bg)

      val open = PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.widget_root, open)

      val today = payloadToday(context)
      if (today == null) {
        views.setViewVisibility(R.id.widget_content, View.GONE)
        views.setViewVisibility(R.id.widget_placeholder, View.VISIBLE)
        views.setTextViewText(
          R.id.widget_placeholder,
          context.getString(R.string.widget_placeholder_day),
        )
        views.setTextColor(R.id.widget_placeholder, Color.parseColor(NEUTRAL_MUTED))
        return views
      }
      views.setViewVisibility(R.id.widget_placeholder, View.GONE)
      views.setViewVisibility(R.id.widget_content, View.VISIBLE)
      bindToday(
        context,
        views,
        today,
        payloadRoot(context)?.optString("dayLabel").orEmpty(),
        accent,
      )
      return views
    }

    private fun bindToday(
      context: Context,
      views: RemoteViews,
      today: JSONObject,
      dayLabel: String,
      accent: Int,
    ) {
      val dateKey = today.optString("dateKey")
      val prayers = today.optJSONArray("prayers")
      val pending = WidgetLogQueue.pendingFor(context, dateKey)

      var logged = today.optInt("logged", 0)
      // Queued taps have not reached the journal, so the payload's count does
      // not know about them. Counting them here is what keeps "3 of 5" in
      // step with the three filled chips beside it.
      for (p in pending) {
        val already = statusOfPrayer(prayers, p)
        if (already.isNullOrEmpty()) logged += 1
      }

      views.setTextViewText(
        R.id.widget_log_title,
        dayLabel.ifEmpty { context.getString(R.string.widget_log_today) },
      )
      views.setTextViewText(
        R.id.widget_log_count,
        context.getString(R.string.widget_log_count, logged, today.optInt("loggable", 5)),
      )

      val count = prayers?.length() ?: 0
      for (i in CHIPS.indices) {
        val row = if (i < count) prayers?.optJSONObject(i) else null
        if (row == null) {
          views.setViewVisibility(CELLS[i], View.GONE)
          continue
        }
        views.setViewVisibility(CELLS[i], View.VISIBLE)
        val key = row.optString("key")
        val status = row.optString("status").takeIf { it.isNotEmpty() && it != "null" }
        val due = row.optBoolean("due", false)
        val queued = pending.contains(key)

        views.setTextViewText(NAMES[i], row.optString("name").ifEmpty { key })
        views.setTextViewText(TIMES[i], row.optString("time"))
        views.setTextColor(NAMES[i], Color.parseColor(if (due || queued) NEUTRAL_TEXT else NEUTRAL_MUTED))

        val done = queued || status == "on-time" || status == "late" || status == "qadha"
        val missed = !queued && status == "missed"
        when {
          done -> {
            views.setInt(CHIPS[i], "setBackgroundResource", R.drawable.widget_log_chip_done)
            // Tint the rounded drawable with the accent the user picked, so
            // this chip matches the highlight on every other Mihrab widget.
            // `setColorStateList` is API 31+; below that the drawable keeps
            // its own emerald, which is the app's default accent anyway — so
            // the only people who see a mismatch are those on Android 11 or
            // older who ALSO changed the highlight colour.
            if (android.os.Build.VERSION.SDK_INT >= 31) {
              views.setColorStateList(
                CHIPS[i],
                "setBackgroundTintList",
                android.content.res.ColorStateList.valueOf(accent),
              )
            }
            views.setTextViewText(CHIPS[i], "✓")
            views.setTextColor(CHIPS[i], Color.WHITE)
          }
          missed -> {
            views.setInt(CHIPS[i], "setBackgroundResource", R.drawable.widget_log_chip_missed)
            views.setTextViewText(CHIPS[i], "!")
            views.setTextColor(CHIPS[i], Color.parseColor("#F87171"))
          }
          due -> {
            views.setInt(CHIPS[i], "setBackgroundResource", R.drawable.widget_log_chip_due)
            views.setTextViewText(CHIPS[i], "+")
            views.setTextColor(CHIPS[i], accent)
          }
          else -> {
            views.setInt(CHIPS[i], "setBackgroundResource", R.drawable.widget_log_chip_idle)
            views.setTextViewText(CHIPS[i], "·")
            views.setTextColor(CHIPS[i], Color.parseColor(NEUTRAL_MUTED))
          }
        }

        // Only a chip that can legitimately change gets a tap. A prayer whose
        // time has not come has nothing to record, and a missed one needs a
        // decision with a date attached — both fall through to the root's
        // "open the app" intent rather than doing something surprising here.
        if (due || queued) {
          views.setOnClickPendingIntent(CELLS[i], tapIntent(context, key, i))
        } else {
          views.setOnClickPendingIntent(CELLS[i], null)
        }
      }

      views.setTextViewText(R.id.widget_log_foot_left, footerLeft(context, prayers, pending))
      val owed = today.optInt("owed", 0)
      views.setTextViewText(
        R.id.widget_log_foot_right,
        if (owed > 0) context.getString(R.string.widget_log_owed, owed) else "",
      )
    }

    private fun statusOfPrayer(prayers: org.json.JSONArray?, key: String): String? {
      val n = prayers?.length() ?: return null
      for (i in 0 until n) {
        val o = prayers.optJSONObject(i) ?: continue
        if (o.optString("key") == key) {
          return o.optString("status").takeIf { it.isNotEmpty() && it != "null" }
        }
      }
      return null
    }

    /** The next prayer still waiting to be logged, or a done message. */
    private fun footerLeft(
      context: Context,
      prayers: org.json.JSONArray?,
      pending: Set<String>,
    ): String {
      val n = prayers?.length() ?: 0
      for (i in 0 until n) {
        val o = prayers?.optJSONObject(i) ?: continue
        val key = o.optString("key")
        val status = o.optString("status").takeIf { it.isNotEmpty() && it != "null" }
        if (o.optBoolean("due", false) && status == null && !pending.contains(key)) {
          return context.getString(R.string.widget_log_waiting, o.optString("name").ifEmpty { key })
        }
      }
      return context.getString(R.string.widget_log_up_to_date)
    }

    /**
     * A distinct request code per cell.
     *
     * `FLAG_UPDATE_CURRENT` matches PendingIntents by everything EXCEPT their
     * extras, so five cells sharing a request code would collapse into one
     * and every chip would log whichever prayer was bound last.
     */
    private fun tapIntent(context: Context, prayer: String, index: Int): PendingIntent {
      val intent = Intent(context, PrayerWidgetLogProvider::class.java).apply {
        action = ACTION_LOG_TAP
        putExtra(EXTRA_PRAYER, prayer)
      }
      return PendingIntent.getBroadcast(
        context,
        1000 + index,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}
