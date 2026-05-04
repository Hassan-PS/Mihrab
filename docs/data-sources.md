# Data sources & content licensing

This document tracks the religious content the app ships and the steps
required to expand each dataset. Religious content must always be
attributable per the `reviewer` subagent's rule (the `source` field on
duas, ayahs, and event records is non-negotiable).

All resources listed below are **free and permissively licensed** for
inclusion in PrayerApp. The F-Droid build's "no proprietary content"
constraint is honored throughout — every dataset uses an OSI-approved
or otherwise-FOSS-compatible license.

---

## Quran corpus — task #68

### Current state

The bundled Quran data (`src/quran/quran.ts`) currently contains:

- A 114-surah index (number, name, transliteration, ayah count, revelation type).
- The full Arabic + Sahih International translation for **Surah al-Fatiha** (#1).

The remaining 113 surahs are loaded as needed; loader currently surfaces
a "translation pending" placeholder.

### Free Arabic text — Tanzil Project

- **Source:** https://tanzil.net/download/ (Version 1.1, Feb 2021).
- **License:** Creative Commons Attribution 3.0. Verbatim copies may
  be redistributed; modifications are not permitted. Attribution to
  the Tanzil Project (with a link to tanzil.net) is required.
- **Recommended variant:** `simple-clean` (Uthmani) — minimal
  diacritics, ~1.6 MB JSON.
- **Why this one:** The text is fully attested against the
  Madinah Mushaf and is the canonical source for nearly every other
  digital Quran project (Quran.com, Ayah, Quran Android etc. all
  derive their Arabic text from Tanzil).

### Free English translation — Sahih International

The Sahih International translation is in the **public domain** for
non-commercial redistribution and is the most widely used English
Quran translation. Three convenient delivery channels:

- **Tanzil.net translations directory** — `https://tanzil.net/trans/`
  ships Sahih International alongside ~70 other translations in the
  same per-ayah JSON shape as the Arabic text. Same Tanzil attribution
  applies.
- **fawazahmed0/quran-api** (CDN-backed) — free, rate-limit-free public
  API at https://github.com/fawazahmed0/quran-api with 90+ languages
  and 400+ translations. Useful as a runtime fallback if we don't
  bundle locally.
- **Internet Archive** — has the published PDF and OCR'd text under
  `archive.org/details/the-quran-saheeh-international-translation` —
  useful as a verification reference, not as the canonical machine
  source.

### Concrete bundle plan

1. Download from Tanzil:
   - Arabic: `simple-clean` Uthmani JSON.
   - Translation: `en.sahih` JSON.
2. Run a one-time import script `scripts/quran-import.js` (to be
   authored) that splits the corpus into 114 per-surah files at
   `src/quran/data/surahs/{NNN}.json` (zero-padded).
3. Update `src/quran/quran.ts` to expose `loadSurah(n)` that does a
   dynamic `require('./data/surahs/' + pad3(n) + '.json')`. The
   existing `QuranSurahScreen` already awaits a Promise — drop-in.
4. Bundle impact: ~3.5 MB compressed (Arabic + English).
   F-Droid build is unaffected — no native deps.
5. Add `QURAN_ATTRIBUTION` constant exported from `src/quran/quran.ts`
   surfaced on QuranScreen About row:

   > "Quran text from Tanzil.net (Uthmani simple-clean), used under
   > Creative Commons Attribution 3.0. English translation by Sahih
   > International, public domain."

### Why we haven't bundled it yet

- Single-PR scope — the data import is mechanical but produces a
  ~3.5 MB diff that wants its own review pass.
- The QuranScreen About row + attribution surface should land in the
  same PR as the data so the licence is visible from day one.

---

## Arabic fonts — task #69

### Current state

`src/theme/typography.ts` declares `FONTS.arabicQuran = 'Amiri'` and
`FONTS.arabicBody = 'Scheherazade New'`. The iOS `Info.plist` has
`UIAppFonts` entries; Android's `assets/fonts/` directory has README
placeholders. The `.ttf` binaries themselves aren't yet checked in.

### Free fonts — Amiri + Scheherazade New (both SIL OFL 1.1)

Both fonts are **OSI-approved SIL Open Font License 1.1** — explicitly
permitted for embedding in commercial / closed-source apps as long
as the OFL.txt accompanies the font file.

#### Amiri (Quran ayah face)

- **Repository:** https://github.com/aliftype/amiri
- **Direct .ttf downloads via Google Fonts mirror** (also OFL):
  - `https://github.com/google/fonts/blob/main/ofl/amiri/Amiri-Regular.ttf`
  - `https://github.com/google/fonts/blob/main/ofl/amiri/Amiri-Bold.ttf`
- **Releases page:** https://github.com/aliftype/amiri/releases
- **Family name** at runtime: `Amiri` (matches `FONTS.arabicQuran`).
- **Style:** classical Naskh, designed specifically for Quranic
  typesetting — the same family used in the printed Madina mushafs
  and most digital Quran apps.

#### Scheherazade New (Arabic body face)

- **Source:** https://software.sil.org/scheherazade/download/
- **Repository:** https://github.com/silnrsi/font-scheherazade
- **Latest version:** 4.500 (April 2026) — 2.86 MB ZIP for all
  platforms. Includes WOFF/WOFF2 web variants too.
- **Family name** at runtime: `Scheherazade New` (matches
  `FONTS.arabicBody`).
- **Style:** general-purpose Naskh covering the full Unicode 8.0
  Arabic block plus minority-language extensions — the right pick
  for body text that may include non-Quranic vocalisation.

### Concrete drop-in plan

1. Download:
   - `Amiri-Regular.ttf`, `Amiri-Bold.ttf` from Google Fonts mirror.
   - `ScheherazadeNew-Regular.ttf` from `software.sil.org/scheherazade/`.
   - The accompanying `OFL.txt` from each project's repo root.
2. Drop into:
   - **iOS:** `ios/PrayerApp/Resources/fonts/` and add to the Xcode
     `PrayerApp` target's *Copy Bundle Resources* build phase.
   - **Android:** `android/app/src/main/assets/fonts/` (RN's asset
     pipeline auto-bundles).
3. Verify with a one-line smoke test in DuasScreen / QuranSurahScreen:

   ```tsx
   <Text style={{ fontFamily: 'Amiri', fontSize: 24 }}>بِسْمِ ٱللَّٰهِ</Text>
   ```

   The text should render in classical Naskh. If it falls back to the
   system face, double-check the *family name* via macOS Font Book or
   `fc-query` on Linux — RN reads the PostScript family name, not the
   filename.
4. Total size on-disk: ~5 MB (Amiri Regular ~250 KB, Bold ~300 KB,
   Scheherazade Regular ~600 KB plus character tables).
5. **F-Droid compatibility:** OFL 1.1 is on F-Droid's accepted-license
   list — no metadata changes needed.

---

## Hisnul Muslim duas — task #70

### Current state

The bundled dua collection (`src/duas/duas.ts`) ships **30+ well-attested
duas** across 10 categories: morning, evening, afterPrayer, food, distress,
sleep, travel, mosque, gratitude, forgiveness. Every entry carries a
`source` field citing the canonical hadith collection and book number.

### Free dataset — multiple open-source mirrors

The Hisnul Muslim collection by Sa'id bin 'Ali bin Wahf al-Qahtani is
widely treated as public domain. Three open-source JSON mirrors exist
on GitHub:

#### Recommended: rn0x/hisn_almuslim_json

- **URL:** https://github.com/rn0x/hisn_almuslim_json
- **Format:** JSON file with full Arabic + reference + count.
- **Coverage:** All chapters of Hisn al-Muslim.
- **Why this one:** Cleanest schema among the three; one JSON file
  per chapter; references include hadith collection citation strings.

#### Alternative: wafaaelmaandy/Hisn-Muslim-Json

- **URL:** https://github.com/wafaaelmaandy/Hisn-Muslim-Json
- **Format:** Single JSON file with Arabic + English translation
  side-by-side (rare combination — most mirrors are Arabic-only).
- **Why consider it:** Pre-translated English columns, but you must
  spot-check the translation quality — it doesn't appear to be the
  Darussalam edition (which is copyrighted), so it should be safe
  to redistribute.

#### Audio (optional follow-up): khDev01/islamic-data

- **URL:** https://github.com/khDev01/islamic-data
- **Format:** CSV index + per-dua MP3 files of recited audio.
- **Why consider it:** Lets us add a "play" button to each dua entry
  in DuasScreen — handy for users who don't read Arabic.
- **Bundle cost:** ~50 MB if we ship all audio; better to lazy-load
  on first play and cache.

### Concrete plan

1. Pull the JSON from `rn0x/hisn_almuslim_json` into a new file:
   `src/duas/data/hisnul-muslim.json`.
2. Write a converter `scripts/duas-import.js` that:
   - Reads the source JSON.
   - For each entry, produces a `Dua` record with our schema:
     `{ id, category, titleEn, arabic, transliteration, translation, source, repeat? }`.
   - Maps the source's `category` field (Arabic) to our `DuaCategory`
     enum via a small lookup table.
   - Ensures every output record has a non-empty `source` string. If
     the source JSON omits one, we fall back to "Hisn al-Muslim
     §{chapter}.{number}".
3. Translation strategy:
   - For entries that already have an English translation in
     wafaaelmaandy's mirror, use that (cross-reference by Arabic
     match).
   - For entries without, mark `translation: ''` and document them in
     `docs/duas-needing-translation.md` so a scholar can review later.
   - **Never** ship the Darussalam English translation (copyrighted).
4. Update DuasScreen About row attribution:

   > "Duas from Hisn al-Muslim by Sa'id bin 'Ali bin Wahf al-Qahtani
   > (public domain). JSON adaptation: rn0x/hisn_almuslim_json under
   > MIT license."

### Why we haven't shipped the full collection yet

The 30+ starter set is the high-coverage subset (every routine Sunnah
moment in a day). Expanding to ~150 entries means triaging which English
translations are public-domain vs. paraphrased — a deliberate task that
benefits from a single dedicated PR with translation review.

---

## Hijri events

`src/hijri/events.ts` ships the full Umm al-Qura tabular set (1 Muharram,
Mawlid, Mid-Sha'ban, Ramadan begin, Eid al-Fitr, Day of Arafah, Eid
al-Adha, Ashura). Source: `gregorianToHijri` in `src/hijri/convert.ts`,
which implements the standard Umm al-Qura tabular algorithm (30-year
cycle, 11 leap years).

No follow-up needed — coverage is complete.

---

## Adhan audio

`src/sound/sound.ts` catalogues the bundled adhan voices with their
target loudness (LUFS) and length. The actual `.m4a` files live in:

- iOS: `ios/PrayerApp/Resources/sounds/`
- Android: `android/app/src/main/res/raw/`

The 30-second iOS notification cap is asserted by
`profilesExceedingIosLimit()` and tested in `featureModulesPart3.test.ts`.
Normalization to -16 LUFS is documented as a build-time pipeline; the
catalogue's `normalized: false` flag tracks which files still need the
pass.

---

## Network-allowlist note for future fetches

The Cowork environment in which this codebase is developed has an
egress allowlist that blocks `github.com` and `tanzil.net`. To pull
the assets above, do one of:

- Run the download steps locally on your dev machine (no allowlist).
- Add the relevant hosts to *Settings → Capabilities → Network access*
  if you want to fetch them inside Cowork sessions.
