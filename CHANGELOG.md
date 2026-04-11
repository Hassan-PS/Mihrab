# Changelog

All notable changes to this project are documented here. The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.0] — 2026-04-11

### Added
- Optional **System colors** when the theme is set to System: platform semantic and dynamic colors (including Material You on Android) for the app and the home screen widget, with **Pure black (OLED)** still applied to backgrounds when enabled in dark mode.
- Widget appearance sync via native `setUiHints` when theme-related settings change (no need to reload prayer data first).

### Changed
- Android uses **Material 3** `DynamicColors` day/night theme so `PlatformColor` Material attributes resolve correctly.
- New launcher icon artwork; icon generator uses minimal zoom (1.0) for crop.
- HTTP `User-Agent` prefix updated to `PrayerTimes/1.3`.

### Release builds
- Android `versionName` **1.3**, `versionCode` **4** — release **AAB** for Google Play and **APK** for GitHub Releases.

[1.3.0]: https://github.com/Hassan-PS/PrayerApp/compare/v1.2.0...v1.3.0

## [1.2.0] — 2026-04-10

### Added
- In-app shortcut on Home for the full month view: calendar icon plus a clear label (translated: EN / SV / AR) so it is obvious that it opens prayer times for the whole month.
- `PRIVACY_POLICY.md` (Swedish and English) for store listings and transparency.

### Changed
- Settings control in the app bar uses a clearer cog-style icon instead of the previous shape that was easy to misread.
- On Home, the compass shortcut was removed from the row below the prayer times source; **Qibla** remains available from the top app bar next to Month and Settings.
- HTTP `User-Agent` for outbound requests (e.g. place search) updated to `PrayerTimes/1.2` to match the app version.

### Release builds
- Android `versionName` **1.2**, `versionCode` **3** — use the release **AAB** for Google Play and the **APK** for GitHub Releases or other distribution.

[1.2.0]: https://github.com/Hassan-PS/PrayerApp/compare/v1.1.0...v1.2.0
