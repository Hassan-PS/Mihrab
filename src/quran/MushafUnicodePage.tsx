/**
 * A muṣḥaf page drawn from Unicode text — the second renderer.
 *
 * ── WHY THERE ARE TWO ─────────────────────────────────────────────────
 *
 * `MushafTextPage` is a GLYPH pipeline: 604 per-page fonts, private-use
 * codepoints, and a hand-justified line table (`mushafLayoutV2.json`). It
 * reproduces the Madinah print line for line, and every one of its
 * codepoints is meaningful only against that page's own font. It is not
 * text; it is a picture of text made of characters.
 *
 * A second riwayah cannot use any of it. What QUL publishes for Warsh is
 * the mirror image — real Unicode text, one font, `page_number` per ayah
 * and NO line assignment — so there is no adapter that makes it fit. See
 * `docs/design/riwayat-plan.md` §2.
 *
 * So this renderer draws the ayahs a page holds as ordinary text and lets
 * the platform break the lines. The trade, stated plainly because someone
 * who has memorised a physical muṣḥaf will notice: **page boundaries are
 * exact, line breaks are not.** What it buys is exact text, in the right
 * script, on the right page, with nothing to download.
 *
 * ── HOW A PAGE IS SIZED ───────────────────────────────────────────────
 *
 * The glyph page knows its font size from the print's own measure. This
 * one has no measure to work from: the same ayahs set larger simply take
 * more lines. So the page is FITTED — sized so its content fills the box
 * it was given and no more — by predicting a size, measuring what the
 * platform actually laid out, and correcting.
 *
 * Two things keep that from being a visible loop:
 *
 *   • the fitted size is cached per page and box, so a page is fitted
 *     once and every later visit is instant; and
 *   • each measurement calibrates the advance estimate the prediction
 *     uses (`calibratedAdvanceEm`), so after the first page or two the
 *     first guess is already right and no correction pass happens at all.
 *
 * The page is drawn while it converges rather than hidden until it has.
 * A page that reflows once on its first appearance is a smaller fault
 * than a page that stays blank because a measurement never arrived.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { FONTS } from '../theme/typography';
import {
  WORD_SPACE_EM,
  WORD_SPACE_MAX_EM,
  WORD_SPACE_MIN_EM,
  gapMetrics,
} from './mushafLayout';

import {
  ayahCountForRiwayah,
  easternNumerals,
  pagesForRiwayah,
} from './pages';
import { loadRiwayahText } from './riwayahData';
import { printedPageFor, type AllocatedLine } from './mushafPrintedLines';
import { riwayahById, riwayahFontFamily, type RiwayahId } from './riwayat';
import { BasmalahRow, SurahBandRow } from './mushafOrnaments';
import type { AyahRef } from './MushafTextPage';

/**
 * Line height as a multiple of the font size.
 *
 * Fully-vocalised Qur'anic Arabic is not ordinary Arabic: the marks stack
 * well above the ascender and the tails drop well below the baseline, and
 * `typography.ts` already warns that Amiri needs ≈2.1× or diacritics
 * clip. The Warsh orthography leans on marks Hafs does not use, so this
 * is the wrong number to economise on.
 */
export const UNICODE_LINE_HEIGHT_EM = 2.05;

/** The ayah-end mark; the digits that follow it are drawn inside it. */
const END_OF_AYAH = '\u06DD';

/** No-break space — keeps an ayah and its number on the same line. */
const NBSP = '\u00A0';

/** Surah-band and basmalah rows, in units of a text line. */
const BAND_ROWS = 1.75;
const BASMALAH_ROWS = 1.3;

/** Every line of a page, measured, in ems of the size it was drawn at. */
const PRINTED_LINE_CACHE = new Map<string, number[]>();

/**
 * How much wider than the measure a line's box is made.
 *
 * Wide enough that no line can reach the end of it, because a line that
 * reaches the end of its box WRAPS, and a wrapped line's remainder is
 * drawn where the row has no height for it — invisibly. Losing the end of
 * an ayah is the one fault this renderer may never produce, and this is
 * what makes that unreachable rather than merely unlikely.
 */
const PRINTED_BOX_SLACK = 2.5;

/**
 * How far a line may be scaled to reach the measure.
 *
 * With the words the print puts on it a line lands within a few per cent
 * of the measure and the scaling is imperceptible. The bounds are for the
 * line that does not — a hair of distortion beats a hole.
 */
const MIN_PRINTED_SCALE = 0.8;
const MAX_PRINTED_SCALE = 1.25;

/** Below this a page is unreadable and should scroll instead. */
const MIN_PRINTED_SIZE = 9;

/**
 * How far short of the measure a line has to fall before it is centred
 * rather than left hanging off the margin. Two per cent is under a
 * letter — below it the line looks flush and dragging it would be fussier
 * than leaving it.
 */
const PRINTED_CENTRE_BELOW = 0.02;

/** Corrections attempted before the page settles for what it has. */
const MAX_FIT_PASSES = 4;

/** A fit is good enough once it fills this much of the box without spilling. */
const FIT_FLOOR = 0.93;

/**
 * Justification is the Hafs pages' own, not a second answer to the same
 * question.
 *
 * `mushafLayout.ts` solved this once, and the reasoning it carries was
 * paid for: the nominal space, the band a solved space may fall in, the
 * slack reserved out of the block so a flush line cannot lose its last
 * word to Android's single-line break, and above all `gapMetrics` — which
 * shrinks the space GLYPH for a tight line rather than asking the platform
 * for negative letter spacing, because that is where issue #6's missing
 * words came from. Importing it means a fix to any of that reaches both
 * renderers, and that the two pages are set to the same measure.
 */

/**
 * What a character of this riwayah's face actually advances, per page box.
 *
 * The printed path needs no fitting loop — the line count is given — but
 * it does need to know how wide a character is, and that is a property of
 * a font nobody can look up. So the widest line is measured once and the
 * answer kept: the implied advance is independent of the size it was
 * measured at, so one pass is exact rather than approximate, and every
 * page after this box's first is drawn right on its first frame.
 */
const ADVANCE_CACHE = new Map<string, number>();

/**
 * The row height of a printed page, as a multiple of the type size.
 *
 * This is the whole of the size decision: fifteen rows divide the box,
 * and the type is the row divided by this. It is deliberately ONE number
 * for the book — see the size comment in `PrintedPageBody` for why a
 * per-page size is the wrong shape of answer — so this is the only place
 * the printed muṣḥaf's type size can be tuned.
 *
 * It is `UNICODE_LINE_HEIGHT_EM` and not less because that is the leading
 * fully-vocalised Qur'anic Arabic needs: `typography.ts` warns that Amiri
 * clips below ≈2.1×, and the Warsh orthography leans on marks Hafs does
 * not use. Anything tighter buys width by cutting the marks off.
 */
const PRINTED_LINE_HEIGHT_EM = UNICODE_LINE_HEIGHT_EM;

/**
 * The width of a typical line of the printed muṣḥaf, in ems of its own
 * type size — the horizontal half of the size decision.
 *
 * Sizing from the row height alone is right only while the box keeps the
 * print's proportions, and full screen does not: it gives the page more
 * height at the same width, which made the type grow until the lines were
 * wider than the measure and every one of them had to be squeezed back.
 * Page 50 full screen was that. So the size is the SMALLER of what the row
 * allows and what the measure allows, and the page is centred in whatever
 * height is left over — a muṣḥaf page has proportions, and a taller window
 * gives it margins, not bigger letters.
 *
 * The number is measured, not chosen: 1,146 lines were laid out on a real
 * device and their drawn widths recorded, a width model fitted to them
 * (chars, gaps and medallions; rms 1.2 em), and every one of the book's
 * 8,807 lines predicted from it. Sized against 18.2, 98.9% of them reach
 * the measure inside the word-space band, which is the flat top of that
 * curve — 17.5 and 19.0 are both worse, and either side of them worse
 * again. `docs/design/riwayat-plan.md` §7 records the sweep and what
 * the finished layout then measured over all 602 pages.
 */
const PRINTED_TYPICAL_LINE_EM = 18.2;

/**
 * How far apart the rows may be set, as a multiple of the leading the type
 * actually needs — the height the page uses when it cannot use it for
 * bigger letters.
 *
 * Full screen on a phone wants about 1.23 to fill exactly. A little over
 * that so it fills rather than nearly fills, and not much over: past about
 * a third again, fifteen lines stop reading as a page and start reading as
 * a list. Whatever a very tall box still cannot use stays as margin, split
 * evenly, which is the honest end of it.
 */
const MAX_PRINTED_LEADING = 1.3;

/**
 * Average advance per base character, in ems — the one guess in the size
 * prediction, and the one thing measurement can teach.
 *
 * It starts at a naskh-ish 0.42 and is corrected towards what the device's
 * own shaper actually produced, which folds in the real font, the real
 * kerning and the real justification without any of them being known here.
 */
let calibratedAdvanceEm = 0.42;

/** Fitted font sizes, keyed by riwayah, page and the box it was fitted to. */
const FIT_CACHE = new Map<string, number>();

/** Tests only — the calibration and cache are process-lifetime otherwise. */
export function _resetUnicodePageFitForTests(): void {
  FIT_CACHE.clear();
  ADVANCE_CACHE.clear();
  PRINTED_LINE_CACHE.clear();
  calibratedAdvanceEm = 0.42;
}

/**
 * Combining marks: drawn, but they take no horizontal room.
 *
 * Written as escapes rather than as the marks themselves. An isolated
 * combining character in source pastes, diffs and greps unpredictably —
 * it attaches itself to whatever precedes it — and a range that quietly
 * lost an endpoint would surface only as pages that fit slightly wrong.
 *
 * U+064B–U+0652 the ḥarakāt, U+0653–U+065F the Qur’anic annotation
 * marks, U+0670 the dagger alif, U+06D6–U+06ED the waqf and sajdah
 * signs, and U+08D3–U+08FF the extended marks Warsh reaches for.
 */
const MARKS =
  /[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g;

/** Characters that actually advance the pen, for the size prediction. */
export function advancingLength(text: string): number {
  return text.replace(MARKS, '').length;
}

export type UnicodePageBlock =
  | { kind: 'surah'; surah: number }
  | { kind: 'basmalah' }
  | { kind: 'text'; ayahs: Array<AyahRef & { text: string }> };

/**
 * What a page holds, in drawing order.
 *
 * Exported and pure so the page's structure can be asserted in a test
 * without rendering anything: the surah bands, the basmalahs that follow
 * them and the ayahs in between are the page, and getting one of them
 * wrong is a scripture bug, not a layout one.
 */
export function unicodePageBlocks(
  page: number,
  riwayah: RiwayahId,
): UnicodePageBlock[] {
  const text = loadRiwayahText(riwayah);
  if (!text) return [];
  const meta = pagesForRiwayah(riwayah).find(p => p.page === page);
  if (!meta) return [];

  // ── Walk this riwayah's OWN numbering ────────────────────────────────
  //
  // This used to step through the Ḥafṣ ayah index, converting the page's
  // bounds with `ayahIndexOf` and reading each ref back with
  // `ayahAtIndex`. Both are Ḥafṣ tables. For a riwayah that divides the
  // text differently they walk the wrong space: Warsh's al-Māʾidah has 122
  // ayahs and Ḥafṣ has 120, so the walk turned to al-Anʿām after 5:120 and
  // 5:121 and 5:122 were never emitted at all. About two dozen ayahs
  // across the muṣḥaf simply were not on any page, and nothing said so —
  // the page before was a little short and that was all a reader saw.
  const stop = meta.end ?? { surah: 114, ayah: Number.MAX_SAFE_INTEGER };
  const blocks: UnicodePageBlock[] = [];
  let run: Array<AyahRef & { text: string }> | null = null;

  for (
    let surah = meta.start.surah, ayah = meta.start.ayah;
    surah < stop.surah || (surah === stop.surah && ayah < stop.ayah);

  ) {
    if (ayah === 1) {
      run = null;
      blocks.push({ kind: 'surah', surah });
      // Al-Fātiḥah counts the basmalah as its first ayah, so drawing one
      // above it would print it twice; al-Tawbah has none at all. Every
      // other surah opens with it, unnumbered, under the band.
      if (surah !== 1 && surah !== 9) blocks.push({ kind: 'basmalah' });
    }
    const body = text[`${surah}:${ayah}`];
    if (body) {
      if (!run) {
        run = [];
        blocks.push({ kind: 'text', ayahs: run });
      }
      run.push({ surah, ayah, text: body });
    }
    if (ayah >= ayahCountForRiwayah(riwayah, surah)) {
      surah += 1;
      ayah = 1;
      if (surah > 114) break;
    } else {
      ayah += 1;
    }
  }
  return blocks;
}

/** What a page costs to draw, in the units the size prediction works in. */
export type PageExtent = {
  /** Advancing characters in the page's ayah text. */
  chars: number;
  /** Bands and basmalahs, in units of one text line. */
  extraRows: number;
};

export function pageExtent(blocks: UnicodePageBlock[]): PageExtent {
  let chars = 0;
  let extraRows = 0;
  for (const block of blocks) {
    if (block.kind === 'surah') extraRows += BAND_ROWS;
    else if (block.kind === 'basmalah') extraRows += BASMALAH_ROWS;
    else {
      for (const a of block.ayahs) {
        // +4 for the ayah mark and the space that separates it from what
        // follows; it is small and it is on every ayah, so it is not noise.
        chars += advancingLength(a.text) + 4;
      }
    }
  }
  return { chars, extraRows };
}

/**
 * The font size at which a page should just fill its box.
 *
 * Lines grow with the size (a bigger face fits fewer characters per line)
 * and each line is itself that much taller, so height goes as the SQUARE
 * of the size. Written out:
 *
 *   height = (chars·adv·size/width + rows) · size · LINE
 *
 * which is a quadratic in `size`, and the positive root is the answer.
 * Solving it rather than iterating from a guess is what keeps the
 * correction pass below to one round, usually none.
 */
export function predictFontSize(
  extent: PageExtent,
  width: number,
  height: number,
  advanceEm: number = calibratedAdvanceEm,
): number {
  const { min, max } = fontBounds(width);
  if (extent.chars <= 0 || width <= 0 || height <= 0) return min;
  const a = (extent.chars * advanceEm * UNICODE_LINE_HEIGHT_EM) / width;
  const b = extent.extraRows * UNICODE_LINE_HEIGHT_EM;
  if (a <= 0) return max;
  const size = (-b + Math.sqrt(b * b + 4 * a * height)) / (2 * a);
  return Math.min(max, Math.max(min, size));
}

/**
 * Bounds on the fitted size.
 *
 * The floor stops a dense page from shrinking to something nobody can
 * read — better that it scrolls. The ceiling stops the short final pages
 * (three surahs of a few lines each) from being set at a size that would
 * look like a mistake; the print enlarges them, but not without limit.
 * `width / 15.75` is the Madinah page's own measure, so the ceiling is a
 * little over what the Hafs pages next door are set at.
 */
export function fontBounds(width: number): { min: number; max: number } {
  return { min: Math.max(9, width / 44), max: Math.max(12, width / 13) };
}

/** What a measurement says the advance really was, for the next page. */
function impliedAdvanceEm(
  extent: PageExtent,
  width: number,
  size: number,
  measuredHeight: number,
): number | null {
  if (extent.chars <= 0 || size <= 0 || measuredHeight <= 0) return null;
  const rows = measuredHeight / (size * UNICODE_LINE_HEIGHT_EM);
  const textRows = rows - extent.extraRows;
  if (textRows <= 0) return null;
  const advance = (textRows * width) / (extent.chars * size);
  // A wild value means the assumptions did not hold on this page — a page
  // of two short surahs, say, where the last line of each is half empty.
  // Ignore it rather than let it poison every page after.
  return advance > 0.2 && advance < 1.2 ? advance : null;
}

export type MushafUnicodePageProps = {
  page: number;
  riwayah: RiwayahId;
  /** Width of the page's text block in dp. */
  width: number;
  /** Height the page should fill. It may exceed it; the column scrolls. */
  height: number;
  colors: {
    text: string;
    accent: string;
    heading: string;
    selection: string;
    muted: string;
  };
  selected?: AyahRef | null;
  /** Ayah currently being recited — highlighted while audio plays. */
  playing?: AyahRef | null;
  onAyahPress?: (ref: AyahRef) => void;
  onAyahLongPress?: (ref: AyahRef) => void;
};

function sameAyah(a: AyahRef | null | undefined, b: AyahRef): boolean {
  return a != null && a.surah === b.surah && a.ayah === b.ayah;
}

/**
 * Android justified its first line only below API 26, so a page there was
 * one justified line above fourteen ragged ones — worse than not
 * justifying at all. Above it, and on iOS, `justify` is honoured.
 */
const TEXT_ALIGN: 'justify' | 'right' =
  Platform.OS === 'android' && Number(Platform.Version) < 26
    ? 'right'
    : 'justify';

function MushafUnicodePage({
  page,
  riwayah,
  width,
  height,
  colors,
  selected,
  playing,
  onAyahPress,
  onAyahLongPress,
}: MushafUnicodePageProps) {
  const blocks = useMemo(
    () => unicodePageBlocks(page, riwayah),
    [page, riwayah],
  );
  const extent = useMemo(() => pageExtent(blocks), [blocks]);
  const fontFamily = riwayahFontFamily(riwayahById(riwayah));

  /**
   * The print's own lines, when this riwayah has a table for them.
   *
   * Preferred over reflowing whenever it exists: the lines are the thing
   * a reader who has memorised from this muṣḥaf actually knows.
   */
  const printed = useMemo(() => {
    const table = loadRiwayahText(riwayah);
    if (!table) return null;
    return printedPageFor(riwayah, page, (s, a) => table[`${s}:${a}`] ?? null);
  }, [page, riwayah]);

  // A page is fitted to a box, so the box is part of its identity. Rounded
  // to whole dp: the measured viewport is a float, and a sub-pixel wobble
  // in it would otherwise throw away a fit that was already correct.
  const fitKey = `${riwayah}:${page}:${Math.round(width)}x${Math.round(height)}`;
  const [key, setKey] = useState(fitKey);
  const [fontSize, setFontSize] = useState(
    () => FIT_CACHE.get(fitKey) ?? predictFontSize(extent, width, height),
  );
  const passes = useRef(0);
  const settled = useRef(FIT_CACHE.has(fitKey));

  // Adjusting state while rendering, deliberately: turning to a page whose
  // fit is already known must draw it at that size on the FIRST frame. An
  // effect would draw one frame at the previous page's size first, and on
  // a pager that frame is the page turn itself.
  if (key !== fitKey) {
    const cached = FIT_CACHE.get(fitKey);
    setKey(fitKey);
    passes.current = 0;
    settled.current = cached != null;
    setFontSize(cached ?? predictFontSize(extent, width, height));
  }

  const onContentLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (settled.current) return;
      const measured = e.nativeEvent.layout.height;
      if (measured <= 0 || height <= 0) return;

      // Every measurement teaches the estimate something, whether or not
      // this page needs another pass — which is why the second page a
      // reader opens usually needs none.
      const advance = impliedAdvanceEm(extent, width, fontSize, measured);
      if (advance != null) {
        calibratedAdvanceEm = calibratedAdvanceEm * 0.7 + advance * 0.3;
      }

      const settle = (value: number) => {
        settled.current = true;
        FIT_CACHE.set(fitKey, value);
        if (value !== fontSize) setFontSize(value);
      };

      const fits = measured <= height;
      if (fits && measured >= height * FIT_FLOOR) {
        settle(fontSize);
        return;
      }

      passes.current += 1;
      const { min, max } = fontBounds(width);
      const next = Math.min(
        max,
        Math.max(min, fontSize * Math.sqrt(height / measured)),
      );
      // Out of passes, or the bounds will not let the size move. Keep what
      // fits: a page that still overflows scrolls in its column, and one
      // that underfills is simply a short page, which the print has too.
      if (passes.current >= MAX_FIT_PASSES || next === fontSize) {
        settle(fits ? fontSize : Math.min(fontSize, next));
        return;
      }
      setFontSize(next);
    },
    [extent, fitKey, fontSize, height, width],
  );

  const lineHeight = fontSize * UNICODE_LINE_HEIGHT_EM;
  const highlight = selected ?? playing ?? null;

  if (blocks.length === 0) return null;

  if (printed) {
    return (
      <PrintedPageBody
        pageKey={`${riwayah}:${page}`}
        rows={printed}
        width={width}
        height={height}
        fontFamily={fontFamily}
        colors={colors}
        highlight={highlight}
        onAyahPress={onAyahPress}
        onAyahLongPress={onAyahLongPress}
      />
    );
  }

  return (
    // `minHeight`, never a fixed height with `overflow: hidden` — a page
    // that came out a little tall must scroll in the column it was given,
    // not lose its last ayah to a clip nobody can see happening.
    <View style={{ width, minHeight: height }}>
      {/*
        The measurement is taken from an INNER view that is only as tall as
        the text, and this is load-bearing.

        `onLayout` used to sit on the box above, whose `minHeight` is the
        height being fitted TO. So a page that filled two thirds of its box
        measured as exactly full, `measured <= height` was true, `measured
        >= height * FIT_FLOOR` was true, and the fit settled on the first
        pass at a size a third too small — with a band of dead space under
        the last line that no number of passes could ever see, because the
        thing being measured was the floor and not the text.

        This is the same fault the Hafs pages had twice (`pageMeasureEm`,
        and the scrolling column's dead band): a fit is only as good as
        what it measures, and measuring the container instead of the
        content is the way to get a confident wrong answer.
      */}
      <View onLayout={onContentLayout}>
      {blocks.map((block, index) => {
        if (block.kind === 'surah') {
          return (
            <SurahBandRow
              key={`s${index}`}
              surah={block.surah}
              width={width}
              rowHeight={lineHeight * BAND_ROWS}
              fontSize={fontSize}
              colors={colors}
              bandScale={0.86}
              nameScale={0.95}
            />
          );
        }
        if (block.kind === 'basmalah') {
          return (
            <BasmalahRow
              key={`b${index}`}
              width={width}
              rowHeight={lineHeight * BASMALAH_ROWS}
              fontSize={fontSize}
              colors={colors}
            />
          );
        }
        return (
          <Text
            key={`t${index}`}
            allowFontScaling={false}
            style={[
              styles.body,
              {
                fontFamily,
                fontSize,
                lineHeight,
                color: colors.text,
                textAlign: TEXT_ALIGN,
              },
            ]}
          >
            {block.ayahs.map(ayah => (
              <Text
                key={`${ayah.surah}:${ayah.ayah}`}
                onPress={() =>
                  onAyahPress?.({ surah: ayah.surah, ayah: ayah.ayah })
                }
                onLongPress={() =>
                  onAyahLongPress?.({ surah: ayah.surah, ayah: ayah.ayah })
                }
                // Nested, so the paragraph stays ONE shaped stream and the
                // letters still join across the boundary — and so the
                // highlight is one unbroken band over the whole ayah rather
                // than a box per line.
                style={
                  sameAyah(highlight, ayah)
                    ? { backgroundColor: colors.selection }
                    : undefined
                }
              >
                {ayah.text}
                {/* No-break before the mark, an ordinary space after it: the
                    ayah and its number never come apart, and the line may
                    still break between one ayah and the next. */}
                {NBSP}
                <Text
                  style={{
                    color: colors.accent,
                    fontFamily: FONTS.arabicQuran,
                  }}
                >
                  {`${END_OF_AYAH}${easternNumerals(ayah.ayah)}`}
                </Text>
                {' '}
              </Text>
            ))}
          </Text>
        );
      })}
      </View>
    </View>
  );
}

/**
 * A page laid out on the print's own lines.
 *
 * ── WHY NOTHING HERE IS MODELLED ──────────────────────────────────────
 *
 * The first four attempts at this priced the text: an advance per
 * character, a width per medallion, a solved word gap. Every one of them
 * produced a page that was either short of the margin — a hole in the
 * setting — or past it. And past it is not a cosmetic fault: a line wider
 * than its box does not clip on Android, it WRAPS, and the wrapped
 * remainder is drawn below a row whose height leaves no room for it. Page
 * 8 lost the last letter of الْعَذَابِ that way, and line six lost its ayah
 * number, with nothing on screen to say either had happened.
 *
 * So nothing is priced. Each line is laid out in a box far wider than it
 * can need, which makes wrapping impossible and therefore makes losing a
 * word impossible. It is then MEASURED, and scaled horizontally to the
 * measure exactly. A line cannot come out short, because the scale is
 * computed from its own drawn width; and it cannot come out long, for the
 * same reason.
 *
 * The type size is chosen so the median line needs no scaling at all,
 * which keeps what scaling remains small and even — a few per cent either
 * way, spread across the page rather than piled onto one line.
 */
function PrintedPageBody({
  pageKey,
  rows,
  width,
  height,
  fontFamily,
  colors,
  highlight,
  onAyahPress,
  onAyahLongPress,
}: {
  /** Identifies the page whose measured line widths are cached. */
  pageKey: string;
  rows: AllocatedLine[];
  width: number;
  height: number;
  fontFamily: string;
  colors: MushafUnicodePageProps['colors'];
  highlight: AyahRef | null;
  onAyahPress?: (ref: AyahRef) => void;
  onAyahLongPress?: (ref: AyahRef) => void;
}) {
  const measure = width;

  const fitKey = `${pageKey}:${fontFamily}:${Math.round(width)}`;
  const [ems, setEms] = React.useState<number[] | null>(
    () => PRINTED_LINE_CACHE.get(fitKey) ?? null,
  );
  const pending = React.useRef<{ key: string; seen: Map<number, number> }>({
    key: fitKey,
    seen: new Map(),
  });
  if (pending.current.key !== fitKey) {
    pending.current = { key: fitKey, seen: new Map() };
  }

  const textRows = React.useMemo(
    () => rows.map((r, i) => (r.empty ? -1 : i)).filter(i => i >= 0),
    [rows],
  );

  /**
   * The size to draw at — ONE size, for every page of the muṣḥaf.
   *
   * A printed muṣḥaf does not change its type from page to page. The line
   * grid fixes the size and the setter fits words to lines at that size;
   * a page whose lines carry fewer letters comes out with more air on
   * them, not with bigger letters on them.
   *
   * This used to derive the size from the page's own measured lines — the
   * size at which THIS page's median line needed no scaling. Every page
   * therefore chose independently, and since the cap allowed anything up
   * to `rowHeight / 1.5`, a sparse page could be set 37% larger than a
   * dense one. Page 5 next to page 3 is what that looks like, and it
   * reads as a different book.
   *
   * All 602 pages of the table have exactly fifteen rows, so `rowHeight`
   * is already the same on every one of them. Taking the size from the
   * row height and nothing else therefore makes the type the same on
   * every one of them too — by construction, with nothing to converge and
   * nothing to cache. What a page's own words decide is its `scaleX`
   * below, which is a few per cent of width, not a third of a size.
   *
   * `PRINTED_LINE_HEIGHT_EM` is where that one ratio lives, and it is the
   * leading the marks need; the old cap bought width by clipping the very
   * diacritics the Warsh orthography leans on.
   *
   * The measure has the same vote as the row, and for the same reason —
   * see `PRINTED_TYPICAL_LINE_EM`. Whichever is tighter decides.
   *
   * ── AND THE LEFTOVER HEIGHT GOES INTO THE LEADING ──────────────────
   *
   * A box taller than the page's proportions — full screen is one — leaves
   * height the type cannot use, because using it would make the lines
   * wider than the measure. Banking it as margin above and below is a
   * void at each end of the page, which is not what the extra room is
   * for. It goes into the ROWS instead: the same fifteen lines, set
   * further apart.
   *
   * This is the answer the Hafs pages already give. `MushafReader`'s
   * `MAX_VERTICAL_STRETCH` stretches the printed page into the same free
   * space rather than letterboxing it, and caps the stretch at 1.25
   * because past that the calligraphy reads as drawn out. Nothing is drawn
   * out here — the letters keep their size and only the space between the
   * lines opens — so the cap can be a little looser, and full screen on a
   * phone wants about 1.23 of it.
   */
  const fontSize = Math.max(
    MIN_PRINTED_SIZE,
    Math.min(
      height / rows.length / PRINTED_LINE_HEIGHT_EM,
      measure / PRINTED_TYPICAL_LINE_EM,
    ),
  );
  const rowHeight = Math.min(
    height / rows.length,
    fontSize * PRINTED_LINE_HEIGHT_EM * MAX_PRINTED_LEADING,
  );
  const margin = Math.max(0, (height - rowHeight * rows.length) / 2);

  const onLineLayout = React.useCallback(
    (index: number, drawn: number) => {
      if (PRINTED_LINE_CACHE.has(fitKey) || drawn <= 0 || fontSize <= 0) return;
      pending.current.seen.set(index, drawn / fontSize);
      if (pending.current.seen.size < textRows.length) return;
      const out = rows.map((_, i) => pending.current.seen.get(i) ?? 0);
      PRINTED_LINE_CACHE.set(fitKey, out);
      setEms(out);
    },
    [fitKey, fontSize, rows, textRows.length],
  );

  const ornaments = React.useMemo(() => {
    const out: Array<{ kind: 'band' | 'basmalah'; surah: number } | null> =
      rows.map(() => null);
    let i = 0;
    while (i < rows.length) {
      if (!rows[i].empty) {
        i += 1;
        continue;
      }
      let j = i;
      while (j < rows.length && rows[j].empty) j += 1;
      const opens = rows[j]?.ayahs[0];
      if (opens && opens.ayah === 1) {
        out[i] = { kind: 'band', surah: opens.surah };
        if (j - i > 1 && opens.surah !== 1 && opens.surah !== 9) {
          out[i + 1] = { kind: 'basmalah', surah: opens.surah };
        }
      }
      i = j;
    }
    return out;
  }, [rows]);

  /** The measure, in ems of the size every page is set at. */
  const targetEm = fontSize > 0 ? measure / fontSize : 0;

  return (
    // The rows are as tall as the type needs, so a box taller than the
    // page's own proportions gives it a margin rather than stretching it.
    <View style={{ width, height, paddingTop: margin }}>
      {rows.map((row, index) => {
        if (row.empty) {
          const ornament = ornaments[index];
          if (ornament?.kind === 'band') {
            return (
              <SurahBandRow
                key={`b${index}`}
                surah={ornament.surah}
                width={width}
                rowHeight={rowHeight}
                fontSize={fontSize}
                colors={colors}
              />
            );
          }
          if (ornament?.kind === 'basmalah') {
            return (
              <BasmalahRow
                key={`m${index}`}
                width={width}
                rowHeight={rowHeight}
                fontSize={fontSize}
                colors={colors}
              />
            );
          }
          return <View key={`e${index}`} style={{ height: rowHeight }} />;
        }

        const tokens: Array<{
          text: string;
          ref: AyahRef;
          mark: number | null;
          lit: boolean;
        }> = [];
        for (const part of row.ayahs) {
          const words = part.text.split(/\s+/).filter(Boolean);
          const lit =
            highlight?.surah === part.surah && highlight?.ayah === part.ayah;
          words.forEach((word, wi) => {
            tokens.push({
              text: word,
              ref: { surah: part.surah, ayah: part.ayah },
              mark: part.ends && wi === words.length - 1 ? part.ayah : null,
              lit,
            });
          });
        }

        /**
         * Exactly the measure — opened out at the gaps first, and only
         * then at the letters.
         *
         * `em` is this line's own drawn width at the nominal gap, divided
         * by the size it was drawn at, so it is a property of the line and
         * not of any guess. Until it is known the line is drawn nominal
         * and simply measured — one frame, once per page and box.
         *
         * ── WHY THE GAPS GO FIRST ──────────────────────────────────────
         *
         * A line reaches the measure by scaling before this, and scaling
         * is the wrong instrument: it is the letterforms that stretch, so
         * a page whose lines needed 18% came out in visibly heavier type
         * than the page beside it — which is what page 5 was. And it has a
         * ceiling, so the lines that needed more than the ceiling simply
         * did not reach the margin, which is the void.
         *
         * The print does not stretch letters. It opens the word gaps, and
         * `mushafLayout` already has the band they may move inside and the
         * exact advance of the bundled space to compute them with — the
         * Hafs pages have justified this way since they were written.
         * `natural` is what the line is without any gap at all, so the gap
         * that closes it is arithmetic rather than a search, and the
         * scaling that remains is the few per cent the band could not take.
         */
        const gaps = Math.max(0, tokens.length - 1);
        const em = ems?.[index] ?? 0;
        const natural = Math.max(0, em - WORD_SPACE_EM * gaps);
        // What the print gives THIS row. A full line on all but the rows
        // a surah ends on, which stop where the surah does.
        const rowEm = targetEm * row.share;
        const spaceEm =
          em > 0 && gaps > 0
            ? Math.min(
                WORD_SPACE_MAX_EM,
                Math.max(WORD_SPACE_MIN_EM, (rowEm - natural) / gaps),
              )
            : WORD_SPACE_EM;
        const justifiedEm = em > 0 ? natural + spaceEm * gaps : 0;
        const scaleX =
          justifiedEm > 0
            ? Math.max(
                MIN_PRINTED_SCALE,
                Math.min(MAX_PRINTED_SCALE, rowEm / justifiedEm),
              )
            : 1;

        /**
         * The line that cannot be filled honestly is centred, not dragged.
         *
         * About one line in ninety is short even with the gaps at the top
         * of their band and the letters at the top of theirs — the closing
         * pages, where a row of the print carries three or four words and
         * is held out to the margin with kashida we cannot draw. Pulling
         * those to the margin anyway means a gap the width of a word
         * between every pair of words. Centring what is there instead is
         * the fidelity rules' own answer for a line that cannot reach the
         * measure honestly, and it reads as a short line rather than a
         * broken one.
         */
        const drawnEm = justifiedEm * scaleX;
        const indent =
          drawnEm > 0 && targetEm - drawnEm > targetEm * PRINTED_CENTRE_BELOW
            ? ((targetEm - drawnEm) / 2) * fontSize
            : 0;
        // Always the bundled face at a size derived from its own advance —
        // never the platform's fallback, whose width differs between iOS
        // and Android and cost the Hafs pages the last word of all fifteen
        // lines of page 49.
        const gapStyle = {
          fontFamily: FONTS.arabicQuran,
          ...gapMetrics(spaceEm, fontSize),
        };

        return (
          <View key={`l${index}`} style={{ height: rowHeight, width }}>
            <Text
              allowFontScaling={false}
              onTextLayout={e =>
                onLineLayout(
                  index,
                  e.nativeEvent.lines.reduce((m, l) => Math.max(m, l.width), 0),
                )
              }
              style={[
                styles.body,
                styles.printedLine,
                {
                  // Far wider than any line can need, so the platform never
                  // has the option of breaking one. Anchored to the right,
                  // which is where an Arabic line begins, and scaled about
                  // that same edge so the text lands on the margin.
                  width: measure * PRINTED_BOX_SLACK,
                  height: rowHeight,
                  lineHeight: rowHeight,
                  fontFamily,
                  fontSize,
                  color: colors.text,
                  right: indent,
                  transform: [{ scaleX }],
                },
              ]}
            >
              {tokens.map((token, i) => (
                <Text
                  key={`${token.ref.surah}:${token.ref.ayah}:${i}`}
                  onPress={onAyahPress ? () => onAyahPress(token.ref) : undefined}
                  onLongPress={
                    onAyahLongPress ? () => onAyahLongPress(token.ref) : undefined
                  }
                  style={token.lit ? { backgroundColor: colors.selection } : undefined}
                >
                  {token.text}
                  {token.mark != null ? (
                    <Text
                      style={{ color: colors.accent, fontFamily: FONTS.arabicQuran }}
                    >
                      {`${NBSP}${END_OF_AYAH}${easternNumerals(token.mark)}`}
                    </Text>
                  ) : null}
                  {i < tokens.length - 1 ? (
                    <Text style={gapStyle}>{NBSP}</Text>
                  ) : null}
                </Text>
              ))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default React.memo(MushafUnicodePage);

const styles = StyleSheet.create({
  printedLine: {
    // Anchored to the right, which is where an Arabic line begins, and
    // scaled about that same edge so the text lands on the margin.
    position: 'absolute',
    top: 0,
    right: 0,
    textAlign: 'right',
    transformOrigin: 'right center',
  },
  body: {
    // ALWAYS rtl — never I18nManager.isRTL. That flag follows the UI
    // language, and the muṣḥaf is right-to-left in every locale.
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
});
