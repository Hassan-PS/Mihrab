# Prayer Times

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
