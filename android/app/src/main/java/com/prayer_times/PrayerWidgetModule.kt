package com.prayer_times

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

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

  /**
   * Hand over every tap the Log Today widget has queued, and clear it.
   *
   * Returns a JSON string rather than a WritableArray so the JS side can run
   * it through the same `coerceLogQueue` it uses on anything else that
   * crosses a process boundary — a bridge array would arrive pre-shaped and
   * skip the validation, which is the wrong direction for something whose
   * contents end up in the journal.
   */
  @ReactMethod
  fun takeLogQueue(promise: Promise) {
    try {
      val entries = WidgetLogQueue.take(reactContext)
      promise.resolve(WidgetLogQueue.serialize(entries))
      // The ticks were being drawn from the queue; now the app owns them, so
      // the widget has to re-read or it would show them twice — once from
      // its own queue and once from the payload the app is about to push.
      PrayerWidgetProvider.requestUpdate(reactContext)
    } catch (e: Exception) {
      promise.reject("E_WIDGET_LOG_QUEUE", e.message, e)
    }
  }

  /**
   * The same hand-over for the Tasbih widget's queue.
   *
   * A separate call rather than one queue with a `kind` field: the two have
   * different rules — a log tap is a set member and a dhikr tap is a
   * sequence — and one string that two sets of rules both parse is a string
   * that will eventually be parsed by the wrong one.
   */
  @ReactMethod
  fun takeTasbihQueue(promise: Promise) {
    try {
      val entries = WidgetTasbihQueue.take(reactContext)
      promise.resolve(WidgetTasbihQueue.serialize(entries))
      // The count was being drawn by projecting the queue over the payload;
      // now the app owns those taps, so the widget has to re-read or it
      // would count them twice.
      PrayerWidgetTasbihProvider.requestUpdate(reactContext)
    } catch (e: Exception) {
      promise.reject("E_WIDGET_TASBIH_QUEUE", e.message, e)
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
      // Every widget kind reads the same payload, so every one of them has
      // to be told. A provider left out here is one that keeps yesterday's
      // numbers until something else happens to wake it.
      PrayerWidgetProvider.requestUpdate(reactContext)
      PrayerWidgetStreakProvider.requestUpdate(reactContext)
      PrayerWidgetReadingProvider.requestUpdate(reactContext)
      PrayerWidgetTasbihProvider.requestUpdate(reactContext)
      PrayerWidgetHijriProvider.requestUpdate(reactContext)
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
