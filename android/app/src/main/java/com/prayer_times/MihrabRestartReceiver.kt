package com.prayer_times

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Restarts the Live Activity foreground service after an app update or
 * device reboot, so the user doesn't need to open the app to get the
 * notification back.
 *
 * Handles two intents:
 *
 *   MY_PACKAGE_REPLACED — fired immediately after this app's APK is
 *     replaced during an OTA update. The old process has already been
 *     killed; this receiver runs in the freshly-installed process.
 *
 *   BOOT_COMPLETED — fired after a full device boot. All foreground
 *     services are dead; we revive the Live Activity if it was active
 *     before the shutdown.
 *
 * Both cases read the payload that was persisted to SharedPreferences by
 * MihrabLiveActivityModule.display() and restart the service with it.
 * If the user had explicitly cancelled (MihrabLiveActivityModule.cancel()
 * clears the prefs), this receiver is a no-op.
 *
 * The RECEIVE_BOOT_COMPLETED permission is already declared in the
 * manifest (added for the widget receivers). MY_PACKAGE_REPLACED does
 * not require a special permission.
 */
class MihrabRestartReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_MY_PACKAGE_REPLACED &&
        action != Intent.ACTION_BOOT_COMPLETED) return

    val payload = MihrabLiveActivityModule.loadPayload(context)
    if (payload.isNullOrEmpty()) {
      Log.i(TAG, "$action — no persisted payload, skipping restart")
      return
    }

    Log.i(TAG, "$action — restarting Live Activity service")
    MihrabLiveActivityModule.ensureChannelExists(context)
    MihrabLiveActivityModule.ensureFgsChannelExists(context)
    val serviceIntent = Intent(context, MihrabLiveActivityService::class.java).apply {
      putExtra(MihrabLiveActivityService.EXTRA_PAYLOAD, payload)
    }
    try {
      ContextCompat.startForegroundService(context, serviceIntent)
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to restart Live Activity service after $action", t)
    }
  }

  companion object {
    const val TAG = "MihrabRestartReceiver"
  }
}
