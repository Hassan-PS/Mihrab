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
import { TOTAL_AYAHS, ayahAtIndex, ayahIndexOf } from './ayahIndex';
import { easternNumerals, pagesForRiwayah } from './pages';
import { loadRiwayahText } from './riwayahData';
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

  const from = ayahIndexOf(meta.start.surah, meta.start.ayah);
  // `end` is EXCLUSIVE — the same convention `findPageForAyah` reads it
  // with — and a null end means the last page, which runs to 114:6.
  const to = meta.end
    ? ayahIndexOf(meta.end.surah, meta.end.ayah) - 1
    : TOTAL_AYAHS;

  const blocks: UnicodePageBlock[] = [];
  let run: Array<AyahRef & { text: string }> | null = null;

  for (let i = from; i <= to; i++) {
    const ref = ayahAtIndex(i);
    if (ref.ayah === 1) {
      run = null;
      blocks.push({ kind: 'surah', surah: ref.surah });
      // Al-Fātiḥah counts the basmalah as its first ayah, so drawing one
      // above it would print it twice; al-Tawbah has none at all. Every
      // other surah opens with it, unnumbered, under the band.
      if (ref.surah !== 1 && ref.surah !== 9) blocks.push({ kind: 'basmalah' });
    }
    const body = text[`${ref.surah}:${ref.ayah}`];
    if (!body) continue;
    if (!run) {
      run = [];
      blocks.push({ kind: 'text', ayahs: run });
    }
    run.push({ ...ref, text: body });
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

  return (
    // `minHeight`, never a fixed height with `overflow: hidden` — a page
    // that came out a little tall must scroll in the column it was given,
    // not lose its last ayah to a clip nobody can see happening.
    <View style={{ width, minHeight: height }} onLayout={onContentLayout}>
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
