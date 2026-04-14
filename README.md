# Prayer Times

A small **React Native** app for **daily Islamic prayer times**, **Qibla**, and a **home-screen widget** — with GPS or manual location, several calculation sources, and a clear month view.

[![Latest release](https://img.shields.io/github/v/release/Hassan-PS/PrayerApp?label=version&logo=github)](https://github.com/Hassan-PS/PrayerApp/releases)

## Get the app

| Channel | Link |
|--------|------|
| **GitHub Releases** | [Latest release](https://github.com/Hassan-PS/PrayerApp/releases/latest) — **`app-play-release.apk`** (Play flavor, optional tips), **`app-fdroid-release.apk`** (no billing), **`app-play-release.aab`** (upload to Google Play). Pushing a version tag **`v*`** runs [`.github/workflows/release-android.yml`](.github/workflows/release-android.yml) to build and **attach** those three files (GitHub’s source zip/tar are automatic extras). |
| **Google Play** | Install from the store when available; maintainers ship the **AAB** from the `play` flavor (`bundlePlayRelease`). |
| **F-Droid** | Recipe in [`contrib/fdroid/`](contrib/fdroid/README.md); [fdroiddata](https://gitlab.com/fdroid/fdroiddata) merge request when the listing is accepted. |

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
- **Home screen widget** (medium / large on iOS; Android widget with next-prayer highlight). On Android, **long-press the widget → settings** to adjust background strength and highlight color; that screen uses the system status bar and navigation areas correctly on current Android versions.
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

Useful scripts include `npm run generate-icons` (regenerates launcher icons from `assets/app-icon-source.png`). For deeper native work, use **Android Studio** / **Xcode** as usual.

**Android release artifacts** (from repo root after `npm install`):

```sh
npm run android:releaseAll
# or: cd android && ./gradlew assemblePlayRelease assembleFdroidRelease bundlePlayRelease
```

Outputs live under `android/app/build/outputs/` (`apk/play/release`, `apk/fdroid/release`, `bundle/playRelease`). Release builds must pick a flavor (`play` or `fdroid`); see **F-Droid build** above.

### Play signing (required)

Google Play accepts upload bundles signed with your **upload key** only. This project intentionally refuses to build `playRelease` with debug signing.

- Local: create `android/keystore.properties` (from `android/keystore.properties.example`) and place your keystore where `storeFile` points.
- GitHub Actions (`release-android.yml`) requires these repository secrets:
  - `ANDROID_UPLOAD_KEYSTORE_BASE64` (base64-encoded keystore file)
  - `ANDROID_UPLOAD_STORE_PASSWORD`
  - `ANDROID_UPLOAD_KEY_ALIAS`
  - `ANDROID_UPLOAD_KEY_PASSWORD`

Without those, Play release builds fail fast instead of producing an invalid `.aab`.

---

*Stack: React Native, TypeScript, native Android (Kotlin) and iOS (Swift) where needed for widgets and integrations.*
