# Widgets — what is done, and what is left for you

Written at the end of the widget build, for Hassan to read before cutting a
release. **Nothing has been version-bumped, tagged or published.** The tree is
still 2.9.0 (238) and every gate below was run against it.

## The catalogue, against the plan

The plan's eight widgets, minus Ayah of the Day (dropped at your request).

| Plan | iOS | Android | Notes |
|---|---|---|---|
| 1 · Next Prayer | systemSmall, accessoryCircular, accessoryInline | 2×1 | On iOS this is a family of the Prayer Times kind, not a separate kind — see the one divergence below |
| 2 · Prayer Times | systemMedium, systemLarge | one entry, 4×2 → 4×4 | Android went from two picker entries to one |
| 2b · + Practice | systemLarge | 4×4 | Grid is a Bitmap on Android |
| 3 · Log Today | systemMedium (iOS 17) | 4×2 | Buttons absent on iOS 16; card deep-links instead |
| 4 · Streak & Practice | small, medium, inline, rectangular | 2×2 → 4×2 | |
| 5 · Continue Reading | small, medium, inline, rectangular | 2×2 → 4×2 | |
| 6 · Hijri Date | small, inline, rectangular | 2×1 | Android's was the last one missing |
| 7 · Ayah of the Day | — | — | Dropped |
| 8 · Tasbih | systemMedium (iOS 17) | 4×2 | |

Android's picker is exactly seven entries. iOS's gallery is six kinds.

### The one deliberate divergence

The plan says to split iOS's existing kind into **Next Prayer (small)** and
**Prayer Times (medium/large)** as separate kinds. That has not been done, and
should not be without a migration plan.

WidgetKit ties a placed widget to its kind. Moving systemSmall to a new kind
turns every already-placed small Mihrab widget into a dead placeholder on
somebody's home screen — the same class of failure the plan's own Migration
section goes to lengths to avoid on Android, and the reason the Live Activity
was moved out of the extension rather than the widgets. The user-visible
difference is one gallery card: someone picking "Prayer Times" and choosing
small still gets the Next Prayer design.

If you want the split, it needs a release where the old kind keeps vending
systemSmall as a deprecated alias.

## Drawn to the plan's mocks

Checked side by side against the rendered mocks, not from memory:

- **iOS systemLarge** — header with the Hijri date opposite, NEXT, the prayer
  and its time, `in` over the duration right-aligned, the six times, the two
  night rows muted beneath them, a rule, then the streak block with the grid
  beside it.
- **Android 4×2** — header, the six-column strip, a rule, `Dhuhr in 2:29:17`
  opposite `2 of 5 logged`, and the night pair under that.
- **Android 4×4** — the same, plus a rule, `12 day streak · Best 31 · …`, the
  practice grid across the full width, and `Sunnah 68% this month` opposite
  `6 fasts`.
- **Android narrow-and-tall** — mirrors the systemLarge layout rather than the
  two-column split it used to draw.

## What was verified, and how

Every widget was placed and driven, not just built.

- **iOS 17 simulator** — all six kinds placed. Log Today: tap flipped the cell
  and moved the header 2→3 of 5, opening the app wrote "On time" to the Log,
  two taps inside the minute went 3→4→3. Tasbih: 12→14 on the widget, and the
  Tasbih screen then read 14. Continue Reading opened Al-Fatihah in the
  translation reader (the mushaf is not downloaded there — that is the case
  the resolved `mode` exists for). All five Lock Screen accessory entries
  placed on a live Lock Screen.
- **Android emulator** — all seven picker entries render distinct, non-blank
  previews. Tasbih driven through +1 ×3, Next, drain, Next. The Chronometer
  observed ticking (`in 4:43:56` → `in 4:43:47`). Night times, the logged
  line and the practice grid all confirmed on a placed instance.
- **The retired provider** — `dumpsys appwidget` shows
  `PrayerWidgetLargeProvider` still registered AND still holding a bound
  instance after being taken out of the picker, and that instance draws the
  merged design. This is the migration the plan asks for, observed rather
  than assumed.
- **Payload expiry** — the stored payload was aged sixty days on purpose. All
  placed widgets fell back to "Open Mihrab" rather than showing stale numbers;
  restoring it brought them back. That is the Homebrew-Mac blank-widget bug
  (970a971) reproduced deliberately against the new widget kinds.
- **Catalyst** — builds and signs with Developer ID. The build script's own
  gates pass: extension sandboxed, both sides sharing
  `GAW23HT439.group.com.prayerapp`, and the App Group holding today's payload.
- **Every size band of the Android prayer-times card, drawn and read.** The
  band mapping had been proved by probe but not looked at since the
  height-axis correction, so all three were rendered on a placed instance.
  Two rows (210dp): header, six-column strip, next-prayer line — no graph,
  nothing clipped. Three rows (321dp): the streak line and the ten-week
  graph join, still inside the card, Monday-first, future days drawn dim.
  The footer band (375dp and up) needs more height than a 420dpi Pixel grid
  will give, so it was reached by dropping the same emulator to 300dpi,
  where three rows measures 488dp: "Sunnah 0% this month" joins the graph
  and nothing is pushed out. That exercise is also what found the 400dp
  `maxResizeHeight` ceiling (075450a) — a declared maximum smaller than a
  size the launcher was already drawing.
- **All six iOS widget kinds, placed and read on a live home screen.** Prayer
  Times in all three sizes (small ring counting down, medium with the full
  list and Isha highlighted, large adding Islamic Midnight, Last Third and
  the streak footer), Hijri Date, Streak & Practice, Continue Reading, Log
  Today and Tasbih. Every one drew real payload data, not placeholder text.
  They were then put through a `chronod` and SpringBoard restart and came
  back drawing the same data with the countdown advanced — the ring moved
  21% → 39% across the session without the app being opened.

## The one check I could not do

**Place the new widgets in macOS Notification Centre and look at them.**

`MihrabAppGroup.m` is explicit that this is the only check that catches its
class of bug: "signature verification passes, notarization passes, pluginkit
registers, and chronod reports success" — and the card can still be empty. It
needs a human at an unlocked machine, and the screen was locked.

What is new since that note was written, and so has never been exercised on
macOS: **the widget extension now WRITES to the App Group**, which it never
did before — Log Today and Tasbih queue taps there. If entitlements are wrong
in a way reads survive and writes do not, the failure is a button that does
nothing. The write calls `synchronize()` and round-trips, so it fails quietly
rather than misleadingly, but it has not been watched.

Ten minutes, on the signed build already at
`ios/build/catalyst-dist/Mihrab-macOS-2.9.0.zip`:

1. Unzip, run it, open Notification Centre, add each Mihrab widget.
2. Confirm each draws real data rather than an empty card.
3. Press **+1** on Tasbih. The number must move.
4. Open the app. The Tasbih screen must show the incremented count.

If step 3 does nothing, the extension cannot write its App Group container
and the two interactive widgets should be withheld from the Catalyst build
(`#if targetEnvironment(macCatalyst)` around them in the bundle) rather than
shipped dead.

## Gates, all green at 2.9.0

- `npx tsc --noEmit` — clean
- `NODE_ENV=test npx jest` — **1341 tests, 118 suites**. The `NODE_ENV=test`
  is not decoration: with `NODE_ENV=production` exported in the shell, `react`
  resolves to its production build, `React.act` is not exported, and every
  `.tsx` render suite fails with `(0, _react.act) is not a function` — 87
  failures that are nothing to do with the code.
- `npx eslint .` — 375 problems, 18 of them errors, all pre-existing; the same
  count before and after this work, and none in a file this branch touched
- `node scripts/audit-locales.js` — 0 key mismatches
- `:app:bundlePlayRelease` and `:app:assembleFdroidRelease` — both succeed, as
  **separate invocations**
- iOS simulator build — succeeds
- Catalyst Developer ID build — succeeds, entitlement gates pass

## Left for you, behind the credential wall

None of these can be done without your credentials, and none have been
started:

1. **Version bump** — you said you would say when. Nothing has been touched.
2. **Release notes and the site stamp** — waiting on the version.
3. **Tag and push** — remember: never delete or move a pushed tag; the F-Droid
   bot and the GitHub release draft both key off it.
4. **Notarize and staple the Catalyst zip** — needs the keychain profile.
5. **Xcode Cloud / App Store Connect** — needs the `.p8`.
6. **GitHub release, Homebrew cask, F-Droid recipe** — follow from the tag.
7. **`verify-release.sh`** — run it until it passes.

## Loose ends worth knowing about

- **The app's own header still reads the long place name.** `shortPlaceLabel`
  is applied at the widget payload boundary only, because the brief was
  widgets. The Home header and the Live Activity still show whatever the
  geocoder returned. One line to change if you want it.
- **`_to_delete/`** is still untracked in the working tree, now with a
  `shots/` folder of verification screenshots inside it. Yours to delete.
- **Android's Next Prayer has no elapsed ring.** The plan's iOS mock has one;
  its Android mock does not, so this matches the plan as drawn.
- **Splitting the iOS extension left an entitlement nobody needed, and it
  broke every cloud build.** `Widgets phase 0` gave the Live Activity its own
  target and copied `PrayerWidgetExtension.entitlements` across with it,
  App Group and all. A Live Activity does not read shared storage — ActivityKit
  hands it its attributes and content state — so the group was never used, but
  claiming it meant the App ID `com.hassan.prayerapp.MihrabLiveActivity` had to
  exist and had to carry the App Groups capability, and automatic signing on
  Xcode Cloud will do neither for you. Builds 520 to 522 all archived cleanly
  and died at export: first `Automatic signing cannot register bundle
  identifier`, then, once the App ID was registered by hand, `cannot update`
  it, because attaching an App Group is portal-only work that the App Store
  Connect API does not expose at all. Local archives never noticed, because
  they export against a profile that already exists on the machine.

  Fixed by asking for nothing: the entitlements file is empty, the capability
  is off the App ID, and there is nothing left for automatic signing to
  reconcile. Two rules fall out of it, both in CLAUDE.md §10 — **an extension
  target's entitlements are a signing contract, not boilerplate to copy**, and
  `xcode-cloud.py why` will not tell you any of this: the real message only
  exists inside the run's LOG_BUNDLE artifact.
- **On a 420dpi Pixel-style 4x6 grid the prayer-times card tops out at three
  rows**, whatever `maxResizeHeight` says — the launcher simply refuses to
  grow it further, before and after the 400→600dp change and across a
  reboot. Three rows there is 321dp, which is inside the graph band and
  below the 375dp footer band, so those users get the graph and never the
  month footer. Nothing is broken by it: every size the widget can actually
  take renders correctly. But it does mean `PRACTICE_MIN_HEIGHT_DP` is dead
  weight on the most common Android configuration, and if you ever want the
  footer visible there it has to come from making the three-row layout
  hold one more line, not from raising a ceiling. There is no room for that
  line today — at 321dp the graph already reaches the bottom of the card.

## Answered: how a widget stays true

This section used to be titled "Open: does every widget see a change the
moment it happens?" It was real, it was worse than described, and it is
fixed. What follows is the contract, so the next person inherits it rather
than rediscovering it.

### One writer, and it is not a screen

`syncPrayerWidget` used to have exactly two callers, both inside
`HomeScreen`. Nothing else in the app ever wrote `payload_v1`. The tabs are
lazy, so `HomeScreen` only mounts once Today has been focused — and **every
deep link the widgets themselves fire** (`mihrab://log`, `mihrab://tasbih`,
`mihrab://quran`, `mihrab://read/:id`) opens the app without mounting it. Tap
a widget, do the thing it asked you to do, and it kept its old numbers for
the whole session. Reproduced on a simulator: marking a prayer missed left
the payload byte-identical until the app was restarted.

`src/widget/republishWidgetPayload.ts` now builds it from settings, the
on-disk prayer cache, and the practice / quran / tasbih stores.
`startWidgetPayloadSync()` runs from `AppNavigationRoot`, which mounts
whichever screen the user landed on, and republishes on:

| Trigger | Where |
|---|---|
| launch | `startWidgetPayloadSync` |
| any practice / quran / tasbih write | store subscriptions, 1500 ms trailing debounce |
| language change | `i18n.on('languageChanged')` |
| `AppState` → active | immediate, not debounced |
| after either tap queue drains | `AppNavigationRoot`, and the notifee background handler |
| backup restore | `snapshotStore.writeData` |

`HomeScreen` still pushes. It has a live GPS fix and a freshly geocoded city
name before either has been written back to settings, so its copy is the
better one **when it exists**; the module is what guarantees there is one the
rest of the time.

It never fetches. A republish can be triggered by a bead being counted, so
the window is read cache-first, then computed on-device with adhan.js, then
not at all. `(0, 0)` bails before `buildWidgetPayload` can throw.

### What each card does when the window runs out

`payloadHasExpired` asks one question: does `days[]` still reach today. Every
widget on both platforms honours it — `PrayerWidgetProvider` was the last
holdout, and past the window it fell through to the top-level single-day
`rows` and drew whenever-the-app-was-last-open **as today**, with a live
countdown. It shows `widget_placeholder_day` now, the same as the rest.

Expiry is not the only staleness. `days[]` rolls; `today`, `hijri` and
`dayLabel` do not — they are stamped once, at write time. From day *two*,
inside a perfectly valid window, the Android card stated one date above
another day's times. The header now comes from the day's own entry, and the
two single-day facts are drawn only when `payloadDescribesToday`.

### What refreshes a card with the app closed

- **`updatePeriodMillis`** — 30 min, prayer widgets only. The system's own
  update, and the most reliable thing here.
- **`ACTION_PRAYER_TIME_ELAPSED`** — armed by `armWidgetAlarms`, which runs
  **before** any drawing and outside everything that can fail. It used to sit
  at the bottom of a successful `applyJson`, so a home screen holding only a
  Streak widget never armed an alarm at all, and one throwing payload killed
  the chain until reboot. The broadcast fans out to all eight providers; it
  used to reach four.
- **`BOOT_COMPLETED`** and **`MY_PACKAGE_REPLACED`** — both redraw everything.
- **WidgetKit timelines** on iOS — one entry per day-start and per prayer,
  capped at 60 boundaries, `.after(last + 2h)`. Tasbih was `.never` and is
  not any more.

`ACTION_SCREEN_ON` and `ACTION_WALLPAPER_CHANGED` are gone from all seven
receivers. Neither can be delivered to a manifest-declared receiver, and
declaring them made the refresh story look far better covered than it was.

### The failure modes that are now contained

- **iOS decoded the payload as one `Codable`.** `decodeIfPresent` throws when
  a key is present but unreadable, so one malformed `practice` field blanked
  all six cards at once, prayer times included. Prayer times stay strict;
  every other block degrades to absent.

  The hand-written `init(from:)` that replaces the synthesized one is the
  riskiest edit in this whole batch — a single wrong key name would silently
  nil a field rather than fail, and it would compile. So it was run, not
  reasoned about: the extension's sources were compiled for macOS against a
  real 30-day / 94-practice-day payload lifted out of the simulator's App
  Group, and every field of every block was asserted. All sixteen checks
  pass. A `practice.streak` corrupted to a string costs `practice` and
  nothing else — prayer times, `days` and `tasbih` all survive — and a
  payload with no `rows` is still refused outright.
- **Android redraws each widget behind its own guard**, so one card cannot
  take down the other seven.
- **Tap queues** discard entries older than fourteen days at drain, are
  capped at 4000 entries, and are dropped entirely when the install marker
  says they were queued on a different device — the log queue's entries name
  their own date and survive a restore honestly, but tasbih entries are
  counts and would have been added a second time.

### What is still worth watching

- **Three and four rows on Android have not been LOOKED at** after the
  height-axis correction. `OPTION_APPWIDGET_MIN_HEIGHT` is the landscape
  height, and every threshold in `PrayerWidgetProvider` and
  `PrayerWidgetReadingProvider` had been tuned against it; they are
  re-expressed against the real card height, whose measured boundaries on a
  420dpi phone are 99 / 210 / 321 / 432 for one to four rows.

  The band mapping itself was proved on device — a temporary probe printed
  the decision for each of those four heights, and it comes out identical to
  what the old constants selected:

  | rows | dp | strip | rows layout | practice grid | month footer |
  |---|---|---|---|---|---|
  | 1 | 99 | – | – | – | – |
  | 2 | 210 | yes | yes | – | – |
  | 3 | 321 | yes | yes | yes | – |
  | 4 | 432 | yes | yes | yes | yes |

  One and two rows were also checked by eye. What is missing is a rendered
  three- and four-row card, which needs a widget placed and dragged — the
  picker's drag-to-place does not automate (neither `input swipe`,
  `motionevent` nor `draganddrop` produce a drag Launcher3 accepts), so it
  wants ten seconds of a human hand.
- **Nothing rebuilds the payload while the app has never been opened.** The
  window is 30 days of cached schedule, which is what carries an unopened
  app; past that every card asks to be opened, which is correct but is still
  the ceiling. A real background refresh would need WorkManager on Android
  and a `BGAppRefreshTask` on iOS, and neither exists today.
- **The Quran and settings blobs are restored by category.** `writeData`
  now routes the Quran one through `primeQuranState`, but tasbih is not in
  the snapshot schema at all, so it does not travel between devices.
