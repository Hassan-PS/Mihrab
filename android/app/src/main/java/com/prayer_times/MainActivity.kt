package com.prayer_times

import android.app.Activity
import android.content.res.Configuration
import android.os.Bundle
import com.facebook.react.ReactApplication
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.appearance.AppearanceModule
import com.google.android.material.color.DynamicColors

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "PrayerApp"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * `null`, deliberately. Passing the real bundle crashes the app.
   *
   * Android saves the FragmentManager's state into `savedInstanceState`, and
   * react-native-screens puts a `ScreenStackFragment` per screen into that
   * manager. On restore, Android reinstantiates those fragments by
   * reflection — and `ScreenFragment.<init>` deliberately throws
   * `IllegalStateException: Screen fragments should never be restored`,
   * because a restored fragment has no Screen view to attach to and the
   * navigation state is JS's to rebuild, not Android's. The throw comes out
   * of `performLaunchActivity` as a FATAL EXCEPTION before any of our code
   * runs; there is nothing to catch it.
   *
   * Handing `super` a null bundle drops the fragment state, so Android
   * restores nothing and JS rebuilds the stack from its own persisted
   * navigation state, which is where it lives anyway. This is the library's
   * documented requirement (software-mansion/react-native-screens#17) and
   * is in the React Native template — we lost it somewhere and did not
   * notice, because the crash needs the activity to be RECREATED FROM
   * SAVED STATE, which never happens in a debug session:
   *
   *   - the process is killed in the background and the user returns to it
   *     from Recents or the launcher;
   *   - a configuration change outside the manifest's `configChanges` list
   *     — system language, font size, display size — recreates the activity;
   *   - "Don't keep activities" is on in developer options.
   *
   * Observed on a Pixel 10 Pro running 2.10.1 on 2026-08-26: relaunching a
   * live activity took the app down with exactly this stack.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Called when uiMode (dark/light) changes without an Activity restart because we declare
   * android:configChanges="uiMode" in the manifest.
   *
   * Two things must happen for the app to repaint correctly:
   *
   * 1. Material3 DynamicColors overlay must be re-applied so that PlatformColor(?attr/...)
   *    attributes resolve against the new dark/light theme on the next Fabric render pass.
   *
   * 2. React Native's AppearanceModule must emit an "appearanceChanged" event so that
   *    useColorScheme() fires in JS and all components re-render with the correct palette.
   *
   * The standard RN chain (super → ReactDelegate → AppearanceModule.onConfigurationChanged)
   * reads night mode via activity.resources.configuration.uiMode. On some Android versions
   * and OEM ROMs this value lags behind the newConfig parameter at the moment the call
   * arrives, so AppearanceModule sees no change and never emits the JS event.
   *
   * forceAppearanceUpdate() bypasses that by reading directly from newConfig — the value
   * Android guarantees is up-to-date — and force-emitting the correct scheme to JS.
   */
  override fun onConfigurationChanged(newConfig: Configuration) {
    // Record the night bit BEFORE anything else can read a staler copy.
    // `newConfig` is the only value Android guarantees is current here, and
    // `SystemThemeModule.getColorScheme()` hands it to JS so the app's
    // "System" theme cannot be left behind by a scheduled dark-mode flip.
    SystemThemeModule.lastKnownNightMode = newConfig.uiMode

    // Standard RN chain: updates resources, calls AppearanceModule (may use stale config
    // on some devices), and — if DynamicColors are active — invalidates PlatformColor cache.
    super.onConfigurationChanged(newConfig)

    // Re-apply Material3 dynamic color overlay for PlatformColor(?attr/...) resolution.
    //
    // We use an explicit anonymous-class instantiation rather than a Kotlin
    // SAM lambda. The trailing-lambda form `Precondition { _, _ -> true }`
    // breaks under Kotlin 2.2 (the F-Droid CI compiler) because
    // `DynamicColors.Precondition` is a plain Java interface, not a Kotlin
    // `fun interface`, and Kotlin 2.2 no longer auto-converts trailing
    // lambdas in that case — both candidate overloads are then rejected
    // with "None of the following candidates is applicable".
    DynamicColors.applyIfAvailable(this, AlwaysApplyPrecondition)

    // Belt-and-suspenders: emit from the definitively-correct newConfig so useColorScheme()
    // fires in JS even on devices where activity.resources.configuration is stale above.
    forceAppearanceUpdate(newConfig)
  }

  /**
   * Reads the night-mode bit directly from [newConfig] and emits the appearance change
   * to JS via AppearanceModule. Safe to call even when the standard chain already emitted
   * the same scheme — AppearanceModule will simply broadcast the same value again, which
   * React batches away without causing extra renders.
   */
  /**
   * Always-apply Precondition for [DynamicColors.applyIfAvailable].
   *
   * Defined as an `object` (singleton anonymous class) implementing the Java
   * SAM interface explicitly, so we are not relying on the Kotlin
   * trailing-lambda → Java SAM conversion. That conversion was tightened in
   * Kotlin 2.2 — and the F-Droid build VM ships Kotlin 2.2, so a trailing
   * lambda here failed CI overload resolution even though it compiled fine
   * locally on Mac with an older Kotlin. Singleton because we always want
   * the overlay re-applied; no per-activity state.
   */
  private object AlwaysApplyPrecondition : DynamicColors.Precondition {
    override fun shouldApplyDynamicColors(activity: Activity, themeResId: Int): Boolean =
        true
  }

  private fun forceAppearanceUpdate(newConfig: Configuration) {
    val reactContext = (application as? ReactApplication)
        ?.reactHost
        ?.currentReactContext
        ?: return
    val module = reactContext.getNativeModule(AppearanceModule::class.java) ?: return
    val isDark = (newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
    module.emitAppearanceChanged(if (isDark) "dark" else "light")
  }
}
