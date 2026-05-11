package com.prayer_times

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Mihrab Live Activity foreground service.
 *
 * Why a foreground service: the OS keeps the app process alive while
 * the service is up, so our internal Handler can re-post the rich
 * notification once a minute and the progress bar actually advances
 * without anyone opening the app.
 *
 * Dual-notification architecture (v2.1.0-beta.10+):
 *
 *   Notification A — FGS placeholder (FGS_NOTIF_ID, mihrab_fgs_v1 channel,
 *     IMPORTANCE_MIN): posted via startForeground(). This satisfies
 *     Android's foreground-service requirement and keeps the process alive.
 *     It is intentionally silent and hidden — users never see it.
 *
 *   Notification B — rich chip notification (NOTIF_ID, mihrab_live_activity_v3
 *     channel, IMPORTANCE_HIGH): posted via regular notify(). Because it is
 *     NOT the FGS notification, NMS does NOT add FLAG_FOREGROUND_SERVICE to
 *     it, which means NMS CAN set FLAG_PROMOTED_ONGOING on it — making it
 *     eligible for the Android 16 status-bar Live Update chip.
 *
 * KEY INSIGHT (confirmed by inspecting EasyPark's live StatusBarNotification):
 *   FLAG_PROMOTED_ONGOING and FLAG_FOREGROUND_SERVICE are mutually exclusive.
 *   NMS only promotes regular notify() notifications to the chip — never FGS
 *   notifications. EasyPark's chip works because their parking notification is
 *   posted via notify(), not startForeground().
 *
 * Lifecycle:
 *  - JS toggles Live Activity ON  → MihrabLiveActivityModule.display(json)
 *      → ContextCompat.startForegroundService(...) with the payload as
 *        an Intent extra. The service calls startForeground() with the
 *        FGS placeholder, then notify() with the rich chip notification,
 *        then schedules its own per-minute ticker.
 *  - Every minute the ticker re-posts the rich notification (NOTIF_ID)
 *    via notify() so the progress bar advances (progress value is
 *    recomputed each tick from prevEpochMs / nextEpochMs).
 *  - JS pushes a fresh payload (e.g. when a prayer time passes) →
 *      service updates its cached payload and re-posts immediately.
 *  - JS toggles Live Activity OFF → MihrabLiveActivityModule.cancel()
 *      → context.stopService(serviceIntent), service onDestroy() cancels
 *        the ticker and removes both notifications.
 *
 * Foreground service type: `specialUse` (Android 14+ requires a type).
 * The manifest declares the property with subtype `prayerCountdown` so
 * the platform / Play Store has a documented justification.
 */
class MihrabLiveActivityService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private var ticker: Runnable? = null
  /** Most recent JSON payload pushed by JS. The ticker rebuilds the
   *  notification from this every minute. */
  @Volatile private var lastPayload: String? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val payload = intent?.getStringExtra(EXTRA_PAYLOAD)
    if (payload != null) {
      lastPayload = payload
      // Channel safety net — required on Android 8+ before startForeground.
      // The JS bridge creates them too, but the service can run independent
      // of that path (system-restarted instance after OOM, etc.).
      MihrabLiveActivityModule.ensureChannelExists(this)
      MihrabLiveActivityModule.ensureFgsChannelExists(this)

      // Step 1: start FGS with the minimal placeholder notification.
      // The IMPORTANCE_NONE channel suppresses it from the shade entirely.
      // Pass the localised fgsText from the JS payload so it uses the
      // app's selected language rather than the device locale.
      val fgsText = MihrabLiveActivityModule.fgsTextFromPayload(JSONObject(payload))
      val fgsNotif = MihrabLiveActivityModule.buildFgsNotification(this, fgsText)
      try {
        // Android 14+ requires the FGS type to match the manifest type.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          startForeground(
            MihrabLiveActivityModule.FGS_NOTIF_ID,
            fgsNotif,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
          )
        } else {
          startForeground(MihrabLiveActivityModule.FGS_NOTIF_ID, fgsNotif)
        }
        Log.i(TAG, "startForeground posted FGS placeholder id=${MihrabLiveActivityModule.FGS_NOTIF_ID}")
      } catch (t: Throwable) {
        Log.w(TAG, "startForeground failed", t)
      }

      // Step 2: post the rich chip notification via regular notify().
      // Because this is NOT posted via startForeground(), NMS does NOT add
      // FLAG_FOREGROUND_SERVICE — leaving it eligible for FLAG_PROMOTED_ONGOING
      // and therefore the Android 16 status-bar Live Update chip.
      try {
        val richNotif = build(payload)
        NotificationManagerCompat.from(this)
          .notify(MihrabLiveActivityModule.NOTIF_ID, richNotif)
        Log.i(TAG, "notify() posted rich chip notification id=${MihrabLiveActivityModule.NOTIF_ID}")
      } catch (t: Throwable) {
        Log.w(TAG, "notify() rich notification failed", t)
      }

      scheduleTicker()
    }
    // START_STICKY so the system restarts the service if the OS kills it
    // for memory. The last payload is replayed when re-started — the
    // service queries lastPayload, but a fresh start without intent
    // means the OS restarted us; we no-op and wait for JS to repost.
    return START_STICKY
  }

  /** Re-post the notification once a minute so the progress bar /
   *  chronometer advance. The Notification's own chronometer ticks
   *  every second on its own via setUsesChronometer(true); the progress
   *  bar is what needs a fresh post.
   *
   *  Auto-advance: if the current `nextEpochMs` has passed (i.e. the
   *  prayer time has been reached), the ticker advances to the next
   *  prayer in `rows[]` so the notification updates without the user
   *  needing to open the app. */
  private fun scheduleTicker() {
    ticker?.let { handler.removeCallbacks(it) }
    ticker = Runnable {
      val payload = lastPayload
      if (payload != null) {
        // Check whether the countdown has expired and we should advance
        // to the next prayer in the rows[] list.
        val advancedPayload = tryAdvanceToNextPrayer(payload)
        val currentPayload = if (advancedPayload != null) {
          lastPayload = advancedPayload
          // Also refresh the FGS placeholder text from the new payload.
          try {
            val fgsText = MihrabLiveActivityModule.fgsTextFromPayload(
              org.json.JSONObject(advancedPayload)
            )
            val fgsNotif = MihrabLiveActivityModule.buildFgsNotification(this, fgsText)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
              startForeground(
                MihrabLiveActivityModule.FGS_NOTIF_ID,
                fgsNotif,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
              )
            } else {
              startForeground(MihrabLiveActivityModule.FGS_NOTIF_ID, fgsNotif)
            }
          } catch (t: Throwable) {
            Log.w(TAG, "ticker FGS refresh failed", t)
          }
          advancedPayload
        } else {
          payload
        }
        try {
          val notif = build(currentPayload)
          NotificationManagerCompat.from(this)
            .notify(MihrabLiveActivityModule.NOTIF_ID, notif)
        } catch (t: Throwable) {
          Log.w(TAG, "ticker re-post failed", t)
        }
      }
      // Self-rescheduling tick — every 60 seconds. ProgressBar's max is
      // 1440 (minutes per day), so each tick advances the bar by exactly
      // one unit.
      val next = ticker
      if (next != null) handler.postDelayed(next, TICK_MS)
    }
    handler.postDelayed(ticker!!, TICK_MS)
  }

  /**
   * If `nextEpochMs` in the cached payload has passed, scan `rows[]` for
   * the next prayer that is in the future and return an updated payload
   * JSON string. Returns null when no advance is needed or when the
   * rows list is exhausted (after Isha — JS will re-sync on next open).
   */
  private fun tryAdvanceToNextPrayer(payload: String): String? {
    return try {
      val p = org.json.JSONObject(payload)
      val now = System.currentTimeMillis()
      val nextEpochMs = p.optLong("nextEpochMs", 0L)

      // Not yet time to advance — current prayer is still in the future.
      if (nextEpochMs > 0L && now < nextEpochMs) return null

      val rows = p.optJSONArray("rows") ?: return null
      val currentKey = p.optString("nextKey", "")

      // Collect rows into an ordered list.
      data class Row(val key: String, val name: String, val time: String)
      val rowList = mutableListOf<Row>()
      for (i in 0 until rows.length()) {
        val r = rows.getJSONObject(i)
        rowList.add(Row(r.optString("key"), r.optString("name"), r.optString("time")))
      }
      if (rowList.isEmpty()) return null

      // Inject sunriseRow into the ordered list right after Fajr so
      // that when currentKey="Sunrise" we can find it by key and select
      // Dhuhr as the next candidate. Without this, Sunrise is absent
      // from rowList, currentIdx=-1, and the fallback scans from Fajr —
      // finding it already in the past → +24h → tomorrow's Fajr (wrong).
      val sunriseObj = p.optJSONObject("sunriseRow")
      if (sunriseObj != null) {
        val srKey = sunriseObj.optString("key", "Sunrise")
        val srName = sunriseObj.optString("name", "Sunrise")
        val srTime = sunriseObj.optString("time", "")
        if (srTime.isNotEmpty()) {
          val fajrIdx = rowList.indexOfFirst { it.key.equals("Fajr", ignoreCase = true) }
          val insertAt = (if (fajrIdx >= 0) fajrIdx + 1 else 1).coerceAtMost(rowList.size)
          rowList.add(insertAt, Row(srKey, srName, srTime))
        }
      }

      // Start scanning from the row after the current one; wrap-around
      // is intentionally NOT supported here — after Isha there is nothing
      // in the list until tomorrow, so we leave the notification frozen
      // (JS will re-sync when the app is foregrounded tomorrow morning).
      val currentIdx = rowList.indexOfFirst { it.key == currentKey }
      val candidates = if (currentIdx >= 0) rowList.drop(currentIdx + 1) else rowList

      for (row in candidates) {
        val epochMs = parseHHMMToEpochMs(row.time, now)
        if (epochMs > now) {
          // Found the next prayer — build the updated payload.
          val updated = org.json.JSONObject(payload)
          updated.put("prevEpochMs", nextEpochMs)
          updated.put("nextEpochMs", epochMs)
          updated.put("nextKey", row.key)
          updated.put("nextLabel", row.name)
          updated.put("nextTime", row.time)
          updated.put("title", "${row.name} · ${row.time}")
          Log.i(TAG, "Auto-advance: $currentKey → ${row.key} @ ${row.time} (epoch=$epochMs)")
          return updated.toString()
        }
      }
      // No future row found today (e.g. post-Isha). Leave frozen.
      Log.i(TAG, "Auto-advance: no future row after $currentKey — freezing until JS resyncs")
      null
    } catch (t: Throwable) {
      Log.w(TAG, "tryAdvanceToNextPrayer failed", t)
      null
    }
  }

  /**
   * Parse an "HH:MM" string into a ms-since-epoch timestamp using
   * `referenceMs` as the base date. If the resolved time is in the past,
   * it is advanced by 24 hours to handle midnight roll-overs gracefully.
   */
  private fun parseHHMMToEpochMs(hhmm: String, referenceMs: Long): Long {
    val m = Regex("^(\\d{1,2}):(\\d{2})$").find(hhmm) ?: return 0L
    val h = m.groupValues[1].toInt()
    val min = m.groupValues[2].toInt()
    if (h !in 0..23 || min !in 0..59) return 0L
    val cal = java.util.Calendar.getInstance().apply {
      timeInMillis = referenceMs
      set(java.util.Calendar.HOUR_OF_DAY, h)
      set(java.util.Calendar.MINUTE, min)
      set(java.util.Calendar.SECOND, 0)
      set(java.util.Calendar.MILLISECOND, 0)
    }
    var t = cal.timeInMillis
    if (t <= referenceMs) t += 24L * 60L * 60L * 1000L
    return t
  }

  /** Build the notification fresh on each tick so the progress bar
   *  value reflects the current wall clock. Delegates to the module's
   *  static builder so the same code path is used as when JS posts
   *  the initial notification. */
  private fun build(payload: String): Notification {
    return MihrabLiveActivityModule.buildNotificationFromPayload(this, JSONObject(payload))
  }

  override fun onDestroy() {
    super.onDestroy()
    ticker?.let { handler.removeCallbacks(it) }
    ticker = null
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
    }
    runCatching {
      val nm = NotificationManagerCompat.from(this)
      nm.cancel(MihrabLiveActivityModule.NOTIF_ID)
      nm.cancel(MihrabLiveActivityModule.FGS_NOTIF_ID)
    }
    Log.i(TAG, "onDestroy — service stopped, both notifications cancelled")
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val TAG = "MihrabLiveActivitySvc"
    const val EXTRA_PAYLOAD = "payload"
    /** 60-second tick. Battery-friendly; the chronometer text inside
     *  the notification continues to tick every second on its own via
     *  the platform Chronometer view. */
    const val TICK_MS = 60_000L
  }
}
