/**
 * Per-page mushaf overlay — QR-8/12/17 (docs/quran-reader-plan.md).
 *
 * Renders on top of a page image, in image-local coordinates:
 *   • selected-ayah highlight (tap feedback / action-sheet anchor),
 *   • playing-ayah highlight that follows recitation,
 *   • bookmark markers in the margin of the ayah's first line.
 *
 * Pure presentational; geometry must already be loaded (the reader
 * gates on `loadGeometry()`), so all lookups here are synchronous.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GEOMETRY_REF_WIDTH,
  pageAyahLineRects,
  type AyahLineRect,
} from '../geometry';
import { BOOKMARK_COLORS, type QuranBookmark } from '../quranState';

type Props = {
  page: number;
  renderedWidth: number;
  selected: { surah: number; ayah: number } | null;
  playing: { surah: number; ayah: number } | null;
  bookmarks: QuranBookmark[];
  accentColor: string;
  nightMode: boolean;
};

function rectsFor(
  rects: AyahLineRect[],
  ref: { surah: number; ayah: number } | null,
): AyahLineRect[] {
  if (!ref) return [];
  return rects.filter(r => r.surah === ref.surah && r.ayah === ref.ayah);
}

export const MushafPageOverlay = memo(function MushafPageOverlay({
  page,
  renderedWidth,
  selected,
  playing,
  bookmarks,
  accentColor,
  nightMode,
}: Props) {
  const rects = pageAyahLineRects(page);
  if (rects.length === 0) return null;
  const scale = renderedWidth / GEOMETRY_REF_WIDTH;

  const box = (r: AyahLineRect, key: string, color: string, opacity: number) => (
    <View
      key={key}
      pointerEvents="none"
      style={[
        styles.rect,
        {
          left: r.x0 * scale - 2,
          top: r.y0 * scale - 2,
          width: (r.x1 - r.x0) * scale + 4,
          height: (r.y1 - r.y0) * scale + 4,
          backgroundColor: color,
          opacity,
        },
      ]}
    />
  );

  const selectedRects = rectsFor(rects, selected);
  const playingRects = rectsFor(rects, playing);

  // Bookmark markers: at the first (topmost, rightmost) rect of the ayah.
  const markers = bookmarks
    .map(b => {
      const own = rects
        .filter(r => r.surah === b.surah && r.ayah === b.ayah)
        .sort((p, q) => p.line - q.line);
      if (own.length === 0) return null;
      const r = own[0];
      return { b, r };
    })
    .filter((m): m is { b: QuranBookmark; r: AyahLineRect } => m != null);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {playingRects.map((r, i) =>
        box(r, `p${i}`, accentColor, nightMode ? 0.35 : 0.22),
      )}
      {selectedRects.map((r, i) =>
        box(r, `s${i}`, accentColor, nightMode ? 0.3 : 0.18),
      )}
      {markers.map(({ b, r }) => (
        <View
          key={b.id}
          pointerEvents="none"
          style={[
            styles.marker,
            {
              backgroundColor: BOOKMARK_COLORS[b.color],
              left: r.x1 * scale + 2,
              top: r.y0 * scale,
              height: Math.max(14, (r.y1 - r.y0) * scale * 0.6),
            },
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  rect: { position: 'absolute', borderRadius: 6 },
  marker: {
    position: 'absolute',
    width: 4,
    borderRadius: 2,
  },
});
