package com.prayer_times

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Taps on the Log Today widget, waiting for the app to write them.
 *
 * The journal is an encrypted blob whose key lives on the JS side, so this
 * receiver cannot write it — and should not want to. `logPrayerOnTime` in
 * `prayerLogAction.ts` already owns that write, including the rule that an
 * existing status is never overwritten, and a second implementation of that
 * rule in Kotlin is one that can drift from the first.
 *
 * So a tap lands here, in the same SharedPreferences the payload already
 * uses, and the app drains it through the real writer when it next runs.
 * The widget renders this queue over the payload, so the checkmark appears
 * on the tap rather than on the next launch.
 *
 * THE RULES BELOW MUST MATCH `src/widget/widgetLogQueue.ts`. That file's
 * tests are what say what they are; this is the second implementation of a
 * three-case rule and the only defence against the two disagreeing is that
 * the cases are few enough to state in one place each.
 */
object WidgetLogQueue {
  const val PREFS_QUEUE_KEY = "widget_log_queue"

  /** Tapping the same prayer again within this takes the tap back. */
  const val UNDO_WINDOW_MS = 60_000L

  /** The five that can be logged, in the order they are prayed. */
  val PRAYERS = listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha")

  data class Entry(val date: String, val prayer: String, val at: Long)

  private val DATE_RE = Regex("^\\d{4}-\\d{2}-\\d{2}$")

  private fun prefs(context: Context) =
    context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)

  /**
   * Read the queue back, dropping anything that could not have come from a
   * real tap — the same discipline the JS side applies, for the same
   * reason: this string is written by another process and its contents end
   * up in someone's record of their own worship.
   */
  fun read(context: Context): List<Entry> {
    val raw = prefs(context).getString(PREFS_QUEUE_KEY, null) ?: return emptyList()
    return parse(raw)
  }

  fun parse(raw: String): List<Entry> {
    val out = mutableListOf<Entry>()
    try {
      val arr = JSONArray(raw)
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val d = o.optString("d")
        val p = o.optString("p")
        val t = o.optLong("t", 0L)
        if (!DATE_RE.matches(d)) continue
        if (!PRAYERS.contains(p)) continue
        if (t <= 0L) continue
        out.add(Entry(d, p, t))
      }
    } catch (_: Exception) {
      return emptyList()
    }
    return out
  }

  fun serialize(entries: List<Entry>): String {
    val arr = JSONArray()
    for (e in entries) {
      arr.put(JSONObject().put("d", e.date).put("p", e.prayer).put("t", e.at))
    }
    return arr.toString()
  }

  /**
   * Apply one tap. Mirrors `applyTap` in widgetLogQueue.ts:
   *
   *   • queued, inside the undo window  → remove it (this is the undo)
   *   • queued, outside the window      → leave it; a tap an hour later is
   *                                       someone confirming, and silently
   *                                       un-logging a prayer they believe
   *                                       they logged is the worst outcome
   *                                       available here
   *   • not queued                      → add it
   *
   * Returns the new queue so the caller can tell whether anything changed.
   */
  fun applyTap(
    queue: List<Entry>,
    date: String,
    prayer: String,
    now: Long,
    undoWindowMs: Long = UNDO_WINDOW_MS,
  ): List<Entry> {
    val existing = queue.firstOrNull { it.date == date && it.prayer == prayer }
    if (existing != null) {
      return if (now - existing.at <= undoWindowMs) {
        queue.filterNot { it.date == date && it.prayer == prayer }
      } else {
        queue
      }
    }
    return queue + Entry(date, prayer, now)
  }

  /** Record a tap and persist it. */
  fun tap(context: Context, date: String, prayer: String, now: Long = System.currentTimeMillis()) {
    val next = applyTap(read(context), date, prayer, now)
    prefs(context).edit().putString(PREFS_QUEUE_KEY, serialize(next)).apply()
  }

  /**
   * Hand the queue over and clear it in one step.
   *
   * One step because the app is about to write these to the journal, and a
   * read-then-clear that is interrupted between the two either loses taps
   * or writes them twice. `apply()` is asynchronous but the in-memory value
   * changes immediately, so a second caller sees the cleared queue.
   */
  fun take(context: Context): List<Entry> {
    val entries = read(context)
    if (entries.isNotEmpty()) {
      prefs(context).edit().remove(PREFS_QUEUE_KEY).apply()
    }
    return entries
  }

  /** Which prayers are queued for `date` — what the widget draws as ticked. */
  fun pendingFor(context: Context, date: String): Set<String> =
    read(context).filter { it.date == date }.map { it.prayer }.toSet()
}
