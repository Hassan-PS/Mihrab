# Changelog

All notable changes to this project are documented here. The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.4.3] — 2026-04-12

### Added
- **iOS**: **WidgetKit extension** (`PrayerWidgetExtension`) embedded in the app — home screen widget matches Android (five prayers + next-prayer highlight) via App Group `group.com.prayerapp`.

### Changed
- **Portrait only**: iPhone/iPad app **portrait** orientation; Android `MainActivity` and widget configure activity use **`screenOrientation="portrait"`**.
- **System colors (Material You / dynamic palette)**: setting and palette path are **Android-only**. On **iOS**, System theme uses standard surfaces with **brand green** accents (same as Light/Dark accent behavior).
- HTTP `User-Agent` prefix **PrayerTimes/1.4.3**.

### Release builds
- Android `versionName` **1.4.3**, `versionCode` **17**.
- iOS `MARKETING_VERSION` **1.4.3**, `CURRENT_PROJECT_VERSION` **15**.

[1.4.3]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.2...v1.4.3

## [1.3.7] — 2026-04-11

### Added
- **Android `fdroid` product flavor**: no Google Play Billing; F-Droid–friendly build (`assembleFdroidRelease`). **`play` flavor** unchanged for store/GitHub APK with optional tips.
- **Apache-2.0** [`LICENSE`](LICENSE) at repo root; `package.json` `license` field set.

### Changed
- **Donations / IAP**: hidden on **`fdroid`** builds via native `PrayerBuildInfo` + JS gating (`TipIapBootstrap` and settings “support developer” section omitted).
- **Android**: hardware back from Settings, Compass, and month view returns to the home screen instead of exiting the app.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.7**.

### Release builds
- Android `versionName` **1.3.7**, `versionCode` **11** — **`play`** APK + **AAB** (Google Play), **`fdroid`** APK (F-Droid / sideload without billing).
- iOS `MARKETING_VERSION` **1.3.7**, `CURRENT_PROJECT_VERSION` **11** (build in Xcode for App Store / TestFlight).

[1.3.7]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.6...v1.3.7

## [1.3.6] — 2026-04-11

### Changed
- **App theme**: When **System colors** is off (or theme is not System), accents use the app’s **brand green** again; Material You / dynamic path unchanged when System + System colors are on.
- **Home screen widget**: **In-app Settings** again control widget options — Android **background strength**, **highlight** presets (green / teal / blue / amber) plus **custom `#RRGGBB`**, synced to the widget; **iOS** gets the same highlight options via the app group. Next-prayer row uses the **phone accent** only when Theme is **System** and **System colors** is on.
- **Android widget configure** (long-press → gear): **Custom color** field; “match phone accent” toggle removed (use app Theme → System colors).
- HTTP `User-Agent` prefix **PrayerTimes/1.3.6**.

### Release builds
- Android `versionName` **1.3.6**, `versionCode` **10** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.6]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.5...v1.3.6

## [1.3.5] — 2026-04-11

### Changed
- **App accents**: Light/Dark (non–System-colors) mode now uses the platform **primary / tint** (`colorPrimary` / `tintColor`) and **primary container** surfaces so the UI matches **Material You** and wallpaper-derived colors on Android 12+ instead of a fixed green.
- **Android widget**: **Configure** from the launcher (long-press widget → settings / gear, or when adding the widget). Native screen for background strength, highlight preset, and “match phone accent”. Removed duplicate widget controls from in-app Settings (short hint only).
- HTTP `User-Agent` prefix **PrayerTimes/1.3.5**.

### Release builds
- Android `versionName` **1.3.5**, `versionCode` **9** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.5]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.4...v1.3.5

## [1.3.4] — 2026-04-11

### Changed
- **App accents**: when system **dynamic colors** are off, UI accent uses brand **green** (`#6BC98A`) aligned with the widget and launcher; dynamic/Material You path unchanged when System colors are on.
- **Widget highlight**: with **System colors** on, **only the next-prayer row** uses the system accent (Android `system_accent1_600` / theme primary; iOS `Color.accentColor`); presets apply when dynamic is off.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.4**.

### Release builds
- Android `versionName` **1.3.4**, `versionCode` **8** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.4]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.3...v1.3.4

## [1.3.3] — 2026-04-11

### Changed
- **Android home screen widget**: neutral dark background (not green-tinted); **only the next prayer** uses an accent color. **Settings** (Android): background strength (opacity) and next-prayer accent (green / teal / blue / amber), with an in-app preview.
- **Widget picker** (Android 12+): `previewLayout` shows sample prayer times in the widget gallery.
- **iOS widget**: same neutral shell with accent on the next prayer only (no extra settings yet).
- App **theme** copy updated so system/dynamic colors are described for the **app**; Android widget styling is separate.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.3**.

### Release builds
- Android `versionName` **1.3.3**, `versionCode` **7** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.3]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.2...v1.3.3

## [1.3.2] — 2026-04-11

### Changed
- **Home screen widget** uses a fixed green-tinted look (aligned with the launcher icon) instead of following system / dynamic theme; next prayer is highlighted in **#6BC98A**.
- Launcher icon pipeline: master resize cap **2048px** and bicubic downscale for sharper mipmaps when the source asset is high resolution.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.2**.

### Release builds
- Android `versionName` **1.3.2**, `versionCode` **6** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.2]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.1...v1.3.2

## [1.3.1] — 2026-04-11

### Changed
- **System colors** mode: stronger platform **background layering** (iOS grouped backgrounds; Android `colorSurface` vs `colorSurfaceContainerHighest`) so dynamic / Material You tints read more clearly.
- In system dynamic mode, **flat chrome**: no box borders or list hairlines; segmented controls use **filled** selection instead of accent outlines. Text fields rely on surface contrast instead of strokes.
- HTTP `User-Agent` prefix **PrayerTimes/1.3.1**.

### Release builds
- Android `versionName` **1.3.1**, `versionCode` **5** — **AAB** for Google Play, **APK** for GitHub Releases.

[1.3.1]: https://github.com/Hassan-PS/PrayerApp/compare/v1.3.0...v1.3.1

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
