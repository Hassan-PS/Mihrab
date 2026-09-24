package com.prayer_times

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

/** `PrayerSilence` to JS — see `src/native/PrayerSilence.ts`. */
class PrayerSilenceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "PrayerSilence"

  @ReactMethod
  fun hasAccess(promise: Promise) {
    promise.resolve(PrayerSilence.hasAccess(reactContext))
  }

  /** The system's own screen: the app cannot grant this to itself. */
  @ReactMethod
  fun requestAccess(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // Land on this app's row rather than the list, where it exists.
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
      }
      (getCurrentActivity() ?: reactContext).startActivity(intent)
      promise.resolve(null)
    } catch (t: Throwable) {
      promise.reject("silence_settings", t.message, t)
    }
  }

  @ReactMethod
  fun setWindows(windows: ReadableArray, endLabel: String, channelName: String, promise: Promise) {
    try {
      val list = (0 until windows.size()).mapNotNull { i ->
        val m = windows.getMap(i) ?: return@mapNotNull null
        PrayerSilence.Window(
          m.getDouble("start").toLong(),
          m.getDouble("end").toLong(),
          m.getString("title") ?: "",
          m.getString("text") ?: "",
        )
      }
      PrayerSilence.saveWindows(reactContext, list, endLabel, channelName)
      promise.resolve(null)
    } catch (t: Throwable) {
      promise.reject("silence_windows", t.message, t)
    }
  }

  @ReactMethod
  fun clear(promise: Promise) {
    try {
      PrayerSilence.clear(reactContext)
      promise.resolve(null)
    } catch (t: Throwable) {
      promise.reject("silence_clear", t.message, t)
    }
  }

  @ReactMethod
  fun isActive(promise: Promise) {
    promise.resolve(PrayerSilence.isActive(reactContext))
  }
}
