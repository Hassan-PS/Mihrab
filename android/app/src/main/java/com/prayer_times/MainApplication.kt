package com.prayer_times

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.google.android.material.color.DynamicColors

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(PrayerWidgetPackage())
          add(PrayerBuildInfoPackage())
          add(AppVersionPackage())
          add(SystemThemePackage())
          if (BuildConfig.IAP_ENABLED) {
            addIapPackageIfPresent(this)
          }
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    DynamicColors.applyToActivitiesIfAvailable(this)
    loadReactNative(this)
  }

  private fun addIapPackageIfPresent(packages: MutableList<ReactPackage>) {
    try {
      val clazz = Class.forName("com.dooboolab.rniap.RNIapPackage")
      val ctor = clazz.getConstructor()
      val pkg = ctor.newInstance() as ReactPackage
      packages.add(pkg)
    } catch (_: Throwable) {
      // F-Droid and other builds omit the IAP native module.
    }
  }
}
