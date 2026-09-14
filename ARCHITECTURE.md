# Mihrab — Architecture

The technical reference for contributors: what the app is, the stack, where
things live, how to build and run it, the native modules, and the patterns
that keep prayer data correct. Read this after **[CONTRIBUTING.md](CONTRIBUTING.md)**
(the rules) and before non-trivial work. The five design principles have their
own home in **[docs/design/principles.md](docs/design/principles.md)**; the
release pipeline is in **[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)**.

## 1. What is Mihrab

A prayer-times + Islamic-life companion app. Bundles:

- **Prayer times** for the 5 daily prayers + Sunrise, fetched from one of 4 providers (or computed on-device offline).
- **Home-screen widgets** on both platforms (small / medium / large + iOS Lock-Screen accessories).
- **Notifications** — adhan alerts, pre-prayer reminders, fasting reminders, journal log actions.
- **Live Activity** — pinned countdown to next prayer (Android ongoing notification with progress bar + iOS ActivityKit Lock Screen / Dynamic Island).
- **Companion content** — Quran reader (Arabic + 14 translations), Tilāwah (continuous recitation with lock-screen controls), duas (Hisnul Muslim), Tasbih, Qibla compass, monthly calendar, prayer journal, fasting tracker.
- **13 locales** in full parity: `en sv ar bn de es fr hi id ru tr ur zh`. Arabic and Urdu are RTL.

Bundle ids:

| Channel | Android applicationId | iOS bundle id |
|---|---|---|
| Stable | `com.prayer_times` | `com.hassan.prayerapp` |
| Beta | `com.prayer_times.beta` | — (TestFlight uses the same `com.hassan.prayerapp`) |

## 2. Stack

| Layer | Detail |
|---|---|
| Runtime | React Native 0.83, Hermes, TypeScript strict |
| State | `PrayerSettingsContext` (AsyncStorage-backed) in `src/context/`, sliced into domain contexts (Appearance, Location, Notifications, DataSource, Widget, LiveActivity) |
| Styling | `useAppPalette()` hook — never hardcode colours. Design tokens live in `src/theme/tokens.ts` |
| i18n | `src/i18n/` — 13 locales loaded statically; runtime switch via `i18n.changeLanguage(lang)` |
| Tests | Jest — `npx jest` or `npx jest --testPathPattern=<name>` |
| Native | Kotlin (Android: widgets, live activity, version info) + Swift (iOS: widgets, ActivityKit live activity, compass) |

## 3. Source layout

```
src/
├── context/                  PrayerSettingsContext + domain slices
├── i18n/                     i18next bootstrap + 13 locale JSONs
├── hijri/                    Gregorian↔Hijri conversion (Umm al-Qura tabular)
├── hooks/                    usePrayerDay, usePrefetchSavedLocations, useAppPalette …
├── liveActivity/             Cross-platform Live Activity orchestrator (syncLiveActivity.ts)
├── native/                   Typed wrappers for Android+iOS native modules
├── notifications/            notifee schedulers (prayer alerts, fasting reminders, live activity)
├── prayer/                   prayerStorage.ts — AsyncStorage cache with write-mutex
├── providers/                4 prayer-time data providers (aladhan, prayertimes_dev,
│                             islamiskaForbundet, localAdhan) + validateTimings.ts
├── quran/                    Quran data + reader screen, and audio/ — the shared
│                             playback store behind the reader, Tilāwah and the mini-player
├── screens/                  Top-level screens
│   ├── home/                 HomeScreen sub-components
│   └── settings/             Settings cards extracted from SettingsScreen
├── seasonal/                 Jumu'ah / Ramadan / Eid treatment computation
├── settings/                 Settings types + storage glue
├── theme/                    Palette + chrome (design tokens)
├── utils/                    Shared utils — prayerTimes math, coords helpers, …
└── widget/                   buildWidgetPayload.ts + syncPrayerWidget.ts (cross-platform)

android/                      Native Android sources + Gradle
ios/                          iOS Xcode project + Pods
contrib/fdroid/               F-Droid submission kit (yml, MR notes, checklist)
docs/                         Architecture/design docs (data-sources.md, design/principles.md)
.claude/                      Slash commands + subagents (designer, reviewer, …)
fastlane/metadata/android/    Play Store + F-Droid listing copy
```

### Key files

**Prayer data**
- `src/prayer/prayerStorage.ts` — AsyncStorage cache with `_writeMutex` (prevents concurrent-write data loss).
- `src/providers/fetchPrayerTimes.ts` — fan-out to all providers; calls `validateTimings()` on every response.
- `src/providers/validateTimings.ts` — asserts all 6 keys present and `HH:MM` formatted; throws on failure.
- `src/providers/localAdhan.ts` — on-device fallback (adhan.js); used when network fails.
- `src/providers/islamiskaForbundet.ts` — Sweden-specific HTML scraper with 6-hour sanity check.

**GPS & location**
- `src/hooks/usePrayerDay.ts` — instant-load pattern (shows cached coords, GPS in background, refetches only if device moved >~1 km via `coordsChangedSignificantly`).
- `src/context/PrayerSettingsContext.tsx` — persists `lastFetchedLatitude/Longitude`; clears them on location-mode switch.

**Home-screen widget**
- `src/widget/buildWidgetPayload.ts` — JSON pushed to both platform widgets; rolls to tomorrow after Isha.
- `src/widget/syncPrayerWidget.ts` — called from HomeScreen on every focus.
- `src/native/PrayerWidget.ts` — typed wrapper for the `PrayerWidget` native module (Android + iOS).
- `android/app/src/main/java/com/prayer_times/PrayerWidget*.kt` — Android widget providers + module.
- `ios/PrayerWidgetExtension/PrayerWidgetExtension.swift` — WidgetKit timeline provider; handles day-rollover.

**Live Activity (v2.1.0+)**
- `src/liveActivity/syncLiveActivity.ts` — platform-dispatch orchestrator.
- `src/notifications/liveActivity.ts` — JS-side Android renderer (channel + notifee fallback).
- `src/native/MihrabLiveActivity.ts` — typed wrapper for the Android Kotlin module.
- `android/app/src/main/java/com/prayer_times/MihrabLiveActivityModule.kt` — Kotlin module with platform `Notification.Builder` + `setShortCriticalText` + `setRequestPromotedOngoing` for Android 16 status-bar chip.
- `src/native/PrayerLiveActivity.ts` — iOS ActivityKit wrapper.
- `ios/PrayerApp/PrayerLiveActivity.swift` + `.m` — ActivityKit bridge.
- `ios/PrayerWidgetExtension/PrayerLiveActivityWidget.swift` — SwiftUI Lock Screen + Dynamic Island views.
- `ios/PrayerWidgetExtension/PrayerLiveActivityAttributes.swift` — shared `ActivityAttributes` (member of BOTH targets via pbxproj entry).

**Notifications**
- `src/notifications/prayerNotifications.ts` — schedules notifee notifications; resyncs on TZ change and AppState active.
- `src/notifications/adhanSafetyControls.ts` — dedupe + stale notifications guards.
- `src/notifications/fastingReminders.ts` — day-before reminders for Monday/Thursday/Ashura/Arafah/etc.
- `src/notifications/notificationActions.ts` — snooze + silent-next action handlers.

**Settings UI**
- `src/screens/settings/` — `*Card.tsx` files: Appearance, DataSource, Location, SavedLocations, Calculation, Notifications, LiveActivity, About + the matching modals.

## 4. Local dev — build & run

### Bootstrap

```sh
npm ci --no-audit
cd ios && pod install && cd ..
```

### Run on Android emulator/device

```sh
npm run android                       # iPhone-paired Pixel by default (scripts/run-android-phone.js)
./android/gradlew -p android installFdroidDebug
./android/gradlew -p android installPlayDebug
```

### Run on iOS simulator

```sh
cd ios
xcodebuild -workspace PrayerApp.xcworkspace -scheme PrayerApp \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build/sim -quiet build
xcrun simctl install booted build/sim/Build/Products/Debug-iphonesimulator/PrayerApp.app
xcrun simctl launch booted com.hassan.prayerapp
```

Or just open `ios/PrayerApp.xcworkspace` in Xcode and Run.

## 5. Native modules

All Android Kotlin modules live in `android/app/src/main/java/com/prayer_times/`. All iOS Swift / Obj-C live in `ios/PrayerApp/` (main app target) or `ios/PrayerWidgetExtension/` (widget extension target).

| Module | Android | iOS | JS wrapper | What it does |
|---|---|---|---|---|
| `PrayerWidget` | `PrayerWidgetModule.kt` | `PrayerWidget.m` + `WidgetTimelineReloader.swift` | `src/native/PrayerWidget.ts` | Push JSON payload to home-screen widget; reload widget timeline |
| `MihrabLiveActivity` | `MihrabLiveActivityModule.kt` | — | `src/native/MihrabLiveActivity.ts` | Post Android Live Activity ongoing notification with progress bar + chronometer + Android 16 chip metadata |
| `PrayerLiveActivity` | — | `PrayerLiveActivity.swift` + `.m` | `src/native/PrayerLiveActivity.ts` | Start/update/end iOS ActivityKit Live Activity (Lock Screen + Dynamic Island) |
| `Compass` | `CompassModule.kt` | `CompassModule.swift` + `.m` | `src/hooks/useQiblaCompass.ts` | Magnetometer stream for Qibla compass |
| `PrayerBuildInfo` | `PrayerBuildInfoModule.kt` | — | `src/native/PrayerBuildInfo.ts` | Exposes the Android product flavor (`play` vs `fdroid`) so JS can hide IAP features on F-Droid |
| `AppVersion` | `AppVersionModule.kt` | `AppVersion.m` | inline | Exposes versionName + versionCode |
| `SystemTheme` | `SystemThemePackage.kt` | — | inline | Material You dynamic-color current accent |
| `SystemClock` | `SystemClockModule.kt` | `SystemClock.m` | `src/native/SystemClock.ts` | Is the device clock set to 24-hour time? (issue #18 — neither platform exposes this to JS). Constant `is24Hour` + method `readIs24Hour()` — **different names on purpose**: a method and a constant sharing a name leaves one unreachable in every bridge mode. |

All modules are registered in:
- Android — `MainApplication.kt` `packageList`.
- iOS — automatic via `RCT_EXPORT_MODULE` + Pods autolinking (no manual registration needed).

### iOS shared types across targets

`PrayerLiveActivityAttributes.swift` is a member of **both** the main app target AND `PrayerWidgetExtension`. ActivityKit requires the `ActivityAttributes` type identity to match across the requesting (app) and rendering (widget) modules. This dual membership is set up via direct `pbxproj` edits (see commit history).

## 6. Patterns & rules

### State management
`PrayerSettingsContext` is sliced into domain contexts (`useAppearanceSettings`, `useLocationSettings`, `useNotificationsSettings`, `useDataSourceSettings`, `useWidgetSettings`, `useLiveActivitySettings`). Consumers subscribe to the narrowest slice they need. The legacy `usePrayerSettings()` facade still exists for cross-cutting consumers.

Single storage blob under `prayerapp.settings.v1` in AsyncStorage. **Schema migrations are additive only** — adding fields is safe, removing or repurposing them breaks upgraders.

### Clock times are two different strings (issue #18)

`formatDisplayTime` / `formatLocalTime` produce **canonical 24-hour `HH:mm`**. That string is machine data and must never be localised: the iOS widget's progress ring splits it on `":"`, `logMinutesOfDay` turns it into minutes-of-day, Android's `epochForDayTime` matches it against `^(\d{1,2}):(\d{2})$`, and `lockScreenPayload` compares it lexicographically against `nowHHMM`.

What the user reads comes from `src/utils/clockFormat.ts`, and only ever through:

- **In React** — `useClockFormatter()` (`src/hooks/useClockFormatter.ts`). Every screen that prints a time uses it.
- **Outside React** — `activeClock()` (`src/utils/activeClock.ts`), a mirror of the preference kept beside `i18n`, set by `PrayerSettingsProvider`. The widget and Live Activity payload builders are plain functions and use this.

Payloads carry **both**: `time` for the parsers, `display` for the renderers — and `display` is **omitted when it equals `time`**, so a 24-hour payload is byte-identical to what it always was. Native falls back to `time`, which is exactly right when the two agree (`PrayerWidgetProvider.displayTime`, `Row.text` in Swift).

The digits are always Latin. Only the day-period marker ("PM", "م", "下午") and its position come from `Intl`, so a time never renders in Arabic-Indic digits beside a Latin-digit countdown on the same card.

`'auto'` follows the device's own 12/24-hour switch, via the `SystemClock` native module. When that module cannot be reached the fallback is **24-hour** — what this app has shown since its first release — never a guess from the locale.

Anything that builds a payload outside React — `republishWidgetPayload` from a headless task, a notification's background handler, or launch before the provider's effect — must call `setActiveClockFormat(settings.clockFormat)` and `await refreshSystemIs24Hour()` first, the way it already does for `language`. And anything in `HomeScreen` that re-syncs the widget, the Live Activity or alert copy keys on the **resolved** `useClockFormatter().hour12`, not on `settings.clockFormat`: on `auto` the answer moves when the device switch does, with no setting changing.

### Mālikī second times (issue #19)

`src/prayer/daruriTimes.ts` computes when each prayer's preferred (*ikhtiyārī*) window closes and its late (*ḍarūrī*) window opens. On-device, from coordinates and the date, beside whichever provider supplied the day — no provider publishes these.

Four rules it exists to hold:

- **Two of the five are rows the card already has.** The book defines Ẓuhr's boundary as ʿAṣr's beginning (fn. 656) and Maghrib's as Ishāʾ's (fn. 659). So `DhuhrDaruri` is `timings.Asr` and `MaghribDaruri` is `timings.Isha` — reused, not recomputed, because a second ʿAṣr a minute from the first reads as a bug. The one exception: on Ḥanafī ʿAṣr (`school === 1`, passed as `asrShadow: 2`) the row is the wrong madhhab's, and the 1:1 shadow is computed instead.
- **`confidence` is part of the answer.** Ẓuhr's, Maghrib's and Ishāʾ's (a third of the night) are `computed` — exact on the card's own terms. Fajr's *isfār* (−6°) and ʿAṣr's *iṣfirār* (+5°) are `modelled` — an angle standing in for something the eye judges — and the row says "approx." for them.
- **Every boundary is gated against the card's own rows** (`inside()` in `daruriTimes.ts`): strictly after its prayer, strictly before the event that closes the second time, wrap-aware for the night. The solar rise/set gate cannot do this alone because rows are not always angles — Stockholm's dataset puts midsummer Fajr at 02:11 while *isfār* is 01:59, and the offline engine's high-latitude rule puts Malmö's Ishāʾ *after* the first third of its own night. Both are dropped. The same gate drops boundaries that are hours off because the device zone is not the location's (a manual location abroad): blank, never wrong.
- **Where a modelled angle has a stated range, take the end that closes the window EARLIER.** The source gives −6° to −4° for *isfār*; morning twilight brightens toward sunrise, so −4° is the later clock time, and a boundary placed late tells someone they are still in the preferred window when they may already be in the ḍarūrī one. Begin late, end early — and the end of an ikhtiyārī window is an end. (*Iṣfirār* is a single number, not a range, so it is not shifted: that would be inventing a boundary rather than choosing conservatively within a stated one.)
- **Ḥanafī ʿAṣr is a real conflict and the card says so.** With `school === 1` the Ẓuhr boundary (1:1, because it is Mālikī) lands ~30 min before the 2:1 ʿAṣr on the row below. The toggle is not hidden — someone may want exactly that — but the help text turns into a warning in `palette.danger` before the switch is touched.
- **The shadow is always 1:1**, whatever `school` says. A Ḥanafī asr setting must not produce a Mālikī boundary from a Ḥanafī shadow.
- **A window needs both ends.** A boundary OPENS a window some other event CLOSES — Fajr's ḍarūrī runs to sunrise, Ẓuhr's and ʿAṣr's to sunset — and an angle can be reached on a day when that event never happens. Under the midnight sun in Tromsø the sun still descends through +5° and still casts the 1:1 shadow, so an implementation that only asked "was the angle reached?" prints an ʿAṣr boundary for a window ending at a sunset that never comes. So: no sunrise, no Fajr boundary; no sunset, no afternoon or evening one. That, plus the angle simply not being reached (above ~55° the sun misses 17° of depression in midsummer), is the whole polar fallback, and the answer is always the same one — nothing.
- **Ishāʾ's is not gated on the sun**, on purpose: it is a third of the interval between two times the card is already showing, not a claim about where the sun is. It is the **same instant as the `Firstthird` row**, and the two must appear and disappear together — `injectNightTimes` falls back to the day's own Fajr on the last day of a window, so `daruriTimesForDay` does too (`nightEnd`). Requiring a real tomorrow printed that one moment twice on the last row of every month: a time in the first-third column, a blank under Ishāʾ.
- **Refraction.** Sunrise/sunset come from adhan.js at −0.833° (refraction + solar radius), which is what "the appearance of the top of the sun" and every published table mean. The twilight angles are geometric, as the constants in the madhhab tables are quoted. Only *iṣfirār* at +5° is low enough for refraction to matter (~9′, under a minute of clock time at mid-latitudes) — well inside the uncertainty that makes it `modelled` in the first place.
- **Attributed.** *Al-Murshid al-Muʿīn* (Ibn ʿĀshir), as rendered in *The Guiding Helper*, Song 11 — named on the settings card where the toggle is.
- **The engine import is guarded.** `daruriImportOk()` exists so a version bump that changes adhan.js's internals fails the test suite instead of silently returning NaN for every boundary; `solarDaruriBoundaries` degrades to `{}` rather than throwing.

It reaches three surfaces, all off until the toggle is on:

- **Today card** — a small line under each of the five prayers, derived reactively in `HomeScreen`'s `view` memo so the toggle takes effect without a re-fetch.
- **Month table** — a second, smaller line under **Fajr, ʿAṣr and Ishāʾ only** (`DARURI_CELL` in `MonthTable.tsx`). Ẓuhr's and Maghrib's boundaries *are* the ʿAṣr and Ishāʾ columns, and printing them again would be the same number twice on one row; `month.daruriLegend` says so in words. Row height comes from `monthRowHeight(showDaruri)` — the stylesheet and `MonthTimesScreen`'s `getItemLayout` must both use it or the list scrolls to the wrong offsets.
- **Notifications** — opt-in **per boundary** (`malikiSecondTimeAlerts`, empty by default) with a shared lead time (`malikiSecondTimeAlertMinutes`, default 15, 0 = at the boundary). Five more alerts a day on top of the prayers and reminders is how an app teaches people to swipe its notifications away, so showing a boundary and announcing it are separate decisions. They never carry the adhan — same rule as Sunrise and the night marks — and get their own `pt-daruri-` id prefix so the existing cancel/keep diff manages them with everything else.

The boundaries ride in the `TimingsMap` under keys nothing else iterates (`FajrDaruri`, …), so the widget and Live Activity are still untouched.

`adhan` is mocked wholesale in `jest.setup.js`; this module reaches `adhan/lib/cjs/SolarTime` directly and is unaffected, but a test that wants the real library must `jest.unmock('adhan')` — and must pass a plain `{latitude, longitude}`, because adhan's ESM `Coordinates` does not survive being handed to the CJS `SolarTime`. **Tests must not hard-code provider rows**: rows are clock strings in the device's zone and the gate compares them against solar instants in the device's zone, so typed-in "05:30"s are only right in one zone. `rowsFor()` in `daruriTimes.test.ts` generates them from the engine in the runner's zone; the suite is run in seven zones including UTC+8:45.

### Provider validation
Every network provider response must pass through `validateTimings()` (asserts all 6 keys + `HH:MM` format). `localAdhan` is the only exempt path — it's deterministic on-device math.

### Widget payload rollover
After Isha, `buildWidgetPayload()` switches to tomorrow's data. iOS WidgetKit's `Provider.getTimeline()` mirrors this — when every `HH:MM` is in the past, it uses tomorrow's calendar date as the timeline base.

### Concurrent cache writes
`prayerStorage.ts` serialises all `setItem` calls through `_writeMutex`. Do not bypass it — losing the mutex causes intermittent data loss when GPS and a manual refresh fire at the same time.

### Settings card pattern
Each `*Card.tsx` in `src/screens/settings/` consumes its narrow slice, owns its own UI state, and uses the shared `sharedSettingsStyles` for chrome. Modals are extracted (`MethodModal`, `PreReminderModal`, etc.) so the card stays under ~150 lines.

### Live Activity lifecycle (Android)
The Android implementation goes through the native Kotlin module, not notifee, because notifee 9.x doesn't expose Android 16's `setShortCriticalText` or `setRequestPromotedOngoing`. The orchestrator (`syncLiveActivity.ts`) routes through `MihrabLiveActivity.display()` on Android and `PrayerLiveActivity.start()` on iOS. The HomeScreen `useEffect` re-fires the sync on every state change + on focus.

**On hardened shells (GrapheneOS, some MIUI builds), custom `RemoteViews` are silently stripped** at notification post time. The current implementation uses standard `InboxStyle` + `setProgress` + `setUsesChronometer` so it renders on every shell.

## 7. Tests

```sh
npx jest                                          # all tests
npx jest --testPathPattern=buildWidgetPayload     # widget rollover
npx jest --testPathPattern=prayerStorage.race     # concurrent write safety
npx jest --testPathPattern=validateTimings        # provider validation
npx jest --testPathPattern=prayerNotifications    # timezone/scheduling
```

All tests live in `__tests__/`. **No snapshot tests** — every assertion is explicit.

There are no E2E tests on iOS / Android yet. Live testing on the iPhone simulator and a physical Pixel is the current verification path; the iOS sim flow is documented in §4.

## 8. Tooling

Slash commands and subagents live under `.claude/` — `/locale-add`, `/locale-audit`, `/tokens-audit`, `/a11y-scan` and the `reviewer` / `designer` / `locale-translator` / `provider-doctor` subagents. **[CONTRIBUTING.md](CONTRIBUTING.md)** lists what each does and when to run it.
