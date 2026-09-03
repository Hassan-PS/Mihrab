package com.prayer_times

import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.TypedValue
import androidx.core.view.WindowCompat
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

  /**
   * Make the system navigation bar follow the app's selected theme.
   *
   * Under the targetSdk-36 enforced edge-to-edge mode the navigation-bar
   * *background* is transparent and the OS draws an adaptive scrim, so the
   * only lever we control is the icon appearance: light icons on dark
   * themes, dark icons on light themes. We flip
   * `isAppearanceLightNavigationBars` (true ⇒ dark icons for a light bar)
   * via the AndroidX inset controller so the back/home/recents glyphs —
   * and the 3-button scrim — match the in-app palette, not just the OS
   * dark/light setting. Must run on the UI thread.
   *
   * It also makes the navigation bar fully see-through so the app content
   * flows underneath it (integrated, edge-to-edge look):
   *  • decor draws behind the system bars (setDecorFitsSystemWindows=false);
   *  • the nav-bar background is transparent;
   *  • the OS contrast scrim behind the 3-button bar is disabled
   *    (isNavigationBarContrastEnforced=false) so the buttons sit directly
   *    over the app's own background instead of a grey band.
   * The app's per-screen bottom insets keep interactive content above the
   * buttons; only the background shows through.
   */
  @ReactMethod
  fun setNavigationBarStyle(isDark: Boolean) {
    val activity = getCurrentActivity() ?: return
    activity.runOnUiThread {
      val window = activity.window ?: return@runOnUiThread
      // Android 15+ (API 35) ENFORCES edge-to-edge: the system bars are
      // already transparent and the OS draws its own adaptive scrim, so the
      // window color/contrast/decor setters below are deprecated no-ops that
      // only trip Play Console's "deprecated edge-to-edge API" check. Touch
      // them only on older versions where they still have a visible effect.
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
        @Suppress("DEPRECATION")
        WindowCompat.setDecorFitsSystemWindows(window, false)
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.TRANSPARENT
      }
      /**
       * THE CONTRAST SCRIM IS TURNED OFF ON EVERY VERSION, and the earlier
       * reading of this was wrong in an instructive way.
       *
       * It was believed above API 35 that the band behind three-button
       * navigation was the platform's adaptive scrim and no longer ours:
       * measured on API 36, rgb(30,32,37) over app content of
       * rgb(13,14,18), unchanged by this setter. But the app was ALSO
       * painting `android:navigationBarBackground` with the opaque
       * `android:navigationBarColor` Theme.Material3 hands out, and that
       * band is what the measurement was of. With the theme's colour now
       * transparent (`styles.xml`) the scrim is the only thing left over
       * the app's own band, and it is worth asking for it to go — a
       * fullscreen muṣḥaf page must reach the bottom of the window, not
       * nearly reach it.
       *
       * React Native's `enableEdgeToEdge` asks for the scrim, so this has
       * to be re-applied after it: `setNavigationBarStyle` runs on every
       * theme change and on every return to the foreground.
       */
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        @Suppress("DEPRECATION")
        window.isNavigationBarContrastEnforced = false
      }
      // Icon appearance (light/dark nav-bar glyphs) is NOT deprecated and is
      // the only lever under enforced edge-to-edge — always apply it.
      val controller = WindowCompat.getInsetsController(window, window.decorView)
      controller.isAppearanceLightNavigationBars = !isDark
    }
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

  /**
   * The system light/dark scheme, from the closest source that has it.
   *
   * React Native's own `Appearance.getColorScheme()` reads the configuration
   * off the APPLICATION context. This app declares
   * `android:configChanges="uiMode"`, so a theme change is delivered to the
   * Activity and nothing recreates it — there is no guarantee the
   * application's configuration is refreshed in step, and a scheduled
   * dark-theme flip that lands while the app is backgrounded can leave it
   * reporting yesterday's answer indefinitely. That is an app stuck in dark
   * on a light phone, with no way back short of killing it.
   *
   * So prefer, in order: the night bit Android handed to
   * `onConfigurationChanged` (the one value it guarantees is current — see
   * `MainActivity`), then the current Activity's configuration, then the
   * React context's. `null` means we genuinely have nothing better than
   * React Native's own answer, and the JS side falls back to it.
   */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getColorScheme(): String? {
    val night = lastKnownNightMode
        ?: getCurrentActivity()?.resources?.configuration?.uiMode
        ?: reactContext.resources?.configuration?.uiMode
        ?: return null
    return when (night and Configuration.UI_MODE_NIGHT_MASK) {
      Configuration.UI_MODE_NIGHT_YES -> "dark"
      Configuration.UI_MODE_NIGHT_NO -> "light"
      else -> null
    }
  }

  /**
   * Is the system using BUTTON navigation rather than gestures?
   *
   * The floating tab bar needs to know the difference, and it cannot get it
   * from the inset. Measured on Android 14 in three-button mode: the
   * navigation bar is **24dp** — the platform's own `navigationBars()` inset
   * says so too, so this is not `react-native-safe-area-context` getting it
   * wrong, which was the first suspicion. Twenty-four dp is also exactly
   * what a gesture strip reports, so at that height the height is not
   * information: the bar tucked itself into what it took for a home
   * indicator and landed underneath the back/home/recents glyphs.
   *
   * `Settings.Secure.navigation_mode` is the system's own answer: 0 is
   * three-button, 1 the old two-button, 2 gestures. `null` means the setting
   * was unreadable, and the caller falls back to judging by height.
   */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun isButtonNavigation(): Boolean? {
    val resolver = reactContext.contentResolver ?: return null
    val mode = Settings.Secure.getInt(resolver, NAVIGATION_MODE, -1)
    return when (mode) {
      0, 1 -> true
      2 -> false
      else -> null
    }
  }

  /**
   * How tall the button navigation bar actually DRAWS, in dp — which is not
   * what it reports as an inset.
   *
   * Android 14, three-button navigation, measured on the emulator after a
   * clean reboot: the `NavigationBar0` window is `fillx126` — 126px, 48dp —
   * and it hands apps `navigationBars insetsSize bottom=63`, 24dp. Half the
   * bar it paints. The back/home/recents glyphs are centred in the window it
   * paints, so they run from 43px to 85px above the window's bottom edge:
   * the lower half sits in the inset, and the upper half is drawn over
   * whatever the app put there. That is the "buttons cutting into the app"
   * report, and no arithmetic on the inset can reach it, because the inset
   * is not wrong — it is deliberately smaller than the bar.
   *
   * The height it paints comes from the platform's own dimension, verified
   * against `framework-res.apk` on that image: `navigation_bar_frame_height`
   * → `navigation_bar_height` → 48dp → 126px at density 2.625, exactly the
   * window size. So read that.
   *
   * Zero when the system is NOT on button navigation, or when the resource
   * cannot be resolved. Deliberately zero for gestures even though the
   * gesture window is the same 48dp: a slim handle floating over a live page
   * is the point of edge-to-edge, and it has no glyphs to protect.
   */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun buttonNavigationHeight(): Double {
    if (isButtonNavigation() != true) return 0.0
    val res = reactContext.resources ?: return 0.0
    var id = res.getIdentifier(NAV_BAR_FRAME_HEIGHT, "dimen", "android")
    if (id == 0) id = res.getIdentifier(NAV_BAR_HEIGHT, "dimen", "android")
    if (id == 0) return 0.0
    val px = res.getDimensionPixelSize(id)
    if (px <= 0) return 0.0
    val density = res.displayMetrics?.density ?: return 0.0
    if (density <= 0f) return 0.0
    return px / density.toDouble()
  }

  companion object {
    const val NAME = "SystemTheme"
    private const val DEFAULT_ACCENT = "#22c55e"

    /**
     * Not in the public `Settings.Secure` constants, but stable since
     * Android 10 and what the system itself reads.
     */
    private const val NAVIGATION_MODE = "navigation_mode"

    /**
     * Platform dimensions, resolved by name because they are not public
     * API. `navigation_bar_frame_height` is the window the bar paints into;
     * `navigation_bar_height` is what it points at on every image checked,
     * and the fallback if the first name ever goes away.
     */
    private const val NAV_BAR_FRAME_HEIGHT = "navigation_bar_frame_height"
    private const val NAV_BAR_HEIGHT = "navigation_bar_height"

    /**
     * The `uiMode` from the most recent `onConfigurationChanged`, which is
     * the freshest value in the process. Written by `MainActivity`; null
     * until the first theme change of this launch, at which point the
     * Activity's own configuration is the next best thing.
     */
    @Volatile
    @JvmStatic
    var lastKnownNightMode: Int? = null
  }
}
