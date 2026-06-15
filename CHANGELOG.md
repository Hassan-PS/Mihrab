# Changelog

All notable changes to this project are documented here. The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.5.0] — 2026-06-15

### Added
- **Android Live Activity — native day-timeline (Android 16)**: The Live Activity now uses the platform `Notification.ProgressStyle` "Live Update" API to render the whole prayer day as a segmented timeline — accent-filled progress with a point marker at each prayer, a tracker dot at the current moment, and sunrise/crescent icons bookending the dawn→night cycle. The upcoming prayer's marker is highlighted in the accent colour. Falls back to a plain progress bar when the day cycle can't be resolved, and to the existing custom layout on pre-Android-16 devices.
- **Header location chip on Android (parity with iOS)**: The current location is shown next to the Settings gear whenever a manual location is set — with or without saved presets. Tapping it always opens the location selector, which now includes an "Add a new location" action that jumps to Settings and briefly highlights the Saved Locations section.
- **iOS Live Activity follows the system theme**: When Liquid Glass / system colours is selected, the Live Activity uses the dynamic iOS system tint (adapting to light/dark on its own) instead of the brand accent, so it matches the in-app theme.

### Changed
- **Refined standard theme (light + dark)**: Warmer, more reverent neutrals (deep ink-blue at night, warm paper by day); a calmer Next-Prayer hero (neutral surface with the countdown carrying the accent, instead of a saturated colour block); a refined deep/lifted emerald accent in place of the old neon green; softer, unified card radii; and a gentler active-row indicator.
- **Android navigation bar follows the app theme**: The system navigation bar icons now match the selected light/dark theme (previously always dark).
- **Themed restart prompt**: The "Restart required" dialog shown when toggling System colours is now a custom themed modal instead of the stock system alert.

## [2.4.0] — 2026-06-14

### Added
- **Multi-day schedule for the home-screen widget + Live Activity**: The app now pushes a multi-day schedule (`days[]`, one dated entry per day) instead of a single-day snapshot. Each native renderer selects the day matching the device's wall-clock date and rolls forward on its own. This fixes prayer times going stale ~24 hours after the app was last opened (previously they only refreshed when the app was reopened). Applies to the iOS widget (timeline now spans every supplied day), the Android widget (selects today's entry; also arms a midnight rollover refresh — previously no refresh was scheduled after Isha), and the Android Live Activity (recomputes next/previous prayer from the absolute dated schedule, including the overnight Isha→Fajr interval).
- **iOS Live Activity — redesigned**: Rebuilt the Lock Screen and Dynamic Island presentations with a live countdown (`Text(timerInterval:)`) and an auto-filling progress bar (`ProgressView(timerInterval:)`) spanning the previous → next prayer, plus a prayer strip with the upcoming prayer accented — mirroring the Android Live Activity feature set. Adopts `ActivityContent(staleDate:)` on iOS 16.2+. Background rollover of the highlighted prayer is handled **locally with no server** via `BGTaskScheduler` (the app stays local-first; APNs/push was explicitly ruled out — see `docs/ios-live-activity-push.md`). The Live Activity setting is labelled **experimental** on iOS (localized across all 13 locales).
- **CI**: Added a GitHub Actions workflow that runs the TypeScript typecheck and the Jest suite on every push/PR (there was previously no automated test run).

### Changed
- **Android Live Activity — advances during deep sleep**: The foreground service now schedules an exact `setExactAndAllowWhileIdle` wake alarm at the next prayer, so the countdown/progress roll over even while the device is dozing (the `Handler` ticker is suspended during sleep).
- **Fewer Android notification channels**: Only the selected adhan channel and the default channel are created (and surplus channels are cleaned up), instead of creating all 17 adhan channels on every sync.

### Fixed
- **Sunrise no longer plays the adhan**: When an adhan sound is selected it now plays for the five daily prayers only; Sunrise (which is not a prayer) uses the default notification sound and drops the "Stop adhan" action.
- **Test suite + typecheck restored to green**: Fixed the half-finished `accentSolid` palette typing and an RTL-title style cast, converted directional CSS in the Quran reader to start/end, and refreshed stale tests (tasbih presets, Quran loader, the relocated LocationChip) that had drifted from the shipped source.

## [2.3.14] — 2026-05-14

### Fixed
- **Android Live Activity — advance past Isha to tomorrow's Fajr**: When the app process was killed (user force-stopped the app) while the foreground-service Live Activity was running, the service's internal 60-second ticker would find no rows after Isha and freeze the notification permanently on "Isha" until the app was reopened. The ticker now wraps around to Fajr after Isha: it locates the Fajr row in the cached payload and calls `parseHHMMToEpochMs`, which automatically places Fajr 24 hours ahead when today's Fajr is already in the past. This matches the behaviour of every other prayer transition (Fajr→Sunrise→Dhuhr→Asr→Maghrib→Isha all advanced correctly via the same ticker logic; Isha→Fajr is the only after-midnight roll-over the ticker needs to handle itself when JS is not running).

## [2.3.13] — 2026-05-12

### Changed
- **Android Live Activity — reverted to standard template (chip preserved)**: Removed the `DecoratedCustomViewStyle` + custom view experiment from v2.3.12. Back to the chip-compatible standard layout: countdown (`↓ 1h 23m`) in `setSubText`, percentage appended to the end of `setContentTitle` (`الفجر · 02:48  ·  52%`) so it is always the last element reading left-to-right on the content row. Progress bar via `setProgress`.

## [2.3.12] — 2026-05-12

### Changed
- **Android Live Activity — platform `DecoratedCustomViewStyle` + percentage far-right**: Uses `Notification.DecoratedCustomViewStyle()` (platform API 36, not compat) with `setCustomContentView` so the prayer title sits LEFT and `52%` sits far RIGHT on the same content row. Countdown (`↓ 1h 23m`) stays in `setSubText` in the header. The platform style wraps the custom view in standard Material You chrome and may allow chip promotion where a bare custom view does not. Progress bar rendered by the custom view's `ProgressBar` (no double bar).

## [2.3.11] — 2026-05-12

### Changed
- **Android Live Activity — layout refinement (chip preserved)**: Countdown (`↓ 1h 23m`) is now shown alone in `setSubText` (right of app name in header row). Percentage (`52%`) moves to the content title row, appended to the prayer name: `"الفجر · 02:48  ·  52%"`. Progress bar remains below. `setCustomContentView` is intentionally absent — assigning a custom content view (even post-build) excludes the notification from chip promotion on Android 16.

## [2.3.10] — 2026-05-12

### Changed
- **Android Live Activity — post-build `contentView` injection (chip + same-line layout)**: Instead of calling `builder.setCustomContentView()` (which flags the notification as "custom template" and causes the builder to suppress `FLAG_PROMOTED_ONGOING` during `build()`), the notification is now built as a standard template so chip state is fully preserved, then `notif.contentView` is assigned directly on the built `Notification` object post-build. This sidesteps the builder's template-type tracking entirely. Also injects `android.requestPromotedOngoing = true` and `android.shortCriticalText` into extras post-build as belt-and-suspenders, and clears the standard progress extras to prevent a double progress bar when the custom `ProgressBar` is in use.

## [2.3.9] — 2026-05-12

### Changed
- **Android Live Activity — same-line layout on Android 16 with chip preservation attempt**: Restored `setCustomContentView` on the Android 16 path so prayer title and countdown+percentage (`↓ 1h 23m  |  52%`) appear on the exact same line again (left / right). The Android 16 chip is preserved via post-build flag injection: `FLAG_PROMOTED_ONGOING` and `android.shortCriticalText` are written directly onto the built `Notification` object after `builder.build()`, bypassing any template-type resolution that might strip them during the build phase. Falls back to standard template (subText countdown) if the custom view fails.

## [2.3.8] — 2026-05-12

### Changed
- **Android Live Activity — compact layout on Android 16**: The countdown and percentage (`↓ 1h 23m  |  52%`) are now placed in `setSubText`, which pins them to the right of the notification header row. The prayer title (`الفجر · 02:48`) gets the full content row below it, and the Material You progress bar sits below that. This is the most compact layout achievable with the standard notification template that also preserves the Android 16 status-bar chip (`setRequestPromotedOngoing`) — `setCustomContentView` / `RemoteViews` breaks chip promotion and cannot be used on this path.

## [2.3.7] — 2026-05-12

### Fixed
- **Android Live Activity — chip regression (v2.3.4–v2.3.6)**: The root cause was `setCustomContentView()` itself on the Android 16 path, not just `DecoratedCustomViewStyle`. Setting a custom content view changes the notification template type internally and prevents `FLAG_PROMOTED_ONGOING` from being applied, which kills the status-bar chip. Fixed by removing `setCustomContentView` entirely from the Android 16 (`buildAndroid16`) path. The standard two-line template (prayer title / countdown+percentage) is used on API 36+ to preserve the chip. The same-line `RemoteViews` layout is kept on pre-36 devices where no chip exists.

## [2.3.6] — 2026-05-12

### Fixed
- **Android Live Activity — chip regression (v2.3.4–v2.3.5)**: Adding `DecoratedCustomViewStyle` in v2.3.4 broke the Android 16 status-bar chip. The style's internal `apply()` call during `build()` was overwriting the promoted-ongoing state set via reflection (`setRequestPromotedOngoing`). Fixed by removing `DecoratedCustomViewStyle` from the Android 16 notification path — on API 36 the system shade renders the header chrome (app icon, app name) automatically without needing an explicit style, so the style was unnecessary and harmful.

## [2.3.5] — 2026-05-12

### Fixed
- **Android Live Activity — double progress bar**: When the custom `RemoteViews` content view is active, `setProgress()` on the builder was also rendering a second progress bar below the custom view. Fixed by skipping `setProgress()` on the builder when the custom layout is in use (the `RemoteViews` `ProgressBar` is the only bar now).
- **Android Live Activity — RTL layout flip with Arabic prayer names**: Arabic text in the prayer title (`الفجر · 02:48`) caused the notification's `LinearLayout` to flip to RTL, putting the prayer title on the right and the countdown on the left — the opposite of the intended layout. Fixed by setting `android:layoutDirection="ltr"` on the row `LinearLayout` to lock the left-prayer / right-countdown widget order, while keeping `android:textDirection="locale"` on each `TextView` so Arabic and Urdu glyphs still render correctly.

## [2.3.4] — 2026-05-11

### Changed
- **Android Live Activity — prayer title and countdown on the same line**: Replaced the two-line layout (title / countdown+percentage) with a custom `RemoteViews` content view using `DecoratedCustomViewStyle`. The prayer title is now left-weighted and the `↓ 1h 23m  |  52%` text is right-pinned on the exact same line. The progress bar sits below, full-width. The standard `setContentTitle`/`setContentText` fields are kept as fallback for hardened shells (GrapheneOS, some MIUI builds) that strip custom `RemoteViews` silently.

## [2.3.3] — 2026-05-11

### Changed
- **Android Live Activity — countdown + percentage in content area**: Moved the `↓ 1h 23m  |  52%` line from the notification header row (`setSubText`, far from the content) into `setContentText` so it sits directly below the prayer title on the same visual block. Layout: line 1 = "Asr · 17:08", line 2 = "↓ 1h 23m  |  52%", progress bar below. Applied to both the Android 16 and legacy (pre-36) notification paths. The legacy path also drops the chronometer/countdown-timer display in the header row in favour of the explicit text line.

## [2.3.2] — 2026-05-12

### Changed
- **Android Live Activity — Material You progress bar**: Reverted the Unicode text bar back to the system `setProgress()` bar, which Android 12+ (Pixel) renders with Material You styling — rounded ends, accent tint, smooth fill. The percentage is shown as `setContentText("52%")` directly above the bar so they read as a single visual unit.

## [2.3.1] — 2026-05-12

### Changed
- **Android Live Activity — progress bar with inline percentage**: Replaced the system `setProgress()` bar (which gives no control over placement) with a Unicode text bar rendered directly in the notification content line: `████████████░░░░░░  52%`. The bar and percentage are now on the same line with no gap between them, exactly as intended. Works on all Android shells including hardened ones (it is plain `setContentText`, not a RemoteView).

## [2.3.0] — 2026-05-12

### Changed
- **Android Live Activity — single notification**: Replaced the dual-notification architecture (a hidden IMPORTANCE_NONE FGS placeholder + a separate rich notification) with a single notification. The rich prayer-countdown notification is now the foreground service notification itself — no more phantom entry in the "silent" section of the notification settings. The trade-off is losing the Android 16 status-bar chip; the cleaner single-notification UX is the correct call.
- **Android Live Activity — progress percentage placement**: Moved the `52%` from the notification title (`"Asr · 17:08  ·  52%"`) to `setSubText`, which places it in the notification header row next to the app name. The title is now cleanly `"Asr · 17:08"` and the progress bar + percentage are visually grouped at the header level.

## [2.2.0] — 2026-05-11

### Fixed
- **Android Live Activity — disappears after app update**: When Android installs an update it kills the app process, stopping the foreground service. The last payload was held only in memory, so the Live Activity notification was gone until the user opened the app. Fixed by persisting the payload to SharedPreferences on every `display()` call and clearing it on `cancel()`. A new `MihrabRestartReceiver` handles `MY_PACKAGE_REPLACED` (fires immediately after an OTA update in the fresh process) and `BOOT_COMPLETED` (fires after a device reboot). Both cases read the persisted payload and restart the service without requiring the app to open.
- **Android build — fdroid APK got ABI splits when building play and fdroid tasks together**: The `wantsPlayRelease` guard in `build.gradle` matched "bundleplayrelease" as a substring when both tasks were run in the same Gradle invocation, enabling ABI splits for the fdroid flavor too. Replaced the substring check with an explicit allowlist of play-flavor task names so fdroid always produces a single universal APK.

## [2.1.9] — 2026-05-11

### Fixed
- **Settings — "Apply coordinates" button too prominent**: The button was using the `primary` filled-accent variant, giving it the same visual weight as a main-screen call-to-action. Switched to `secondary` (outlined accent, transparent fill) so it sits at the same visual level as the rest of the settings surface.

## [2.1.8] — 2026-05-11

### Fixed
- **Settings — "Apply coordinates" button visual consistency**: The manual-coordinates Apply button in the Location card was rendered as a raw `Pressable` with a solid accent fill and no pressed-opacity handler, making it appear brighter and heavier than every other action button in settings. Replaced with the shared `Button` component so it gets the same pressed-state opacity (0.85), typography, padding, and border-radius as all other primary buttons.
- **F-Droid recipe — build entries out of order**: The `rewritemeta` linter sorts `Builds:` entries by `versionCode` ascending and fails if it has to reorder them. Builds 2.1.4 / 2.1.5 / 2.1.6 were added in the wrong order (2.1.6 → 2.1.5 → 2.1.4). Reordered to correct ascending sequence so `rewritemeta` is a no-op.

## [2.1.7] — 2026-05-11

### Fixed
- **Android Live Activity — wrong prayer after Sunrise (background advance)**: The foreground service ticker that auto-advances the countdown when a prayer passes while the app is closed was not including Sunrise in its candidate row list. When `nextKey="Sunrise"` and Sunrise passed with the app closed, the ticker's index-of lookup returned -1 (Sunrise absent from `rows[]`), causing it to scan from Fajr, find it in the past, and advance +24h to **tomorrow's Fajr** instead of today's Dhuhr. Fixed by injecting `sunriseRow` into the ordered list immediately after Fajr before the candidate scan, so the full six-point sequence [Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha] is searched correctly.

## [2.1.6] — 2026-05-11

### Fixed
- **Android Live Activity — progress bar starts at ~20% at Isha adhan**: After Isha passes, `buildWidgetPayload` rolls the widget over to tomorrow's prayer data. The previous `prevEpochMs` computation iterated through those tomorrow-rows and — because tomorrow's Isha in Stockholm (May, days getting longer) is slightly later than today's — it mis-identified tomorrow's Maghrib as the most recent past prayer, inflating the initial progress to ~23%. Fixed by passing the raw `today` TimingsMap directly to `computePrevPrayerEpoch`; it now always scans the actual current-day `HH:MM` strings (Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha) and correctly finds today's Isha as the previous anchor, so the bar resets to 0% at rollover.

## [2.1.5] — 2026-05-11

### Changed
- **Settings — Live Activity description**: The help text beneath the Live Activity toggle now notes that iOS support is experimental. Updated across all 13 supported locales.

## [2.1.4] — 2026-05-11

### Fixed
- **iOS Live Activity — race condition on launch**: Multiple React Native effects (`useFocusEffect`, settings change, next-prayer advance) firing simultaneously at app launch could race each other into a create/dismiss spiral, leaving no visible Live Activity. Fixed with two complementary guards: an 800 ms JS-side debounce that coalesces concurrent `syncLiveActivity` calls so only the freshest payload executes, and a Swift-side serial `DispatchQueue` + `isStarting` flag that skips duplicate in-flight `start()` calls. Existing activities are now updated in-place (`act.update(using:)`) instead of stop-then-restart, eliminating the flash-and-disappear on the lock screen.

## [2.1.3] — 2026-05-11

### Added
- **Home screen — Mihrab logo in header**: The app name in the home screen navigation bar now shows a transparent-fill pointed-arch icon (matching the launcher icon geometry) alongside the text. The arch interior shows through to the navigation bar background, adapting to light and dark themes automatically.

### Fixed
- **Home screen — title always "Mihrab"**: The home screen header title is now always the proper app name "Mihrab" regardless of the selected language. Previously it was translated (e.g. "محراب" in Arabic), which obscured the brand name.
- **iOS Live Activity — next-prayer advance**: When a prayer passes while the app is open in the foreground, the Live Activity now immediately updates to show the next prayer and a fresh countdown. Root cause: `syncLiveActivity` was not re-triggered when the "next prayer" pointer advanced; adding `nextInfo` to the effect dependency array fixes this.

## [2.1.2] — 2026-05-11

### Fixed
- **Android notifications — status-bar icon**: All notifications (prayer alerts, fasting reminders, Live Activity) now show a refined mihrab arch icon whose Bézier shoulder curves and eight-pointed star are derived directly from the launcher icon geometry, replacing the previous straight-line approximation.

### Changed
- **Android Live Activity — notification prayer names**: Prayer names in the Live Activity notification now correctly use the app's selected language (e.g. Arabic) instead of always falling back to English. Root cause was a lowercase key lookup (`prayer.fajr`) that missed the capitalised keys (`prayer.Fajr`) used in all 13 locale files.
- **Android Live Activity — auto-advance**: When a prayer time passes while the app is in the background, the Live Activity foreground service now automatically advances to the next prayer and updates the notification without requiring the app to be opened.
- **Android Live Activity — compact mode permanent**: The compact single-row layout is now the permanent default; the compact mode toggle has been removed from settings.

## [2.1.1] — 2026-05-11

### Changed
- **Android Live Activity — localised notification strings**: Channel name, channel description, and FGS placeholder text are now translated into all 13 supported locales (ar, bn, de, es, fr, hi, id, ru, sv, tr, ur, zh) via Android `strings.xml` resources. Previously these were hardcoded English strings shown in Android Settings → Notifications.

## [2.1.0] — 2026-05-11

### Added
- **Android Live Activity — status-bar chip (Android 16+)**: The prayer countdown now appears as a Live Update chip in the Android 16 status bar alongside the clock. Implemented via `setRequestPromotedOngoing` and `setShortCriticalText` (reflected from `Notification.Builder` API 36).
- **Android Live Activity — dual-notification architecture**: The foreground service now posts two notifications — a minimal silent placeholder via `startForeground()` (keeps the process alive) and a rich chip notification via `notify()`. This is required because `FLAG_FOREGROUND_SERVICE` and `FLAG_PROMOTED_ONGOING` are mutually exclusive in Android 16's NMS; only `notify()` notifications can be promoted to the chip.
- **Android Live Activity — progress percentage**: The notification content text now shows the elapsed percentage (e.g. "52%") above the progress bar, giving a quick at-a-glance sense of where the prayer window stands.
- **Android Live Activity — compact single-row layout**: Prayer name and time are now combined on one line ("Asr · 17:08") instead of separate title/body rows, matching the clean Material style of system apps like EasyPark and Uber.
- **Android Live Activity — `POST_PROMOTED_NOTIFICATIONS` permission**: Declared in `AndroidManifest.xml`; auto-granted at install (`prot=normal|appop`). Required by Android 16's `api_rich_ongoing_permission` feature flag.
- **FGS channel `mihrab_fgs_v1`** (`IMPORTANCE_MIN`): Dedicated silent/hidden channel for the foreground-service placeholder notification so it never appears in the user-facing shade.

### Fixed
- **Android Live Activity — chip blocked by `FLAG_FOREGROUND_SERVICE`**: Previous single-FGS-notification approach permanently blocked chip promotion. Split into FGS placeholder + regular `notify()` chip notification.
- **Android Live Activity — `setSilent` compile error**: Removed `.setSilent(true)` from the platform `Notification.Builder` path (API 36); it only exists on `NotificationCompat.Builder`. The `mihrab_live_activity_v3` channel already sets `sound=null` and `vibration=false`.

### Changed
- **Android Live Activity — notification design**: Removed the InboxStyle prayer table from the expanded notification. The notification is now compact-only — a single title row + percentage text + progress bar + chronometer countdown — matching Material Design ongoing-activity conventions.

## [1.5.46] — 2026-04-28

### Fixed
- **Android medium widget — refresh button placement**: The ↻ button now sits in the empty space at the right end of the left panel, vertically centred next to the divider line. Previously it was at the top-right corner of the whole widget, floating above the prayer-times list.

## [1.5.45] — 2026-04-28

### Fixed
- **Android widgets — refresh on wallpaper/theme change**: All three widget variants (small, medium, large) now listen for `ACTION_WALLPAPER_CHANGED` and re-render immediately when the system wallpaper or Material You color palette changes. Previously the widget could stay the wrong accent color for up to 30 minutes.
- **Android widgets — refresh after reboot**: Widgets now listen for `ACTION_BOOT_COMPLETED` and repopulate as soon as the device finishes booting. Previously they stayed stale until the user opened the app or the 30-minute system timer fired.
- **Android widgets — prayer-time highlight advance**: The AlarmManager alarm that fires at each prayer time now refreshes all three widget variants. Previously it only targeted medium widgets, so small and large widgets kept the wrong prayer row highlighted after a prayer time passed.
- **Android widgets — screen-on refresh scope**: `ACTION_SCREEN_ON` and `ACTION_USER_PRESENT` now correctly refresh all three widget variants. Previously if only a small or large widget was on the home screen (no medium), the screen-on refresh was a no-op.
- **Android medium widget — refresh button overlap**: The refresh button (↻) was positioned inside the left panel at `top|start`, overlapping the prayer name on the narrow 4×1 layout. Moved to the top-right corner of the whole widget so it clears the left-side content.

## [1.5.44] — 2026-04-28

### Fixed
- **Android medium widget — wrong size**: On Android 12+ (API 31) the medium widget placed at 4×3 instead of 4×1 due to the `xml-v31/prayer_widget_info.xml` override pointing to the large widget layout (`prayer_widget`) with `targetCellHeight="3"`. Corrected to use `prayer_widget_horizontal` and `targetCellHeight="1"`.

### Changed
- **Android medium widget — design**: Redesigned to match the large widget's visual style — `sans-serif-light` time, `sans-serif-medium` all-caps prayer name, a thin vertical divider between the next-prayer panel and the prayer list. Right panel rows made more compact (equal 1:1 weight split, 4dp row padding) to fit the 4×1 height.

## [1.5.30] — 2026-04-27

### Fixed
- **iOS widget — build**: `.kerning()` called after `.foregroundStyle()` resolves to the SwiftUI View modifier (iOS 16+) rather than `Text.kerning(_:)` (iOS 13+). Moved all `.kerning()` calls to be the first modifier on each `Text` view so the compiler picks the correct iOS 13+ method.

## [1.5.29] — 2026-04-27

### Fixed
- **Android widget — New Architecture**: `NativeModules.PrayerWidget` is not accessible in React Native New Architecture (bridgeless mode). The widget sync now uses `TurboModuleRegistry.get()` as the primary lookup, falling back to `NativeModules` for older builds. Added `@ReactModule` annotation to `PrayerWidgetModule` for proper TurboModule registry discovery.

## [1.5.28] — 2026-04-27

### Fixed
- **Android widget — doesn't load**: `requestUpdate` was using `sendBroadcast` which can be silently dropped by battery optimisation on Android 8+. Replaced with direct `AppWidgetManager.updateAppWidget()` calls throughout. The configure activity now also directly refreshes the new widget on Save (instead of relying on the broadcast reaching the correct ID). Also fixed `setBackgroundResource(0)` → `setBackgroundColor(TRANSPARENT)` which could throw on some ROM variants.

## [1.5.27] — 2026-04-27

### Fixed
- **iOS widget — build**: `.tracking()` (SwiftUI letter-spacing modifier, iOS 16+ only) replaced with `.kerning()` (iOS 13+) so the Xcode Cloud archive compiles on the app's minimum deployment target.

## [1.5.26] — 2026-04-27

### Fixed
- **Widget — fresh install**: widget would show "Open Prayer Times to load times" even after the app had loaded prayer data. The widget data is now also synced every time the Home screen gains focus (e.g. when returning after placing the widget), guaranteeing the widget is populated within seconds of opening the app.

## [1.5.25] — 2026-04-27

### Fixed
- **F-Droid CI**: trailing space on a `sudo` curl line in the v1.5.21 build recipe caused `fdroid rewritemeta` to produce a diff and fail the pipeline; whitespace removed.

### Changed
- **Month view — layout**: prayer times now displayed in an aligned column grid (day label + 6 prayer columns with abbreviated headers) instead of a single joined string; each column has a fixed-width header; Sunrise column rendered muted italic.
- **Month view — today highlight**: today's row shows the accent background and a leading accent bar; Friday rows use the card background to distinguish the day of Jumu'ah.
- **Month view — controls**: month nav, "This Month", refresh, and "Share" toggle are now compact pills in a single row; provider info and cache count shown in one meta line; column headers are fixed below the controls (not part of the scrollable list).
- **Month view — auto-scroll**: list jumps to today's row on initial load.
- **Share image — banner**: header background changed to brand dark green (`#14532d`) to match app identity.
- **Share image — Sunrise column**: Sunrise times rendered muted italic in both the header and data rows of the shareable table.
- **Share image — GitHub URL**: corrected from `github.com/hassan/PrayerApp` to `github.com/Hassan-PS/PrayerApp`.

### Release builds
- Android `versionName` **1.5.25**, `versionCode` **48**.
- iOS `MARKETING_VERSION` **1.5.25**, `CURRENT_PROJECT_VERSION` **48**.

[1.5.25]: https://github.com/Hassan-PS/PrayerApp/compare/v1.5.24...v1.5.25

## [1.5.24] — 2026-04-27

### Changed
- **Home screen — Next prayer card**: redesigned hero card with prayer name and time side-by-side, a countdown pill, and platform-specific corner radius (iOS 20dp, Android 16dp).
- **Home screen — Prayer table**: Sunrise row is now rendered in muted italic to distinguish it as a reference time, not a salah. The active prayer row gains a 4dp accent bar on the leading edge.
- **Home screen — layout**: switched to `gap`-based spacing for consistent vertical rhythm; month shortcut moved below the prayer table and spans full width.
- **Navigation (iOS)**: large title headers enabled on all screens (`headerLargeTitle`), matching iOS HIG expectations.
- **Widget (Android)**: left panel uses `sans-serif-light` for the large time (more elegant), prayer name rendered uppercase with letter spacing, subtle vertical divider separates panels, right-side prayer list uses `sans-serif-medium` for clarity.
- **Widget (iOS — small)**: added "NEXT" micro-label, prayer name shown above the time, location shown uppercase with tracking at top.
- **Widget (iOS — medium/large)**: left panel restructured with location top, "NEXT" label, uppercase prayer name, and day label at bottom; large time uses `.light` weight. Highlighted row gains a 3dp leading accent bar alongside the background tint. Divider between panels.

### Release builds
- Android `versionName` **1.5.24**, `versionCode` **47**.
- iOS `MARKETING_VERSION` **1.5.24**, `CURRENT_PROJECT_VERSION` **47**.

[1.5.24]: https://github.com/Hassan-PS/PrayerApp/compare/v1.5.23...v1.5.24

## [1.5.23] — 2026-04-27

### Changed
- **Notification icon (Android)**: status-bar icon replaced with a mosque silhouette (dome + two minarets) for a more recognisable prayer app icon.
- **README**: store badge buttons rendered in a fixed horizontal row.

### Release builds
- Android `versionName` **1.5.23**, `versionCode` **46**.
- iOS `MARKETING_VERSION` **1.5.23**, `CURRENT_PROJECT_VERSION` **46**.

[1.5.23]: https://github.com/Hassan-PS/PrayerApp/compare/v1.5.22...v1.5.23

## [1.5.22] — 2026-04-27

### Fixed
- **Compass (iOS)**: native `CompassModule` is now null-checked before constructing `NativeEventEmitter`, preventing a crash on builds where the module is not registered.
- **Settings persistence**: storage write failures are now logged instead of silently swallowed, making AsyncStorage errors diagnosable.
- **Prayer cache**: background cache-write and refresh errors are now logged so storage failures don't go undetected.
- **UK prayer times (PrayerTimes.dev)**: date-part variables initialised to `undefined` instead of `0`, preventing a wrong-epoch timezone offset when `Intl.DateTimeFormat.formatToParts` partially fails.
- **Sweden prayer times**: times extracted by HTML scraping are validated to be in strict chronological order; an out-of-order result now throws rather than silently storing corrupted data.
- **Sweden reverse-geocoding cache**: capped at 200 entries (FIFO eviction) to prevent unbounded memory growth.
- **Widget highlight ID**: native Android widget appearance value is validated against known IDs before being written to settings, removing an unsafe `as any` cast.
- **Language persistence**: settings storage now recognises all 13 supported languages; previously only `en`, `sv`, and `ar` were accepted and other languages were silently reset to English on restart.
- **Midnight rollover**: home screen now detects when the calendar date has changed during an active session and re-fetches prayer times automatically.
- **Widget (iOS + Android)**: after Isha, the "next prayer" left panel no longer falls back to showing today's Fajr time (stale data); it now stays blank until the app syncs tomorrow's payload.
- **Widget `getSnapshot` (iOS)**: snapshot now computes the real dynamic next prayer instead of passing `nil`, so the widget preview reflects live data.
- **Widget comment**: corrected stale comment that said "Sunrise is omitted" when Sunrise has been included in the row list.
- **Widget description (iOS)**: updated App Store widget gallery description to reflect six displayed times including Sunrise.

### Changed
- **Sunrise row (widget)**: Sunrise is now rendered in muted colour when it is not the current next item, visually distinguishing it as a reference time rather than a daily salah — consistent on both iOS and Android.
- **Widget (iOS)**: added `systemSmall` family — a compact view showing location, next prayer name, and time.
- **Widget (iOS)**: `computeDynamicNext` extracted as a module-level function shared by both `getSnapshot` and `getTimeline`, eliminating duplicated logic.
- **Widget info (Android)**: added `targetCellWidth`/`targetCellHeight` and `maxResizeWidth`/`maxResizeHeight` for correct Android 12+ grid sizing.
- **CI**: `release-android.yml` now builds both the F-Droid APK (`assembleFdroidRelease`) and the Google Play AAB (`bundlePlayRelease`) and attaches both to the GitHub Release.
- **HTTP User-Agent**: updated version string from stale `1.4.9` to `1.5.22`.

### Release builds
- Android `versionName` **1.5.22**, `versionCode` **45**.
- iOS `MARKETING_VERSION` **1.5.22**, `CURRENT_PROJECT_VERSION` **45**.

[1.5.22]: https://github.com/Hassan-PS/PrayerApp/compare/v1.5.21...v1.5.22

## [1.4.9] — 2026-04-24

### Added
- **Settings**: installed version now includes a tappable GitHub link at the bottom.

### Changed
- **Android dynamic theme**: use higher-contrast container colors to avoid low-contrast text with Material You palettes.
- **Android widget**: Android 12+ widget metadata now marks the widget as reconfigurable so launcher settings affordance appears on long-press.
- **iOS widget**: use native widget container background and internal padding for consistent edge rendering.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.9**.

### Release builds
- Android `versionName` **1.4.9**, `versionCode` **22**.
- iOS `MARKETING_VERSION` **1.4.9**, `CURRENT_PROJECT_VERSION` **21**.

[1.4.9]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.8...v1.4.9

## [1.4.8] — 2026-04-22

### Added
- **Settings (Android + iOS)**: show installed app version/build at the bottom of the Settings screen.

### Changed
- **Notifications**: Adhan sound options are bundled in-app for Android/iOS; help text updated to reflect built-in sounds.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.8**.

### Release builds
- Android `versionName` **1.4.8**, `versionCode` **21**.
- iOS `MARKETING_VERSION` **1.4.8**, `CURRENT_PROJECT_VERSION` **20**.

[1.4.8]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.7...v1.4.8

## [1.4.6] — 2026-04-22

### Added
- **Notifications (Android + iOS)**: bundled built-in Adhan sound assets are now shipped in the app (`adhan_makkah`, `adhan_madina`, `adhan_aqsa`) so sound options work out of the box on every build.

### Changed
- **Notification sound picker** copy now confirms voices are built into the app build.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.6**.

### Release builds
- Android `versionName` **1.4.6**, `versionCode` **20**.
- iOS `MARKETING_VERSION` **1.4.6**, `CURRENT_PROJECT_VERSION` **19**.

[1.4.6]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.5...v1.4.6

## [1.4.5] — 2026-04-22

### Added
- **Notifications**: selectable alert sound profile with default notification sound plus Adhan voice options (Makkah, Madina, Al-Aqsa) in Settings.

### Changed
- **Android notifications**: prayer alerts now use a dedicated monochrome status-bar icon instead of the generic fallback circle.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.5**.

### Release builds
- Android `versionName` **1.4.5**, `versionCode` **19**.

[1.4.5]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.4...v1.4.5

## [1.4.4] — 2026-04-14

### Changed
- **Compass (iOS + Android)**: improved diagnostics for weak/very weak signal and unstable movement, with actionable calibration guidance (move away from metal/electronics, remove magnetic accessories, do a slow figure-8, hold steady).
- **iOS compass permission UX**: clearer startup prompt guidance and explicit denied-permission messaging with direct path to system settings.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.4**.

### Release builds
- Android `versionName` **1.4.4**, `versionCode` **18**.
- iOS `MARKETING_VERSION` **1.4.4**, `CURRENT_PROJECT_VERSION` **18**.

[1.4.4]: https://github.com/Hassan-PS/PrayerApp/compare/v1.4.3...v1.4.4

## [1.4.3] — 2026-04-12

### Added
- **iOS**: **WidgetKit extension** (`PrayerWidgetExtension`) embedded in the app — home screen widget matches Android (five prayers + next-prayer highlight) via App Group `group.com.prayerapp`.

### Changed
- **Portrait only**: iPhone/iPad app **portrait** orientation; Android `MainActivity` and widget configure activity use **`screenOrientation="portrait"`**.
- **System colors (Material You / dynamic palette)**: setting and palette path are **Android-only**. On **iOS**, System theme uses standard surfaces with **brand green** accents (same as Light/Dark accent behavior).
- **iOS**: optional **tip / IAP** UI is **omitted** (tips remain on Android Play builds only). Support copy no longer names other app stores.
- HTTP `User-Agent` prefix **PrayerTimes/1.4.3**.

### Release builds
- Android `versionName` **1.4.3**, `versionCode` **17**.
- iOS `MARKETING_VERSION` **1.4.3**, `CURRENT_PROJECT_VERSION` **17**.

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
