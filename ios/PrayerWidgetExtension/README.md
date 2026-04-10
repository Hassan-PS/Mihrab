# iOS home screen widget (optional target)

The main app already writes prayer JSON to the **App Group** `group.com.prayerapp` and reloads timelines via `PrayerWidget.m`.

To show the widget on the home screen:

1. Open `ios/PrayerApp.xcworkspace` in Xcode.
2. **File → New → Target… → Widget Extension** (e.g. name `PrayerWidgetExtension`, include live activity off).
3. Delete the template Swift files Xcode creates, then **add** `PrayerWidgetExtension/PrayerWidgetExtension.swift` from this folder to the new target (check the extension target membership).
4. Select the **extension target → Signing & Capabilities → + App Groups** and enable `group.com.prayerapp` (must match the main app entitlements).
5. Set the extension **Deployment Target** to iOS 15.1 or match the main app.
6. Build and run the app once, then add the **Prayer times** widget from the widget gallery.

Android needs no extra steps: add the **PrayerApp** widget from the system widget picker after installing the app.
