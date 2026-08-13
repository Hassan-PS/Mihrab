package com.prayer_times

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

/**
 * Exposes build-time distribution (e.g. `play` vs `fdroid`) to JavaScript so
 * the UI can omit proprietary store features on F-Droid builds.
 *
 * Also the package's first-install time, which the journal's backfill button
 * uses as the earliest day it may offer to fill in. The app cannot ask the
 * user when they installed it, and it must not guess: every day that button
 * fills becomes a claim in the user's own prayer record. Android is the only
 * platform that simply knows, so JS falls back to a stamp written on first
 * run where this is absent (see installDate.ts).
 */
class PrayerBuildInfoModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  override fun getConstants(): Map<String, Any> =
    mapOf(
      "distribution" to BuildConfig.FLAVOR,
      "firstInstallTime" to firstInstallTime(),
    )

  /** Epoch ms of the first install, or 0 when it cannot be read. Doubles as
   *  "unknown" on the JS side, which then uses its own stamp. */
  private fun firstInstallTime(): Double =
    try {
      val ctx = reactApplicationContext
      ctx.packageManager.getPackageInfo(ctx.packageName, 0).firstInstallTime.toDouble()
    } catch (_: Exception) {
      0.0
    }

  companion object {
    const val NAME = "PrayerBuildInfo"
  }
}
