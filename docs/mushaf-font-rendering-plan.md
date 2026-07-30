# Mushaf: move from page images to font-rendered text

Decision taken 2026-07-30 (Hassan). The raster reader has hit its ceiling —
this replaces it with the same technique the sharpest competitors use.

## Why the current reader can't get better

Pages are pre-rendered PNGs (2600×4206, ~120 MB downloaded). Everything else
follows from that:

- **Pixelation.** Any zoom is upscaling a picture of text. 2600 px is the hard
  limit of available detail; landscape zoom on a 3× phone already asks for
  ~2400 px, so there is nothing left in reserve.
- **Memory.** A decoded page is ~44 MB (2600×4206×4 B). The pager mounts three.
  That is what crashed the app in landscape (fixed in 2.7.43 by zooming only the
  visible page and staying inside the render cache — a ceiling, not a cure).
- **Rotation cost.** Changing orientation changes the display size, so the
  sharpening cache must regenerate copies; until they land the reader either
  shows a stale-scale copy or decodes the original. Slow on both platforms.
- **Interaction is geometry, not content.** Ayah hit-testing works off
  hand-maintained coordinate boxes (`mushafGeometry`), which is why word-level
  features are hard.

## Target: QCF (QPC) v2 per-page fonts

The King Fahd Complex publishes the Madinah mushaf as **604 per-page fonts**
(`QCF_P001`…`QCF_P604`), where **one glyph = one word**, positioned so a page
laid out in its own font reproduces the printed page exactly.

| | today (images) | font-rendered |
|---|---|---|
| Sharpness | fixed 2600 px raster | vector — crisp at any zoom |
| Memory / page | ~44 MB decoded | a font + text nodes (< 1 MB) |
| Download | ~120 MB | ~20–40 MB (verify: 604 TTFs) |
| Rotation | re-scale + re-decode | re-layout text (instant) |
| Ayah targeting | coordinate boxes | real text nodes, per word |

Word-level highlight during recitation becomes almost free — we already have
word timing data (`useWordTiming`).

### Licensing — no new exposure

KFGQPC's terms allow free use "in websites, software, and other similar
intermediates" (<https://dm.qurancomplex.gov.sa/copyright-2/>). The app already
ships KFGQPC *images* under exactly these terms, so switching to their fonts
does not change the F-Droid position (the same NonFreeAssets question applies
before and after, and the MR is currently accepted as-is). Mirrors:
<https://github.com/nuqayah/qpc-fonts>, and QUL
(<https://qul.tarteel.ai/resources/font/249>) for the fonts plus the matching
word-code data.

## Data needed

1. **Fonts** — 604 TTFs (QCF v2). Decide bundle-vs-download after measuring.
2. **Page layout data** — per page: 15 lines; per line: type (surah header /
   basmalah / verse text) and the ordered word codepoints, each carrying
   `surah`, `ayah`, `word` index. QUL's QPC-HAFS word script provides
   `page`, `line_number`, `code_v2` per word — one JSON per page, or one
   compact indexed blob.

## Technical risk to solve first: runtime font loading

React Native cannot register 604 font families at build time sensibly. Both
platforms support runtime registration, so this needs a small native module —
same shape as the existing `MushafPageScaler`:

- Android: `Typeface.createFromFile` + `ReactFontManager.getInstance().setTypeface(...)`
- iOS: `CTFontManagerRegisterFontsForURL`

**Spike this before anything else** — the whole plan rests on it.

## Phases

0. **Spike** — register one page font at runtime on both platforms and draw one
   line of page 1. Answers the only existential question.
1. **Asset pipeline** — fetch fonts + word data, generate per-page layout JSON,
   measure total size, wire into the existing download/cache manager
   (`mushafDownload`, Manage-downloads screen, disk accounting).
2. **Renderer** — `MushafPage` component: 15 flex rows, words as `<Text>` with
   the page font, line stretch via `justifyContent: 'space-between'`. Pages 1–2
   (decorative frames) and surah headers need their own treatment
   (`QCF_BSML` ligature font for basmalah/headers).
3. **Feature parity** — ayah long-press sheet, bookmarks, khatmah position,
   night mode (now just colours), search highlight, recitation follow
   (upgrade to word-level), share-as-image.
4. **Orientation + zoom** — font size drives everything; landscape becomes a
   larger size with vertical scroll, and pinch-to-zoom becomes trivial. The
   windowed-strip pager from 2.7.43 stays.
5. **Switchover** — ship behind a setting (`mushafRenderer: 'text' | 'image'`),
   default to text once verified, keep image mode one release as an escape
   hatch, then drop the 120 MB image download.

## Invariants to keep (already unit-tested)

- `mushafLayoutMode` — phones never get the tablet two-page spread.
- Windowed strip in phone landscape — page offsets must stay small; the 604-page
  absolute strip is what rendered blank at large `pageW`.
- Long-press must resolve the correct ayah; swipe must turn and re-centre.

## Verification bar

Every phase: Android emulator (portrait + landscape, 300 dpi and 480 dpi),
iPhone, iPad (spread unchanged), Catalyst. Rotation must paint in well under a
second with no memory step-change; `dumpsys meminfo` native heap should stay
flat across ten rotations.
