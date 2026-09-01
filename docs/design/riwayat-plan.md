# A second riwayah — Warsh, and what would follow it

Written 2026-09-01, against v2.13.8, for issue #11.

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

**This is the blocking question, and it is a question for a human, not a
build script.** Mihrab is AGPL-3.0-or-later and ships on three stores; it
cannot bundle scripture data of unclear provenance and hope. Before any
code: write to Tarteel and to KFGQPC and get the terms in writing. If the
answer is no, the feature does not ship, and that is a better outcome than
shipping it and finding out later.

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
3. **Track by ayah index, not page.** 6236 ayahs are 6236 ayahs in every
   riwayah. Progress becomes riwayah-independent by construction, and
   pages become a display detail. Costs a migration of stored khatmah,
   bookmark and last-read records.

**Option 3 is the right shape and the most work.** It is also the only one
that stops this recurring for every riwayah after Warsh. Worth doing in
Phase 1 rather than Phase 4 if it is going to be done at all — migrating
once, before a second riwayah exists to complicate it, is much cheaper
than migrating after.

---

## 6. What could still stop this

- **Licence.** Unresolved, and blocking. Everything else is engineering.
- **Text verification.** Someone with the standing to do so should check a
  sample against a printed KFGQPC Warsh muṣḥaf. A checksum proves the file
  did not change in transit; it does not prove the file was right.
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
