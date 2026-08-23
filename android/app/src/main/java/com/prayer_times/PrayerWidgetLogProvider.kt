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
open class PrayerWidgetLogProvider : AppWidgetProvider() {

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

  /**
   * Redraw when the card is resized.
   *
   * Everything this widget decides — whether the header row and its rule are
   * there, how tall the chips are, whether the practice graph appears at all
   * — it decides from the measured height. Without this the launcher changes
   * the height and never tells us, so a card dragged from one row to three
   * kept drawing the one-row card in a three-row box: the date line missing,
   * the countdown missing, and a third of the card blank where the graph was
   * supposed to be. It looked like the size thresholds were wrong. They were
   * never being asked.
   */
  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle,
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    appWidgetManager.updateAppWidget(appWidgetId, buildViews(context, appWidgetId))
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
      // Both classes. The tall picker entry is this provider under a second
      // name — a name the launcher keeps its own instance list under, so a
      // fan-out that names only one of them leaves the other showing
      // yesterday until something else happens to wake it.
      for (cls in arrayOf(
        PrayerWidgetLogProvider::class.java,
        PrayerWidgetLogLargeProvider::class.java,
      )) {
        val ids = mgr.getAppWidgetIds(ComponentName(context, cls))
        for (id in ids) mgr.updateAppWidget(id, buildViews(context, id))
      }
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

    /**
     * Below this the card drops its date line and its rule and shrinks its
     * chips. Two launcher rows is 210dp and one is 99, so the threshold
     * sits between them.
     */
    private const val COMPACT_MAX_HEIGHT_DP = 145

    /**
     * What the card occupies with its header on and no graph, in dp: 20 of
     * root padding, the date line at 16, the chips row at 78 (a 38dp chip
     * over the name and the time, plus the margin between them), the rule and
     * its margins at 12, and the footer at 18.
     *
     * Deliberately a little generous: the leftover is spent on padding, and
     * padding that overshoots pushes the footer off the bottom of the card.
     */
    private const val LOG_NO_GRID_CONTENT_DP = 148

    /** A guard on arithmetic done with a number the launcher supplies. */
    private const val LOG_SLACK_CAP_DP = 56

    /**
     * What the card spends above and below the grid, in dp: 10 of padding
     * top and bottom, the header line, the chips row at its natural height,
     * the divider above the footer with its margins, the footer, the streak
     * line, and the divider above the grid.
     */
    private const val LOG_CHROME_DP = 206
    private const val CARD_PADDING_DP = 20

    /** As many weeks as the payload carries. See PRACTICE_WINDOW_DAYS. */
    private const val MAX_GRID_WEEKS = 26

    private fun buildViews(base: Context, appWidgetId: Int): RemoteViews {
      // Every label below comes out of the string table, so the context has to
      // be the one that speaks Mihrab's language before anything is read from
      // it. See PrayerWidgetProvider.localized.
      val context = PrayerWidgetProvider.localized(base)
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
      val root = payloadRoot(context)
      bindToday(
        context,
        views,
        today,
        root?.optString("dayLabel").orEmpty(),
        accent,
        root,
      )
      bindGrid(context, views, appWidgetId, accent)
      bindCompact(context, views, appWidgetId)
      return views
    }

    /**
     * One launcher row, and everything that matters still on it.
     *
     * The card is the five chips, their times and the countdown; the date
     * line and the rule above the footer are what a short card can do
     * without. The chips shrink with it — the tap target is the whole
     * column, not the chip, so a smaller chip costs nothing to hit — and
     * the card's own padding halves, which is the last few points needed to
     * fit 99dp.
     *
     * `setViewLayoutHeight` is API 31. Below that the chips keep their full
     * height and a one-row card is simply tight; every phone this decade is
     * on 31 or later, and the alternative is a second layout file kept in
     * step by hand.
     */
    private fun bindCompact(context: Context, views: RemoteViews, appWidgetId: Int) {
      val (_, heightDp) = PrayerWidgetProvider.sizeDp(
        context,
        AppWidgetManager.getInstance(context),
        appWidgetId,
      )
      // 0 is a launcher that has not measured yet: the roomy card is the
      // safer guess, because the tight one on a tall card looks like a bug
      // while the reverse only looks tight for one frame.
      val tight = heightDp in 1 until COMPACT_MAX_HEIGHT_DP
      val vis = if (tight) View.GONE else View.VISIBLE
      views.setViewVisibility(R.id.widget_log_header_row, vis)
      views.setViewVisibility(R.id.widget_log_divider, vis)
      val density = context.resources.displayMetrics.density
      val pad = ((if (tight) 6 else 10) * density).toInt()
      views.setViewPadding(R.id.widget_root, pad, pad, pad, pad)

      // Two rows, and no graph to spend the second one on.
      //
      // The chips row takes its own height, so a card taller than the content
      // simply ended early: at 4x2 the five prayers sat against the top with
      // a quarter of the card blank underneath. The row grows into the gap
      // instead — the date line stays at the top, the footer lands on the
      // bottom, and the chips sit in the middle of the card. Nothing to do at
      // one row, where there is no slack, or from three up, where the graph
      // is what fills it.
      val slack =
        if (tight || heightDp >= GRID_MIN_HEIGHT_DP) 0
        else ((heightDp - LOG_NO_GRID_CONTENT_DP) / 2).coerceIn(0, LOG_SLACK_CAP_DP)
      val slackPx = (slack * density).toInt()
      views.setViewPadding(R.id.widget_log_row, 0, slackPx, 0, slackPx)

      if (android.os.Build.VERSION.SDK_INT < 31) return
      val chip = (if (tight) 30 else 38).toFloat()
      for (id in CHIPS) {
        views.setViewLayoutHeight(id, chip, android.util.TypedValue.COMPLEX_UNIT_DIP)
      }
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
      val (widthDp, heightDp) = PrayerWidgetProvider.sizeDp(
        context,
        AppWidgetManager.getInstance(context),
        appWidgetId,
      )
      // An unmeasured card (0) draws no graph. The other way round — the
      // launcher has not measured, so assume there is room — puts a graph
      // on a card that may be one row tall, and it takes the space out of
      // the chips above it.
      val show = practice != null && heightDp >= GRID_MIN_HEIGHT_DP
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
      // Everything the card spends before the grid gets a say: the padding,
      // the header, the chips row at its natural height, the two dividers
      // with their margins, the footer and the streak line. Measured on the
      // layout rather than guessed, and the grid gets the rest — which is
      // the box the column count is chosen for.
      val boxHeight = heightDp - LOG_CHROME_DP
      val boxWidth = widthDp - CARD_PADDING_DP
      views.setImageViewBitmap(
        R.id.widget_log_grid,
        PracticeGridBitmap.render(
          practice.optJSONArray("days"),
          PracticeGridBitmap.weeksForBox(boxWidth, boxHeight, MAX_GRID_WEEKS),
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
      root: JSONObject?,
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
      bindCountdown(context, views, prayers, root, dateKey)
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
    /** "05:12" to 312, or -1 for anything that is not a time. */
    private fun minutesOfDay(at: String?): Int {
      val parts = (at ?: "").split(":")
      if (parts.size != 2) return -1
      val h = parts[0].toIntOrNull() ?: return -1
      val m = parts[1].toIntOrNull() ?: return -1
      if (h < 0 || m < 0) return -1
      return h * 60 + m
    }

    /**
     * The first prayer of the day after `todayKey`, from the payload's
     * multi-day window.
     *
     * Found by walking to today's entry and taking the one after it rather
     * than by trusting index 1: the window starts at today in every payload
     * this app has written, but a widget that has not been redrawn since
     * before midnight is holding one where it does not, and off-by-one here
     * would count down to a Fajr two days out without ever looking wrong.
     */
    private fun tomorrowFirstPrayer(root: JSONObject?, todayKey: String): JSONObject? {
      val days = root?.optJSONArray("days") ?: return null
      if (todayKey.isEmpty()) return null
      var afterToday = false
      for (i in 0 until days.length()) {
        val day = days.optJSONObject(i) ?: continue
        if (afterToday) return day.optJSONArray("rows")?.optJSONObject(0)
        if (day.optString("dateKey") == todayKey) afterToday = true
      }
      return null
    }

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
     * WRAPS PAST MIDNIGHT, and for six hours a night it did not.
     *
     * The arithmetic here is minutes-since-midnight, and the guard threw
     * away anything that came out negative. Every prayer but one is later
     * today than now, so the guard only ever caught the one that is not:
     * once Isha has passed, what comes next is tomorrow's Fajr, at 03:25
     * against a clock reading 22:27 — a negative number, and the countdown
     * hid itself. The card lost its countdown every night between Isha and
     * dawn, which is a stretch of hours a home screen most needs it. The
     * prayer-times strip has wrapped for a while; this is the same wrap.
     *
     * Tomorrow's Fajr comes from the multi-day window in the payload, which
     * this widget did not used to read — the older comment here said
     * tomorrow's schedule was not available, and it has been for a while.
     * When it is missing, today's own first prayer stands in: it is a minute
     * or two out at worst, and a countdown a minute out is worth more than
     * no countdown at all.
     */
    private fun bindCountdown(
      context: Context,
      views: RemoteViews,
      prayers: org.json.JSONArray?,
      root: JSONObject?,
      todayKey: String,
    ) {
      val now = java.util.Calendar.getInstance()
      val currentMinutes =
        now.get(java.util.Calendar.HOUR_OF_DAY) * 60 + now.get(java.util.Calendar.MINUTE)

      var next = nextPrayer(prayers)
      var minutesAt = minutesOfDay(next?.optString("time"))
      var minutesLeft = if (minutesAt < 0) -1 else minutesAt - currentMinutes

      if (next == null || minutesLeft < 0) {
        // The day is done. What is next is on the other side of midnight.
        val fajr = tomorrowFirstPrayer(root, todayKey)
          ?: prayers?.optJSONObject(0)
        val fajrMinutes = minutesOfDay(fajr?.optString("time"))
        if (fajr != null && fajrMinutes >= 0) {
          next = fajr
          minutesAt = fajrMinutes
          minutesLeft = fajrMinutes + 24 * 60 - currentMinutes
        }
      }

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
