package com.prayer_times

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PrayerWidgetModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun setData(json: String, promise: Promise) {
    try {
      reactContext
        .getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(PrayerWidgetProvider.PREFS_KEY, json)
        .apply()
      PrayerWidgetProvider.requestUpdate(reactContext)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_WIDGET", e.message, e)
    }
  }

  companion object {
    const val NAME = "PrayerWidget"
  }
}
