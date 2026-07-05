# Quran Reader v2 — Comprehensive Plan

> **Status (2026-07-05): Phases 0–4 implemented** (QR-1…QR-24, except the
> deviations below) and verified on the Android emulator + iPhone 17
> simulator. See CHANGELOG "Unreleased" for the user-facing summary.
>
> Deviations / follow-ups:
> - QR-15 audio pipeline: streaming uses EveryAyah directly (attributed in
>   About) instead of a mirrored release; word timings ARE re-hosted on
>   this repo (`quran-timings-v1`). Mirroring audio remains open.
> - QR-11 "page scrubber" shipped as tap-page-number → go-to-page dialog.
> - QR-23 verse of the day lives on the Quran screen (not HomeScreen), no
>   daily notification yet.
> - "Manage downloads" settings card (sizes / delete / verify) not yet
>   built — the reader's own retry path covers integrity.
> - New patch: `patches/react-native-track-player+4.1.2.patch` fixes RN
>   0.83 bridgeless (Kotlin nullability, Job-returning @ReactMethods,
>   reactNativeHost → reactHost in MusicService.emit). Upstream when RNTP
>   releases a bridgeless-ready version.

Elevating the Quran feature from "generic surah list + image pages" to a
first-class reader competitive with **Ayah** (the app this plan explicitly
benchmarks against): true interactive mushaf, verse-by-verse audio with
highlighting, memorization tools, and Ayah's signature calm minimalism —
while staying inside Mihrab's non-negotiables (no trackers, F-Droid-clean,
13-locale parity, sourced & attributed religious content).

> Task IDs here are `QR-1 … QR-24` to avoid colliding with roadmap `#N`
> numbering. Referenced from `IMPROVEMENT_ROADMAP.md` §2.2.

---

## 1. Where we are today (audit, July 2026)

| Area | Current state | Verdict |
|---|---|---|
| Text data | Full Tanzil Uthmani corpus, per-surah JSON (~23 MB in `src/quran/data/`), 14 translation editions bundled | ✅ Solid foundation |
| Index screen | Flat 114-surah FlatList; no juz/page tabs, no search, no continue-reading | ⚠️ Basic |
| Translation view | `ScrollView` + `.map()` over **all** ayahs — Al-Baqarah mounts 286 cards at once | 🔴 Perf problem |
| Mushaf view | 604 KFGQPC page PNGs (2600×4206) streamed from our GitHub release, 3-page window in a paged ScrollView, RTL page flow | ✅ Clever, but… |
| Mushaf interactivity | **None.** Images are dead pixels: no tap-to-ayah, no highlight, no text selection | 🔴 Core gap vs Ayah |
| Mushaf theming | Hardcoded `#ffffff` parchment; no dark mode; violates the `useAppPalette()` rule | 🔴 |
| Mushaf storage | `Image.prefetch()` → platform image cache. Evictable by OS; completion flag (`mushaf.assets.v3.complete`) can go stale → blank pages offline | 🔴 Stability risk |
| Audio | None (roadmap §2.2 lists it as "the killer feature most competitors lead with") | 🔴 Biggest gap |
| Bookmarks / last-read / khatmah / memorization / search | None | 🔴 |
| Translation loading | Synchronous `require()` of 1–2 MB JSON on the JS thread at first render | ⚠️ Jank on low-end Android |

**What Ayah has that we don't:** verse-by-verse audio with highlighting and
customizable repeat, tens of reciters, khatmah tracking, colorful bookmarks,
starred verses, quick search, verse of the day, tap-anywhere ayah
interactions on a true Madinah mushaf, beautiful night mode.

---

## 2. Architecture decisions

### 2.1 Mushaf rendering: images + ayah-geometry now, glyph fonts later

Two industry approaches:

- **A. Page images + ayah bounding boxes** — Quran for Android's proven
  architecture. Keep our existing 604 PNGs; add the **ayah/word geometry
  database** (QUL publishes bounding-box SQLite for the same KFGQPC pages,
  keyed `page / line / surah / ayah / min_x / max_x / min_y / max_y`).
  Overlay transparent regions on the `<Image>` → tap-to-select, audio
  highlight, bookmark markers — all without re-rendering text.
- **B. Glyph-font rendering** — quran.com's architecture. QPC V2/V4
  page-by-page fonts (604 TTFs, one per page) + QUL mushaf-layout DB
  (15 lines/page, words per line). Real text: scalable, natively themeable,
  tajweed-colored (V4), selectable. Cost: per-page dynamic font
  registration needs a small native module on both platforms, and the line
  layout engine is real work.

**Decision: ship A first (Phases 1–3), keep B as the v3 end-state (Phase 5).**
A reuses everything we have and unlocks the entire Ayah feature set in weeks;
B is a rendering-layer swap later — the interaction/audio/bookmark layers
built for A carry over unchanged because both key off `(surah, ayah)` and
`(page, line)`.

### 2.2 Audio stack

- **Player:** `react-native-track-player` (Apache-2.0, no Google Play
  Services — F-Droid-safe; verify with `reviewer` before adding). Gives
  background playback, lock-screen/notification media controls, queue
  management on both platforms.
- **Audio source:** ayah-by-ayah MP3s (EveryAyah naming scheme
  `{SSS}{AAA}.mp3`, 128 kbps). Mirror the chosen reciters' files to our own
  GitHub release(s) exactly like `mushaf-assets-v2` — no third-party CDN
  dependency at runtime, no tracking. Start with 3–5 reciters
  (e.g. Husary, Minshawi, Abdul Basit, Alafasy, Sudais), grow by demand.
- **Timing data:** `cpfair/quran-align` word-precise timestamps
  (CC BY 4.0) for word-level highlight; ayah-level segmentation comes free
  from the one-file-per-ayah scheme.
- **Offline:** per-surah download manager (same worker-pool pattern as
  `mushafDownload.ts`) storing real files via `react-native-fs`-style
  storage — **not** the evictable image cache.

### 2.3 Storage: move mushaf + audio to explicit files

Replace `Image.prefetch()` caching with a managed content store:

```
<AppData>/quran/
├── mushaf/v2/{001..604}.png     (+ manifest.json with per-file sha256)
├── audio/{reciterId}/{SSS}{AAA}.mp3
├── timings/{reciterId}.json
└── geometry/ayah-bounds-v2.json (or .sqlite)
```

Manifest-driven integrity: on open, verify manifest exists and spot-check
files; "Manage downloads" settings card shows sizes, supports delete/retry.
Fixes the stale-completion-flag / evicted-cache blank-page bug for good.

### 2.4 State

New `QuranContext` slice (same pattern as the other domain slices), backed
by its own AsyncStorage keys (additive schema, per §12 of CLAUDE.md):
last-read position `(surah, ayah, page, mode)`, bookmarks
`[{surah, ayah, color, createdAt}]`, starred ayahs, khatmah plans, reciter +
playback prefs, memorization loop settings.

---

## 3. Phased delivery

### Phase 0 — Stabilize what exists (small, do first)

| ID | Task |
|---|---|
| QR-1 | Virtualize translation view: `ScrollView.map()` → `FlatList` with `getItemLayout`-free dynamic sizing, `initialNumToRender≈8`. Fixes Al-Baqarah jank. |
| QR-2 | Move translation JSON loading off the render path (`InteractionManager.runAfterInteractions` + in-memory LRU of 2 editions); show skeleton rows meanwhile. |
| QR-3 | Mushaf theming: replace hardcoded `PARCHMENT`/`ORNAMENT`/`#0a7c30` with `useAppPalette()` tokens; add a **night mode** page treatment (inverted/sepia matrix on the `<Image>` via `react-native-color-matrix-image-filters` or a simple opacity-composited dark layer — evaluate both, pick the one that keeps ink crisp). |
| QR-4 | `useWindowDimensions()` instead of `Dimensions.get()` in `MushafReader` so fullscreen rotation reflows pages correctly. |
| QR-5 | Migrate mushaf pages to the explicit file store (§2.3) with manifest + retry UI for failed pages; delete the `Image.prefetch` path and the lie-prone completion flag. |
| QR-6 | i18n pass: "Part ٢" header (`quran.juzLabel`), download strings, page-number a11y labels — all 13 locales via `/locale-add`. |

### Phase 1 — Interactive mushaf (the Ayah feel)

| ID | Task |
|---|---|
| QR-7 | Import QUL ayah-geometry data for the KFGQPC v2 pages; bundle as compressed JSON (~1–2 MB) or lazy-download with the mushaf. Scale boxes from source (2600×4206) to rendered size. |
| QR-8 | Tap-to-ayah: transparent overlay per mounted page; tap → subtle highlight + action sheet (Play from here · Bookmark · Star · Share · Copy · Translation peek). Long-press → multi-ayah range select. |
| QR-9 | **Translation peek**: bottom-sheet showing the tapped ayah's translation (active edition) without leaving the mushaf — Ayah's signature "read mushaf, peek meaning" flow. |
| QR-10 | Last-read: persist `(page, surah, ayah)` on every page turn; "Continue reading — p. ٤٢, Al-Baqarah" resume card at the top of QuranScreen and optionally on HomeScreen. |
| QR-11 | Navigation: QuranScreen tabs **Surah / Juz / Page / Bookmarks**; "go to page/ayah" quick-jump field; page slider scrubber in the mushaf footer. |
| QR-12 | Bookmarks & starred verses: colored bookmark set (Ayah-style), rendered as small margin markers on mushaf pages via the geometry DB; managed list in the Bookmarks tab. |
| QR-13 | Mushaf chrome polish per the five design principles: juz/hizb + surah name header, page number in the ornament frame, tap-center to toggle chrome, keep-screen-awake toggle while reading. |

### Phase 2 — Audio recitation

| ID | Task |
|---|---|
| QR-14 | Add `react-native-track-player`; reviewer pass for F-Droid/FOSS compliance **before** merging the dep. |
| QR-15 | Audio content pipeline: script (like `scripts/quran-import.js`) that pulls a reciter's EveryAyah set + quran-align timings, checksums them, and publishes a `audio-{reciter}-v1` GitHub release + manifest. |
| QR-16 | Playback core: play ayah / surah / page / juz / continuous; queue built from ayah files; gapless-feeling transitions (preload next ayah); background + lock-screen controls; speed 0.75×–2×. |
| QR-17 | Sync highlighting: ayah-level highlight on the mushaf (geometry DB) and auto page-turn following playback; word-level highlight in translation view using quran-align timestamps. |
| QR-18 | Reciter picker + per-surah offline downloads with the managed store (§2.3); streaming fallback when not downloaded (direct fetch from our release, generic User-Agent). |

### Phase 3 — Memorization (hifz) tools

| ID | Task |
|---|---|
| QR-19 | Repeat engine: repeat ayah N× / range A–B looped M× / pause-between-repeats multiplier — the classic memorization drill set (Ayah's "customizable repeat"). |
| QR-20 | Hide & reveal: in translation view, mask the Arabic (or the translation) per ayah with tap-to-reveal; on mushaf, an optional blur overlay per ayah driven by the geometry DB. |
| QR-21 | Khatmah tracking: plans ("finish in 30 days"), computed daily portion (pages/juz), progress ring, gentle catch-up suggestions. Local-only, no accounts — reuse prayer-journal storage patterns. Optional day-ahead reminder via the existing notifee scheduler. |

### Phase 4 — Polish & discovery

| ID | Task |
|---|---|
| QR-22 | Search: diacritic-insensitive Arabic search (normalized index built once, cached) + translation search; results deep-link to mushaf page or translation card. |
| QR-23 | Verse of the day: local deterministic pick (date-seeded), shown on HomeScreen card + optional daily notification; share-as-image via existing `react-native-view-shot`. |
| QR-24 | Ayah-share cards: render selected ayah + translation into a beautiful shareable image (calligraphic accent per design principle 2). |

### Phase 5 — Glyph-font mushaf (v3 end-state, optional)

QPC V4 page fonts + QUL layout DB → text-native mushaf: tajweed color
rendering, font-size control, perfect dark mode, no 120 MB image download
(fonts ≈ 60 MB, or per-page ~100 KB lazy). Requires: native dynamic font
registration module (iOS `CTFontManager`, Android `Typeface.createFromFile`),
a 15-line layout renderer, and re-validation of every interaction feature.
Also evaluate **DigitalKhatt** (single variable font + layout data — far
fewer moving parts than 604 fonts). Decide only after Phases 1–3 ship.

---

## 4. Data sources & licensing (verify each before shipping)

| Asset | Source | License | Status |
|---|---|---|---|
| Uthmani text | Tanzil.net | CC BY 3.0 | ✅ shipped. ⚠️ `quran.ts` references `__tests__/quranIntegrity.test.ts` which **doesn't exist** (only `quran.loader.test.ts` does) — write it in QR-1's PR |
| Translations (14) | Tanzil / alquran.cloud | Public domain / CC BY 3.0 per edition | ✅ already shipped, attributed |
| Page images | KFGQPC renders (quran.com-images pipeline) via our release | KFGQPC permits non-commercial Quran apps; already in production | ✅ keep attribution row |
| Ayah geometry | QUL (qul.tarteel.ai) — open-sourced resources | Confirm per-resource terms on QUL before import | ☐ QR-7 gate |
| Audio (reciters) | EveryAyah mirrors → our GitHub release | Recitations generally free for non-commercial distribution; confirm per reciter | ☐ QR-15 gate |
| Word timings | cpfair/quran-align releases | CC BY 4.0 | ✅ attribution required |
| QPC fonts / layout (Phase 5) | QUL | Confirm redistribution terms | ☐ Phase 5 gate |

Every new asset gets a line in the About → Attributions screen (religious
content non-negotiable) and a `quranIntegrity`-style checksum test.

## 5. Non-negotiable compliance checklist

- **F-Droid:** no new dep may pull Play Services (`react-native-track-player`
  is expected-clean — verify; `react-native-fs` or equivalent likewise).
  All downloads come from our own GitHub releases over HTTPS.
- **Privacy:** no analytics; audio/mushaf fetches use the existing generic
  User-Agent; nothing user-identifying leaves the device. Khatmah/bookmark
  data is local AsyncStorage only.
- **13-locale parity:** every new string lands via `/locale-add`; Arabic/Urdu
  RTL uses `Start/End` spacing only.
- **Additive settings schema:** all new keys optional with defaults.
- **Design:** every screen through the `designer` subagent; tabular numerals
  for page/ayah numbers; mushaf stays the one calm focus (principle 1).

## 6. Testing

- `findPageForAyah` ↔ geometry-DB cross-validation (604 pages, boundary ayahs).
- Geometry scaling math (source px → rendered px, both orientations).
- Download manager: cancel/resume/integrity/retry-failed (extend existing patterns).
- Repeat-engine state machine (loop counts, range wrap, interruption by call/route change).
- Khatmah portion math incl. Hijri month lengths + DST days.
- Playback queue: surah boundary, page-follow, app-backgrounded transitions (manual on sim/Pixel).
- Search normalization (hamza/alef/ta-marbuta folding).

## 7. Suggested order & rough effort

Phase 0 (≈1 week) → Phase 1 (≈2–3 weeks) → Phase 2 (≈2–3 weeks) →
Phase 3 (≈1–2 weeks) → Phase 4 (≈1 week each item). Phase 5 unscheduled.
Ship after each phase — every phase is independently releasable and
user-visible.

## 8. Open questions

1. Which reciters first? (Suggest Husary — cleanest for memorization — plus
   Alafasy and Abdul Basit Mujawwad.)
2. Bundle ayah-geometry JSON in-app (~1–2 MB) vs download with mushaf?
   (Suggest bundle: it also powers bookmarks/last-read UI without download.)
3. Night-mode mushaf: image inversion vs dark-sepia composite — needs a
   visual spike on real pages before committing (QR-3).
4. Does the khatmah reminder warrant its own notification channel? (Probably
   yes, mirroring fasting reminders.)
