package com.prayer_times

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = PrayerWidgetModule.NAME)
class PrayerWidgetModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun getAndroidWidgetAppearance(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
      if (!prefs.contains(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY)) {
        promise.resolve(null)
        return
      }
      val map = Arguments.createMap()
      map.putInt("opacity", prefs.getInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, 88))
      map.putString("highlightId", prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, "green"))
      map.putString("highlightHex", prefs.getString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, ""))
      map.putBoolean("highlightDynamic", prefs.getBoolean(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_DYNAMIC, false))
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("E_WIDGET_APPEARANCE_GET", e.message, e)
    }
  }

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

  @ReactMethod
  fun setAndroidWidgetAppearance(
    opacity: Int,
    highlightId: String,
    highlightHex: String?,
    highlightDynamic: Boolean,
    promise: Promise,
  ) {
    try {
      val o = opacity.coerceIn(0, 100)
      val hid = highlightId.trim().ifEmpty { "green" }
      val hex =
        highlightHex
          ?.trim()
          ?.takeIf { it.isNotEmpty() }
          ?: ""
      reactContext
        .getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putInt(PrayerWidgetProvider.PREFS_WIDGET_BG_OPACITY, o)
        .putString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_ID, hid)
        .putString(PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_HEX, hex)
        .putBoolean(
          PrayerWidgetProvider.PREFS_WIDGET_HIGHLIGHT_DYNAMIC,
          highlightDynamic,
        )
        .apply()
      PrayerWidgetProvider.requestUpdate(reactContext)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_WIDGET_APPEARANCE", e.message, e)
    }
  }

  @ReactMethod
  fun setUiHints(style: String, oledBackground: Boolean, promise: Promise) {
    try {
      reactContext
        .getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(PrayerWidgetProvider.PREFS_UI_STYLE_KEY, style)
        .putBoolean(PrayerWidgetProvider.PREFS_UI_OLED, oledBackground)
        .apply()
      PrayerWidgetProvider.requestUpdate(reactContext)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("E_WIDGET_UI", e.message, e)
    }
  }

  companion object {
    const val NAME = "PrayerWidget"
  }
}
