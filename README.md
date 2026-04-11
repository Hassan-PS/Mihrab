# Prayer Times

A small **React Native** app for **daily Islamic prayer times**, **Qibla**, and a **home-screen widget** — with GPS or manual location, several calculation sources, and a clear month view.

[![Latest release](https://img.shields.io/github/v/release/Hassan-PS/PrayerApp?label=version&logo=github)](https://github.com/Hassan-PS/PrayerApp/releases)

## Get the app

| Channel | Link |
|--------|------|
| **GitHub Releases** | [Latest APK](https://github.com/Hassan-PS/PrayerApp/releases/latest) (direct install on Android) |
| **Google Play** | Uploads use the release **AAB** from maintainers; check the store for the listing when published. |

Release notes and history: [CHANGELOG.md](CHANGELOG.md).

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

Useful scripts include `npm run generate-icons` (regenerates launcher icons from `assets/app-icon-source.png`). For deeper native work, use **Android Studio** / **Xcode** as usual.

---

*Stack: React Native, TypeScript, native Android (Kotlin) and iOS (Swift) where needed for widgets and integrations.*
