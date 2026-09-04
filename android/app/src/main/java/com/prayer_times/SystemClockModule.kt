package com.prayer_times

import android.text.format.DateFormat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Whether the device clock is set to 24-hour time — issue #18.
 *
 * `Settings.System.TIME_12_24` is the only source of truth on Android:
 * it is a system setting, independent of the locale, so ICU (and
 * therefore anything JavaScript can see through `Intl`) cannot answer
 * this. A German phone switched to 12-hour time shows 5:31 PM in the
 * clock app, and the app should agree.
 *
 * Exposed twice on purpose. The constant is there at startup with no
 * round trip, so the first frame is already right; `readIs24Hour()` is
 * called again when the app returns to the foreground, because the
 * user may have gone to Settings precisely to change this.
 *
 * The two have DIFFERENT names, and that is not cosmetic. Under the New
 * Architecture's interop layer a name that is a method is a method, and
 * a constant of the same name is unreachable; under the legacy bridge
 * the constants are `Object.assign`ed over the module and the method is
 * the one that vanishes. One name for both means one of the two halves
 * is dead in every mode — and the first cut shipped exactly that, with
 * `auto` starting as 24-hour on every cold start and flipping a frame
 * later once the promise came back.
 */
class SystemClockModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  private fun read(): Boolean = DateFormat.is24HourFormat(reactContext)

  override fun getConstants(): Map<String, Any> = mapOf("is24Hour" to read())

  @ReactMethod
  fun readIs24Hour(promise: Promise) {
    promise.resolve(read())
  }

  companion object {
    const val NAME = "SystemClock"
  }
}
