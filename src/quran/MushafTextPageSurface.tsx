/**
 * A mushaf page, drawn — and the one place that decides HOW.
 *
 * Wraps a page renderer with everything the reader shouldn't have to know
 * about: which riwayah is open and therefore which renderer draws it,
 * fetching and registering a glyph page's font, the placeholder shown while
 * that happens, night-mode colours (a repaint, not an image inversion), the
 * opening plates' frame, and the fallback signal when a page's font can't be
 * had at all.
 *
 * ── WHY THE DISPATCH LIVES HERE ───────────────────────────────────────
 *
 * There are two renderers and four readers (phone, phone-landscape, spread,
 * and the legacy image reader's text branch). Asking each reader which
 * renderer to use would be the same question answered four times, and the
 * fifth reader — or the fifth riwayah — is exactly where one of the copies
 * gets forgotten. A reader asks for "page 42 of this riwayah, this big";
 * everything after that is this file's problem.
 */
import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MushafTextPage, {
  MUSHAF_LINE_HEIGHT_EM,
  type AyahRef,
} from './MushafTextPage';
import MushafUnicodePage from './MushafUnicodePage';
import {
  getPageLayout,
  isFramedPage,
  lineInkPadding,
  pageBlockEm,
  pageMeasureEm,
} from './mushafLayout';
import { DEFAULT_RIWAYAH, riwayahById, type RiwayahId } from './riwayat';
import { toneIsDark, type MushafTone } from './mushafTone';
import { useMushafPageFont } from './useMushafPageFont';
import { ayahTint, withAlpha, type AyahRefLike } from './ayahMarks';
import type { QuranBookmark } from './quranState';

export type MushafPageColors = {
  text: string;
  accent: string;
  heading: string;
  selection: string;
  muted: string;
  /** Behind the one word being recited — stronger than the ayah's wash. */
  word: string;
};

export type MushafTextPageSurfaceProps = {
  page: number;
  /** Width of the page's text block in dp. */
  width: number;
  /** Height of the page box in dp; lines divide it evenly. */
  height: number;
  /** Which muṣḥaf. Absent means Hafs, which is what every reader meant
   *  before there was a second one. */
  riwayah?: RiwayahId;
  /** Paper, sepia or night — see `mushafTone.ts`. */
  tone: MushafTone;
  accentColor: string;
  selected?: AyahRef | null;
  playing?: AyahRef | null;
  /**
   * The standing marks on the page — everything the reader has put there
   * or the khatmah is pointing at. Passed as sources rather than as a
   * finished tint so the surface can resolve them against the palette it
   * already owns, which is the same reason it owns the palette at all.
   */
  bookmarks?: readonly QuranBookmark[];
  khatmahPosition?: AyahRefLike | null;
  /** The ayah the khatmah portion in hand ends on. */
  khatmahTarget?: AyahRefLike | null;
  /** Called once when this page's font cannot be loaded. Glyph pages only —
   *  a bundled riwayah has no font to fail to fetch. */
  onUnavailable?: (page: number) => void;
  /**
   * Both handlers take the page, so the reader can pass ONE stable callback
   * for the whole list instead of closing over the page per item. A fresh
   * closure per render is what used to defeat the memo on every line: it
   * changed identity, so `MushafTextPage`'s `useCallback` changed with it, so
   * `LineView`'s memo compared unequal and all fifteen lines rebuilt — on
   * every page turn and every fullscreen toggle.
   */
  onWordPress?: (ref: AyahRef, page: number) => void;
  onWordLongPress?: (ref: AyahRef, page: number) => void;
  /** Prefetch radius in pages; only the visible page should pass > 0. */
  prefetchRadius?: number;
};

/**
 * The page's ink, for either renderer.
 *
 * Night is a repaint, not an image inversion, so a Unicode page gets it by
 * using this palette and nothing else. Sepia is the paper palette with a
 * brown ink: the ornament, the accent and the washes are the print's.
 */
export function mushafPageColors(
  tone: MushafTone,
  accentColor: string,
): MushafPageColors {
  if (tone === 'night') {
    return {
      text: '#E8E4DA',
      accent: accentColor,
      // The surah's name, inside the band. On a night page the accent
      // is too close to the ground to read at a glance, so the name
      // takes the page's own ink and the band keeps the accent —
      // which is also how the print does it: the frame is worked, the
      // name is written.
      heading: '#F2EFE6',
      selection: 'rgba(255,255,255,0.10)',
      muted: 'rgba(232,228,218,0.72)',
      word: withAlpha(accentColor, 0.55),
    };
  }
  if (tone === 'sepia') {
    return {
      text: '#2B2418',
      accent: accentColor,
      heading: accentColor,
      selection: 'rgba(60,40,10,0.08)',
      muted: 'rgba(43,36,24,0.64)',
      word: withAlpha(accentColor, 0.42),
    };
  }
  return {
    text: '#1A1A18',
    accent: accentColor,
    heading: accentColor,
    selection: 'rgba(0,0,0,0.06)',
    muted: 'rgba(26,26,24,0.66)',
    word: withAlpha(accentColor, 0.42),
  };
}

/**
 * The inset a page keeps clear of the edge of its block.
 *
 * A justified line spans the measure exactly, so without an inset the
 * outermost glyph would sit hard against the edge of the screen. The print
 * keeps a margin; 3% of the block reads the same at any size.
 * Framed pages need more room: the text block sits inside a drawn double
 * rule, so its inset has to clear the rule AND its padding, not just the
 * screen edge.
 * The plate pages hold 7-8 lines in the space a normal page gives 15, so
 * they have vertical room to spare. Spending some of it on a wider text
 * block makes the opening pages read at a size that matches their weight.
 */
function pageInset(page: number, width: number): number {
  return isFramedPage(page) ? width * 0.08 : width * 0.035;
}

/**
 * Fit `lineCount` lines into `boxH`, leaving room for the ink that
 * overshoots the first line's box above and the last line's below.
 *
 * ── THE CUT THAT `lineInkPadding` DOES NOT REACH ──────────────────────
 *
 * A line's ink overshoots its metrics by up to 0.4 em above and 0.2 em
 * below, and `lineInkPadding` gives the text view room for it — padding
 * the view and pulling the padding back with a negative margin, so the
 * baseline does not move. That works everywhere INSIDE a page, because
 * the room borrowed is a neighbouring line's box and a line box is
 * transparent: the maddah over an alif is drawn across the bottom of the
 * line above it and nobody can tell.
 *
 * The first and last lines have no neighbour to borrow from. They borrow
 * from outside the page, and whatever contains the page clips it there —
 * the landscape column is a `ScrollView`, and a `ScrollView` on Android
 * always clips its content. So the top line lost the marks ABOVE it while
 * keeping every letter, which reads as a broken font rather than a clip,
 * and the bottom line lost its deepest swashes.
 *
 * It shows worst in the landscape column, where the recitation's
 * follow-scroll comes to rest exactly on a line box (`followOffset`) — so
 * the line at the top of the viewport is cut at precisely the height
 * where the harakat live, on every scroll, not just at the top of a page.
 *
 * So the page reserves that room out of its own box: the lines are a hair
 * shorter and the block is padded by what the ink needs. The scrolling
 * column asks for the reserve back in its height instead
 * (`mushafPageColumnHeight`), which keeps the landscape reading zoom
 * exactly where it was.
 */
export function fitLinesWithInk(
  fontSize: number,
  boxH: number,
  lineCount: number,
): { lineHeight: number; top: number; bottom: number } {
  const flat = { lineHeight: boxH / lineCount, top: 0, bottom: 0 };
  if (!(fontSize > 0) || !(boxH > 0) || lineCount < 1) return flat;
  let lineHeight = boxH / lineCount;
  let ink = lineInkPadding(fontSize, lineHeight);
  // The reserve depends on the line height it is reserved out of — a
  // shorter line has less leading and so needs a hair more room — so this
  // is a fixed point, not a formula. Two passes land within a dp of it,
  // and the third would move nothing anyone could see.
  for (let pass = 0; pass < 2; pass++) {
    const next = (boxH - ink.top - ink.bottom) / lineCount;
    if (!(next > 0)) return flat;
    lineHeight = next;
    ink = lineInkPadding(fontSize, lineHeight);
  }
  // A box too small to hold the reserve keeps its lines rather than
  // collapsing them: a squeezed page beats no page.
  if (!(boxH - ink.top - ink.bottom > 0)) return flat;
  return { lineHeight, top: ink.top, bottom: ink.bottom };
}

/**
 * Pages 1–2 are ornamental plates in the print. We draw a restrained
 * double rule rather than reproducing the illumination: the frame reads as
 * deliberate, and stays inside the app's "reverent, not heavy" line.
 */
function FramedPlate({
  width,
  height,
  inset,
  color,
  children,
}: {
  width: number;
  height: number;
  inset: number;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.block, { width, height }]}>
      <View
        style={[
          styles.frameOuter,
          {
            borderColor: color,
            padding: inset * 0.22,
            borderRadius: inset * 0.5,
          },
        ]}
      >
        <View
          style={[
            styles.frameInner,
            {
              borderColor: color,
              paddingHorizontal: inset * 0.6,
              paddingVertical: inset * 0.35,
              borderRadius: inset * 0.32,
            },
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

/** The glyph pipeline: one downloaded font per page, exact printed lines. */
function GlyphPageSurface({
  page,
  width,
  height,
  tone,
  accentColor,
  selected,
  playing,
  bookmarks,
  khatmahPosition,
  khatmahTarget,
  onUnavailable,
  onWordPress,
  onWordLongPress,
  prefetchRadius = 0,
}: MushafTextPageSurfaceProps) {
  const nightMode = toneIsDark(tone);
  const { family, failed } = useMushafPageFont(page, true, prefetchRadius);
  const layout = getPageLayout(page);

  useEffect(() => {
    if (failed) onUnavailable?.(page);
  }, [failed, onUnavailable, page]);

  // Bound to the page here, once, rather than in the reader's renderItem —
  // which runs on every reader render and would hand a new function down each
  // time.
  const handleWordPress = React.useCallback(
    (ref: AyahRef) => onWordPress?.(ref, page),
    [onWordPress, page],
  );
  const handleWordLongPress = React.useCallback(
    (ref: AyahRef) => onWordLongPress?.(ref, page),
    [onWordLongPress, page],
  );

  const colors = React.useMemo(
    () => mushafPageColors(tone, accentColor),
    [tone, accentColor],
  );

  const tint = useMemo(
    () =>
      ayahTint({
        selected,
        playing,
        bookmarks,
        khatmahPosition,
        khatmahTarget,
        accentColor,
        nightMode,
      }),
    [
      selected,
      playing,
      bookmarks,
      khatmahPosition,
      khatmahTarget,
      accentColor,
      nightMode,
    ],
  );

  const lineCount = layout?.lines.length ?? 15;
  const framed = isFramedPage(page);
  const inset = pageInset(page, width);
  const textWidth = width - inset * 2;

  if (!layout || !family) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        {!failed ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : null}
      </View>
    );
  }

  // The page fits its box less the room its outermost ink needs — see
  // `fitLinesWithInk`. `fontSize` is decided by the WIDTH alone (it is
  // `textWidth / pageBlockEm`, in MushafTextPage), so the reserve can be
  // solved here without laying anything out.
  const fit = fitLinesWithInk(
    textWidth / pageBlockEm(layout),
    height - inset * (framed ? 1.2 : 0),
    lineCount,
  );

  const drawn = (
    <MushafTextPage
      page={page}
      width={textWidth}
      lineHeight={fit.lineHeight}
      fontFamily={family}
      colors={colors}
      selected={selected}
      playing={playing}
      tint={tint}
      onWordPress={handleWordPress}
      onWordLongPress={handleWordLongPress}
    />
  );

  // The reserve is padding, not margin: it has to be INSIDE the page's box
  // so that whatever clips the page — the landscape column, always — clips
  // outside the ink rather than through it.
  if (!framed) {
    return (
      <View
        style={[
          styles.block,
          {
            width,
            paddingHorizontal: inset,
            paddingTop: fit.top,
            paddingBottom: fit.bottom,
          },
        ]}>
        {drawn}
      </View>
    );
  }
  return (
    <FramedPlate
      width={width}
      height={height}
      inset={inset}
      color={colors.accent}
    >
      <View style={{ paddingTop: fit.top, paddingBottom: fit.bottom }}>
        {drawn}
      </View>
    </FramedPlate>
  );
}

/**
 * The Unicode pipeline: bundled text in a bundled face, fitted to the box.
 *
 * No font fetch, so no placeholder and no `onUnavailable` — the data either
 * shipped with the build or the riwayah was never offered (`riwayat.ts`).
 */
function UnicodePageSurface({
  page,
  width,
  height,
  riwayah = DEFAULT_RIWAYAH,
  tone,
  accentColor,
  selected,
  playing,
  bookmarks,
  khatmahPosition,
  khatmahTarget,
  onWordPress,
  onWordLongPress,
}: MushafTextPageSurfaceProps) {
  const nightMode = toneIsDark(tone);
  const handlePress = React.useCallback(
    (ref: AyahRef) => onWordPress?.(ref, page),
    [onWordPress, page],
  );
  const handleLongPress = React.useCallback(
    (ref: AyahRef) => onWordLongPress?.(ref, page),
    [onWordLongPress, page],
  );
  const colors = React.useMemo(
    () => mushafPageColors(tone, accentColor),
    [tone, accentColor],
  );

  const tint = useMemo(
    () =>
      ayahTint({
        selected,
        playing,
        bookmarks,
        khatmahPosition,
        khatmahTarget,
        accentColor,
        nightMode,
      }),
    [
      selected,
      playing,
      bookmarks,
      khatmahPosition,
      khatmahTarget,
      accentColor,
      nightMode,
    ],
  );

  const framed = isFramedPage(page);
  const inset = pageInset(page, width);
  const textWidth = width - inset * 2;
  // The frame's rules and padding come out of the height the text is fitted
  // to, or the fit would size a page to a box the frame then shrinks.
  const textHeight = Math.max(120, height - inset * (framed ? 1.6 : 0));

  const drawn = (
    <MushafUnicodePage
      page={page}
      riwayah={riwayah}
      width={textWidth}
      height={textHeight}
      colors={colors}
      selected={selected}
      playing={playing}
      tint={tint}
      onAyahPress={handlePress}
      onAyahLongPress={handleLongPress}
    />
  );

  if (!framed) {
    return (
      <View style={[styles.block, { width, paddingHorizontal: inset }]}>
        {drawn}
      </View>
    );
  }
  return (
    <FramedPlate
      width={width}
      height={height}
      inset={inset}
      color={colors.accent}
    >
      {drawn}
    </FramedPlate>
  );
}

function MushafTextPageSurface(props: MushafTextPageSurfaceProps) {
  const riwayah = props.riwayah ?? DEFAULT_RIWAYAH;
  // Two components rather than one with a branch inside it: they do not use
  // the same hooks, and a glyph surface that kept calling `useMushafPageFont`
  // for a Warsh page would queue a 310 KB download per page nobody will draw.
  return riwayahById(riwayah).render === 'unicode' ? (
    <UnicodePageSurface {...props} riwayah={riwayah} />
  ) : (
    <GlyphPageSurface {...props} />
  );
}

export default React.memo(MushafTextPageSurface);

/**
 * The Madinah text block is 1.636 as tall as it is wide. A Unicode page has
 * no printed proportions of its own to inherit, so it borrows these: a
 * muṣḥaf is a muṣḥaf-shaped thing, and a reader who switches riwayah should
 * not find the page has changed shape as well as script.
 */
const PRINT_BLOCK_ASPECT = 1.636;

/**
 * How tall a page's box should be, whichever renderer fills it.
 *
 * Three readers were each working this out from `getPageLayout` and
 * `pageMeasureEm` — Hafs-only calls, in code that now has to serve a
 * riwayah that has neither.
 */
export function mushafPageColumnHeight({
  page,
  riwayah = DEFAULT_RIWAYAH,
  textWidth,
  viewportHeight,
  scrolling,
}: {
  page: number;
  riwayah?: RiwayahId;
  /** Width of the page's text block. */
  textWidth: number;
  /** The viewport the page has to work with. */
  viewportHeight: number;
  /** True when the column scrolls — the phone's landscape reading zoom. */
  scrolling: boolean;
}): number {
  // The mini player is a flex sibling below the pager, so the viewport it
  // is measured in already excludes it — nothing to reserve here.
  if (!scrolling) return Math.max(120, viewportHeight);
  // Height follows the text: the column scrolls whatever overflows.
  if (riwayahById(riwayah).render === 'unicode') {
    return Math.max(viewportHeight, textWidth * PRINT_BLOCK_ASPECT);
  }
  const layout = getPageLayout(page);
  if (!layout) return Math.max(120, viewportHeight);
  // The measure has to be the DRAWN one — `layout.measure` is advances only,
  // and sizing against it makes the column ~14% taller than the text that
  // lands in it, leaving a dead band under the last line.
  const fontSize = textWidth / pageMeasureEm(layout);
  // Ask for the ink reserve ON TOP of the line boxes rather than out of
  // them. The surface takes the same reserve back out of whatever height
  // it is given (`fitLinesWithInk`), so handing it the padded height is
  // what leaves the landscape reading zoom exactly where it was while
  // still giving the first and last lines room the column will not clip.
  const drawn = textWidth / pageBlockEm(layout);
  const ink = lineInkPadding(drawn, drawn * MUSHAF_LINE_HEIGHT_EM);
  return Math.max(
    viewportHeight,
    fontSize * MUSHAF_LINE_HEIGHT_EM * layout.lines.length +
      ink.top +
      ink.bottom,
  );
}

/**
 * Where the lines actually land in a column of this height.
 *
 * The follow-scroll used to work this out from `pageBlockEm` alone, which
 * is the width the FONT is sized against — not the pitch the lines end up
 * drawn at. `mushafPageColumnHeight` sizes the column against
 * `pageMeasureEm`, and `fitLinesWithInk` then divides that column back
 * into lines, so the real pitch is a few percent off the font's own and
 * the first line starts an ink reserve down from the top. Over fifteen
 * lines that is most of a line of drift — invisible in a tall viewport,
 * and the whole error in a four-line one.
 *
 * So this asks the same two functions the surface asks, in the same order,
 * and answers in points from the top of the column.
 */
export function mushafLineGeometry({
  page,
  textWidth,
  columnHeight,
}: {
  page: number;
  textWidth: number;
  columnHeight: number;
}): { top: number; pitch: number; lineCount: number } | null {
  if (!(textWidth > 0) || !(columnHeight > 0)) return null;
  const layout = getPageLayout(page);
  if (!layout) return null;
  const blockEm = pageBlockEm(layout);
  if (!(blockEm > 0)) return null;
  const lineCount = layout.lines.length;
  if (lineCount < 1) return null;
  const fit = fitLinesWithInk(textWidth / blockEm, columnHeight, lineCount);
  return { top: fit.top, pitch: fit.lineHeight, lineCount };
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameOuter: {
    borderWidth: StyleSheet.hairlineWidth * 3,
  },
  frameInner: {
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
