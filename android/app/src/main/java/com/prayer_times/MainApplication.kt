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
          add(MihrabLiveActivityPackage())
          add(MushafPageScalerPackage())
          add(MushafFontPackage())
          add(CustomAdhanPackage())
          add(SecureRandomPackage())
          add(MihrabClipboardPackage())
          add(SyncFolderPackage())
          add(ScanQrPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    DynamicColors.applyToActivitiesIfAvailable(this)
    loadReactNative(this)
  }
}
