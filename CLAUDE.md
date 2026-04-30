# PrayerApp — Claude Project Guide

React Native 0.83 + TypeScript prayer-times app for iOS and Android.
No trackers, no analytics. All 4 data providers work offline after first cache.

---

## Stack

| Layer | Detail |
|---|---|
| Runtime | React Native 0.83, Hermes, TypeScript strict |
| State | `PrayerSettingsContext` (AsyncStorage-backed) in `src/context/` |
| Styling | `useAppPalette` hook — never hardcode colours |
| i18n | `src/i18n/` — 13 locales; always add keys to **all** locale files |
| Tests | Jest — run `npx jest` or `npx jest --testPathPattern=<name>` |

---

## Android

Two product flavors — always build them separately (mixing in one Gradle call enables ABI splits for fdroid unintentionally):

```bash
# F-Droid universal APK (no Play Services, no IAP)
./android/gradlew -p android assembleFdroidRelease

# Play Store AAB
./android/gradlew -p android bundlePlayRelease
```

Output paths:
- `android/app/build/outputs/apk/fdroid/release/app-fdroid-release.apk`
- `android/app/build/outputs/bundle/playRelease/app-play-release.aab`

R8 minification is ON (`enableProguardInReleaseBuilds = true`). ABI splits are only enabled for the play flavor (guarded by `wantsPlayRelease` in `build.gradle`).

---

## iOS

Xcode Cloud is connected — a push to `main` or any version tag triggers a new build automatically. No manual Xcode steps needed.

Widget extension: `ios/PrayerWidgetExtension/PrayerWidgetExtension.swift`
Widget reloader: `ios/PrayerApp/WidgetTimelineReloader.swift`

---

## Versioning

Both platforms must be bumped together:

| File | What to change |
|---|---|
| `android/app/build.gradle` | `versionCode` (+1) and `versionName` |
| `ios/PrayerApp.xcodeproj/project.pbxproj` | `CURRENT_PROJECT_VERSION` and `MARKETING_VERSION` (3 occurrences each) |

Current: **v1.5.51, build 74**

---

## Release checklist

1. Bump versions (both platforms)
2. `./android/gradlew -p android assembleFdroidRelease` — universal APK built locally
3. `./android/gradlew -p android bundlePlayRelease` — AAB for Play
4. `git push --force-with-lease origin main` — triggers Xcode Cloud
5. `git tag vX.Y.Z && git push origin vX.Y.Z`
6. `gh release create vX.Y.Z android/.../app-fdroid-release.apk` — F-Droid APK only on GitHub releases
7. Update `contrib/fdroid/com.prayer_times.yml` + mirror to `/Users/hassan/git/fdroiddata/metadata/com.prayer_times.yml`
8. Push fdroiddata fork → MR 36312 auto-updates

**F-Droid CI rules** (rewritemeta linter):
- Multi-line `curl` commands must keep a trailing space before the indented URL line.
- Use tag refs (`commit: v1.5.51`) not raw hashes in build entries.

---

## Key source files

### Prayer data
| File | Role |
|---|---|
| `src/prayer/prayerStorage.ts` | AsyncStorage cache with write-mutex (prevents concurrent-write data loss) |
| `src/providers/fetchPrayerTimes.ts` | Fan-out to all providers; calls `validateTimings()` on every response |
| `src/providers/validateTimings.ts` | Asserts all 6 keys present and `HH:MM` formatted — throws on failure |
| `src/providers/localAdhan.ts` | On-device fallback (adhan.js); used when network fails |
| `src/providers/islamiskaForbundet.ts` | Sweden-specific HTML scraper with 6-hour sanity check |

### GPS & location
| File | Role |
|---|---|
| `src/hooks/usePrayerDay.ts` | **Instant-load pattern**: shows cached coords immediately, GPS in background, re-fetches only if device moved >~1 km (`coordsChangedSignificantly`) |
| `src/context/PrayerSettingsContext.tsx` | Persists `lastFetchedLatitude/Longitude`; clears them on location-mode switch |

### Widget
| File | Role |
|---|---|
| `src/widget/buildWidgetPayload.ts` | Builds the JSON pushed to both platform widgets; rolls to tomorrow after Isha |
| `src/widget/syncPrayerWidget.ts` | Called from HomeScreen on every focus; pushes payload via native module |
| `src/native/PrayerWidget.ts` | Typed wrapper for the `PrayerWidget` native module (Android + iOS) |
| `ios/PrayerWidgetExtension/PrayerWidgetExtension.swift` | WidgetKit timeline provider; handles day-rollover (all-times-in-past → use tomorrow base date) |

### Notifications
| File | Role |
|---|---|
| `src/notifications/prayerNotifications.ts` | Schedules notifee notifications; resyncs on TZ change and AppState active |
| `src/notifications/adhanSafetyControls.ts` | Prevents duplicate/stale notifications |

### Settings modals (extracted from SettingsScreen)
`src/screens/settings/` — `MethodModal`, `PreReminderModal`, `SoundPickerModal`, `LanguageModal`

---

## Important patterns & rules

### Never use (0, 0) coords
`lastFetchedLatitude ?? 0` is a bug — it sends prayer times for off the coast of Ghana.
Always check `!= null` and show a loading/error state instead.

### RTL layout
Use `paddingStart/End` and `marginStart/End` — never `Left/Right`.
Arabic and Urdu are supported; test in those locales after layout changes.

### Adding a translation key
Add to **all 13** files in `src/i18n/locales/`. Missing keys silently fall back to the key name.

### Widget payload rollover
`buildWidgetPayload` switches to tomorrow's data when all of today's prayers have passed (after Isha). The iOS WidgetKit timeline must account for this: when all `HH:MM` times appear to be in the past, use tomorrow's calendar date as the base for scheduling entries.

### Provider validation
Every network provider response must go through `validateTimings()`. Local adhan (on-device) is exempt.

### Concurrent cache writes
`prayerStorage.ts` serialises all `setItem` calls through `_writeMutex`. Do not bypass it.

### Commit messages
No `Co-Authored-By` or AI-tool attribution lines. History has been cleaned; keep it that way.

---

## Tests

```bash
npx jest                                          # all tests
npx jest --testPathPattern=buildWidgetPayload     # widget rollover
npx jest --testPathPattern=prayerStorage.race     # concurrent write safety
npx jest --testPathPattern=validateTimings        # provider validation
npx jest --testPathPattern=prayerNotifications    # timezone/scheduling
```

All tests live in `__tests__/`. No snapshot tests — all assertions are explicit.

---

## F-Droid metadata

Local copy: `contrib/fdroid/com.prayer_times.yml`
Fork: `/Users/hassan/git/fdroiddata/metadata/com.prayer_times.yml`
MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/36312 (branch `add-com.prayer_times`)

When updating, push the fork branch — the MR updates automatically. Always keep the two YAML files in sync.
