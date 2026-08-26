# Background power — what runs, what it costs, what to do about it

Audit date: 2026-08-24, against v2.10.1.

## What this is, and what it is not

A **static** audit: every periodic wakeup, sensor subscription, alarm and
foreground service in the app, found by reading the code, with the interval
constants quoted. It is not a measurement. Nothing here is expressed in mAh,
because nothing here was measured on a real battery — the emulator's battery
stats are fiction, and the phone was not on adb when this was written. So the
ordering below is by *structural* cost (how often a thing runs × how much it
does × how many users have it on), not by observed drain.

The last section says how to turn these into real numbers, which is worth
doing before and after the P0 change at minimum.

## The map

Everything that runs without the user looking at the app.

| # | What | Where | How often | Who has it |
|---|------|-------|-----------|-----------|
| 1 | Live Activity notification re-post | `MihrabLiveActivityService.kt:196` | **1 s** screen-on, 60 s screen-off, indefinitely | opt-in |
| 2 | Home countdown re-render | `TodayCard.tsx:116` | **1 s**, including backgrounded | everyone on the Today tab |
| 3 | Magnetometer + watchdog | `useCompassSensor.ts:109`, `:256` | **100 ms** sensor, 600 ms watchdog | anyone who opened Compass once |
| 4 | Widget fan-out on unlock | `PrayerWidgetProvider.kt:415` | every unlock, ×9 receivers | anyone, widget or not |
| 5 | Home day/TZ watchdog | `HomeScreen.tsx:308` | 30 s, backgrounded too | everyone |
| 6 | Foreground cascade | `usePrayerDay.ts:631` + effects | every `'active'`, unthrottled | everyone |
| 7 | Pending OS alarms | `prayerNotifications.ts` et al | ~106 standing, rewritten per foreground | everyone |
| 8 | Doze-piercing wake alarms | `MihrabLiveActivityService.kt:514` | ~6/day `RTC_WAKEUP` | opt-in |
| 9 | Widget poll | `prayer_widget_info.xml:54` | 30 min, non-wakeup | widget users |
| 10 | Wi-Fi backfill burst | `usePrayerDay.ts:576` | ≤1/hour, ~90 network rounds | everyone |
| 11 | autoSync ticker | `autoSync.ts:135` | 2 min timer, work suppressed when not active | everyone |

Items 9 and 11 are already cheap and are listed only so nobody "optimises"
them later and breaks something for nothing. See *Leave alone*.

---

## P0 — The Live Activity re-posts a notification every second to animate a countdown the OS can animate itself

**Now.** `scheduleTicker()` re-posts the whole notification on a
`Handler.postDelayed` chain at `TICK_MS_SCREEN_ON = 1_000L`
(`MihrabLiveActivityService.kt:575`). Each tick does:

- `recomputeFromDays(payload)` — `JSONObject(payload)` over a **30-day**
  window (`WIDGET_WINDOW_DAYS = 30`, `src/prayer/widgetDayWindow.ts:31`),
  builds an event list across every day in it, sorts it, then parses the
  payload **again** to rewrite `rows`/`sunriseRow`/Hijri;
- `build(currentPayload)` — parses it a **third** time and constructs the
  notification, including the Android 16 `ProgressStyle` segments and two
  reflection lookups on the promotion path;
- `NotificationManagerCompat.notify(...)` — a binder round-trip into
  NotificationManagerService, which re-inflates and re-ranks it.

Three full parses of a 30-day schedule, an allocation-heavy rebuild and a
binder IPC, **3600 times an hour**, for as long as the screen is on — whether
or not the app is in front, for as long as the feature is enabled, across
reboots (`MihrabRestartReceiver.kt:69` brings it back).

**Why it is there.** The seconds in `H:MM:SS` have to advance.

**The change.** Let the platform tick them. `setUsesChronometer(false)` is set
explicitly at `MihrabLiveActivityModule.kt:433`; the countdown variant should
instead use `setUsesChronometer(true)` + `setChronometerCountDown(true)` +
`setWhen(nextEpochMs)`, which is exactly what the notifee path already does on
the JS side (`src/notifications/liveActivity.ts:487` sets
`showChronometer: true` / `chronometerDirection: 'down'`). The OS then animates
the seconds with no app involvement, and the ticker drops to:

- **on prayer change** (~6/day) — re-post with new times, re-arm the alarm;
- **once a minute** — only to move the `ProgressStyle` bar, which crawls
  across a multi-hour interval and cannot visibly need 60 updates a minute;
- **on screen-on / config change** — as today.

That is ~3600 rebuilds/hour → ~60. Same visible behaviour.

**Risk.** A chronometer renders as a bare `H:MM:SS`, so any styling the
current text has (the prayer name inline with the time, the localised label)
has to survive being split between `contentText` and the chronometer slot. On
Android 16 the `ProgressStyle` promotion path needs checking — verify the chip
still promotes with `usesChronometer` set. Both are visual checks on a device,
not guesses to make in the plan.

**Verify.** With the Live Activity on and the screen awake for 60 s:
`dumpsys notification --noredact | grep -c "com.prayer_times"` is not the
measure — instead count re-posts by logging in `notify()` behind a debug flag,
or watch `perfetto`'s NotificationService track. Before: ~60 posts/minute.
After: ~1.

## P1 — The Home countdown keeps ticking after the user leaves the app

**Now.** `TodayCard.tsx:110-118` gates its 1 Hz `setInterval` on
`useIsFocused()` — **navigation** focus, not app foreground. Background the app
from the Today tab (the default tab, so this is the common case) and the timer
keeps firing: a `setNow(new Date())` state update and a hero re-render, once a
second, until the process dies or the OS freezes the timer. `TodayCard.tsx`
does not import `AppState` at all.

**The change.** Gate on both: `focused && appState === 'active'`. A small
`useIsActive()` hook (focus AND foreground) is worth writing once, because
items 2, 5 and the Ramadan card all want it, and every one of them got this
wrong independently.

**Risk.** Near zero. On return to foreground the effect re-runs and `setNow`
fires immediately, so the countdown is never seen stale.

**Verify.** Background from Today, then
`adb shell dumpsys cpuinfo | grep prayer_times` — the JS thread should go
quiet instead of holding a steady percentage.

## P2 — The compass keeps the magnetometer at 10 Hz after the user walks away from it

**Now.** `useCompassSensor(sensorEnabled)` is enabled by
`const sensorEnabled = hydrated && !needsGpsPrime;` (`CompassScreen.tsx:55`) —
no focus gate, no AppState gate. The hook subscribes the magnetometer at
`setUpdateIntervalForType(SensorTypes.magnetometer, 100)` (`:109`) plus a
600 ms watchdog (`:256`), and tears both down **only on unmount** (`:274-288`).
Its AppState listener handles `'active'` only (`:270-272`) — there is no
`'background'` branch. And `enableFreeze(false)` (`index.js:30`) keeps every
visited screen live in the React tree by design.

Net: open Compass once, and the phone samples a sensor 10 times a second
forever — in your pocket, overnight, until the process is killed.

**The change.** Pass `sensorEnabled && isFocused && appState === 'active'`
into the hook, and add the `'background'` branch that unsubscribes. The
existing `restartSubscription()` on `'active'` already makes resume correct.

**Risk.** Low. The compass takes a moment to settle on re-entry, which it
already does today from cold.

**Verify.** `adb shell dumpsys sensorservice | grep -A3 prayer_times` while
backgrounded — the connection should be gone, not idle.

## P3 — Every unlock runs the widget fan-out nine times

**Now.** All nine widget receivers declare `ACTION_USER_PRESENT` in the
manifest, and each maps it to `PrayerWidgetProvider.requestUpdate(context)`.
That method (`:405-444`) runs `dropQueuesFromAnotherDevice` (a `Settings.Secure`
read + a prefs write), then `armWidgetAlarms` — **two `AlarmManager.set*` calls,
unconditionally, before any placement check** — then `getAppWidgetIds` for
three classes plus five sub-provider `requestUpdate` calls, each with its own
`getAppWidgetIds`. Nine receivers × that = ~18 alarm registrations and ~72
binder round-trips per unlock, and the Streak path allocates and draws an
`ARGB_8888` bitmap. It runs identically for a user with **zero widgets placed**.

**The change.** Two independent fixes, both small:

1. Declare `ACTION_USER_PRESENT` on **one** receiver, not nine. The others
   only ever forwarded to the same place.
2. In `requestUpdate`, check placement before arming: if no widget of any
   class is placed, there is nothing to redraw and no boundary alarm worth
   holding. Return early.

**Risk.** Low, but there is a real trap: the boundary alarm is also what
refreshes a placed widget at the prayer boundary, so the early return must be
"no widgets at all", not "none of *this* class".

**Verify.** `adb shell dumpsys alarm | grep -A5 com.prayer_times` before and
after an unlock — the count should stop growing by ~18.

## P4 — One `'active'` event cascades into a GPS fix, an alarm rewrite and a journal decrypt

**Now.** `usePrayerDay.ts:631` calls `requestAndLoad(true)` on **every**
`'active'`, unthrottled. Its `state` change is a dependency of the HomeScreen
effects, so each foreground also triggers: `syncPrayerNotifications`
(`HomeScreen.tsx:314` and again at `:377` on focus), which tears down and
rewrites the whole ~48-alarm prayer set;
`rescheduleEndOfDayLogReminders` (`:333`), which **decrypts the entire journal**
(`endOfDayLog.ts:216` — its own comment says "this runs on every foreground
resync"); an immediate uncoalesced widget payload rebuild
(`republishWidgetPayload.ts:267`); a second widget write from
`HomeScreen.tsx:394`; and a Live Activity push (`:408`).

`autoSync.ts:15-22` already documents that `'active'` "fires several times a
minute in normal use" — share sheets, permission dialogs, unlock. autoSync is
the only path that throttles on it.

**The change.** A single shared foreground throttle, the one autoSync already
proves the shape of (`AUTO_SYNC_MIN_GAP_MS`): skip the expensive resync when
the last one was under ~60 s ago and neither the day, the timezone nor the
settings changed. Applied to the location refresh, the notification rewrite and
the end-of-day rewrite. The widget republish is already coalesced at 1500 ms
for its subscription paths — the `'active'` path bypasses that deliberately and
should keep a shorter, but non-zero, gap.

**Risk.** Moderate, and this is the one to be careful with. "Refresh on
foreground" is why the app is correct after a flight, a timezone change or a
day rollover. The throttle must be keyed on *what would change the answer*
(day key, timezone offset, coordinates, settings version), not on time alone,
or someone lands in Cairo and sees Stockholm's times.

**Verify.** Instrument the resync path with a counter; foreground and
background the app ten times in a minute. Today: ten full cascades. After: one.

## P5 — ~106 standing alarms, rewritten wholesale

**Now.** With defaults: ~24 salāh + ~24 pre-prayer (4-day horizon,
`prayerNotifications.ts:395`), 14 ayah (`ayahOfDay.ts:43`), 7 end-of-day
(`endOfDayLog.ts:71`), 7 khatmah (`khatmahReminder.ts:24`), up to 30 fasting
(`fastingReminders.ts:176`). Up to ~118 with the night times on. Each is an OS
alarm; the app also holds `SCHEDULE_EXACT_ALARM`.

Standing alarms are not themselves a drain — an alarm that has not fired costs
nothing but a row in a table. The cost is in the **rewriting** (P4) and in the
`allowWhileIdle` ones, which pierce Doze.

**The change.** Lower priority than P0-P4, and mostly bookkeeping:
- Shorten the horizons that do not need to be long. 14 days of ayah
  notifications exist so the app survives two weeks unopened; the same
  guarantee holds at 7 with half the alarms, and the reschedule already runs
  hourly on foreground.
- The ayah rewrite does **up to 14 sequential `loadSurah`/`loadTafsir` calls**
  (`ayahOfDay.ts:176`, `:192`) — network-capable work inside what looks like a
  cheap reschedule. Cache per day-key so a rewrite that changes nothing costs
  nothing.
- Audit which alarms genuinely need `allowWhileIdle`. A prayer alert does; the
  ayah of the day at 09:00 does not.

**Verify.** `adb shell dumpsys alarm | grep com.prayer_times | wc -l`.

## P6 — The Wi-Fi backfill is a ~90-round burst that ignores backgrounding

**Now.** Every Wi-Fi connect fires `maybeFullSyncOnWifi`
(`usePrayerDay.ts:576`), throttled by `FULL_SYNC_COOLDOWN_MS = 1 hour` and
skipped once 12 months are stored. When it does run it fetches up to 365 days
at `concurrency = 4` with a 100 ms gap between batches
(`prayerStorage.ts:524-565`) — and nothing cancels it when the user leaves.

**The change.** Cancel on background, resume on foreground; the batching loop
already has a natural checkpoint between batches. Optionally require the
charger, which is what this kind of opportunistic prefetch is for.

**Risk.** Low. It is already resumable by construction — it stores as it goes.

## Leave alone

- **The widget's 30-minute poll** (`updatePeriodMillis="1800000"`). That is the
  platform floor, and AppWidget updates are non-wakeup and batched to the next
  time the device is already awake. Lowering it is impossible; raising it makes
  the widget wrong.
- **The `specialUse` foreground service itself.** It is what keeps the process
  resident so the countdown survives; killing it kills the feature. P0 makes it
  cheap, which is the actual goal.
- **The autoSync 2-minute ticker.** The body already short-circuits unless
  `AppState.currentState === 'active'` (`autoSync.ts:136`), so the cost is one
  no-op JS callback per two minutes. Not worth the risk of touching.
- **`enableFreeze(false)`.** Turning freezing back on would fix P1 and P2 as a
  side effect, and break the thing the comment at `index.js:24-29` describes:
  screens stuck on the old palette after a theme change. Fix the timers
  directly instead.

## Order of work

P0 and P1 are most of the win and carry the least risk. P2 is nearly free and
matters enormously to the few users it affects. P3 is contained. P4 is the one
that needs care and a test. P5 and P6 are cleanup.

1. **P0** — chronometer + 1/min ticker
2. **P1** — `useIsActive()` and the three timers that want it
3. **P2** — compass sensor gating
4. **P3** — one `USER_PRESENT` receiver, placement check before arming
5. **P4** — shared foreground throttle keyed on day/tz/coords/settings
6. **P5** — horizons, ayah caching, `allowWhileIdle` audit
7. **P6** — cancel the backfill on background

## How to get real numbers

The audit is structural; these turn it into evidence. Worth running before P0
and after, on a real phone.

```sh
# Reset, use the phone normally for an hour, then dump.
adb shell dumpsys batterystats --reset
adb shell dumpsys batterystats > before.txt          # Battery Historian input
adb shell dumpsys alarm | grep -A20 com.prayer_times # standing + fired counts
adb shell dumpsys sensorservice | grep -B2 -A6 prayer_times
adb shell dumpsys notification --noredact | grep -c com.prayer_times

# What "Restricted" does to us, which is a different question (see below).
adb shell cmd appops set com.prayer_times RUN_ANY_IN_BACKGROUND deny
```

Perfetto with the `android_power`, `sched` and `binder` data sources for a
60-second capture with the screen on tells the P0 story directly: the ticker
shows up as a once-per-second CPU wake with a binder transaction attached.

## Related

Background *restriction* — what breaks when a user sets the app to
"Restricted" — is a different problem with an overlapping cause: the less the
app does in the background, the less a restricted user loses. Alarms not
firing, foreground services being pulled and `BOOT_COMPLETED` not arriving are
documented at
<https://developer.android.com/topic/performance/background-optimization>.
The app detects battery *optimization* today (`NotificationsCard.tsx:54-64`)
but not restriction, and the two need different settings pages.
