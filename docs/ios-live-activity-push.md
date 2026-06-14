# iOS Live Activity — local-first design (no server)

## Decision

Mihrab is **local-first**: prayer times are computed/stored on-device and the
app must work with no network. We therefore **do not use APNs / a push server**
for the Live Activity. This doc records that decision and the on-device
mechanisms we use instead. (An earlier draft proposed an APNs push pipeline;
that was rejected — see "Why not push" below.)

## How the Live Activity stays correct, offline

1. **Live countdown + progress, rendered on-device.** The Lock Screen and
   Dynamic Island use `Text(timerInterval:)` and `ProgressView(timerInterval:)`
   (see `PrayerLiveActivityWidget.swift`). These tick and fill every second on
   the device with **zero** app execution or network — the countdown to the
   next prayer is always live and correct offline.

2. **Foreground refresh.** Whenever the app becomes active / the prayer-day
   data changes, `syncLiveActivity` pushes the current `ContentState`
   (`PrayerLiveActivity.swift` → `Activity.update`). This is the primary
   rollover path: the highlighted "next prayer" advances every time the user
   opens the app.

3. **Background rollover via `BGTaskScheduler` (no server).** A
   `BGAppRefreshTask` (`LiveActivityRefresher.swift`) recomputes the current
   prayer from the running activity's own `rows` (each carries `HH:MM` + a
   localized `name`) and calls `Activity.update`. This advances the highlighted
   prayer while the app is backgrounded **without any push**. iOS schedules
   these tasks opportunistically and throttles them, so the timing is
   best-effort — it cannot guarantee "update exactly at Maghrib," but combined
   with the always-live on-device countdown it keeps the card current.

4. **`staleDate`.** Each update sets `staleDate` just after the next prayer
   (iOS 16.2+), so if no refresh has landed yet the system visibly
   de-emphasizes the card rather than showing a stale state as if it were live.

## The duration reality (why a server wouldn't change the picture)

iOS ends a Live Activity after **8 hours** of activity and removes it from the
Lock Screen after at most **12 hours** total. So a Live Activity is inherently a
"counting down over the next few hours" surface, **not** an all-day fixture —
with or without a push server. The all-day, always-correct surface is the
**home-screen widget**, which is already fully local (WidgetKit builds its
multi-day timeline on-device; see `PrayerWidgetExtension.swift`). The Live
Activity is re-armed from the foreground whenever the user next opens the app,
which comfortably fits the 8-hour window.

## Why not push

- APNs cannot run locally. A push must be signed with the app's APNs key and
  delivered from Apple's servers over the internet; the device cannot push to
  itself, and a "self-hosted" relay would still go out through Apple. There is
  no offline/loopback variant.
- It would add a server dependency that contradicts the local-first principle
  and the F-Droid/no-network posture (CLAUDE.md §4).
- Given the 8–12h cap, push buys only background rollover of the highlighted
  prayer for a few hours — which `BGTaskScheduler` + foreground refresh already
  approximate locally.

## Components

- `ios/PrayerWidgetExtension/PrayerLiveActivityAttributes.swift` — shared
  `ContentState`; each `Row` carries `key` / `abbr` / `name` / `time` so the
  background task can rebuild the hero label without localization tables.
- `ios/PrayerWidgetExtension/PrayerLiveActivityWidget.swift` — on-device timer
  + progress rendering.
- `ios/PrayerApp/PrayerLiveActivity.swift` — start/update/stop bridge; sets
  `staleDate`; kicks the BG refresh schedule.
- `ios/PrayerApp/LiveActivityRefresher.swift` — `BGTaskScheduler` registration,
  scheduling, and the recompute-and-update handler.
- `ios/PrayerApp/AppDelegate.swift` — registers the BG task at launch and
  schedules it when entering the background.
- `Info.plist` — `BGTaskSchedulerPermittedIdentifiers` + `UIBackgroundModes`
  (`fetch`).

The Live Activity setting remains labelled **experimental** on iOS
(`settings.liveActivityExperimental`) while background rollover is best-effort.
