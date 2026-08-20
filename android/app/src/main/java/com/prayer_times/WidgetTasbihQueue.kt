package com.prayer_times

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Taps on the Tasbih widget, waiting for the app to apply them.
 *
 * Same shape as `WidgetLogQueue` and for the same reason — the counter lives
 * in the app's own storage, which a widget process cannot reach — but with
 * one difference that changes the rules: a journal entry is a SET and a
 * dhikr count is a SEQUENCE. Tapping Fajr twice means Fajr; tapping +1 twice
 * means two. So nothing is de-duplicated and order is the answer.
 *
 * THE RULES BELOW MUST MATCH `src/widget/widgetTasbihQueue.ts`, whose tests
 * are what say what they are, and `TasbihWidget.swift`, which is the third
 * copy.
 */
object WidgetTasbihQueue {
  const val PREFS_QUEUE_KEY = "widget_tasbih_queue"

  const val ACTION_INC = "inc"
  const val ACTION_RESET = "reset"
  const val ACTION_NEXT = "next"

  private val ACTIONS = setOf(ACTION_INC, ACTION_RESET, ACTION_NEXT)

  data class Entry(val action: String, val at: Long)

  private fun prefs(context: Context) =
    context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)

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
        val a = o.optString("a")
        val t = o.optLong("t", 0L)
        // An unknown action is dropped rather than treated as one of the
        // known ones: this ends up in someone's dhikr count.
        if (!ACTIONS.contains(a)) continue
        if (t <= 0L) continue
        out.add(Entry(a, t))
      }
    } catch (_: Exception) {
      return emptyList()
    }
    return out
  }

  fun serialize(entries: List<Entry>): String {
    val arr = JSONArray()
    for (e in entries) arr.put(JSONObject().put("a", e.action).put("t", e.at))
    return arr.toString()
  }

  /** Append one action. There is no de-duplication: see the header. */
  fun append(context: Context, action: String, now: Long = System.currentTimeMillis()) {
    if (!ACTIONS.contains(action)) return
    val next = read(context) + Entry(action, now)
    prefs(context).edit().putString(PREFS_QUEUE_KEY, serialize(next)).apply()
  }

  /** Hand the queue over and clear it in one step — see WidgetLogQueue.take. */
  fun take(context: Context): List<Entry> {
    val entries = read(context)
    if (entries.isNotEmpty()) {
      prefs(context).edit().remove(PREFS_QUEUE_KEY).apply()
    }
    return entries
  }

  /** What the count IS, given what the app published and what has been tapped. */
  data class Projection(val index: Int, val counts: List<Int>, val todayTotal: Int)

  /**
   * Mirrors `projectTasbih` in widgetTasbihQueue.ts.
   *
   * Two behaviours worth naming because they are invisible when wrong: a
   * bounded preset stops at its target (the preset's own
   * `unboundedAfterTarget`, carried on the payload, says which are which),
   * and Next keeps a part-finished count rather than discarding it.
   */
  fun project(
    index: Int,
    total: Int,
    counts: List<Int>,
    targets: List<Int>,
    unboundedFlags: List<Boolean>,
    todayTotal: Int,
    queue: List<Entry>,
  ): Projection {
    var idx = index
    val out = counts.toMutableList()
    var today = todayTotal
    for (e in queue) {
      when (e.action) {
        ACTION_INC -> {
          val current = out.getOrElse(idx) { 0 }
          // The rules that apply are the CURRENT index's, which Next may
          // have moved inside this very loop.
          val target = targets.getOrElse(idx) { 0 }
          val unbounded = unboundedFlags.getOrElse(idx) { false }
          if (!unbounded && target > 0 && current >= target) continue
          if (idx in out.indices) out[idx] = current + 1
          today += 1
        }
        ACTION_RESET -> if (idx in out.indices) out[idx] = 0
        ACTION_NEXT -> if (total > 0) idx = (idx + 1) % total
      }
    }
    return Projection(idx, out, today)
  }
}
