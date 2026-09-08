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

#### The Arabic: rn0x/hisn_almuslim_json

- **URL:** https://github.com/rn0x/hisn_almuslim_json
- **Format:** One JSON object, 134 chapters keyed by Arabic title, each
  with `text[]` and `footnote[]` — the footnotes carry the hadith
  citation (`أخرجه البخاري 1/45 ومسلم 1/283`, and so on).
- **Licence: NONE.** Checked against the GitHub API on 2026-09-07: the
  repository has no licence file and no licence field. **An earlier
  version of this page said "MIT" and that was wrong** — the kind of
  error that ends up in an attribution screen, which is worse than
  having no attribution screen.
- **What that means in practice:** the Arabic is quotation of hadith
  and is not this repository's to license — the citations let us
  attribute to Bukhārī, Muslim, Abū Dāwūd and the rest directly. So the
  file is usable as a CROSS-CHECK and an index, not as a thing to copy
  wholesale and credit.

#### wafaaelmaandy/Hisn-Muslim-Json — do NOT take the English

- **URL:** https://github.com/wafaaelmaandy/Hisn-Muslim-Json
- **Format:** Arabic + transliteration + English side by side.
- **Licence: NONE.**
- **Why not:** an earlier version of this page said the English
  "doesn't appear to be the Darussalam edition ... so it should be safe
  to redistribute". Read the records: every one carries an `AUDIO` field
  pointing at `hisnmuslim.com/audio/...`, which is the book's own site,
  and the English matches what that site publishes ("All Praise is for
  Allah who has clothed me with this garment and provided it for me,
  with no power nor might from myself"). That is the published
  translation, mirrored — exactly the thing this page says never to
  ship. Treat it as copyrighted.

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
3. Translation strategy — and this is the whole cost of the task:
   - The Arabic is free to quote. **Every translation is a modern
     work with an author**, and this app ships thirteen languages, so
     one imported dua is one Arabic text and thirteen translation
     problems. No GitHub dataset found (2026-09-07) solves that: the
     multilingual ones are either unlicensed mirrors of the published
     translation, or machine-translated, and a machine translation of
     a supplication is not something to put in front of someone.
   - **Never** ship the Darussalam English translation (copyrighted),
     and treat any unattributed English mirror of Hisn al-Muslim as
     being that translation until shown otherwise.
   - **The route worth trying: IslamHouse.** islamhouse.com publishes
     this same book in 64 languages, including every one Mihrab ships.
     Its pages carry "© Islamhouse Website" and no redistribution
     licence, so it is a permission to ASK FOR rather than a file to
     take — but it is one request that would answer thirteen languages
     at once, from a publisher whose whole purpose is free
     distribution. https://islamhouse.com/en/books/39062/
   - Failing that, they are short texts: six of them for the lavatory
     and garment categories, one of which is a single word. Writing our
     own translations is a smaller job than it looks, and it is the only
     option that leaves the app owning what it ships.
4. Update DuasScreen About row attribution — naming the hadith
   collections, which is what the citations actually support:

   > "Supplications from the Qur'an and the hadith collections cited on
   > each entry; arranged after Hisn al-Muslim by Saʿīd b. ʿAlī b. Wahf
   > al-Qaḥṭānī. Translations by the Mihrab project."

   NOT "JSON adaptation: rn0x/hisn_almuslim_json under MIT license" —
   that repository has no licence, and crediting a licence that does not
   exist is worse than crediting nothing.

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
egress allowlist. Confirmed blocked as of 2026-09-08: `github.com`,
`tanzil.net`, `quranenc.com`, `api.alquran.cloud`. Confirmed reachable:
`raw.githubusercontent.com` (any repo's file contents) and, from the
Mac side, `api.github.com` via `gh`. So a dataset that lives in a
GitHub repository can be fetched here; one behind a project's own API
cannot. To pull the assets above, do one of:

- Run the download steps locally on your dev machine (no allowlist).
- Add the relevant hosts to *Settings → Capabilities → Network access*
  if you want to fetch them inside Cowork sessions.


## The Isa García Spanish translation — issue #37, SHIPPED 2026-09-08

The app shipped one Spanish edition, Julio Cortés. #37 asked for a
second: Muhammad Isa García's translation, which Quran.com uses. It now
ships as `es.garcia`, **beside** Cortés and not in place of it — Cortés
stays first in `QURAN_TRANSLATIONS` and therefore stays what
`defaultEditionForLocale('es')` returns, so nobody's reading changes
unless they choose it.

### Licence

Same slot as the other twelve. The text is the **Tanzil** edition of
García, redistributed by Tanzil under **CC BY 3.0** with the standing
condition that copies are verbatim (no modification) and attributed to
the Tanzil Project. That is the identical basis on which Cortés,
Bernström, Hamidullah, Bubenheim, Diyanet, Kuliev and Ma Jian already
ship, so #37 adds no new licence regime and nothing new for the F-Droid
build to answer for.

QuranEnc also publishes a García edition, under its own seven
conditions (no modification, credit quranenc.com, name the version,
keep transcript info, report errors, track the latest revision). It
was not used. Its terms are workable but they are a *second* regime to
honour, and its text is a later revision than the one the rest of the
Spanish tooling in this app is aligned to. Tanzil was already the
answer for every other edition here; adding a fourteenth from the same
place keeps one rule instead of two.

### Where the bytes came from, and how we know they are the right ones

Neither tanzil.net nor quranenc.com nor api.alquran.cloud is reachable
from this development environment (see the allowlist note above);
`raw.githubusercontent.com` is. So the file was assembled from GitHub
mirrors, and then **proved** rather than trusted:

1. **Two independent mirrors, compared against each other.**
   `jomtek/quran-translated` (`es.garcia/{1..114}`, one ayah per line)
   and `Damarcreative/QuranAPI` (`surah/{n}/es-garcia.json`) were both
   downloaded in full. After dropping the basmalah row that
   Damarcreative prepends to every surah but 1 and 9, the two agree on
   **all 6,236 ayahs, character for character**. Two unrelated
   repositories do not converge on 6,236 identical strings by accident.

2. **Both compared against a copy that names Tanzil as its source.**
   `fawazahmed0/quran-api` carries `spa-muhammadisagarc` with
   `"source": "http://tanzil.net"` in its `editions.json`. That
   aggregator strips punctuation, so the comparison normalises
   punctuation away on both sides — and then **6,235 of 6,236 ayahs
   match exactly**. The one exception, 26:69, is a leading "Y " the
   aggregator dropped.

3. **The same test, run against an edition we already had, as a
   control.** The aggregator's `spa-juliocortes` was compared to the
   `es.cortes.json` this app has shipped since v2.7.40 — which came
   from Tanzil through alquran.cloud. Same normalisation: **6,193 of
   6,236 exact, and every one of the 43 remainder is a punctuation mark
   or a muqaṭṭaʿāt backtick the aggregator removed**, not a word. That
   establishes what the aggregator does to a text we can already
   verify, which is what makes step 2 mean anything.

The shipped `assets/quran/translations/es.garcia.json` is built from the
mirror with punctuation intact (`jomtek`), keyed chapter → ayah exactly
like the other thirteen: 114 chapters, 6,236 ayahs, checked against the
per-surah counts of the existing corpus.

### If this needs redoing

Fetch the Tanzil text directly (`https://tanzil.net/trans/es.garcia`)
from a machine without the allowlist and diff it against the shipped
asset. If they differ, Tanzil is right and this file is wrong.

## The duʿāʾ khatm al-Qurʾān — issue #35, DECLINED 2026-09-07

Searched GitHub on 2026-09-07. **There is no usable dataset**, and the
reason is more interesting than the absence.

**It is not one text.** "دعاء ختم القرآن" names several different
supplications: the one printed at the end of many muṣḥafs, and — for
instance — the one attributed to ʿAbd al-Qādir al-Jīlānī, which turns up
in app repositories under exactly the same name. Choosing to ship one is
choosing between traditions, before any question of translation.

**Its provenance is contested, and the corpus says so.** The core of the
printed version — *اللهم ارحمني بالقرآن واجعله لي إماماً ونوراً وهدى
ورحمة* — appears in OpenITI's academic corpus of classical Arabic texts
(github.com/OpenITI), where it is quoted with its chain: reported by Abū
Manṣūr al-Muẓaffar b. al-Ḥusayn al-Arrajānī in *Faḍāʾil al-Qurʾān* and by
Abū Bakr b. al-Ḍaḥḥāk in *al-Shamāʾil*, through Abū Dharr al-Harawī. One
of the other places it turns up is al-ʿIrāqī's takhrīj of the *Iḥyāʾ* —
the section collecting reports **for which he found no isnād**.

### The decision, and why

**Mihrab does not ship it.** Not because it is disliked, and not because
nobody asked — it was requested with a reference, by someone who has
given this project more good reports than anyone.

Every dua in this app names its collection and stands on it. That rule is
what the Duas screen is worth: a reader can check any line in it against
a book. The printed khatm duʿāʾ cannot meet that bar. Its best honest
citation is "printed in most muṣḥafs", and the report behind it is one
al-ʿIrāqī lists among those for which he found no isnād. Printing it
beside sixty entries that each cite Bukhārī or Muslim would either
mislead by association, or need a disclaimer explaining that this one is
different — and a disclaimer on a supplication is a strange thing to hand
somebody who has just finished the Qurʾān.

There is also no single text to ship. The muṣḥaf version and the one
attributed to ʿAbd al-Qādir al-Jīlānī share the name, so shipping "the"
khatm duʿāʾ means picking a tradition on the reader's behalf, silently,
in an app used across all of them.

### What would change the answer

- A khatm supplication with a chain that stands — then it goes in like
  any other entry, citing that chain.
- A ruling from a scholar this project can name, that the printed text is
  sound enough to carry, and a form of words on screen that says exactly
  what it is.

Neither is a research task. Both are somebody's judgement, on the record.

Nothing stops a reader saying the duʿāʾ from the muṣḥaf in front of them;
this is about what the app puts its own name to.
