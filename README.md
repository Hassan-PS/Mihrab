# Prayer Times

A small **React Native** app for **daily Islamic prayer times**, **Qibla**, and a **home-screen widget** — with GPS or manual location, several calculation sources, and a clear month view.

[![Latest release](https://img.shields.io/github/v/release/Hassan-PS/PrayerApp?label=version&logo=github)](https://github.com/Hassan-PS/PrayerApp/releases)

## Get the app

| Channel | Link |
|--------|------|
| **GitHub Releases** | [Latest APK](https://github.com/Hassan-PS/PrayerApp/releases/latest) (direct install on Android) |
| **Google Play** | Uploads use the release **AAB** from maintainers; check the store for the listing when published. |
| **F-Droid** | Build the `fdroid` flavor (see below); listing is added via [fdroiddata](https://gitlab.com/fdroid/fdroiddata) when published. |

Release notes and history: [CHANGELOG.md](CHANGELOG.md).

## License

Source code in this repository is licensed under the [Apache License 2.0](LICENSE).

## F-Droid build (third Android variant)

Android uses two **product flavors**:

- **`play`** — Google Play Billing for optional one-time tips; this is the default for `npm run android` (physical device script uses `playDebug`).
- **`fdroid`** — No Play Billing native code, no in-app donation section (F-Droid policy–friendly).

From the repo root after `npm install`:

```sh
npm run android:assembleFdroidRelease
```

Or: `cd android && ./gradlew assembleFdroidRelease`. Use `assemblePlayRelease` for store builds. To run the F-Droid variant on a device: `npm run android:fdroid`.

**Listing on f-droid.org** uses the separate **[fdroiddata](https://gitlab.com/fdroid/fdroiddata)** GitLab repo. This project includes a ready-to-copy recipe and MR template under **[`contrib/fdroid/`](contrib/fdroid/README.md)** (`com.prayer_times.yml`, `MERGE_REQUEST.md`). Optional store-style text lives in [`fastlane/metadata/android/en-US/`](fastlane/metadata/android/en-US/).

## What you get

- **Today’s times** on the home screen, with optional **alerts** for the five daily prayers.
- **Whole month** view for planning ahead.
- **Qibla** direction from the app bar (device sensors).
- **Home screen widget** (medium / large on iOS; Android widget with next-prayer highlight).
- **Location**: GPS or manual coordinates, with **place search** (Nominatim) where supported.
- **Sources**: configurable providers (e.g. AlAdhan, Sweden city list, others — see in-app settings).
- **Look & feel**: English, **Swedish**, and **Arabic** (with RTL layout); **System / Light / Dark** theme; optional **system colors** (including Material You on Android) and **pure black** for OLED; app and widget follow the same choices when system theme is used.
- **Privacy**: [Privacy policy](PRIVACY_POLICY.md) (EN / SV) for transparency and store listings.

## Repository & contributing

- **Security** (secrets, signing, reporting): [SECURITY.md](SECURITY.md).
- **Issues & ideas**: [GitHub Issues](https://github.com/Hassan-PS/PrayerApp/issues).
- **Contributors**: do not commit keystores, `keystore.properties`, API keys, or `.env` files with real values.

## For developers

This repo is the **source tree** for the shipped app (not a minimal template). To run from a clone you need a standard [React Native development environment](https://reactnative.dev/docs/set-up-your-environment).

```sh
npm install
npm start          # Metro
npm run android    # or: npm run ios (after CocoaPods: bundle exec pod install in ios/)
```

Useful scripts include `npm run generate-icons` (regenerates launcher icons from `assets/app-icon-source.png`). For deeper native work, use **Android Studio** / **Xcode** as usual. Android release builds must pick a flavor (`play` or `fdroid`); see **F-Droid build** above.

---

*Stack: React Native, TypeScript, native Android (Kotlin) and iOS (Swift) where needed for widgets and integrations.*
