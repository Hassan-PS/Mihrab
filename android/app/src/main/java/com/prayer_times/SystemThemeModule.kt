package com.prayer_times

import android.content.Intent
import android.os.Process
import android.util.TypedValue
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.system.exitProcess

/**
 * Native helpers for system-theme behavior — task #112.
 *
 * Exposes two methods to JS:
 *
 *   • restartApp()           — finishes the current activity, fires
 *     a fresh launch intent, then System.exit's the process. Used
 *     after the Material You toggle so PlatformColor refs are torn
 *     down and re-resolved against the new theme.
 *
 *   • resolveAccentHex()      — reads `?attr/colorPrimary` from the
 *     current activity theme and returns it as a #RRGGBB string.
 *     SVG icons can't consume PlatformColor; this gives them a hex
 *     that matches the live system accent under Material You.
 */
class SystemThemeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun restartApp() {
    val activity = getCurrentActivity() ?: return
    val pm = reactContext.packageManager
    val intent = pm.getLaunchIntentForPackage(reactContext.packageName) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    activity.finishAffinity()
    reactContext.startActivity(intent)
    Process.killProcess(Process.myPid())
    exitProcess(0)
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun resolveAccentHex(): String {
    val activity = getCurrentActivity() ?: return DEFAULT_ACCENT
    val typedValue = TypedValue()
    val theme = activity.theme
    // Try the Material 3 colorPrimary (resolves the Material You /
    // dynamic color overlay applied by DynamicColors.applyToActivities)
    // first, then fall back to the platform colorPrimary, then
    // colorAccent for AppCompat themes.
    // android.R.attr.colorPrimary maps to colorPrimary in the active
    // theme. When DynamicColors.applyToActivities has been called this
    // is the Material You colorPrimary; otherwise it's the static brand
    // primary from the AppTheme.
    val resolved = theme.resolveAttribute(
        android.R.attr.colorPrimary,
        typedValue,
        true,
    )
    if (!resolved) return DEFAULT_ACCENT
    val color = typedValue.data
    val r = (color shr 16) and 0xFF
    val g = (color shr 8) and 0xFF
    val b = color and 0xFF
    return String.format("#%02X%02X%02X", r, g, b)
  }

  companion object {
    const val NAME = "SystemTheme"
    private const val DEFAULT_ACCENT = "#22c55e"
  }
}
