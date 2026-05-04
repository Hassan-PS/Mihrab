# PrayerApp — Improvement Roadmap

A grounded, prioritized list of fixes, polish, new features, and Claude Code workflows for v1.5.56+.

---

## Part 1 — Fix & Harden (current features)

### 1.1 Performance & rendering

**HomeScreen.tsx (801 lines) re-renders every second.** The `setInterval` at line ~91 calls `setNow(new Date())` every 30s, which forces the whole component tree to re-render — day carousel, countdown, prayer rows, all of it. Day carousel items, the next-prayer card, and the countdown should each be their own memoized component (`React.memo`), and the countdown should be the only thing wired to `now`.

**Split god-components.** HomeScreen (801), SettingsScreen (1043), CompassScreen (892) all need to be broken into smaller files. Suggested splits:
- HomeScreen → `DayCarousel`, `NextPrayerCard`, `PrayerRow`, `PermissionBanner`, plus the orchestrator
- SettingsScreen → `AppearanceCard`, `LocationCard`, `NotificationsCard`, `DataSourceCard`, `WidgetCard`, plus orchestrator
- CompassScreen → `CompassDial`, `CompassStatus`, `SensorBootstrap`

**Context bloat.** `PrayerSettingsContext` holds 13 fields. Changing widget color triggers a re-render in HomeScreen even though it doesn't read it. Split into 3–4 domain contexts (Appearance, Location, Notifications, Widget) or use a selector pattern.

**setInterval cleanup.** Verify the clock interval in HomeScreen is cleared on unmount; tighten the dep array of the focus effect so it doesn't re-subscribe on every render.

**Memoization gaps.** `pickerPalette`, modal styles, `nextInfo`, and the day carousel items are recomputed on every tick. Wrap with `useMemo`/`useCallback`.

### 1.2 Reliability & correctness

**Provider error handling is uneven.** `fetchWithRetry` only retries 429/503; 5xx and timeouts fail immediately. Standardize: retry 5xx with jittered backoff, give every provider a 6–8s timeout, and log the failure category to a debug screen.

**Validate every provider response, not just the shape.** `aladhan.ts` accepts a 200 with no structural check before passing to `validateTimings()`. Add an explicit `Maghrib < Isha` and `Fajr < Sunrise` sanity check after parse so a malformed but well-formatted response doesn't poison the cache.

**Islamiska Förbundet HTML scraper is fragile.** The `/\d{2}:\d{2}/g` regex will match any `HH:MM` substring on the page. Switch to a proper HTML parser (`fast-xml-parser` or `cheerio-without-node-native`) or anchor the regex to known surrounding markup. Add a snapshot test of a real page so CI fails the day they redesign.

**DST edge cases are untested.** Sweden does spring-forward and fall-back; the Isha "circular minute diff" logic in `islamiskaForbundet.ts` and the widget midnight rollover need explicit tests for those two days each year.

**Cache write mutex has no timeout.** A hung fetch could block all writes. Add a 10s wrap; on timeout, release the mutex and surface a "couldn't save" warning.

**Cache eviction is silent.** `saveStoredPrayerData()` swallows `setItem` errors. If AsyncStorage hits quota, the app behaves as if saved. Catch quota errors and either evict the oldest month or surface a "storage full" toast.

**Notifications: re-check exact-alarm permission at scheduling time.** Android can revoke `SCHEDULE_EXACT_ALARM` after the user grants it. The current code only checks at boot. Re-check inside `syncPrayerNotifications` and degrade to inexact with a banner.

**Negative pre-prayer reminder.** Clamp `prePrayerReminderMinutes` to `[0, 60]` at the source; right now nothing prevents `-5` and the notification fires after the prayer.

**Cancel-then-create race.** `notifee.cancelTriggerNotifications()` returns before the OS actually clears them on some Android devices. Await with a small delay or use the per-id `cancelNotification` so old IDs don't briefly co-exist with new ones.

**Widget rollover when tomorrow is undefined.** If `state.tomorrow` failed to fetch, the widget falls back to today's data showing "next prayer" as null instead of "tomorrow's Fajr at HH:MM." Add an explicit "next-day Fajr" path.

**`(0, 0)` coords still possible in widget payload.** CLAUDE.md flags this as a known footgun. Add a runtime assert in `buildWidgetPayload` that throws on `(0, 0)` instead of letting Ghana times reach the home screen.

### 1.3 Accessibility

**Live countdown isn't announced.** The next-prayer countdown should use `accessibilityLiveRegion="polite"` (Android) and post a periodic `AccessibilityInfo.announceForAccessibility` (iOS) at meaningful boundaries (every 5 min, then every 1 min in the last 5).

**zh.json compass strings are still English.** `compass.a11y*` keys in `src/i18n/locales/zh.json` contain English fallback text. Translate (and audit other locales — same risk).

**Missing labels & roles.** Day carousel needs `accessibilityRole="tablist"`, theme picker needs `accessibilityRole="radiogroup"`, the calendar/compass header icons need labels. Run a sweep across HomeScreen, SettingsScreen, CompassScreen.

**Hit targets.** Audit all `Pressable` elements for ≥44pt height. Day carousel chevrons and modal dismiss buttons are likely under-sized.

**RTL audit.** Grep the codebase for `Left|Right` in StyleSheet entries (`paddingLeft`, `marginRight`, `borderLeftWidth`) and replace with `Start`/`End`. CLAUDE.md already warns about this — add a CI check.

**Dynamic type.** Test with iOS "Larger Accessibility Sizes" on; CARD_PADDING and ROW_PADDING are hardcoded constants. Use `PixelRatio.getFontScale()` to scale or accept that text might overflow.

### 1.4 Internationalization

**Locale-key drift detector.** No automated check that all 13 locale files have the same keys. Add a Jest test that loads each JSON, flattens keys, and asserts equality with `en.json`. This alone would have caught the zh compass strings.

**Plural forms in Arabic, Russian, Polish.** i18next supports CLDR plurals but `prePrayer.startsIn` style keys aren't using it. Convert `"Starts in {{count}} min"` to `prePrayer_one`, `prePrayer_few`, `prePrayer_many`, `prePrayer_other`.

**Hijri month names.** If the app shows Hijri month names in English in non-English locales, translate them.

### 1.5 Privacy & security

**Encrypted storage for coordinates.** `lastFetchedLatitude/Longitude` and `manualLocationLabel` are PII at rest. Move them to `react-native-keychain` or use `EncryptedSharedPreferences`/`Keychain` via a thin wrapper. Settings pref like theme/language can stay on AsyncStorage.

**Validate fetched JSON shape strictly.** Add `zod` (or hand-rolled type guards) at the boundary of every provider so malicious responses can't poison cache.

**HTTP UA review.** Confirm `httpIdentity.ts` doesn't include device-identifying info; it currently looks clean but pin it down.

**IAP receipt validation.** `react-native-iap` purchases on Play Store can be validated with a simple Cloud Function or a public-key check on-device — even a token check is better than nothing for tip products.

### 1.6 Testing gaps (high-value additions)

The existing 9 tests are good. Add:
- **Locale-key parity** test (catches drift).
- **`usePrayerDay` failover path** — provider fails → local adhan kicks in.
- **Permission denied** flows — both location and notifications.
- **DST transition** — spring forward and fall back for Sweden.
- **Exact alarm permission revoked at runtime.**
- **Widget payload when `tomorrow` is null.**
- **AsyncStorage quota exceeded** behavior.
- **Compass sensor timeout recovery.**
- **Concurrent month loads** for `loadMonthPrayerTimes`.
- **`coordsChangedSignificantly`** thresholds (the ~1km logic in `usePrayerDay`).

### 1.7 Build & release

**Single command version bump.** A small node script that takes `--version 1.5.57 --code 80` and updates `android/app/build.gradle`, the three `pbxproj` occurrences, `package.json`, and the F-Droid YAML in lockstep. Today this is manual and error-prone.

**Auto-generate F-Droid build entry.** Same script appends a templated entry to `contrib/fdroid/com.prayer_times.yml` and mirrors to the fork.

**Release notes.** A `scripts/changelog.js` that builds a CHANGELOG entry from `git log` since the last tag (filter out fixup/wip commits).

**CI.** GitHub Actions workflow that runs `npx jest`, `eslint`, the locale-parity test, and a TypeScript check on every PR. Cheap to add and prevents most regressions.

**iOS release lane.** Even with Xcode Cloud, a `fastlane match`-driven local fallback is worth having for offline emergency builds.

---

## Part 2 — New Features (gaps vs. competitor prayer apps)

Ordered roughly by user value × implementation cost.

### 2.1 Quick wins (1–3 days each)

- **Multiple saved locations** with quick-switch (Home / Work / Travel). Today the app supports only one location at a time.
- **Tasbih (digital counter)** with vibration on increment, configurable target (33, 99, custom), session history. Pure local feature, no network.
- **Hijri calendar with Islamic events** — Ramadan start, Eid al-Fitr, Eid al-Adha, Day of Arafah, Ashura, Mawlid. Static dataset; show as a banner on HomeScreen on the day.
- **Suhoor/Iftar countdown** during Ramadan — automatic when the app detects we're in Ramadan based on the Hijri date already being computed.
- **Adhan preview button in settings** — let the user hear each adhan sound before selecting. (You already have 12 adhan voices.)
- **Snooze/silent/dismiss actions on adhan notification.**
- **Manual adjustment offsets** per prayer (±N minutes) for users whose mosque uses a different convention.
- **Today widget for iOS** (Lock Screen / StandBy / complications). You have a home-screen widget; lock-screen rectangular and circular complications are small additions.
- **Friday (Jumu'ah) highlight** on HomeScreen.
- **Share next prayer time** as a pre-formatted message (for family/group chats).

### 2.2 Mid-effort (1–2 weeks each)

- **Prayer journal / streak tracker.** Tap each of the 5 prayers when prayed; weekly/monthly stats; longest streak. All local, no account needed.
- **Dua library** — categorized supplications (morning/evening, after prayer, travel, food, etc.) with Arabic + transliteration + translation. Static JSON, ships in app.
- **Complete Quran reader with audio recitation** — all 114 surahs offline (Tanzil text bundled), side-by-side translations, multiple reciters streamed with offline-per-surah download, bookmarks, last-read marker, repeat-ayah for memorization. The killer feature most competitors lead with. See task #27.
- **Mosque finder** — Overpass/OSM query for `amenity=place_of_worship + religion=muslim` near the user. No new accounts, no API keys.
- **Wear OS / Apple Watch complication** — show next prayer + countdown. WatchOS via the existing widget data, Wear OS as a lightweight Compose tile.
- **Fasting tracker for Ramadan** — checkbox per day with intention (niyyah) reminder before suhoor.
- **Hijri date picker** for the month view — let users browse a Hijri month, not just Gregorian.
- **Adhan with custom audio** — let users pick a file from their device.
- **Backup/restore settings** to file (no cloud, no account).
- **Theme presets** beyond System/Light/Dark — green, sepia, "high contrast for outdoors."

### 2.3 Larger investments (1+ month)

- **Tahajjud / Duha / Ishraq notifications** with calculated optional prayer windows (third of night, after sunrise + 15min).
- **Family/community mode** — invite household members; shared prayer reminder (e.g., "Dad started Maghrib"). Privacy-preserving with a single shared key.
- **Full Wear OS app and full watchOS app** (not just complications) — qibla on the wrist, tasbih on the wrist.
- **Privacy-first analytics** — aggregated, opt-in, on-device only ("you prayed Fajr on time 18 of 30 days this month") without sending anything to a server.

### 2.4 Polish & design

- **Onboarding flow** for first-run — explain location, notifications, exact-alarm permission in a friendly 3-step modal instead of dumping all permission prompts at once.
- **Empty/error illustrations** instead of plain text. A small SVG of a mosque silhouette for "location needed" beats a paragraph.
- **Haptic feedback** on prayer-time arrival, tasbih increments, day swipe.
- **Subtle animation** on the next-prayer card — a smooth countdown, gentle pulse 1 minute before athan.
- **Dynamic icon** (iOS) — show different colors based on prayer time of day.
- **Status bar tint** matching the current prayer (Fajr blue, Maghrib orange, etc.).

---

## Part 3 — Utilizing Claude Code to the fullest

Concrete tooling to add to `.claude/` to compound your productivity on this codebase.

### 3.1 Slash commands (`.claude/commands/`)

- **`/bump VERSION CODE`** — runs the version-bump script across `build.gradle`, `pbxproj` (3 places), `package.json`, F-Droid YAML, then opens a diff for review.
- **`/release`** — orchestrates the 8-step release checklist from CLAUDE.md: bump → build APK → build AAB → push → tag → gh release → update F-Droid → push fork.
- **`/locale-audit`** — diffs every locale file against `en.json` and prints missing/extra keys per language. Catches the zh.json compass bug.
- **`/locale-add KEY EN_VALUE`** — adds a key to all 13 files, leaves others as a `TODO_TRANSLATE:` marker for human/translator review.
- **`/test-related FILE`** — finds tests under `__tests__/` related to a source file and runs only those.
- **`/dst-test`** — runs the timezone/DST test suite specifically (used before each release).
- **`/perf-scan`** — flags components > 500 lines, missing memoization, `setInterval` without cleanup, inline object props.
- **`/a11y-scan`** — flags JSX missing `accessibilityLabel`/`Role`/`Hint`, hardcoded `Left`/`Right`, hit targets < 44pt.
- **`/provider-snapshot`** — fetches today's times from each provider for a fixed coord, diffs against last snapshot to detect breaking API changes early.
- **`/changelog`** — generates CHANGELOG.md entry from `git log` since the last tag.

### 3.2 Subagents (`.claude/agents/`)

- **`reviewer`** — code-review subagent with PrayerApp-specific rules baked in: never hardcode colors, never use `Left/Right`, every provider response must hit `validateTimings`, never bypass `_writeMutex`.
- **`locale-translator`** — given an English key, produces translations across all 12 non-English locales with consistent terminology (especially Arabic religious terminology).
- **`release-validator`** — runs through the release checklist, verifies all version numbers match across files, checks tag doesn't already exist, dry-runs the F-Droid metadata update.
- **`provider-doctor`** — when a provider breaks (HTML changed, API endpoint moved), this agent investigates, proposes a fix, and writes a regression test against a saved fixture.

### 3.3 Hooks (`.claude/settings.json`)

- **`PreToolUse` for `Edit`/`Write` on `src/i18n/locales/*.json`** — block the edit unless ALL 13 files are being modified together (prevents key drift).
- **`PostToolUse` for `Edit`/`Write` on `src/**/*.tsx`** — auto-run `eslint --fix` on the changed file.
- **`PostToolUse` for `Edit`/`Write` on `package.json`/`build.gradle`/`*.pbxproj`** — print a reminder if version was changed in only one of the four files.
- **`UserPromptSubmit`** — if the user says "release" or "ship", suggest the `/release` command.
- **`Stop`** — if a test file was changed and tests weren't run, prompt to run them.

### 3.4 MCP servers

- **`prayer-times-validator` MCP** — exposes a tool that fetches a known date/coord from each provider and validates the response shape; useful for pre-release sanity.
- **`fdroid-metadata` MCP** — exposes tools to read/update the F-Droid YAML and check rewritemeta linter rules.
- **`xcode-cloud` MCP** (if available) — read build status from Xcode Cloud so the agent knows if main is green before tagging.

### 3.5 Workflow patterns

- **PR drafting** — keep a `.claude/commands/pr.md` that generates a PR description from `git diff main`, including a "Files changed" summary, "Why" pulled from the most recent commit body, and a "Testing" checklist tailored to which subsystems were touched (notifications, providers, widget, etc.).
- **Issue triage from F-Droid/Play Console reviews** — paste a review into a `/triage` command; it categorizes (bug / feature / locale / permission), drafts a response, and creates a TODO entry.
- **Crash-log analyzer** — feed a Play Console ANR/native crash to a `/crash` command; it correlates with recent commits in the affected area.
- **Update CLAUDE.md after each release** — a `Stop` hook that nudges you to update the "Current: vX.Y.Z, build N" line.

### 3.6 Repository hygiene

- Move CLAUDE.md back into the repo (it was untracked in commit cc3fc7a) but with a `# Local notes` section that's `.gitignore`d, so the team-wide guide is shared.
- Add a `.claude/README.md` documenting which slash commands and agents exist, so contributors discover them.
- Add `CONTRIBUTING.md` summarizing the architectural rules in CLAUDE.md for human contributors.

---

## Suggested execution order

If you want a 4-week plan:

**Week 1 — stop the bleeding.** Locale-parity test + fix zh strings, exact-alarm runtime re-check, clamp pre-prayer reminder, widget `tomorrow` null-path, version-bump script, basic CI.

**Week 2 — performance & accessibility.** Split HomeScreen and SettingsScreen, memoize hot paths, split context, accessibility sweep, RTL audit, dynamic-type pass.

**Week 3 — first new features.** Multiple locations, tasbih, Islamic events overlay, Suhoor/Iftar countdown, adhan preview, manual offsets, Friday highlight, lock-screen iOS widget.

**Week 4 — Claude Code tooling.** Slash commands (`/bump`, `/release`, `/locale-audit`, `/perf-scan`, `/a11y-scan`), subagents (reviewer, locale-translator, provider-doctor), hooks for locale-drift and version-sync.

**Backlog (1+ month each).** Prayer journal, dua library, mosque finder, complete Quran with audio, fasting tracker.
