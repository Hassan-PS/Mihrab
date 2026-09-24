package com.prayer_times

import android.app.AlarmManager
import android.app.AutomaticZenRule
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.notification.Condition
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * The clockwork behind "silence the phone at prayer time" — issue #60.
 *
 * JS hands over the next few days of windows (`setWindows`), each a
 * `[start, end)` in epoch ms with the words to print while it is on.
 * Everything after that happens here, with the app closed: an exact
 * alarm at the next window's start turns the quiet on, one at its end
 * turns it off, and a boot or a clock change re-reads the list and
 * re-arms. The list is the whole state; a receiver never has to guess.
 *
 * ── A RULE OF OUR OWN, NOT THE PHONE'S SWITCH ─────────────────────────
 *
 * The quiet is an automatic Do Not Disturb rule owned by this app — it
 * shows in the phone's Do Not Disturb settings as "Mihrab · prayer" —
 * and all this code ever does is set that rule's state. Two reasons:
 *
 *   • Ending our quiet must not end the person's own. Somebody who put
 *     the phone on Do Not Disturb for a meeting and then walks into
 *     ʿAṣr keeps their meeting when ʿAṣr's window closes. With a rule,
 *     the two are separate; with the global switch they are one thing.
 *   • What still gets through — alarms, starred contacts, repeat callers
 *     — is the person's choice, made once in system settings for our
 *     rule, rather than a policy this app would have to invent.
 *
 * A rule with no condition provider needs Android 10 (API 29). Below
 * that the interruption filter is set directly, and restored only if it
 * is still ours at the end.
 *
 * ── THE NOTIFICATION ──────────────────────────────────────────────────
 *
 * While a window is on there is a quiet, ongoing notification saying so
 * and until when, with one action: end it now. A phone that has gone
 * silent by itself with nothing on screen to say why is a phone whose
 * owner turns the feature off.
 */
object PrayerSilence {
  private const val TAG = "PrayerSilence"
  private const val PREFS = "prayer_silence"
  private const val KEY_WINDOWS = "windows"
  private const val KEY_END_LABEL = "end_label"
  private const val KEY_CHANNEL_NAME = "channel_name"
  private const val KEY_RULE_ID = "rule_id"
  private const val KEY_ACTIVE_UNTIL = "active_until"
  private const val KEY_LEGACY_FILTER = "legacy_filter"

  const val ACTION_START = "com.prayer_times.silence.START"
  const val ACTION_END = "com.prayer_times.silence.END"
  const val ACTION_END_NOW = "com.prayer_times.silence.END_NOW"
  const val ACTION_RESCHEDULE = "com.prayer_times.silence.RESCHEDULE"

  private const val REQUEST_START = 7601
  private const val REQUEST_END = 7602
  private const val REQUEST_END_NOW = 7603
  private const val REQUEST_OPEN = 7604
  private const val NOTIFICATION_ID = 7605
  private const val CHANNEL_ID = "prayer_silence"
  private const val RULE_NAME = "Mihrab · prayer"
  private val CONDITION_ID: Uri = Uri.parse("condition://com.prayer_times/prayer-silence")

  data class Window(val start: Long, val end: Long, val title: String, val text: String)

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // ── The list ────────────────────────────────────────────────────────

  fun loadWindows(ctx: Context): List<Window> {
    val raw = prefs(ctx).getString(KEY_WINDOWS, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        Window(o.getLong("start"), o.getLong("end"), o.optString("title"), o.optString("text"))
      }
    } catch (t: Throwable) {
      Log.w(TAG, "windows unreadable, dropping", t)
      emptyList()
    }
  }

  fun saveWindows(ctx: Context, windows: List<Window>, endLabel: String, channelName: String) {
    val arr = JSONArray()
    for (w in windows) {
      arr.put(
        JSONObject().put("start", w.start).put("end", w.end).put("title", w.title).put("text", w.text)
      )
    }
    prefs(ctx).edit()
      .putString(KEY_WINDOWS, arr.toString())
      .putString(KEY_END_LABEL, endLabel)
      .putString(KEY_CHANNEL_NAME, channelName)
      .apply()
    reschedule(ctx)
  }

  fun clear(ctx: Context) {
    prefs(ctx).edit().remove(KEY_WINDOWS).apply()
    reschedule(ctx)
  }

  fun hasAccess(ctx: Context): Boolean {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return nm.isNotificationPolicyAccessGranted
  }

  fun isActive(ctx: Context): Boolean = prefs(ctx).getLong(KEY_ACTIVE_UNTIL, 0L) > System.currentTimeMillis()

  // ── The clock ───────────────────────────────────────────────────────

  /**
   * Put the world in the state the list says it should be in right now,
   * and arm the alarm for the next change. Idempotent: called from JS
   * after every rewrite, from every alarm, and after a boot.
   */
  fun reschedule(ctx: Context) {
    // A second of grace: an exact alarm can land a few milliseconds
    // before the instant it was set for, and a window whose end is
    // still 3 ms away would otherwise be begun all over again.
    val now = System.currentTimeMillis() + 1_000L
    val windows = loadWindows(ctx).sortedBy { it.start }
    val current = windows.firstOrNull { it.start <= now && now < it.end }
    val next = windows.firstOrNull { it.start > now }
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val activeUntil = prefs(ctx).getLong(KEY_ACTIVE_UNTIL, 0L)

    if (current != null) {
      // "Ended early" is remembered as the window's end moved to now, so a
      // reschedule inside the same window does not switch it back on.
      if (activeUntil == -current.end) {
        arm(ctx, am, REQUEST_START, ACTION_START, next?.start)
        return
      }
      begin(ctx, current)
      arm(ctx, am, REQUEST_END, ACTION_END, current.end)
      arm(ctx, am, REQUEST_START, ACTION_START, next?.start)
      return
    }
    if (activeUntil > 0L) end(ctx)
    arm(ctx, am, REQUEST_END, ACTION_END, null)
    arm(ctx, am, REQUEST_START, ACTION_START, next?.start)
  }

  /** End the window that is on, and keep it ended for the rest of it. */
  fun endNow(ctx: Context) {
    val now = System.currentTimeMillis() + 1_000L
    val current = loadWindows(ctx).firstOrNull { it.start <= now && now < it.end }
    end(ctx)
    if (current != null) prefs(ctx).edit().putLong(KEY_ACTIVE_UNTIL, -current.end).apply()
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    arm(ctx, am, REQUEST_END, ACTION_END, null)
  }

  private fun arm(ctx: Context, am: AlarmManager, request: Int, action: String, at: Long?) {
    val pi = PendingIntent.getBroadcast(
      ctx,
      request,
      Intent(ctx, PrayerSilenceReceiver::class.java).setAction(action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    am.cancel(pi)
    if (at == null) return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      } else {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "could not arm $action", t)
    }
  }

  // ── On and off ──────────────────────────────────────────────────────

  private fun begin(ctx: Context, w: Window) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!nm.isNotificationPolicyAccessGranted) {
      Log.i(TAG, "no policy access; window not applied")
      return
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val id = ensureRule(ctx, nm)
        nm.setAutomaticZenRuleState(id, Condition(CONDITION_ID, w.title, Condition.STATE_TRUE))
      } else {
        val before = nm.currentInterruptionFilter
        if (before != NotificationManager.INTERRUPTION_FILTER_PRIORITY) {
          prefs(ctx).edit().putInt(KEY_LEGACY_FILTER, before).apply()
          nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "could not turn the quiet on", t)
      return
    }
    prefs(ctx).edit().putLong(KEY_ACTIVE_UNTIL, w.end).apply()
    postNotification(ctx, nm, w)
  }

  private fun end(ctx: Context) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val id = prefs(ctx).getString(KEY_RULE_ID, null)
        if (id != null && nm.isNotificationPolicyAccessGranted && nm.getAutomaticZenRule(id) != null) {
          nm.setAutomaticZenRuleState(id, Condition(CONDITION_ID, "", Condition.STATE_FALSE))
        }
      } else if (nm.isNotificationPolicyAccessGranted) {
        // Only if it is still ours: a person who turned Do Not Disturb on
        // by hand in the meantime keeps it.
        val legacy = prefs(ctx).getInt(KEY_LEGACY_FILTER, -1)
        if (legacy >= 0 && nm.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_PRIORITY) {
          nm.setInterruptionFilter(legacy)
        }
        prefs(ctx).edit().remove(KEY_LEGACY_FILTER).apply()
      }
    } catch (t: Throwable) {
      Log.w(TAG, "could not turn the quiet off", t)
    }
    prefs(ctx).edit().remove(KEY_ACTIVE_UNTIL).apply()
    nm.cancel(NOTIFICATION_ID)
  }

  /** The app's rule, created on first use and re-created if the person deleted it. */
  private fun ensureRule(ctx: Context, nm: NotificationManager): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw IllegalStateException("no rules below Q")
    val stored = prefs(ctx).getString(KEY_RULE_ID, null)
    if (stored != null && nm.getAutomaticZenRule(stored) != null) return stored
    val rule = AutomaticZenRule(
      RULE_NAME,
      null,
      ComponentName(ctx, MainActivity::class.java),
      CONDITION_ID,
      null,
      NotificationManager.INTERRUPTION_FILTER_PRIORITY,
      true,
    )
    val id = nm.addAutomaticZenRule(rule)
    prefs(ctx).edit().putString(KEY_RULE_ID, id).apply()
    return id
  }

  private fun postNotification(ctx: Context, nm: NotificationManager, w: Window) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) !=
      android.content.pm.PackageManager.PERMISSION_GRANTED
    ) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val name = prefs(ctx).getString(KEY_CHANNEL_NAME, null) ?: "Prayer time silence"
      val channel = NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW).apply {
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      }
      nm.createNotificationChannel(channel)
    }
    val endLabel = prefs(ctx).getString(KEY_END_LABEL, null) ?: "End now"
    val endPi = PendingIntent.getBroadcast(
      ctx,
      REQUEST_END_NOW,
      Intent(ctx, PrayerSilenceReceiver::class.java).setAction(ACTION_END_NOW),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    val openPi = if (launch != null) {
      PendingIntent.getActivity(
        ctx, REQUEST_OPEN, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    } else null
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(ctx, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(ctx).setPriority(Notification.PRIORITY_LOW)
    }
    builder
      .setSmallIcon(R.drawable.ic_stat_prayer)
      .setContentTitle(w.title)
      .setContentText(w.text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_STATUS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, endLabel, endPi).build())
    if (openPi != null) builder.setContentIntent(openPi)
    nm.notify(NOTIFICATION_ID, builder.build())
  }
}
