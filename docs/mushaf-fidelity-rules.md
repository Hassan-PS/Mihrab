# Mushaf fidelity: what may adapt, and what may not

The mushaf must match the printed Madinah page **page for page and line for
line**, so that "page 152, third line" means the same thing in the app as in
the physical copy. That is what makes the reader usable for memorisation and
for finding a place someone quotes.

## Invariant — never negotiable

**A page's lines, and each line's words, come from the layout data and are
never reflowed.** Nothing about screen size can move a word to a different
line or a line to a different page. The renderer draws line *n* with the words
the print puts on line *n*, or it draws nothing. Line wrapping is not merely
disabled: the concept does not exist in this renderer.

This is already enforced structurally — `MushafTextPage` draws each line as
one run of exactly the words the data lists, with `numberOfLines={1}`. There
is no code path that could wrap.

**Not wrapping is not the same as not losing a word.** A single line is laid
out by BREAKING it and drawing only the first line, so a run even a hair wider
than its box loses everything after the last break — not a sliver of ink, a
whole word, with no error anywhere. Page 49 shipped like that: all fifteen
lines ended one word early. Two things keep it from recurring:

- The gap between two words is drawn in a font we ship (`AmiriQuran`) at a
  size derived from that font's own space advance, so the drawn width of a
  line is the width we computed rather than whatever face the platform falls
  back to — the QPC page fonts carry no space glyph at all, and the fallback
  differs between iOS and Android.
- **A line is never allowed to be wider than its box.** `MUSHAF_LINE_BOX_SLACK_EM`
  is reserved out of the page block for exactly this, and it is load-bearing:
  measured on a Pixel, removing it brought the missing words straight back.

A no-break gap character (U+00A0) is worth having and we use it, but it is
*not* what saves the line, and it is worth knowing why. Android has nowhere to
break such a line, so it breaks between glyphs instead — and in QPC a glyph is
a whole word, so the line loses its last one anyway. Nothing but fitting the
box prevents that.

### Token order

The glyphs of a line are drawn in the order QPC numbers them, in a
right-to-left paragraph, with **no bidi control characters at all**.

The renderer used to wrap a token in an LTR override (U+202D…U+202C) when it
had more than one glyph, and leave single-glyph tokens bare. That put two
kinds of run in one paragraph, and the bidi algorithm reordered the overridden
ones against their neighbours: page 49 drew `وَإِن ۞ كُنتُمْ` where the print
puts the rub-el-hizb first, and 2:2 drew `لَا ۛ فِيهِ ۛ رَيْبَ` for
`لَا رَيْبَ ۛ فِيهِ ۛ`. Uniform bare tokens render correctly on both platforms
— including every multi-glyph word of pages 1 and 2, the case the override was
added for in the first place.

## What may adapt to the screen

Only two things, and both are bounded:

### 1. Word spacing, within a band

A line is spaced to fill the measure. The space is SOLVED for — the gap that
makes `natural + gaps × space` equal the measure — and may only move inside
`WORD_SPACE_MIN_EM … WORD_SPACE_MAX_EM`.

- Below the minimum, letterforms of adjacent words start to touch — the QPC
  calligraphy interlocks by design and needs room to read.
- Above the maximum, the line stops looking like a line of the mushaf and
  starts looking like justified web text pulled apart. Page 1's basmalah at
  full justification was the cautionary case: 6.7 em of text dragged across a
  12 em plate.

**If a line cannot reach the measure within that band, it is centred at its
natural width rather than stretched further.** Short lines — the last line of
a surah, the plate pages — are meant to be short.

### 2. Overall scale

The font size comes from the page's widest line **as drawn** — its advances
plus a nominal space per gap, which is `pageMeasureEm()`, not the advance-only
`measure` in the data — so that line spans the measure exactly. Every page then renders at the same physical width, which is
why the text does not jump size as you turn pages, even though the 604 fonts
are drawn at different design sizes.

## Single page vs dual page

The decision is about **available width per page**, not about the device name.
A phone in landscape and an iPad in portrait can present similar widths, and
the reader should do the same sensible thing in both.

```
usablePageWidth = (window.width − chrome) / 2      // if we paired
dual page  ⟺  usablePageWidth ≥ MIN_DUAL_PAGE_DP
              AND window.width > window.height     // landscape only
```

- `MIN_DUAL_PAGE_DP` is the narrowest a single page may be and still read
  comfortably. Below it, two pages side by side means text too small to read,
  which is worse than one page.
- A phone in landscape fails the width test (half of ~800 dp is ~400 dp, and
  each page would be a narrow column), so it stays single — which is why
  `MushafPhoneReader` never pairs.
- An iPad in landscape passes it comfortably and pairs, matching how a
  physical mushaf falls open.
- An iPad in portrait shows one page, centred, at a comfortable width rather
  than stretched to the full tablet width.

### Never stretch a single page to fill a wide screen

When a single page is shown on a wide screen (iPad portrait, a resized Mac
window), the page is capped at `MAX_SINGLE_PAGE_DP` and centred. Filling a
13-inch tablet with one page makes the text absurdly large and the line
spacing unnatural; the print has a page width, and past a point we should add
margin instead of scale.

## Where these live

- `WORD_SPACE_MIN_EM` / `WORD_SPACE_MAX_EM`, `WORD_SPACE_EM`,
  `MUSHAF_SPACE_ADVANCE_EM`, `MUSHAF_LINE_BOX_SLACK_EM`, and the
  `pageMeasureEm` / `pageBlockEm` / `lineSpaceEm` / `lineWidthEm` /
  `lineTokenStream` model — `mushafLayout.ts`, kept free of React Native so
  the tests replay exactly what the renderer draws
- `MIN_DUAL_PAGE_DP` / `MAX_SINGLE_PAGE_DP` — `mushafSpread.ts`, used by
  `MushafSpreadReader`
- Phone landscape zoom (`LANDSCAPE_ZOOM`) — `MushafPhoneReader`, bounded by
  the same "never too large" instinct as `MAX_SINGLE_PAGE_DP`

## How to check it

`scripts/mushaf/verify_mushaf.py` proves the content invariant: every glyph of
all 604 pages matches an independent copy of the QPC data. It also replays the
renderer's justification over every line of every page (`check_spacing`) and
ties `MUSHAF_SPACE_ADVANCE_EM` to the font binary we ship (`check_gap_font`).

`__tests__/mushafLayout.test.ts` runs the same two checks on every build, so a
line that would be drawn wider than its measure fails CI rather than reaching
a reader.
