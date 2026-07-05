/**
 * Per-page mushaf overlay — QR-8/12/17 (docs/quran-reader-plan.md).
 *
 * Renders on top of a page image, in image-local coordinates:
 *   • selected-ayah highlight (long-press feedback / action-sheet anchor),
 *   • playing-ayah highlight that follows recitation,
 *   • bookmarked ayahs highlighted IN FULL in their bookmark color
 *     (v2.7.28 — the old margin marker sat at the *start* of the ayah,
 *     which reads as the previous ayah since the ayah number comes
 *     after the text). Kept translucent so the page stays readable.
 *   • the khatmah position ayah in the reserved khatmah color.
 *
 * Pure presentational; geometry must already be loaded (the reader
 * gates on `loadGeometry()`), so all lookups here are synchronous.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GEOMETRY_REF_HEIGHT,
  GEOMETRY_REF_WIDTH,
  pageAyahLineRects,
  type AyahLineRect,
} from '../geometry';
import {
  BOOKMARK_COLORS,
  KHATMAH_COLOR,
  type QuranBookmark,
} from '../quranState';

type Props = {
  page: number;
  renderedWidth: number;
  /** Pass when the page is drawn vertically stretched (v2.7.29) so
   *  highlight rects track the stretched text; defaults to uniform. */
  renderedHeight?: number;
  selected: { surah: number; ayah: number } | null;
  playing: { surah: number; ayah: number } | null;
  bookmarks: QuranBookmark[];
  /** Active khatmah pinned position, if it falls on this page. */
  khatmahPosition: { surah: number; ayah: number } | null;
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
  renderedHeight,
  selected,
  playing,
  bookmarks,
  khatmahPosition,
  accentColor,
  nightMode,
}: Props) {
  const rects = pageAyahLineRects(page);
  if (rects.length === 0) return null;
  const scale = renderedWidth / GEOMETRY_REF_WIDTH;
  const scaleY =
    renderedHeight != null ? renderedHeight / GEOMETRY_REF_HEIGHT : scale;

  const box = (r: AyahLineRect, key: string, color: string, opacity: number) => (
    <View
      key={key}
      pointerEvents="none"
      style={[
        styles.rect,
        {
          left: r.x0 * scale - 2,
          top: r.y0 * scaleY - 2,
          width: (r.x1 - r.x0) * scale + 4,
          height: (r.y1 - r.y0) * scaleY + 4,
          backgroundColor: color,
          opacity,
        },
      ]}
    />
  );

  const selectedRects = rectsFor(rects, selected);
  const playingRects = rectsFor(rects, playing);
  const khatmahRects = rectsFor(rects, khatmahPosition);

  // Full-ayah bookmark highlights. Opacities stay low so the black
  // (light mode) / inverted-white (night mode) ink keeps full contrast.
  const bookmarkBoxes = bookmarks.flatMap(b =>
    rects
      .filter(r => r.surah === b.surah && r.ayah === b.ayah)
      .map((r, i) =>
        box(
          r,
          `b${b.id}-${i}`,
          BOOKMARK_COLORS[b.color],
          nightMode ? 0.28 : 0.16,
        ),
      ),
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bookmarkBoxes}
      {khatmahRects.map((r, i) =>
        box(r, `k${i}`, KHATMAH_COLOR, nightMode ? 0.3 : 0.18),
      )}
      {playingRects.map((r, i) =>
        box(r, `p${i}`, accentColor, nightMode ? 0.35 : 0.22),
      )}
      {selectedRects.map((r, i) =>
        box(r, `s${i}`, accentColor, nightMode ? 0.3 : 0.18),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  rect: { position: 'absolute', borderRadius: 6 },
});
