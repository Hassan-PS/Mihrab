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

      // Step 1: start FGS with the minimal silent placeholder notification.
      // This satisfies Android's foreground-service requirement and keeps the
      // process alive for the per-minute ticker. The placeholder is posted via
      // startForeground(), so NMS adds FLAG_FOREGROUND_SERVICE to it — making
      // it ineligible for chip promotion (which is fine; it's just a keeplive).
      val fgsNotif = MihrabLiveActivityModule.buildFgsNotification(this)
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
