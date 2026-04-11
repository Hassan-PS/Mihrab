package com.prayer_times

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

/**
 * Exposes build-time distribution (e.g. `play` vs `fdroid`) to JavaScript so
 * the UI can omit proprietary store features on F-Droid builds.
 */
class PrayerBuildInfoModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  override fun getConstants(): Map<String, Any> =
    mapOf(
      "distribution" to BuildConfig.FLAVOR,
    )

  companion object {
    const val NAME = "PrayerBuildInfo"
  }
}
