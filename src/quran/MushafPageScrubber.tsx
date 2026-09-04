/**
 * A page rail for every mushaf reader (design review 2d, widened v2.8.5,
 * rebuilt v2.14.3).
 *
 * Six hundred and four pages is too many for a pair of chevrons — reaching
 * juz 20 by tapping ‹ three hundred times is not navigation. A draggable
 * rail states where you are and takes you anywhere in one gesture.
 *
 * The rail runs right-to-left, like the mushaf: page 1 is at the right end.
 *
 * ── WHAT A DRAG DOES, AND DOES NOT DO ─────────────────────────────────
 *
 * Nothing in the reader moves while the finger is moving. Every touch
 * sample used to become a `jumpToPage` — a scroll of the pager, a page laid
 * out in a fresh font, a last-read write, a khatmah record and a header
 * title, sixty times a second — and the rail stuttered under exactly the
 * gesture it existed for. Now a drag moves a number (`mushafRail.ts`), the
 * knob and a readout follow it, the reader PEEKS at the page only once the
 * finger has rested on it for a moment, and the place is committed once, on
 * release.
 *
 * Sliding the finger away from the rail slows the scrub — half, a quarter,
 * a tenth — so a single page can be chosen on purpose; the readout says
 * which speed it is in. The tick marks are the thirty ajzāʾ.
 *
 * ── Why the sideways drag is silent ──────────────────────────────────
 *
 * It used to tick at every surah boundary, at a weight set by how fast
 * the thumb was travelling: firm when hunting, light when ranging. The
 * reasoning was sound and the result was not. Surahs are unevenly spaced
 * — Al-Baqarah is 48 pages of nothing, the last juz is a boundary every
 * few millimetres — so the same gesture is silent across half the muṣḥaf
 * and a continuous buzz across the end of it, which reads as the rail
 * being noisy rather than as information about where you are.
 *
 * The one movement that still ticks is UP, into a slower speed. That is a
 * mode change the finger cannot see — the rail looks identical at half
 * speed and at a tenth — and it is the only thing here a reader needs
 * told without looking. One tick per crossing, and nothing while the
 * thumb runs along the rail.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { cardEdgeStyle } from '../theme/chrome';
import { hapticScrubStart, hapticScrubTick } from '../polish/haptics';
import {
  juzForPageIn,
  surahsForRiwayah,
  totalPagesForRiwayah,
} from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import { mushafSurahName } from './surahName';
import {
  createRailDrag,
  fractionForPage,
  juzTickFractions,
  PEEK_STILL_MS,
  surahAtPage,
  type RailDrag,
} from './mushafRail';

// The model's pure parts, re-exported for the tests that pinned them here.
// `isRangingDrag` outlives its caller: the rail no longer weights ticks by
// how fast the thumb is moving (there are no per-surah ticks left to
// weight), but the pure function and the reasoning behind it are still
// tested here and would be what a future speed-aware tick reached for.
export { isRangingDrag, surahAtPage } from './mushafRail';

type Props = {
  page: number;
  /** Which muṣḥaf the rail is scrubbing. Absent means Hafs. */
  riwayah?: RiwayahId;
  /** The place, committed — on release. */
  onSelectPage: (page: number) => void;
  /**
   * A look at a page while the finger rests on it, mid-drag. Optional: a
   * reader that cannot show a page cheaply may leave it out and get the
   * page on release only.
   */
  onPeekPage?: (page: number) => void;
  /** Opens the type-a-number sheet. Renders the ⌗ button when provided. */
  onOpenJump?: () => void;
};

/** The touch target: the track sits in the middle of this. */
const RAIL_BOX_H = 36;
const TRACK_H = 6;
const KNOB = 16;
/** The readout above the knob; a fixed width so it never has to be measured. */
const BUBBLE_W = 176;

function MushafPageScrubberImpl({
  page,
  riwayah = DEFAULT_RIWAYAH,
  onSelectPage,
  onPeekPage,
  onOpenJump,
}: Props) {
  const { t, i18n } = useTranslation();
  const totalPages = totalPagesForRiwayah(riwayah);
  const { palette } = useAppPalette();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  /**
   * What is shown while a finger is down: the page under it and the speed
   * it is in. Null between drags, when the knob follows `page`.
   */
  const [drag, setDrag] = useState<{ page: number; tier: number } | null>(
    null,
  );

  // Everything the responder reads at call time. The responder is made
  // once; a re-render changes what it sees without remaking it.
  const latest = useRef({ page, riwayah, totalPages, onSelectPage, onPeekPage });
  latest.current = { page, riwayah, totalPages, onSelectPage, onPeekPage };

  const dragRef = useRef<RailDrag | null>(null);
  // A move arrives more often than a frame is drawn; the state takes the
  // last sample per frame rather than a render per sample.
  const frame = useRef<number | null>(null);
  const pending = useRef<{ page: number; tier: number } | null>(null);
  const publish = useCallback((next: { page: number; tier: number }) => {
    pending.current = next;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (dragRef.current && pending.current) setDrag(pending.current);
    });
  }, []);

  // The peek: the page under a finger that has stopped moving.
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peeked = useRef(0);
  const clearPeek = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = null;
  };
  const schedulePeek = useCallback((target: number) => {
    clearPeek();
    if (!latest.current.onPeekPage) return;
    peekTimer.current = setTimeout(() => {
      peekTimer.current = null;
      if (!dragRef.current || target === peeked.current) return;
      peeked.current = target;
      latest.current.onPeekPage?.(target);
    }, PEEK_STILL_MS);
  }, []);

  /** The finger lifted, or the system took the touch: commit and clear. */
  const finish = useCallback(() => {
    clearPeek();
    const d = dragRef.current;
    dragRef.current = null;
    if (frame.current != null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    pending.current = null;
    setDrag(null);
    if (d) latest.current.onSelectPage(d.page());
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // A drag that has started on the rail belongs to the rail until the
      // finger lifts — the pager above must not take it as the finger
      // reaches up for a slower speed.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: e => {
        const w = widthRef.current;
        if (!(w > 0)) return;
        const { page: at, totalPages: total } = latest.current;
        const d = createRailDrag({
          total,
          width: w,
          page: at,
          grabX: e.nativeEvent.locationX,
        });
        dragRef.current = d;
        // Warms the Taptic Engine so the first speed tick is not late.
        // It is not itself a tick: grabbing the rail is something the
        // finger already knows it did.
        hapticScrubStart();
        const first = d.page();
        peeked.current = at;
        publish({ page: first, tier: 0 });
        schedulePeek(first);
      },
      onPanResponderMove: (_, g) => {
        const d = dragRef.current;
        if (!d) return;
        const before = d.tier();
        const { page: next, tier } = d.move(g.dx, g.dy);
        // THE ONLY TICK ON THE RAIL. Reaching up into a slower speed is a
        // mode change with no visible sign — the rail looks the same at
        // half speed and at a tenth — so it is announced once, firmly
        // enough to feel through a deliberate movement. Sliding ALONG the
        // rail says nothing: see the note at the top of the file.
        if (tier !== before) hapticScrubTick(false);
        publish({ page: next, tier });
        schedulePeek(next);
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    }),
  ).current;

  useEffect(
    () => () => {
      clearPeek();
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const shown = drag?.page ?? page;
  const fraction = fractionForPage(shown, totalPages);
  const knobCenter = fraction * width;
  const ticks = useMemo(() => juzTickFractions(riwayah), [riwayah]);

  /**
   * The readout above the knob while dragging: the surah under the thumb,
   * its juz and page, and the speed the finger is in. Nobody knows Yaseen
   * starts on 440; everybody knows Yaseen.
   */
  const bubble = useMemo(() => {
    if (!drag) return null;
    const number = surahAtPage(drag.page, riwayah);
    const meta = surahsForRiwayah(riwayah).find(s => s.number === number);
    const surah = meta ? mushafSurahName(meta, i18n.language) : '';
    const juz = juzForPageIn(drag.page, riwayah);
    const where = `${t('quran.juzLabel', { juz })} · ${t('quran.pageLabel', {
      page: drag.page,
    })}`;
    const speed =
      drag.tier === 0
        ? t('quran.scrubHint', 'Slide up for finer control')
        : drag.tier === 1
          ? t('quran.scrubHalf', 'Half speed')
          : drag.tier === 2
            ? t('quran.scrubQuarter', 'Quarter speed')
            : t('quran.scrubFine', 'Fine control');
    return { surah, where, speed, active: drag.tier > 0 };
  }, [drag, riwayah, i18n.language, t]);

  const bubbleLeft = Math.max(
    -8,
    Math.min(width - BUBBLE_W + 8, knobCenter - BUBBLE_W / 2),
  );

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
          now: shown,
          text: t('quran.pageLabel', { page: shown }),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => {
          // Reading direction: forward is the next page.
          const step = e.nativeEvent.actionName === 'increment' ? 1 : -1;
          onSelectPage(Math.max(1, Math.min(totalPages, page + step)));
        }}
        onLayout={onLayout}
        style={styles.railBox}
        {...pan.panHandlers}>
        <View
          pointerEvents="none"
          style={[styles.track, { backgroundColor: palette.controlBg }]}>
          {/* Thirty landmarks a reader can use; a hundred and fourteen
              surahs would be a texture. */}
          {width > 0
            ? ticks.map(f => (
                <View
                  key={f}
                  style={[
                    styles.tick,
                    {
                      left: Math.round(f * width) - 0.5,
                      backgroundColor: palette.muted,
                    },
                  ]}
                />
              ))
            : null}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.knob,
            {
              backgroundColor: palette.accentSolid,
              // Clamp so the knob stays inside the rail at both ends.
              left: Math.max(0, Math.min(width - KNOB, knobCenter - KNOB / 2)),
              transform: [{ scale: drag ? 1.25 : 1 }],
            },
          ]}
        />
        {bubble ? (
          <View
            pointerEvents="none"
            style={[
              styles.bubble,
              cardEdgeStyle(palette),
              { backgroundColor: palette.card, left: bubbleLeft },
            ]}>
            <Text
              style={[styles.bubbleSurah, { color: palette.text }]}
              numberOfLines={1}>
              {bubble.surah}
            </Text>
            <Text
              style={[styles.bubbleWhere, { color: palette.muted }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {bubble.where}
            </Text>
            <Text
              style={[
                styles.bubbleSpeed,
                { color: bubble.active ? palette.accentSolid : palette.muted },
              ]}
              numberOfLines={1}>
              {bubble.speed}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.readoutBox} pointerEvents="none">
        <Text
          style={[styles.readout, { color: palette.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {`${shown} / ${totalPages}`}
        </Text>
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
    paddingVertical: 4,
    // The rail keeps its height, like the player below it: the pager above
    // is the `flex: 1` one, and it is the one with room to give. See the
    // same note on the mini player's card.
    flexShrink: 0,
  },
  railBox: {
    flex: 1,
    height: RAIL_BOX_H,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    overflow: 'hidden',
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    opacity: 0.35,
  },
  knob: {
    position: 'absolute',
    top: (RAIL_BOX_H - KNOB) / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
  },
  bubble: {
    position: 'absolute',
    bottom: RAIL_BOX_H + 4,
    width: BUBBLE_W,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    gap: 2,
  },
  bubbleSurah: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  bubbleWhere: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  bubbleSpeed: { fontSize: 11, textAlign: 'center' },
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
});
