# Mushaf: font-rendered pages (QPC v2)

Decision taken 2026-07-30 (Hassan). The raster reader had hit its ceiling;
pages are now drawn as **text** using the KFGQPC QPC v2 per-page fonts, the
same technique the sharpest competitors use.

**Status: implemented and rendering on Android (v2.8.0, unreleased).** What is
done and what is left is at the bottom.

## Why the image reader could not get better

Pages were pre-rendered PNGs (2600×4206, ~120 MB downloaded):

- **Pixelation** — any zoom upscales a picture of text; 2600 px is all the
  detail there is, and landscape zoom on a 3× phone already asked for ~2400.
- **Memory** — a decoded page is ~44 MB and the pager mounts three. That is
  what crashed landscape (capped in 2.7.43 — a ceiling, not a cure).
- **Rotation** — a new display size means regenerating sharpened copies.
- **Interaction was geometry** — ayah hit-testing ran off hand-maintained
  coordinate boxes, which is why word-level features were out of reach.

## What replaced it

| | images (≤2.7.43) | fonts (2.8.0) |
|---|---|---|
| Sharpness | fixed 2600 px raster | vector — crisp at any zoom |
| Memory per mounted page | ~44 MB decoded | a typeface + text nodes |
| First open | after a 120 MB download | immediately (~300 KB/page) |
| Rotation | re-scale + re-decode | text re-layout |
| Ayah targeting | coordinate boxes | real word nodes |

### Assets

`scripts/mushaf/build_qcf_assets.py` builds everything from two public
sources — the fonts from <https://github.com/nuqayah/qpc-fonts> (a mirror of
`qurancomplex.gov.sa/TTF`) and the word/line data from `api.quran.com`:

- **604 page fonts**, each subset to the glyphs its own page uses
  (208 MB raw → 188 MB, ~310 KB per page), uploaded by
  `scripts/mushaf/upload_qcf_fonts.sh` to the `mushaf-fonts-v2` release on
  this repo — the same hosting model as the page images.
- **`src/quran/data/mushafLayoutV2.json`** (828 KB, bundled): for each page,
  its 15 lines — line kind (surah plate / basmalah / ayah), the words as
  codepoints, which ayah and word position each belongs to, whether the line
  is centred, and every line's natural width in ems.

The generator is strict about the data and the tests re-check it: 604 pages,
15 lines each (bar the two plate pages), 114 surah plates exactly once, 112
basmalah lines, 6236 ayah medallions, word positions consecutive, and ayahs in
order with no gaps across the whole mushaf.

Two upstream quirks are handled in the pipeline: a verse straddling a page
break is returned under both pages (so words are grouped by the page the
*word* claims, never the request), and the medallion of 84:21 is tagged to the
line above its own ayah (snapped forward).

### Licensing

KFGQPC allows free use "in websites, software, and other similar
intermediates" (<https://dm.qurancomplex.gov.sa/copyright-2/>). The app already
shipped KFGQPC *images* under those terms, so this changes nothing for
F-Droid MR 36312 — the same question applies before and after.

### Rendering

`MushafTextPage` draws 15 flex rows. Sizing follows the print rather than the
web:

- `fontSize = textWidth / pageMeasureEm(page)`, where the measure is the
  page's widest line **as drawn** — its glyph advances plus a nominal space
  per gap. Every page then comes out the same physical width even though the
  604 fonts are drawn at different design sizes. (`page.measure` in the data
  is the advances alone; sizing from it makes every full line ~15% wider than
  its box.)
- Every other line is justified by solving for its space — the gap that makes
  `natural + gaps × space` equal the measure — held inside the band in
  `docs/mushaf-fidelity-rules.md`. The gap is drawn as a no-break space in the
  bundled AmiriQuran, at a size derived from that font's own space advance, so
  a line's drawn width is the width we computed on both platforms. A line that
  **ends a surah**, or that cannot reach the measure inside the band, is
  centred at its natural width, as in the print.
- Pages 1–2 keep their plate proportions inside a drawn double rule.
- Night mode is a repaint, not an image inversion.

### Font loading

604 fonts cannot be declared at build time, so they are registered at runtime:
`MushafFontModule.kt` (`Typeface.createFromFile` + `ReactFontManager`) and
`MushafFont.swift` (`CTFontManagerRegisterFontsForURL`).

React Native caches a typeface per `fontFamily` name forever, so fonts are
addressed through a **pool of 24 slot families** that are recycled, with the
mounted pages pinned. Two failure modes are unit-tested, because both are
silent: a recycled-while-visible slot, and — the bug that actually happened —
claiming a slot only *after* registration returns, which let all three
initially-mounted pages pick the same slot. Since every page font uses the same
codepoints, the losers drew **another page's words in their own line
structure**: a wrong Quran page with no error anywhere.

## Done

- [x] Runtime font registration, both platforms (iOS builds; Android verified)
- [x] Asset + layout pipeline, with data invariants under test
- [x] 604 fonts published to the `mushaf-fonts-v2` release
- [x] Renderer: justification, centring, plates, medallions, night mode
- [x] Per-page on-demand download + neighbour prefetch; the download gate is
      gone in text mode
- [x] Long-press a word → its ayah (no geometry), tap → fullscreen
- [x] Landscape uses the full width — the render-cache clamp is image-only now
- [x] `mushafRenderer` preference (`text` default, `image` escape hatch)

## Left

- [ ] Verify on the iOS simulator interactively (builds clean; CoreText path
      unexercised) and on iPad + Catalyst
- [ ] Rotation timing on a device — the emulator would not rotate under adb
- [ ] Manage-downloads: a row for the font store (size, delete, fetch-all for
      offline) and a way to drop the now-unused page images. Needs 13-locale
      keys.
- [ ] Bookmarks / khatmah markers on text pages (selection + playing highlight
      already work)
- [ ] Word-level recitation highlight — the plumbing (`activeWord`) is in the
      renderer, it needs wiring to `useWordTiming`
- [ ] Share-as-image from a text page
- [ ] Once text mode has shipped a release: drop the image path, the 120 MB
      download, `ayahGeometry.json` (2.7 MB) and the render cache
