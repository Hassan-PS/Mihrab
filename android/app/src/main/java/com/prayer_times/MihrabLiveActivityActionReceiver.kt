package com.prayer_times

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Handles the "Mute next adhan" toggle action on the Live Activity (Android 17+).
 *
 * The Live Activity is a native Notification.Builder (not notifee), so its
 * action button fires a broadcast here. We split responsibility:
 *
 *   • Native owns the BUTTON STATE — the muted-prayer epoch is stored in the
 *     Live Activity SharedPreferences and read back by the notification builder
 *     to choose the "Mute" vs "Unmute" label. This makes the label flip
 *     instantly and reliably, even with no JS runtime alive.
 *
 *   • JS owns the ACTUAL MUTE — the adhan is an OS-played notification-channel
 *     sound baked into a pre-scheduled notifee trigger, so silencing it means
 *     re-creating that trigger on a silent channel. That's JS work, dispatched
 *     to [AdhanMuteHeadlessService] (a HeadlessJS task) which runs even when the
 *     app is closed. The task also persists the mute so a later full resync
 *     keeps the prayer silent.
 *
 * The two are independent: if the JS side fails, the button still toggles and
 * the Live Activity itself is never affected.
 */
class MihrabLiveActivityActionReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    if (intent.action != ACTION_TOGGLE_MUTE_NEXT) return
    val epoch = intent.getLongExtra(EXTRA_EPOCH, 0L)
    val name = intent.getStringExtra(EXTRA_NAME) ?: ""
    if (epoch <= 0L) return

    val prefs = ctx.getSharedPreferences(
      MihrabLiveActivityModule.PREFS_NAME, Context.MODE_PRIVATE,
    )
    val currentlyMuted = prefs.getLong(KEY_MUTED_EPOCH, -1L) == epoch
    val nowMuted = !currentlyMuted
    prefs.edit().putLong(KEY_MUTED_EPOCH, if (nowMuted) epoch else -1L).apply()
    Log.i(TAG, "toggle mute next adhan: epoch=$epoch name=$name -> muted=$nowMuted")

    val payloadJson = MihrabLiveActivityModule.loadPayload(ctx)
    val payload = runCatching { payloadJson?.let { JSONObject(it) } }.getOrNull()

    // 1) Re-post the Live Activity immediately so the button label flips now.
    runCatching {
      if (payload != null) {
        val notif = MihrabLiveActivityModule.buildNotificationFromPayload(ctx, payload)
        NotificationManagerCompat.from(ctx).notify(MihrabLiveActivityModule.NOTIF_ID, notif)
      }
    }.onFailure { Log.w(TAG, "re-post after toggle failed", it) }

    // 2) Apply the real (un)mute in JS via a HeadlessJS task. The button tap is
    //    a user interaction, which grants the brief background start allowance
    //    the service needs. Reschedule data comes from the persisted payload.
    runCatching {
      val svc = Intent(ctx, AdhanMuteHeadlessService::class.java).apply {
        putExtra(EXTRA_EPOCH, epoch)
        putExtra(EXTRA_NAME, name)
        putExtra(EXTRA_MUTED, nowMuted)
        putExtra("title", payload?.optString("nextLabel", name) ?: name)
        putExtra("body", payload?.optString("atPrayerBody", "") ?: "")
        putExtra("adhanChannelId", payload?.optString("adhanChannelId", "") ?: "")
        putExtra("adhanSoundId", payload?.optString("adhanSoundId", "default") ?: "default")
        putExtra(
          "defaultChannelId",
          payload?.optString("defaultChannelId", "prayer-times-default")
            ?: "prayer-times-default",
        )
      }
      ctx.startService(svc)
      HeadlessReschedule.acquire(ctx)
    }.onFailure { Log.w(TAG, "headless mute dispatch failed", it) }
  }

  companion object {
    const val TAG = "MihrabLAAction"
    const val ACTION_TOGGLE_MUTE_NEXT = "com.prayer_times.ACTION_TOGGLE_MUTE_NEXT"
    const val EXTRA_EPOCH = "epoch"
    const val EXTRA_NAME = "name"
    const val EXTRA_MUTED = "muted"
    /** SharedPreferences key (in MihrabLiveActivityModule.PREFS_NAME) holding the
     *  epoch of the prayer whose next adhan is muted, or -1 when none. */
    const val KEY_MUTED_EPOCH = "muted_next_epoch"
  }
}

/** Tiny wakelock holder so the HeadlessJS service has time to spin up. */
object HeadlessReschedule {
  fun acquire(ctx: Context) {
    runCatching { com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(ctx) }
  }
}
