<div align="center">
  <img src="assets/app-icon-source.png" alt="Prayer App Icon" width="150" style="border-radius: 20px;">
  
  # Prayer Salah Times & Qibla
  
  A simple, fast, and privacy-focused React Native app for daily prayer times, Qibla direction, monthly calendar, and home screen widgets.
  
  <a href="https://apps.apple.com/us/app/prayer-salah-times-qibla/id6762085256">
    <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us" alt="Download on the App Store" height="40">
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/Hassan-PS/PrayerApp/releases/latest">
    <img src="https://raw.githubusercontent.com/rubenpgrady/get-it-on-github/refs/heads/main/get-it-on-github.png" alt="Get it on GitHub" height="51">
  </a>
</div>

## Features

- **No Ads & Full Privacy**: Completely free of advertisements. No tracking, no data collection, and full transparency with open-source code.
- **Accurate Prayer Times**: Get prayer times for the day, or view the entire month up to a year in advance.
- **Offline First & Fast**: Uses on-device storage to cache data, reducing network requests so the app loads instantly and works offline.
- **Home Screen Widgets**: Beautiful, customizable widgets for iOS and Android to see the next prayer at a glance.
- **Qibla Compass**: Accurate Qibla direction using your device's sensors.
- **Adhan & Reminders**: Get notified with beautiful Adhan sounds and upcoming prayer reminders.
- **Customizable UI**: Personalize the interface settings to your liking.
- **Multi-Language Support**: Available in English, Arabic, Swedish, Bengali, Urdu, Hindi, French, Spanish, German, Turkish, Indonesian, Russian, and Chinese.

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
