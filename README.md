# Prayer Times

<a href="https://apps.apple.com/us/app/prayer-salah-times-qibla/id6762085256">
  <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83&amp;releaseDate=1713052800" alt="Download on the App Store" height="50">
</a>
<a href="https://github.com/Hassan-PS/PrayerApp/releases/latest">
  <img src="https://raw.githubusercontent.com/rubenpgrady/get-it-on-github/refs/heads/main/get-it-on-github.png" alt="Get it on GitHub" height="50">
</a>

Simple React Native app for prayer times, Qibla, month view, and widget.

## Install

- **GitHub Releases (default)**: [Latest](https://github.com/Hassan-PS/PrayerApp/releases/latest) → `app-fdroid-release.apk`

## Build

```sh
npm install
npm start
```

### Android

```sh
npm run android:assembleFdroidRelease
npm run android:bundlePlayRelease
```

Outputs:
- F-Droid APK: `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`
- Play AAB: `android/app/build/outputs/bundle/playRelease/app-play-release.aab`

### iOS

```sh
npm run ios
```

Build and upload via Xcode Organizer for App Store/TestFlight.

## License

Apache-2.0 (`LICENSE`).
