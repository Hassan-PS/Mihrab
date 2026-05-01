package com.prayer_times

import android.content.res.Configuration
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.google.android.material.color.DynamicColors

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "PrayerApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Re-apply Material3 DynamicColors when night mode changes.
   *
   * android:configChanges="uiMode" prevents Activity recreation on dark/light toggle, which
   * means the DynamicColorsContextWrapper created at onActivityPreCreated in MainApplication
   * would otherwise hold stale (light-mode) theme resources after a system dark-mode switch.
   * Re-calling applyIfAvailable here re-applies the dynamic color overlay against the updated
   * Configuration so that PlatformColor(?attr/...) attributes resolve correctly on the next
   * Fabric render pass.
   */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // Explicit SAM constructor avoids trailing-lambda overload resolution ambiguity
    // in older Kotlin toolchains (e.g. F-Droid CI) that do not infer the Precondition
    // SAM type from the trailing lambda form.
    DynamicColors.applyIfAvailable(this, DynamicColors.Precondition { _, _ -> true })
  }
}
