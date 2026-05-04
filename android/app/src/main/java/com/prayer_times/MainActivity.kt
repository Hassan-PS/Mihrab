package com.prayer_times

import android.content.res.Configuration
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
    // Standard RN chain: updates resources, calls AppearanceModule (may use stale config
    // on some devices), and — if DynamicColors are active — invalidates PlatformColor cache.
    super.onConfigurationChanged(newConfig)

    // Re-apply Material3 dynamic color overlay for PlatformColor(?attr/...) resolution.
    // Explicit SAM constructor required for F-Droid's older Kotlin toolchain.
    DynamicColors.applyIfAvailable(this, DynamicColors.Precondition { _, _ -> true })

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
