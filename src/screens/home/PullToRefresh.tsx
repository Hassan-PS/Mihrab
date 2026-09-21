/**
 * PULL THE HOME PAGE DOWN TO REFRESH ITS TIMES.
 *
 * ── WHY NOT `RefreshControl` ──────────────────────────────────────────
 *
 * Because of what this refresh is. It is not "fetch the current value" —
 * it re-downloads a published table, drops a month of stored rows and
 * refills them (`refreshStoredPrayerData`), and on a slow connection that
 * is tens of seconds with a number attached. `RefreshControl` offers a
 * spinner and no way to say how far along it is or what it is doing, and
 * a spinner that sits for half a minute is indistinguishable from one
 * that has hung.
 *
 * So the indicator says what stage the gesture is at on the way down, and
 * how far the work has got once it is running.
 *
 * ── HOW IT TAKES THE GESTURE FROM THE SCROLL VIEW ─────────────────────
 *
 * It does not, most of the time. `onMoveShouldSetPanResponder` claims a
 * drag only when the page is already at the top and the finger is moving
 * down — a scroll view at offset zero has nothing to give that gesture
 * anyway, so nothing is taken from it. Every other drag, including the
 * horizontal one that turns the day carousel, is never claimed
 * (`shouldClaimPull`).
 *
 * ── AND NOT ON THE MAC ────────────────────────────────────────────────
 *
 * A pull is a thumb. On Catalyst the page is driven by a trackpad and a
 * scroll wheel, where an overscroll is not a gesture anybody makes on
 * purpose, and the same refresh is a row in Settings.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import {
  PULL_RESTING,
  pullDistance,
  pullPhase,
  pullProgress,
  releaseStarts,
  shouldClaimPull,
  type PullPhase,
} from './pullGesture';

export type PullRefreshProgress = { current: number; total: number } | null;

type Options = {
  /** False on Catalyst, and while there is nothing to refresh. */
  enabled: boolean;
  /**
   * The work. Resolves when it is done; its rejection is swallowed by the
   * caller's own error surface, not by the indicator, which only reports
   * that it has finished.
   */
  onRefresh: (report: (current: number, total: number) => void) => Promise<void>;
};

export function usePullToRefresh({ enabled, onRefresh }: Options) {
  const pull = useRef(new Animated.Value(0)).current;
  const distance = useRef(0);
  const atTop = useRef(true);
  const running = useRef(false);
  const [phase, setPhase] = useState<PullPhase>('hidden');
  const [progress, setProgress] = useState<PullRefreshProgress>(null);

  const set = useCallback(
    (next: number) => {
      distance.current = next;
      pull.setValue(next);
      setPhase(pullPhase(next, running.current));
    },
    [pull],
  );

  const settle = useCallback(
    (to: number) => {
      Animated.spring(pull, {
        toValue: to,
        useNativeDriver: true,
        bounciness: 0,
        speed: 14,
      }).start(() => {
        distance.current = to;
        if (to === 0) setPhase('hidden');
      });
      distance.current = to;
    },
    [pull],
  );

  const finish = useCallback(() => {
    running.current = false;
    setProgress(null);
    setPhase('hidden');
    settle(0);
  }, [settle]);

  const start = useCallback(() => {
    running.current = true;
    setPhase('refreshing');
    setProgress({ current: 0, total: 1 });
    // Parked exactly at the threshold — "dropping it at the threshold
    // keeps it there during the refresh".
    settle(PULL_RESTING);
    void onRefresh((current, total) => {
      if (running.current) setProgress({ current, total });
    })
      .catch(() => undefined)
      .then(finish);
  }, [finish, onRefresh, settle]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      atTop.current = e.nativeEvent.contentOffset.y <= 0;
    },
    [],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          enabled &&
          !running.current &&
          shouldClaimPull({
            atTop: atTop.current,
            dy: gesture.dy,
            dx: gesture.dx,
          }),
        onPanResponderMove: (_evt, gesture) => {
          if (running.current) return;
          set(pullDistance(gesture.dy));
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (running.current) return;
          // Asked of the DISTANCE, so a pull past the threshold that was
          // pushed back up again is the cancel the reader meant it as.
          if (releaseStarts(pullDistance(gesture.dy))) start();
          else settle(0);
        },
        // A gesture the system takes away — a notification shade, a call —
        // is not a release. Put the page back.
        onPanResponderTerminate: () => {
          if (!running.current) settle(0);
        },
        onPanResponderTerminationRequest: () => !running.current,
      }),
    [enabled, set, settle, start],
  );

  return {
    panHandlers: enabled ? responder.panHandlers : {},
    onScroll,
    translateY: pull,
    phase,
    progress,
    /** True while the work is running, for anything that must not double it. */
    refreshing: phase === 'refreshing',
  };
}

/**
 * The strip above the page, which is only ever seen because the page has
 * been dragged off the top of it.
 *
 * Drawn UNDER the content and positioned by the same pull that moves the
 * content, rather than being pushed down by a spacer: a spacer would relayout
 * the whole page on every frame of the drag.
 */
export function PullIndicator({
  phase,
  progress,
  translateY,
  top = 0,
}: {
  phase: PullPhase;
  progress: PullRefreshProgress;
  translateY: Animated.Value;
  /** The status bar's height, where this page runs to the top edge. */
  top?: number;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  if (phase === 'hidden') return null;

  const label =
    phase === 'refreshing'
      ? t('home.pullRefreshing', 'Refreshing your times…')
      : phase === 'release'
        ? t('home.pullRelease', 'Release to refresh')
        : t('home.pullToRefresh', 'Pull down to refresh');

  const fraction = progress
    ? pullProgress(progress.current, progress.total)
    : 0;

  /**
   * Its own height plus the status bar's, and pushed up by exactly that.
   *
   * Not `paddingTop` on a fixed height: on a phone the page runs to the
   * top edge, so the strip has to clear the clock, and padding inside a
   * 72pt box would have squeezed the line it is there to show. Grown and
   * lifted by the same number, the text still lands `PULL_RESTING` above
   * the page — which is where the pull puts it.
   */
  const height = PULL_RESTING + top;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.strip,
        {
          height,
          top: -height,
          paddingTop: top,
          // Follows the page down, so the text sits in the gap the pull
          // opened rather than sliding under the first card.
          transform: [{ translateY }],
        },
      ]}>
      <Text style={[styles.label, { color: palette.muted }]} numberOfLines={1}>
        {label}
      </Text>
      {phase === 'refreshing' ? (
        <View style={[styles.track, { backgroundColor: palette.accentBg }]}>
          <View
            style={[
              styles.fill,
              {
                width: `${Math.round(fraction * 100)}%`,
                backgroundColor: palette.accentSolid,
              },
            ]}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    /**
     * Against the page, not centred in the strip.
     *
     * The strip is only ever seen from the bottom up — a pull of twenty
     * points reveals its bottom twenty points — so a centred label is
     * invisible for the first half of the gesture, which is precisely
     * the half where the reader is deciding whether this gesture exists.
     */
    justifyContent: 'flex-end',
    gap: SPACING.xs,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  label: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  track: {
    width: 140,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
});
