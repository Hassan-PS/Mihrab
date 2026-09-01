/**
 * A page rail for every mushaf reader (design review 2d, widened v2.8.5).
 *
 * Six hundred and four pages is too many for a pair of chevrons — reaching
 * juz 20 by tapping ‹ three hundred times is not navigation. A draggable
 * rail states where you are and takes you anywhere in one gesture, and the
 * page-of-604 readout means the position is legible even when you are not
 * dragging.
 *
 * The rail runs right-to-left, like the mushaf: page 1 is at the right end.
 *
 * ── Why the haptics are speed-aware ──────────────────────────────────
 *
 * A 604-page rail across a phone is roughly two pages per pixel, so pages
 * are the wrong unit for feedback: ticking per page is a continuous buzz
 * that says nothing. Surahs are the landmark people actually navigate by,
 * and they are unevenly spaced — which is the point. Al-Baqarah is 48
 * pages of silence, the last juz is a tick every few millimetres.
 *
 * The tick then reports the reader's own intent back to them. Drag slowly
 * and boundaries arrive rarely and land firmly, so you can stop ON one.
 * Sweep and they arrive constantly, so they go light and become a texture
 * — "you are in the short surahs now" — instead of twenty medium knocks a
 * second, which is just a vibration with no information in it.
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { TABULAR_MAX_FONT_SCALE } from '../theme/textScale';
import { hapticScrubStart, hapticScrubTick } from '../polish/haptics';
import {
  pagesForRiwayah,
  surahsForRiwayah,
  totalPagesForRiwayah,
} from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import { mushafSurahName } from './surahName';

type Props = {
  page: number;
  /** Which muṣḥaf the rail is scrubbing. Absent means Hafs. */
  riwayah?: RiwayahId;
  onSelectPage: (page: number) => void;
  /** Opens the type-a-number sheet. Renders the ⌗ button when provided. */
  onOpenJump?: () => void;
};

/**
 * Pages per second above which a drag counts as ranging rather than
 * hunting. A deliberate search moves maybe a fifth of the rail per second
 * (~120 pages); anything past 260 is a sweep.
 */
const RANGING_PAGES_PER_SECOND = 260;

/** Floor between ticks so a sweep cannot outrun the vibrator. */
const MIN_TICK_INTERVAL_MS = 45;

/**
 * page → surah number, built once PER MUṢḤAF.
 *
 * A table, not a constant: two riwayat break their pages differently, so
 * "which surah is page 300" has no answer until you say which print. Built
 * on first use and kept — the rail asks this on every frame of a drag.
 */
const SURAH_AT_PAGE = new Map<RiwayahId, ReadonlyArray<number>>();

function surahAtPageTable(riwayah: RiwayahId): ReadonlyArray<number> {
  const cached = SURAH_AT_PAGE.get(riwayah);
  if (cached) return cached;
  const total = totalPagesForRiwayah(riwayah);
  const table = new Array<number>(total + 1).fill(1);
  for (const p of pagesForRiwayah(riwayah)) {
    if (p.page >= 1 && p.page <= total) table[p.page] = p.start.surah;
  }
  SURAH_AT_PAGE.set(riwayah, table);
  return table;
}

/** The surah a page opens in. Out-of-range pages clamp to the mushaf. */
export function surahAtPage(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): number {
  const table = surahAtPageTable(riwayah);
  const clamped = Math.max(1, Math.min(table.length - 1, Math.round(page)));
  return table[clamped] ?? 1;
}

/**
 * Is this drag ranging (sweeping for a region) rather than hunting (looking
 * for one surah)? Pure so the threshold can be argued about in a test
 * instead of by feel on a device.
 */
export function isRangingDrag(pagesMoved: number, elapsedMs: number): boolean {
  if (elapsedMs <= 0) return true;
  return (Math.abs(pagesMoved) / elapsedMs) * 1000 > RANGING_PAGES_PER_SECOND;
}

function MushafPageScrubberImpl({
  page,
  riwayah = DEFAULT_RIWAYAH,
  onSelectPage,
  onOpenJump,
}: Props) {
  const { t, i18n } = useTranslation();
  const totalPages = totalPagesForRiwayah(riwayah);
  const { palette } = useAppPalette();
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  // Drag bookkeeping. Refs, not state: these are read and written inside
  // PanResponder callbacks that must not re-render to do their job.
  const lastSurah = useRef(0);
  const lastPage = useRef(page);
  const lastMoveAt = useRef(0);
  const lastTickAt = useRef(0);

  /** x → page, counting from the RIGHT: the mushaf opens that way. */
  const pageAt = useCallback(
    (x: number): number => {
      const w = widthRef.current || 1;
      const fraction = 1 - Math.max(0, Math.min(1, x / w));
      return Math.max(
        1,
        Math.min(totalPages, Math.round(fraction * (totalPages - 1)) + 1),
      );
    },
    [totalPages],
  );

  /**
   * Tick if this move crossed into a different surah, at a weight set by
   * how fast the thumb is travelling.
   */
  const feedback = useCallback(
    (next: number, now: number) => {
    const surah = surahAtPage(next, riwayah);
    if (surah === lastSurah.current) {
      lastPage.current = next;
      lastMoveAt.current = now;
      return;
    }
    const ranging = isRangingDrag(
      next - lastPage.current,
      now - lastMoveAt.current,
    );
    lastSurah.current = surah;
    lastPage.current = next;
    lastMoveAt.current = now;
    if (now - lastTickAt.current < MIN_TICK_INTERVAL_MS) return;
    lastTickAt.current = now;
    hapticScrubTick(ranging);
    },
    [riwayah],
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const next = pageAt(e.nativeEvent.locationX);
        setDragging(true);
        hapticScrubStart();
        // Seed from the page we land on, so the first tick is the first
        // boundary actually crossed rather than an artefact of grabbing
        // the rail somewhere else in the mushaf.
        lastSurah.current = surahAtPage(next, riwayah);
        lastPage.current = next;
        lastMoveAt.current = Date.now();
        lastTickAt.current = 0;
        onSelectPage(next);
      },
      onPanResponderMove: e => {
        const next = pageAt(e.nativeEvent.locationX);
        feedback(next, Date.now());
        onSelectPage(next);
      },
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    }),
  ).current;

  const fraction = (totalPages - page) / (totalPages - 1);

  /**
   * While dragging, the readout names the surah under the thumb. The page
   * number alone does not tell anyone whether they have arrived — nobody
   * knows Yaseen starts on 440.
   */
  const surahLabel = useMemo(() => {
    if (!dragging) return null;
    const number = surahAtPage(page, riwayah);
    const meta = surahsForRiwayah(riwayah).find(s => s.number === number);
    return meta ? mushafSurahName(meta, i18n.language) : null;
  }, [dragging, page, i18n.language, riwayah]);

  return (
    <View style={styles.wrap}>
      {onOpenJump ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.jumpToPage', 'Go to page')}
          onPress={onOpenJump}
          hitSlop={10}
          style={[styles.jumpBtn, { backgroundColor: palette.controlBg }]}>
          <Text style={[styles.jumpGlyph, { color: palette.accentSolid }]}>
            ⌗
          </Text>
        </Pressable>
      ) : null}
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={t('quran.pageScrubber', 'Go to page')}
        accessibilityValue={{
          min: 1,
          max: totalPages,
          now: page,
        }}
        onLayout={onLayout}
        style={[styles.rail, { backgroundColor: palette.controlBg }]}
        {...pan.panHandlers}>
        <View
          pointerEvents="none"
          style={[
            styles.knob,
            {
              backgroundColor: palette.accentSolid,
              // Clamp so the knob stays inside the rail at both ends.
              left: Math.max(0, Math.min(width - 14, fraction * width - 7)),
            },
          ]}
        />
      </View>
      <View style={styles.readoutBox} pointerEvents="none">
        <Text
          style={[styles.readout, { color: palette.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {`${page} / ${totalPages}`}
        </Text>
        {surahLabel ? (
          <Text
            style={[styles.readoutSurah, { color: palette.text }]}
            numberOfLines={1}>
            {surahLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const MushafPageScrubber = memo(MushafPageScrubberImpl);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  rail: { flex: 1, height: 12, borderRadius: 6, justifyContent: 'center' },
  knob: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  jumpBtn: {
    width: 34,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpGlyph: { fontSize: 17, fontWeight: '700', lineHeight: 20 },
  readoutBox: { minWidth: 76, alignItems: 'flex-end' },
  readout: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  readoutSurah: { fontSize: 11, fontWeight: '600', textAlign: 'right' },
});
