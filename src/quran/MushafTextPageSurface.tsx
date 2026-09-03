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
import { getPageLayout, isFramedPage, pageMeasureEm } from './mushafLayout';
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

  const drawn = (
    <MushafTextPage
      page={page}
      width={textWidth}
      lineHeight={(height - inset * (framed ? 1.2 : 0)) / lineCount}
      fontFamily={family}
      colors={colors}
      selected={selected}
      playing={playing}
      tint={tint}
      onWordPress={handleWordPress}
      onWordLongPress={handleWordLongPress}
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
  playerReserve = 0,
}: {
  page: number;
  riwayah?: RiwayahId;
  /** Width of the page's text block. */
  textWidth: number;
  /** The viewport the page has to work with. */
  viewportHeight: number;
  /** True when the column scrolls — the phone's landscape reading zoom. */
  scrolling: boolean;
  /** Room the player is holding at the foot of a non-scrolling column. */
  playerReserve?: number;
}): number {
  if (!scrolling) return Math.max(120, viewportHeight - playerReserve);
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
  return Math.max(
    viewportHeight,
    fontSize * MUSHAF_LINE_HEIGHT_EM * layout.lines.length,
  );
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
