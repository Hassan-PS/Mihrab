# A second riwayah — Warsh, and what would follow it

Written 2026-09-01, against v2.13.8, for issue #11.

## Status

**Phases 1–3 are built. Phase 0 was answered by changing the question.**

### What September 1st found, and what it overturned

Written after the feature reached a phone and failed on the very file this
plan pointed at. Four things below are corrections, not additions: the
plan asserted the opposite of each, and code was built on them.

**1. The source was the wrong one, and then both were.**

`riwayat.ts` pointed at QUL's `qpc-warsh-script-ayah`, which is text and
nothing else — no `page_number`, no `juz_number`. The plan had surveyed
the *word-by-word* export, which has them. A reader following the link
downloaded 1.8 MB of correct Warsh scripture the app could not turn into a
muṣḥaf, and got an error for it.

Neither is what ships now. **Quranpedia** serves the same KFGQPC text at a
fixed path — `https://api.quranpedia.net/v1/mushafs/4` — with
`page_number`, `juz`, `hizb`, and the field that mattered most (below).
Cross-checked against QUL's copy: identical per-surah counts in all 114
surahs, and all 6,214 ayahs identical once the diacritics are normalised.

**2. "6236 ayahs are 6236 ayahs in every riwayah" is false.**

§5 option 3 rests on that sentence and it is wrong. Warsh divides the same
text into **6,214** ayahs under the Madani-last count. Fifty surahs differ
from the Kufan division, in both directions — al-Baqarah 285 against 286,
al-Wāqiʿah 99 against 96 — and the difference is where the boundaries
fall, not what text is there. Measured: 77,421 words against Ḥafṣ's
77,430, a gap of nine, which is Warsh writing a handful of words joined.

So `TOTAL_AYAHS`, the surah table and the ayah index are Ḥafṣ facts, not
Qur'anic ones. Tracking by ayah index is still the right shape, but it
does not come free the way §5 claimed.

**3. There is a mapping, so the whole book can be checked.**

Every Quranpedia ayah carries `number_in_hafs` — which Ḥafṣ ayahs of its
own surah it corresponds to. That replaced two things:

- completeness. Counting to 6,236 refuses Warsh; requiring every Ḥafṣ ayah
  to be accounted for, in order, does not, and is strictly stronger.
- content. `juzCheck.ts` could only read sixty places because without a
  mapping ayah N of one riwayah is not ayah N of the other.
  `hafsAlignment.ts` reads all of them — 6,155 groups for Warsh, 59 where
  it splits a Ḥafṣ ayah and 78 where it merges — at a mean of 98.5%.

Measuring a real Warsh muṣḥaf against a real Ḥafṣ one also found three
ways `skeleton()` refused scripture: the dagger alif deleted rather than
folded, yeh barree not folded at all, and short ayahs judged by a measure
that can only answer in thirds. Fixing those moved the corpus from 95.0%
with five failures to 98.5% with none.

**4. The licence question has an answer, and it is permissive.**

§1 records the search coming up empty and §6 keeps it as a standing risk.
Both are out of date. KFGQPC publishes Muṣḥaf al-Madinah as a complete
free digital copy, explicitly permitting *"digital publishing, media use,
and use in websites, software, and other similar intermediates"* —
worldwide, commercial included. The only carve-out is printing muṣḥafs
physically for commercial sale, reserved to the Complex. Recorded in full
in `quranpedia/quran-svg`'s NOTICE.md, sourced to qurancomplex.gov.sa.

So "Mihrab cannot bundle scripture of unclear provenance" is no longer the
situation. It still does not bundle or host one, but the reason is now a
choice rather than a constraint: hosting means a copy of the Qur'an whose
fidelity is ours to answer for, and it buys only convenience that the
publisher's own link already provides.

### And what that opens

Quranpedia publishes eight riwayat, not one — Ḥafṣ, Warsh, Qālūn, al-Dūrī,
al-Sūsī, al-Bazzī, Qunbul and Shuʿbah — which contradicts §1's finding
that four of the five printed riwayat are "blocked on a text nobody has
published openly". Run through the app's own verifier today:

| Muṣḥaf | Count | Result |
|---|---|---|
| Warsh | madani-last, 6214 | ✅ passes |
| Qālūn | madani-last, 6214 | ✅ passes |
| Shuʿbah | kufi, 6236 | ✅ passes |
| al-Dūrī | madani-first, 6218 | ❌ al-Fātiḥah maps 6 of 7 ayahs |
| al-Bazzī | makki, 6221 | ❌ surah 72 runs backwards |

The two failures are defects in Quranpedia's mapping data, worth reporting
upstream. The three passes are a table entry and a name each.

**Real page layout is also available**, which §2 concluded was not
possible. `quranpedia/quran-svg` (CC0) publishes 604 vector pages for each
of five riwayat with a real per-ayah polygon layer — about 72 MB brotli or
107 MB as the publisher's zip, against the ~188 MB the Ḥafṣ glyph fonts
already cost. What it does not give is per-line *text*, so §2's conclusion
stands for a text renderer: the choice per riwayah is the printed page as
vector art, or the real text reflowed.

---

### The sourcing, settled

The plan said the licence was blocking and that the way through it was to
ask KFGQPC and Tarteel for terms in writing. Two things have changed.

First, the search for a Warsh text that already states its terms was done,
in September 2026, and it came up empty:

| Source | Warsh text? | Terms? |
|---|---|---|
| Tanzil | ❌ Hafs only | ✅ verbatim copying, attribution, link back |
| alquran.cloud | ❌ no Warsh edition | ✅ reproduce/redistribute with credit |
| QUL (Tarteel) | ✅ ayah and word-by-word | ❌ resources state none |
| KFGQPC `nashr.` | ✅ Hafs and Warsh | ❌ a Windows app, no stated terms |
| DigitalKhatt | ❌ Hafs | ✅ OFL fonts, MIT/AGPL code |
| ITQAN catalogue | ❌ | ❌ "not stated" on every entry |

Second, and the actual resolution: **the app does not need the right to
redistribute something it never distributes.** Mihrab ships the reader and
the checks. The muṣḥaf is obtained by the reader, from whoever publishes
it, and lands on their device — nothing of ours is in the chain, and no
permission is needed for a person to fetch a file a publisher offers.

So there is no bundled Warsh data, no `src/quran/data/warsh/`, and no
`require()` of a file that may not exist. What replaced it:

- `riwayahStore.ts` — `<Documents>/quran/riwayat/v1/<id>/`, holding the
  pagination, the text and a `source.json` recording where it came from
  and when. Provenance is written LAST, so an interrupted install reads as
  absent rather than as a muṣḥaf nobody can account for.
- `riwayahImport.ts` — the checks, moved out of `tools/` into `src/`,
  because the file that becomes scripture on a phone is one no maintainer
  will ever see. The CLI and the device now run the same function.
- `riwayahDownload.ts` — the boundary between bytes and scripture. Nothing
  crosses it unverified, and every refusal is a sentence a reader can act
  on rather than a stack trace.
- Manage downloads carries the section that adds and removes one, and says
  in as many words that Mihrab neither includes nor hosts these texts.

Known cost, stated rather than hidden: F-Droid will treat this as a
non-free network asset, and the metadata should declare it.

### Built

- `ayahIndex.ts` — progress counted in ayahs, so a khatmah means the same
  amount of Qur'an in either muṣḥaf (§5, option 3). Migrated before a
  second riwayah existed, as the plan asked.
- `riwayat.ts` — the riwayah TABLE, with availability computed from what
  the DEVICE has, not from what the build has. No `totalPages` field: a
  page count is a fact that arrives with the data.
- `pages.ts` — one pagination per riwayah; `MUSHAF_PAGES` and the
  one-argument `findPageForAyah` still mean Hafs, for every caller that
  has not been told about riwayat.
- `MushafUnicodePage.tsx` — the second renderer. Text from the riwayah's
  own table, drawn in a bundled face, FITTED to the page box (the size is
  solved for, measured, and the estimate calibrates itself).
- Chrome parity: page number, juz, night mode, rotation, jump-to-page, the
  scrubber and the index sidebar all read the riwayah's own table. The
  toggle sits next to Audio and Tafsir, as asked, and only in muṣḥaf mode.
- Switching keeps your place, by way of the ayah at the page boundary.

### Not done

- The QPC Warsh face (`fontBundled: false` in `riwayat.ts`) is a QUL
  resource like the text, so it is not bundled either. Until a reader can
  install one the Unicode renderer draws in AmiriQuran, which shapes the
  marks correctly.
- Phase 5 — Qālūn, al-Dūrī, al-Sūsī and Shuʿbah are each one dataset and
  one table row away, and nothing in the code counts to two.

## What this is

A plan, not a change. It answers three questions before any code moves:
what can actually be sourced, what the current reader assumes that a second
reading tradition would break, and what the smallest honest version looks
like.

The short version: **Warsh is buildable now, the other four riwayat are
not, and Warsh cannot use the renderer Hafs uses.** The rest of this
document is why, and what to do about it.

## Scope, as asked for

From the reporter (issue #11, 2026-08-31), after being asked whether
reading or audio-following was the point:

> For the warsh quran, I mainly need it just for reading and be able to use
> the feature of khatmah tracker already implemented.

And from the maintainer, 2026-09-01: reading only; the toggle sits next to
the translation and audio buttons; real text from a mushaf layout is
preferred "but not a must if not possible"; the default chrome — page
number, juz, light and dark, auto-rotate — should be there; sources must be
open, reliable and correct.

So: **a reading mushaf, with the chrome the Hafs one has, and khatmah
tracking that keeps working.** No word highlighting, no audio-follow.

---

## 1. What can be sourced

Surveyed the Quranic Universal Library (QUL, by Tarteel — the library
behind quran.com's assets, which is what "like the quran.com warsh version"
points at), and its credits, which name **KFGQPC** for the fonts and
original prints and **Tanzil** for text auditing.

| Riwayah | Text | Font | Page layout |
|---|---|---|---|
| **Hafs ʿan ʿĀṣim** | ✅ many | ✅ QPC v1/v2/v4 | ✅ 12 layouts |
| **Warsh ʿan Nāfiʿ** | ✅ **ayah-by-ayah and word-by-word** | ✅ `uthmanic-warsh-v21.ttf` | ❌ none |
| Qālūn ʿan Nāfiʿ | ❌ | ✅ QPC Qaloun | ❌ |
| al-Dūrī ʿan Abī ʿAmr | ❌ | ✅ QPC Douri | ❌ |
| al-Sūsī ʿan Abī ʿAmr | ❌ | ✅ QPC Sousi | ❌ |
| Shuʿbah ʿan ʿĀṣim | ❌ | ✅ QPC Shuba | ❌ |

Those five non-Hafs fonts are exactly the riwayat in wide printed use
today — Warsh across North and West Africa, Qālūn in Libya and Tunisia,
al-Dūrī in Sudan and the Horn — so the *ambition* in the request is the
right one. But **fonts without text are not a feature.** Four of the five
are blocked on a text nobody has published openly, and a font alone cannot
be turned into a mushaf.

### The one that matters: the Warsh word-by-word dataset

Published as JSON and SQLite, and its fields are the reason this plan is
short rather than speculative:

```
verse_key      surah:ayah
text           the full verse in Warsh script
words[]        position, text, location (surah:ayah:word)
page_number    ← the whole ballgame
juz_number
hizb_number
```

`page_number` means **pagination is available**: which verses sit on which
page of the printed Warsh muṣḥaf. That is what makes page numbers, the juz
label and the khatmah tracker possible at all.

What is **not** there is `line_number`. So we know which ayahs are on a
page and not where the lines break inside it.

### The licence, which is the real risk

QUL's *code* is MIT. Its *resources* carry no stated licence — not on the
resource pages, not in the repository README. The credits name KFGQPC and
Tanzil as upstreams, both of which have their own terms.

**This was written as the blocking question. It is not, any more —
see the Status section at the top.** Mihrab is AGPL-3.0-or-later and ships
on three stores, so it cannot bundle scripture of unclear provenance and
hope; what it can do, and now does, is not bundle it at all. The app never
holds a copy, so it never needs the right to pass one on. Asking for terms
in writing remains worth doing — it would let the data be bundled, which
is a better experience — but it is no longer what the feature waits on.

---

## 2. Why Warsh cannot use the Hafs renderer

This is the finding that shapes everything.

The Hafs reader is a **glyph** pipeline:

- 604 per-page fonts, ~310 KB each, **~188 MB downloaded at runtime** from
  a GitHub release (`mushafFontStore.ts`, `FONT_RELEASE = 'mushaf-fonts-v2'`)
- `mushafLayoutV2.json` (1.4 MB) holds, per page, 15 lines of private-use
  **codepoints** — `"x":"ﱁ|ﱂ|ﱃ|ﱄ|ﱅ"` — plus each word's advance width in ems
- `MushafTextPage.tsx` draws one `<Text>` per line and justifies it by
  distributing slack across measured advances

Every one of those glyph codes is meaningful only against *that page's own
font*. It is not text; it is a picture of text made of characters.

The Warsh asset is the mirror image: **Unicode text plus one Unicode
font**. There is no glyph table, no per-page font, no advance data, and —
critically — no line assignment.

So there is no adapter that makes Warsh fit `MushafTextPage`. What Warsh
needs is a **second, simpler renderer**: Unicode text in the Warsh font,
flowed into a page whose ayah range comes from `page_number`.

That trade is worth stating plainly, because it cuts both ways:

| | Hafs (glyph) | Warsh (Unicode) |
|---|---|---|
| Line breaks | exactly the printed muṣḥaf | **reflowed — will not match the print** |
| Download | ~188 MB | **~1 MB, bundle it** |
| Page boundaries | exact | exact |
| Text fidelity | exact | exact (it is the KFGQPC text) |
| Word-level taps | yes | possible, `words[]` is there |

The user's brief already allows this: real layout "is not a must if not
possible". It is not possible today. What we get instead is the right text
on the right page in the right script, with lines that fall where the
renderer puts them — and no 188 MB download.

---

## 3. What the code assumes about Hafs

From a full read of the reader (paths are the seams to cut, in order of
how much they hurt):

1. **`mushafLayout.ts:332`** — `require('./data/mushafLayoutV2.json')`,
   hard-coded. Single seam; everything decoded flows from here.
2. **`pages.ts`** — `MUSHAF_PAGES` and `findPageForAyah()` are a single
   global pagination. Called from 11 places. A second riwayah means a
   second table and a riwayah-aware lookup.
3. **`mushafFontStore.ts:38/46/55`** — store dir, `QCF2###.ttf` filename
   and the release URL all assume one riwayah. Warsh needs none of this if
   its single font is bundled, which is the argument for bundling it.
4. **`src/native/MushafFont.ts:69`** — `byPage: Map<number, number>` keys
   loaded fonts by page number alone. Two riwayat would alias. (Moot if
   Warsh does not use the slot pool.)
5. **`KHATMAH_TOTAL_PAGES = 604`** (`quranState.ts:493`) and every stored
   `page`: `QuranBookmark.page`, `LastRead.page`, `KhatmahPlan.pagesRead`
   and `.position.page`. **None of these carry a riwayah tag.** See §5.
6. **Hafs-shaped constants** — `isFramedPage()` (pages 1–2),
   `PAGE_ASPECT = 2600/4206`, `MUSHAF_LINE_HEIGHT_EM = 1.7183`,
   `MUSHAF_LINES_PER_PAGE = 15`. All from the Madinah print's proportions.
7. **`scripts/mushaf/*.py`** — `build_qcf_assets.py` and
   `rebuild_page_ranges.py` hard-code 604 pages and 15 lines.

The chrome, happily, is nearly free:

- **Page number and juz** — `MushafPageHeader` / `MushafPageFooter` in
  `mushafReaderCore.tsx`, both driven by `MUSHAF_PAGES`. Point them at a
  riwayah-aware table and they work unchanged. (Note: the app shows the
  juz *number* only; there is no juz-name table anywhere. If juz names are
  wanted, that is its own small piece of work — for both riwayat.)
- **Light/dark** — `quran.prefs.mushafNightMode` is a repaint, not an
  image inversion, so a Unicode page gets it for free by using the same
  ink palette from `MushafTextPageSurface`.
- **Auto-rotate** — orientation is set by the navigator in
  `QuranSurahScreen.tsx` (`orientation: 'default'` for the muṣḥaf, the
  only screen in the app that rotates). Riwayah-independent.
- **The toggle** — the control row is the navigator's `headerRight`
  (`QuranSurahScreen.tsx:285–361`): Audio, the Tafsir/Mushaf view toggle,
  and fullscreen. A fourth pressable goes in beside them exactly as asked.
  A "حفص / ورش" pill next to the ☀︎/☾︎ night pill in `MushafPageHeader` is
  the alternative worth a look, since it survives fullscreen.

---

## 4. The shape of the work

**Phase 0 — permission and provenance.** Get the licence answer in
writing. Download the Warsh dataset and establish, as build-time checks:
the page count (`max(page_number)` — the Hafs assumption of 604 must not
be inherited untested), 114 surahs, 6236 ayahs, and a diff of the text
against a second independent copy. Scripture is the one payload where
"probably right" is not a state the app may ship in. No UI work until this
passes.

**Phase 1 — riwayah becomes a concept.** A `riwayah: 'hafs' | 'warsh'`
setting, defaulting to `hafs`; the seams in §3 items 1–2 parameterised; the
toggle in the header row. Nothing visible changes for anyone who does not
touch it.

**Phase 2 — the Unicode page.** A second page renderer: the ayahs for a
page from the Warsh table, drawn as text in the bundled Warsh font,
justified by the platform rather than by advance tables. Ayah-end markers
and surah headers reuse `mushafOrnaments.tsx`.

**Phase 3 — chrome parity.** Page number, juz, night mode, rotation,
jump-to-page, the scrubber and the index sidebar, all pointed at the
riwayah-aware pagination.

**Phase 4 — the reading record.** §5. This is the design decision, not a
chore.

**Phase 5 — the others, if the text appears.** Qālūn, al-Dūrī, al-Sūsī and
Shuʿbah are one dataset each away. If Phases 1–3 are built with a riwayah
*table* rather than an `if (warsh)`, each becomes a data drop. That is the
main thing to get right early, and it is the same lesson
`regionalProviders.ts` learned when Morocco followed Sweden.

---

## 5. The decision worth making deliberately

Yushi asked for the khatmah tracker to keep working. That is where the two
riwayat actually collide.

`KhatmahPlan.pagesRead` is a page count out of 604. A bookmark stores a
page. `LastRead` stores a page. **None of them records which riwayah the
page number belongs to**, and page 300 of a Warsh muṣḥaf is not page 300
of a Hafs one. Switch riwayah mid-khatmah today and the tracker would
silently mean something else.

Three options:

1. **Tag every record with its riwayah.** Honest and small to write.
   Costs: a khatmah is then per-riwayah, so switching abandons progress —
   arguably correct, and arguably infuriating.
2. **Keep one khatmah, converted on switch** via the ayah at the boundary.
   Progress survives; the number moves when you switch, which needs
   explaining in the UI or it reads as a bug.
3. **Track by ayah index, not page.** ~~6236 ayahs are 6236 ayahs in every
   riwayah.~~ *(Wrong — see Status. Warsh has 6,214, and the ayah index is
   a Ḥafṣ fact. The option is still right; it is not free.)* Progress becomes riwayah-independent by construction, and
   pages become a display detail. Costs a migration of stored khatmah,
   bookmark and last-read records.

**Option 3 is the right shape and the most work.** It is also the only one
that stops this recurring for every riwayah after Warsh. Worth doing in
Phase 1 rather than Phase 4 if it is going to be done at all — migrating
once, before a second riwayah exists to complicate it, is much cheaper
than migrating after.

---

## 6. What could still stop this

- **Licence.** ~~Unresolved~~ **resolved** — KFGQPC's terms permit software
  use worldwide; see Status. The paragraph below stands anyway, because the
  app still distributes nothing: the app does not
  distribute the data, so it does not need a licence to. What it does need
  is to keep being true — the moment anything is bundled or mirrored, this
  becomes the blocking question again.
- **Text verification.** Half of this is now the app's job and is done.
  `juzCheck.ts` reads an incoming dataset at the sixty places a reader
  would check it themselves — the first and last ayah of each of the
  thirty ajzāʾ — against the Tanzil Hafs text already in the build, and
  refuses anything that does not read like the Qur'an there. It catches
  the three failures that matter: a file that is not scripture, real
  scripture shifted by an ayah, and juz numbering off by one. It was
  written after a synthetic fixture passed every structural check and
  rendered on a device as a muṣḥaf, complete with surah band and page
  number, with nothing on screen to say otherwise.

  The other half remains a human's. This proves a file is the Qur'an; it
  does not prove it is a faithful WARSH edition, and someone with the
  standing to do so should still check a sample against a printed KFGQPC
  muṣḥaf. A checksum proves a file did not change in transit; this proves
  it is scripture; neither proves the riwayah is right.
- **Shaping.** Warsh orthography leans on marks Hafs does not use. RN
  `<Text>` should shape it correctly on both platforms, but "should" is
  doing work in that sentence — it needs a device test early in Phase 2,
  not late.
- **Line breaks will not match the print.** Anyone who has memorised page
  positions from a physical Warsh muṣḥaf will notice. Say so in the UI
  rather than let them discover it.
- **Not the ten qirāʾāt.** This plan covers the riwayat that are printed
  and read as everyday muṣḥafs. It is not a qirāʾāt reference work and
  should not be described as one.
