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

  // Every branch goes through PrayerWidgetProvider.requestUpdate rather than
  // this provider's own: one signal has to redraw every widget and re-arm the
  // alarm chain, or a home screen holding only this one stops moving. See the
  // comment on requestUpdate.
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_USER_PRESENT,
      Intent.ACTION_BOOT_COMPLETED,
      PrayerWidgetProvider.ACTION_PRAYER_TIME_ELAPSED ->
        PrayerWidgetProvider.requestUpdate(context)
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
        val root = JSONObject(raw)
        // A payload whose schedule has run out still carries a `today`
        // block, dated whenever the app was last opened. Rendering it would
        // offer that day's prayers as today's, and a tap would queue a log
        // against THAT date — a status on a day the user never touched.
        // See PrayerWidgetProvider.payloadHasExpired.
        if (PrayerWidgetProvider.payloadHasExpired(root)) null else root
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

    /**
     * The height at which the practice graph appears.
     *
     * The same number the prayer-times widget uses for the same bitmap: two
     * launcher rows is 210dp and three is 321dp on a 420dpi phone, so 265
     * sits in the middle of that gap. A 4x2 — where this widget was
     * designed to live — is unchanged; drag it to 4x3 and the graph is
     * what the extra row is for.
     */
    private const val GRID_MIN_HEIGHT_DP = 265

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
      bindGrid(context, views, appWidgetId, accent)
      return views
    }

    /**
     * The practice graph, on a card tall enough to hold it.
     *
     * Drawn by the same renderer the prayer-times and streak widgets use,
     * so the three describe the same weeks identically — a graph that
     * disagreed with itself across two home-screen cards would be worse
     * than one card having none.
     *
     * Absent practice data hides it rather than drawing an empty grid: the
     * app has simply not pushed a block yet, and an empty graph is a claim
     * that nothing was ever logged.
     */
    private fun bindGrid(
      context: Context,
      views: RemoteViews,
      appWidgetId: Int,
      accent: Int,
    ) {
      val practice = payloadRoot(context)?.optJSONObject("practice")
      val since = practice?.optString("since")?.ifEmpty { null }
      val (_, heightDp) = PrayerWidgetProvider.sizeDp(
        context,
        AppWidgetManager.getInstance(context),
        appWidgetId,
      )
      // `heightDp == 0` is a launcher that has not measured yet, not a
      // short card: showing the graph is the better guess, because the only
      // way to be here at all is a widget the user has placed.
      val show = practice != null && !(heightDp in 1 until GRID_MIN_HEIGHT_DP)
      val vis = if (show) View.VISIBLE else View.GONE
      views.setViewVisibility(R.id.widget_log_grid_divider, vis)
      views.setViewVisibility(R.id.widget_log_practice_row, vis)
      views.setViewVisibility(R.id.widget_log_grid, vis)
      if (!show || practice == null) return

      // The same line the prayer-times card draws, from the same block and
      // in the same words: "0  day streak · Best 92 · 3 of 5 today · 1 to
      // make up". Two cards on one home screen describing the same practice
      // differently is worse than one of them not describing it at all.
      val streak = practice.optInt("streak", 0)
      views.setTextViewText(R.id.widget_log_streak, streak.toString())
      val parts = mutableListOf(
        context.resources.getQuantityString(
          R.plurals.widget_streak_day_label,
          streak,
          streak,
        ),
      )
      val best = practice.optInt("bestStreak", 0)
      if (best > 0) parts.add(context.getString(R.string.widget_streak_best, best))
      parts.add(
        context.getString(R.string.widget_streak_logged, practice.optInt("loggedToday", 0)),
      )
      val owedAllTime = practice.optInt("owed", 0)
      if (owedAllTime > 0) {
        parts.add(
          context.resources.getQuantityString(
            R.plurals.widget_streak_make_up,
            owedAllTime,
            owedAllTime,
          ),
        )
      }
      views.setTextViewText(R.id.widget_log_practice_second, parts.joinToString(" · "))
      val density = context.resources.displayMetrics.density
      views.setImageViewBitmap(
        R.id.widget_log_grid,
        PracticeGridBitmap.render(
          practice.optJSONArray("days"),
          // Twenty columns, because seven rows of fourteen is a 2:1 shape
          // in a box three times as wide as it is tall — the graph sat in
          // the left two thirds with the right third empty. Twenty is what
          // the payload now carries, and it fills the card. Fewer when the
          // journal is younger than that: see weeksToDraw.
          PracticeGridBitmap.weeksToDraw(since, 20),
          (7 * density).toInt().coerceAtLeast(3),
          (2f * density).toInt().coerceAtLeast(1),
          accent,
          since,
        ),
      )
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
            // A hollow tick, not a plus.
            //
            // The plus said "add something" and left it to the reader to work
            // out what — on a widget where the whole verb is "log this
            // prayer". A tick says what tapping produces, and the chip it
            // becomes is the same tick filled in, so the empty and the done
            // states are one glyph in two weights rather than two unrelated
            // symbols. Outline versus fill carries "not yet" versus "done",
            // which is the distinction that actually matters here.
            views.setInt(CHIPS[i], "setBackgroundResource", R.drawable.widget_log_chip_due)
            views.setTextViewText(CHIPS[i], "✓")
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

      val owed = today.optInt("owed", 0)
      views.setTextViewText(
        R.id.widget_log_foot_left,
        footerLeft(context, prayers, pending, owed),
      )
      bindCountdown(context, views, prayers)
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
      owed: Int,
    ): String {
      val n = prayers?.length() ?: 0
      for (i in 0 until n) {
        val o = prayers?.optJSONObject(i) ?: continue
        val key = o.optString("key")
        val status = o.optString("status").takeIf { it.isNotEmpty() && it != "null" }
        if (o.optBoolean("due", false) && status == null && !pending.contains(key)) {
          // Says what the + DOES, not what the chips already show.
          //
          // "Fajr not logged yet" restated the empty chip directly above it
          // and left the only interactive thing on the widget unexplained —
          // a plus sign in a circle is an affordance nobody is born knowing.
          // The footer is the one line with room for a verb.
          return context.getString(
            R.string.widget_log_tap_to_log,
            o.optString("name").ifEmpty { key },
          )
        }
      }
      // "Today is up to date" while a prayer is owed is the card
      // contradicting itself. Nothing is DUE, which is what the loop above
      // answers, but something is outstanding — and that is the more
      // useful of the two things to say.
      if (owed > 0) return context.getString(R.string.widget_log_owed, owed)
      return context.getString(R.string.widget_log_up_to_date)
    }

    /**
     * The next prayer whose time has not arrived, or null after the last.
     *
     * `due` is computed by the app when it writes the payload, so the first
     * row that is NOT due is the next one — the same reading iOS's footer
     * takes.
     */
    private fun nextPrayer(prayers: org.json.JSONArray?): JSONObject? {
      val n = prayers?.length() ?: 0
      for (i in 0 until n) {
        val o = prayers?.optJSONObject(i) ?: continue
        if (!o.optBoolean("due", false)) return o
      }
      return null
    }

    /**
     * "Maghrib · in 2:12:04", ticked by the system.
     *
     * A Chronometer rather than a string this process computes: the widget
     * redraws when the payload changes and at each prayer boundary, so a
     * computed "in 2h 12m" would be right when drawn and frozen for the
     * hour after. Handing the view the moment the prayer lands costs
     * nothing and counts itself down.
     *
     * Nothing is shown after the last prayer of the day. Tomorrow's Fajr
     * would need tomorrow's schedule, and this widget is about today — the
     * footer already says the day is done.
     */
    private fun bindCountdown(
      context: Context,
      views: RemoteViews,
      prayers: org.json.JSONArray?,
    ) {
      val next = nextPrayer(prayers)
      val at = next?.optString("time").orEmpty()
      val parts = at.split(":")
      val minutesAt = if (parts.size == 2) {
        (parts[0].toIntOrNull() ?: -1) * 60 + (parts[1].toIntOrNull() ?: -1)
      } else {
        -1
      }
      val now = java.util.Calendar.getInstance()
      val currentMinutes =
        now.get(java.util.Calendar.HOUR_OF_DAY) * 60 + now.get(java.util.Calendar.MINUTE)
      val minutesLeft = minutesAt - currentMinutes
      if (next == null || minutesAt < 0 || minutesLeft < 0) {
        views.setTextViewText(R.id.widget_log_foot_right, "")
        // Stopped as well as hidden: a running Chronometer inside a hidden
        // view is still a view being invalidated once a second.
        views.setChronometer(R.id.widget_log_remaining, 0L, null, false)
        views.setViewVisibility(R.id.widget_log_remaining, View.GONE)
        return
      }
      views.setTextViewText(
        R.id.widget_log_foot_right,
        next.optString("name").ifEmpty { next.optString("key") },
      )
      // The seconds of the current minute have to come off the base or the
      // countdown is up to 59 seconds early — long enough to show 00:00
      // while the prayer has not arrived.
      val base = android.os.SystemClock.elapsedRealtime() +
        minutesLeft * 60_000L - now.get(java.util.Calendar.SECOND) * 1000L
      views.setChronometerCountDown(R.id.widget_log_remaining, true)
      views.setChronometer(
        R.id.widget_log_remaining,
        base,
        context.getString(R.string.widget_countdown_format),
        true,
      )
      views.setViewVisibility(R.id.widget_log_remaining, View.VISIBLE)
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
