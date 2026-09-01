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
  ayahCountForRiwayah,
  easternNumerals,
  pagesForRiwayah,
} from './pages';
import { loadRiwayahText } from './riwayahData';
import {
  allocate,
  printedLinesFor,
  type AllocatedLine,
} from './mushafPrintedLines';
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

/** Corrections attempted before the page settles for what it has. */
const MAX_FIT_PASSES = 4;

/** A fit is good enough once it fills this much of the box without spilling. */
const FIT_FLOOR = 0.93;

/**
 * The ayah mark and the space before it, in advancing characters.
 *
 * Small, and on every ayah, so leaving it out of a line's width bends the
 * sizing by about a character per ayah — three or four on a busy line.
 */
const AYAH_MARK_CHARS = 4;

/**
 * How much of the measure a printed line is sized to fill.
 *
 * Under one because the size is derived from an estimated advance, and a
 * line that comes out a hair too wide does not clip — it WRAPS, which
 * turns fifteen rows into sixteen and undoes the whole point.
 */
const PRINTED_FILL = 0.97;

/** The most a printed line may be tracked out to reach the measure. */
const MAX_TRACKING_EM = 0.06;

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
    const rows = printedLinesFor(riwayah, page);
    if (!rows) return null;
    const table = loadRiwayahText(riwayah);
    if (!table) return null;
    return allocate(rows, (s, a) => table[`${s}:${a}`] ?? null);
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
 * The reflowing path below fits a font size to the box and lets the text
 * wrap where it will. This one does the opposite and it is the better way
 * round when the data allows it: the lines are given, so the rows divide
 * the height exactly and the size follows from the measure. There is no
 * fitting loop, nothing to measure, and nothing to converge — which is
 * also why the class of bug the loop kept producing cannot arise here.
 */
function PrintedPageBody({
  rows,
  width,
  height,
  fontFamily,
  colors,
  highlight,
  onAyahPress,
  onAyahLongPress,
}: {
  rows: AllocatedLine[];
  width: number;
  height: number;
  fontFamily: string;
  colors: MushafUnicodePageProps['colors'];
  highlight: AyahRef | null;
  onAyahPress?: (ref: AyahRef) => void;
  onAyahLongPress?: (ref: AyahRef) => void;
}) {
  // Every row is a row of the print, band rows included, so the height
  // divides by the count and the page fills its box by construction.
  const rowHeight = height / rows.length;

  /**
   * Sized so the LONGEST line fits the measure.
   *
   * Not the average: a line that overflows either wraps — destroying the
   * grid this whole path exists to keep — or is clipped, and neither is
   * recoverable. Sizing to the longest costs a little fill on the shorter
   * lines, which justification below takes back.
   */
  const lengths = React.useMemo(
    () =>
      rows.map(row =>
        row.ayahs.reduce(
          (n, a) => n + advancingLength(a.text) + (a.ends ? AYAH_MARK_CHARS : 0),
          0,
        ),
      ),
    [rows],
  );
  const widest = lengths.reduce((most, n) => Math.max(most, n), 0);
  const widestRow = lengths.indexOf(widest);

  const advanceKey = `${fontFamily}:${Math.round(width)}`;
  const [advanceEm, setAdvanceEm] = React.useState(
    () => ADVANCE_CACHE.get(advanceKey) ?? calibratedAdvanceEm,
  );
  const fontSize =
    widest > 0
      ? Math.min(
          rowHeight / UNICODE_LINE_HEIGHT_EM,
          (width * PRINTED_FILL) / (widest * advanceEm),
        )
      : rowHeight / UNICODE_LINE_HEIGHT_EM;

  /**
   * One measurement of the longest line, which settles the face's advance.
   *
   * `onTextLayout` reports what was DRAWN. Deriving the advance from it
   * rather than fitting towards it is what keeps this to a single pass:
   * width = chars × advance × size, so advance = width / (chars × size)
   * whatever size the measurement happened at.
   */
  const onWidestLayout = React.useCallback(
    (e: { nativeEvent: { lines: Array<{ width: number }> } }) => {
      if (ADVANCE_CACHE.has(advanceKey) || widest <= 0 || fontSize <= 0) return;
      const drawn = e.nativeEvent.lines.reduce((m, l) => Math.max(m, l.width), 0);
      if (drawn <= 0) return;
      const implied = drawn / (widest * fontSize);
      // A wild answer means the line wrapped, or the face fell back to
      // something else entirely. Keep the estimate rather than enshrine a
      // number that would mis-size every page after it.
      if (implied < 0.2 || implied > 1.2) return;
      ADVANCE_CACHE.set(advanceKey, implied);
      setAdvanceEm(implied);
    },
    [advanceKey, fontSize, widest],
  );

  /**
   * What belongs on each empty row.
   *
   * The table records a band's rows as lines with nothing on them, which
   * is what they are — the print gives a surah opening two of its fifteen
   * lines, and a renderer that adds a band ON TOP of fifteen text rows
   * overflows the page by exactly that much. So the surah is read off the
   * row that follows: an empty run before an ayah 1 is that surah's band,
   * and its basmalah if the print gave it two rows.
   */
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

  return (
    <View style={{ width, height }}>
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
        const chars = row.ayahs.reduce(
          (n, a) => n + advancingLength(a.text) + (a.ends ? AYAH_MARK_CHARS : 0),
          0,
        );
        // Positive only, and capped. Asking a platform for a NEGATIVE gap
        // is what lost words off the ends of Hafs lines on one reporter's
        // device — it was silently ignored there, and the line was then
        // drawn wider than it had been measured for.
        const slack = width - chars * advanceEm * fontSize;
        const spacing =
          chars > 1
            ? Math.max(0, Math.min(slack / (chars - 1), fontSize * MAX_TRACKING_EM))
            : 0;
        return (
          <Text
            key={`l${index}`}
            allowFontScaling={false}
            onTextLayout={index === widestRow ? onWidestLayout : undefined}
            style={[
              styles.body,
              {
                width,
                height: rowHeight,
                fontFamily,
                fontSize,
                lineHeight: rowHeight,
                letterSpacing: spacing,
                color: colors.text,
                textAlign: 'right',
              },
            ]}
          >
            {row.ayahs.map((part, i) => {
              const ref = { surah: part.surah, ayah: part.ayah };
              const lit =
                highlight?.surah === part.surah && highlight?.ayah === part.ayah;
              return (
                <Text
                  key={`${part.surah}:${part.ayah}:${i}`}
                  onPress={onAyahPress ? () => onAyahPress(ref) : undefined}
                  onLongPress={
                    onAyahLongPress ? () => onAyahLongPress(ref) : undefined
                  }
                  style={lit ? { backgroundColor: colors.selection } : undefined}
                >
                  {part.text}
                  {part.ends ? (
                    <Text style={{ color: colors.accent, fontFamily: FONTS.arabicQuran }}>
                      {`${NBSP}${END_OF_AYAH}${easternNumerals(part.ayah)}`}
                    </Text>
                  ) : null}
                  {i < row.ayahs.length - 1 ? ' ' : ''}
                </Text>
              );
            })}
          </Text>
        );
      })}
    </View>
  );
}

export default React.memo(MushafUnicodePage);

const styles = StyleSheet.create({
  body: {
    // ALWAYS rtl — never I18nManager.isRTL. That flag follows the UI
    // language, and the muṣḥaf is right-to-left in every locale.
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
});
