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
 * Why a foreground service (added in v2.1.0-beta.8): a plain
 * `NotificationManagerCompat.notify(...)` call posts a notification
 * that the system files under "Silent" on most ROMs and that doesn't
 * auto-tick — the progress bar only advances when the app is opened
 * and the React Native side re-posts. That's the wrong UX for a
 * countdown.
 *
 * Foreground services in Android (10+) get three things for free that
 * a regular notify() doesn't:
 *
 *   1. The notification renders in the **main "Notifications" section**
 *      of the shade — not in "Silent". (Foreground service notifications
 *      are excluded from silent by design — they signal "this is an
 *      ongoing user-visible activity".)
 *   2. The OS keeps the app process alive while the service is up, so
 *      our internal Handler can re-post the notification once a minute
 *      and the progress bar / chronometer actually progresses without
 *      anyone opening the app.
 *   3. Foreground-service notifications are the eligible candidate for
 *      Android 16's **status-bar Live Update chip** (`ProgressStyle` +
 *      `setShortCriticalText` + `setRequestPromotedOngoing`). Regular
 *      `notify()` calls are NOT promoted to the chip.
 *
 * This is the exact pattern Uber, Lyft, EasyPark, Google Maps Navigation,
 * Spotify, Strava, and most other "ongoing activity" apps use.
 *
 * Lifecycle:
 *  - JS toggles Live Activity ON  → MihrabLiveActivityModule.display(json)
 *      → ContextCompat.startForegroundService(...) with the payload as
 *        an Intent extra. The service builds the notification, calls
 *        startForeground(), and schedules its own ticker.
 *  - Every minute the ticker re-runs build() with the SAME payload so
 *    the progress bar advances (the bar's `progress` value is recomputed
 *    each tick from `prevEpochMs` / `nextEpochMs`).
 *  - JS pushes a fresh payload (e.g. when a prayer time passes) →
 *      service updates its cached payload and re-posts immediately.
 *  - JS toggles Live Activity OFF → MihrabLiveActivityModule.cancel()
 *      → context.stopService(serviceIntent), service onDestroy() cancels
 *        the ticker and removes the notification.
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
      // The JS bridge creates it too, but the service can run independent
      // of that path (system-restarted instance after OOM, etc.).
      MihrabLiveActivityModule.ensureChannelExists(this)
      val notif = build(payload)
      try {
        // Android 14+ requires the FGS type to match the manifest type.
        // specialUse covers our case.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          startForeground(
            MihrabLiveActivityModule.NOTIF_ID,
            notif,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
          )
        } else {
          startForeground(MihrabLiveActivityModule.NOTIF_ID, notif)
        }
        Log.i(TAG, "startForeground posted id=${MihrabLiveActivityModule.NOTIF_ID}")
      } catch (t: Throwable) {
        // Some shells refuse FGS posts when the app isn't in a privileged
        // state (Doze mode, background). Fall back to a plain notify so
        // the user still sees something.
        Log.w(TAG, "startForeground failed; falling back to notify()", t)
        runCatching {
          NotificationManagerCompat.from(this)
            .notify(MihrabLiveActivityModule.NOTIF_ID, notif)
        }
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
   *  bar is what needs a fresh post. */
  private fun scheduleTicker() {
    ticker?.let { handler.removeCallbacks(it) }
    ticker = Runnable {
      val payload = lastPayload
      if (payload != null) {
        try {
          val notif = build(payload)
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
      NotificationManagerCompat.from(this).cancel(MihrabLiveActivityModule.NOTIF_ID)
    }
    Log.i(TAG, "onDestroy — service stopped, notification cancelled")
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
