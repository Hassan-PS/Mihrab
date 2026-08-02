/**
 * A mushaf page drawn as text, with its font loaded on demand — v2.8.0.
 *
 * Wraps `MushafTextPage` with everything the reader shouldn't have to know
 * about: fetching and registering the page's font, the placeholder shown while
 * that happens, night-mode colours (a repaint, not an image inversion), and
 * the fallback signal when a page's font can't be had at all.
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MushafTextPage, { type AyahRef } from './MushafTextPage';
import { getPageLayout, isFramedPage } from './mushafLayout';
import { useMushafPageFont } from './useMushafPageFont';

export type MushafTextPageSurfaceProps = {
  page: number;
  /** Width of the page's text block in dp. */
  width: number;
  /** Height of the page box in dp; lines divide it evenly. */
  height: number;
  nightMode: boolean;
  accentColor: string;
  selected?: AyahRef | null;
  playing?: AyahRef | null;
  /** Called once when this page's font cannot be loaded. */
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

function MushafTextPageSurface({
  page,
  width,
  height,
  nightMode,
  accentColor,
  selected,
  playing,
  onUnavailable,
  onWordPress,
  onWordLongPress,
  prefetchRadius = 0,
}: MushafTextPageSurfaceProps) {
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
    () =>
      nightMode
        ? {
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
          }
        : {
            text: '#1A1A18',
            accent: accentColor,
            heading: accentColor,
            selection: 'rgba(0,0,0,0.06)',
            muted: 'rgba(26,26,24,0.66)',
          },
    [nightMode, accentColor],
  );

  const lineCount = layout?.lines.length ?? 15;
  const framed = isFramedPage(page);

  // A justified line spans the measure exactly, so without an inset the
  // outermost glyph would sit hard against the edge of the screen. The print
  // keeps a margin; 3% of the block reads the same at any size.
  // Framed pages need more room: the text block sits inside a drawn double
  // rule, so its inset has to clear the rule AND its padding, not just the
  // screen edge.
  // The plate pages hold 7-8 lines in the space a normal page gives 15, so
  // they have vertical room to spare. Spending some of it on a wider text
  // block makes the opening pages read at a size that matches their weight.
  const inset = framed ? width * 0.08 : width * 0.035;
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

  const page1 = (
    <MushafTextPage
      page={page}
      width={textWidth}
      lineHeight={(height - inset * (framed ? 1.2 : 0)) / lineCount}
      fontFamily={family}
      colors={colors}
      selected={selected}
      playing={playing}
      onWordPress={handleWordPress}
      onWordLongPress={handleWordLongPress}
    />
  );

  if (!framed) {
    return (
      <View style={[styles.block, { width, paddingHorizontal: inset }]}>
        {page1}
      </View>
    );
  }

  // Pages 1–2 are ornamental plates in the print. We draw a restrained
  // double rule rather than reproducing the illumination: the frame reads as
  // deliberate, and stays inside the app's "reverent, not heavy" line.
  return (
    <View style={[styles.block, { width, height }]}>
      <View
        style={[
          styles.frameOuter,
          {
            borderColor: colors.accent,
            padding: inset * 0.22,
            borderRadius: inset * 0.5,
          },
        ]}
      >
        <View
          style={[
            styles.frameInner,
            {
              borderColor: colors.accent,
              paddingHorizontal: inset * 0.6,
              paddingVertical: inset * 0.35,
              borderRadius: inset * 0.32,
            },
          ]}
        >
          {page1}
        </View>
      </View>
    </View>
  );
}

export default React.memo(MushafTextPageSurface);

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
