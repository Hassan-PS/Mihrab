package com.prayer_times

import android.os.Build
import android.provider.Settings
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
      "deviceName" to deviceName(),
    )

  /**
   * What this device calls itself, for the paired list on someone else's
   * phone.
   *
   * `Settings.Global.DEVICE_NAME` is the name the user typed in Settings —
   * "Hassan's Pixel" rather than "Pixel 9" — and is the one worth showing.
   * It is empty on plenty of devices, so the Bluetooth name is tried next
   * (it is usually the same string) and the model last, which at least
   * distinguishes two phones in a household.
   *
   * A label only. The public key is the identity, and nothing keys off this.
   */
  private fun deviceName(): String {
    val resolver = reactApplicationContext.contentResolver
    val candidates = listOfNotNull(
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
        runCatching { Settings.Global.getString(resolver, Settings.Global.DEVICE_NAME) }.getOrNull()
      } else {
        null
      },
      runCatching { Settings.Secure.getString(resolver, "bluetooth_name") }.getOrNull(),
      Build.MODEL,
    )
    return candidates.firstOrNull { !it.isNullOrBlank() }?.trim() ?: "Android phone"
  }

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
