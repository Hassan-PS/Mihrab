package com.prayer_times

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The alarms and the system broadcasts behind `PrayerSilence` — issue #60.
 *
 * START and END are the exact alarms for a window's two ends, END_NOW is
 * the notification's action, and everything else — a boot, an app
 * update, the clock or the time zone changing under us — is a reason to
 * re-read the list and put the phone in the state it says. All of them
 * end in `reschedule`, which is idempotent, so the receiver does not have
 * to know which it was to be right.
 */
class PrayerSilenceReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      PrayerSilence.ACTION_END_NOW -> PrayerSilence.endNow(context)
      else -> PrayerSilence.reschedule(context)
    }
  }
}
