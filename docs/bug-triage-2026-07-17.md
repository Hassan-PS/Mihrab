# Bug triage — 2026-07-17 (user report, real device)

Reported on the user's Android phone (1165×2600, dark theme, running 2.7.39-era JS).
Work these with simulators/emulator per bug; verify before claiming fixed.

## 1. Tools grid renders 2 half-width columns on the user's phone
Screenshot: tiles ~96dp wide, 2 per row, right ~50% of the row EMPTY. The same
build shows a correct full-width 3-column grid on the emulator (Medium Phone
API 36.1) and iPhone sim — device-specific.
- The empty right side means AdaptiveGrid's MEASURED width (onLayout) was
  ~half the real row width at compute time, and it never re-measured (or the
  itemWidth stuck). Suspect the `if (next !== w)` guard + a mid-layout first
  pass, possibly interacting with the new `homeColumn` gap wrapper or a
  display-size/font-scale setting on the device.
- Repro attempt: `adb shell wm density`/`wm size` to mimic the device;
  also try font scale 1.3 + display size Large.
- Candidate fixes: (a) find/fix the measure bug properly; (b) resilience:
  `flexGrow: 1` on item wrappers so rows always fill (changes last-row
  widths — check aesthetics), or re-measure via `key`ing the grid on
  window-width changes.

## 2. "Adhan sound never fires since I turned off the Live Activity" (Android)
Code audit found NO cancel-all in the LA-off path (MihrabLiveActivityModule
.cancel() only clears its own NOTIF_ID; adhanMute marker is event-specific;
LA channel cleanup only touches its own legacy channels). Hypotheses, in order:
- The LA's FOREGROUND SERVICE was keeping the app un-cached, so OEM battery
  policy honored AlarmManager alarms; without it the process is cached and
  the OEM defers/silences them. Test: disable LA on emulator, schedule a
  near-future prayer (fake time or short offset), lock screen, observe.
- Channel state: `ensureChannel` deletes surplus adhan channels per sync —
  verify the SELECTED adhan channel survives an LA toggle + resync cycle and
  still carries its custom sound (dump `adb shell dumpsys notification_manager
  | grep -A5 prayer-`).
- The muted-next-adhan marker or the mute headless task re-creating the
  trigger on the silent channel in some path.
Ask the user (splits the space): do prayer notifications APPEAR silently, or
not appear at all, with LA off?

## 3. Unify tafsir/translation selection (feature)
One global "companion text" preference consumed EVERYWHERE:
- State: extend quran prefs — `companionMode: 'translation' | 'tafsir'`
  (exists as `votdMode`, rename/generalize with additive migration),
  active translation edition (exists: useActiveEdition) + tafsir edition
  (exists: prefs.tafsirEditionId + resolveTafsirEdition).
- Consumers to converge: surah reader translation view rows, mushaf ayah
  sheet (its Translation/tafsir section order + default), verse-of-the-day
  card (votdMode today), ayah-of-the-day notification body, search results?
- UI: one selector component (mode toggle + edition pickers for BOTH modes)
  used in Settings → Quran card AND on the Quran index page (compact row
  near the votd card / header). Switching anywhere applies everywhere.
- 13-locale keys for any new labels; keep phone layouts unchanged otherwise.
- Verify: Android emulator + iPhone + iPad portrait/landscape; both mushaf
  and translation view modes; votd card; a triggered ayah-of-day notification.

Then cut a release (routine incl. verify-release.sh gate).

## Resolution (2026-07-27)
All three shipped on main (commits b7aec9d..8cb1f93+): (1) AdaptiveGrid floor+columnGap — repro was fractional-dp widths (440dpi), verified 440/456/420dpi + iPhone/iPad; (2) adhan-after-LA-off = FGS was masking a today+tomorrow-only alert window + OEM battery kills — now 4 cached days of triggers + battery-optimization fix-it row in Settings; (3) app-wide companion-text pref (companionMode, seeded from votdMode) with its own card on the Quran page, grouped-by-language selector (Arabic+English pinned), one-tap pick-activates-and-closes, applied to reader/votd/ayah sheet/daily notification; al-Muyassar reclassified tafsir-only; cross-language picks honored. 631 tests green.
