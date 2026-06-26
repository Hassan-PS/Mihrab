package com.prayer_times

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS "AdhanMuteToggle" headless task that re-creates the next prayer's
 * notifee trigger on a silent (or adhan) channel when the user toggles "Mute
 * next adhan" from the Live Activity. Works with the app closed.
 *
 * The task name MUST match AppRegistry.registerHeadlessTask('AdhanMuteToggle')
 * in index.js. `allowedInForeground = true` lets it run while the app is open
 * too (the user often taps the button from the lock screen with the app alive).
 */
class AdhanMuteHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras: Bundle = intent?.extras ?: Bundle()
    return HeadlessJsTaskConfig(
      "AdhanMuteToggle",
      Arguments.fromBundle(extras),
      30_000, // timeout (ms)
      true,   // allowedInForeground
    )
  }
}
