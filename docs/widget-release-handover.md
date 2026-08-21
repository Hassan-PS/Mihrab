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
- `NODE_ENV=test npx jest` — **1328 tests, 116 suites**
- `npx eslint src/ __tests__/` — 358 problems, all pre-existing; the same
  count before and after this work
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

## Open: does every widget see a change the moment it happens?

Reported after the 4×1 work and not fully chased down. What is known:

**The push path looks right.** `useWidgetDataRevision` subscribes to the
practice, Quran and tasbih stores; a change bumps a revision, and
HomeScreen's payload effect lists that revision in its deps. It is a plain
`useEffect`, not `useFocusEffect`, so it does not require Home to be the
visible tab — only for HomeScreen to be mounted, which a tab navigator keeps
it after first visit. `PrayerWidgetModule.setData` then calls `requestUpdate`
on all six Android providers, so one push refreshes every kind.

**Two things that would defeat it, neither confirmed:**

1. `useWidgetDataRevision` coalesces on a 1500 ms trailing debounce. A change
   watched for less than that reads as "not refreshing".
2. If HomeScreen is ever unmounted — a cold start straight into another tab,
   or a navigator config change — nothing rebuilds the payload at all until
   Home is visited. The sync living inside a screen is the structural
   weakness here; it belongs at app level, next to the stores it watches.

**Worth ruling out first:** the screenshot that prompted this showed
"0 days · 1 of 5 today", which is what a correct partial day looks like — a
streak needs all five, so it stays 0 until the day is complete. That the
"1 of 5" moved at all says a push DID happen. Before treating this as a sync
bug, log a prayer and watch whether the *logged count* moves within a couple
of seconds; if it does, the payload is arriving and the question is what the
streak should say, not whether it updated.

**If it is real**, the fix is to move the payload build out of HomeScreen and
into a module that subscribes to the same stores directly, so no screen has
to be mounted for a widget to be true.
