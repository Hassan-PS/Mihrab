/**
 * PULL THE HOME PAGE DOWN TO REFRESH ITS TIMES.
 *
 * ── WHY NOT `RefreshControl` ──────────────────────────────────────────
 *
 * Because of what this refresh is. It is not "fetch the current value" —
 * it re-downloads a published table, drops a month of stored rows and
 * refills them (`refreshStoredPrayerData`), and on a slow connection that
 * is tens of seconds with a number attached. `RefreshControl` offers a
 * spinner and no way to say how far along it is, and a spinner that sits
 * for half a minute is indistinguishable from one that has hung. So the
 * indicator says what stage the gesture is at on the way down, and how far
 * the work has got once it is running.
 *
 * ── WHY IT WAS LAGGY, AND WHAT CHANGED ────────────────────────────────
 *
 * The first version drove the pull from a `PanResponder`: every touch
 * event went to the JavaScript thread, which worked out a distance and
 * pushed it back to the page with `setValue`. The page could only move as
 * fast as that round trip, and the Home page's JavaScript thread is not
 * idle — the countdown ticks every second, and the pull ALSO called a
 * state setter on every move from a hook living in HomeScreen, so a
 * fifteen-hundred-line screen was being asked to render while the reader's
 * thumb was on it. Reported as "very laggy", correctly.
 *
 * Now the finger moves the page on the UI thread. `PanGestureHandler`
 * feeds its translation straight into a native-driven `Animated.event`,
 * and the page's transform is an `interpolate` of that value over
 * `PULL_CURVE` — no JavaScript between the finger and the pixels. The
 * house precedent is `ShareMonthScreen`'s pinch, which has moved a month
 * table this way for as long as it has existed.
 *
 * JavaScript still hears about the pull, through the event's listener,
 * for the two things that are decisions rather than motion: which words
 * the indicator shows, and whether a release refreshes. Those updates go
 * to a small store the indicator subscribes to — never to HomeScreen,
 * which renders nothing at all while a pull is in progress.
 *
 * ── HOW IT SHARES THE PAGE WITH THE SCROLL VIEW ───────────────────────
 *
 * The handler is enabled only while the page is at the top, and the
 * scroll view WAITS for it (`waitFor`): a drag that turns out to be a pull
 * never starts a scroll, and one that turns out to be anything else —
 * upward, or sideways across the day carousel — fails the pull within a
 * few points and goes on as a scroll. See `pullGesture.ts` for the
 * offsets and why each one is there.
 *
 * ── AND NOT ON THE MAC ────────────────────────────────────────────────
 *
 * A pull is a thumb. On Catalyst the page is driven by a trackpad and a
 * scroll wheel, where an overscroll is not a gesture anybody makes on
 * purpose, and the same refresh is a row in Settings.
 */
import {
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  NativeViewGestureHandler,
  PanGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import {
  PULL_ACTIVE_OFFSET_Y,
  PULL_CURVE,
  PULL_FAIL_OFFSET_X,
  PULL_FAIL_OFFSET_Y,
  PULL_RESTING,
  pullDistance,
  pullPhase,
  pullProgress,
  releaseStarts,
  type PullPhase,
} from './pullGesture';

export type PullRefreshProgress = { current: number; total: number } | null;

type Snapshot = {
  phase: PullPhase;
  progress: PullRefreshProgress;
  atTop: boolean;
  running: boolean;
};

type RefreshWork = (
  report: (current: number, total: number) => void,
) => Promise<void>;

/**
 * Everything the pull knows, OUTSIDE React.
 *
 * The indicator and the frame subscribe to it; HomeScreen only holds it.
 * That is the whole of the lag fix on the React side: a pull changes this
 * object dozens of times a second and HomeScreen, which owns it, is never
 * told — only the two small components that read it are, and only when
 * the value they read has actually changed.
 */
export class PullStore {
  /** The raw finger travel, driven natively by the gesture. */
  readonly drag = new Animated.Value(0);
  /** The page's travel — `drag` over `PULL_CURVE`, also native. */
  readonly translate = this.drag.interpolate({
    inputRange: [...PULL_CURVE.inputRange],
    outputRange: [...PULL_CURVE.outputRange],
    extrapolate: 'clamp',
  });

  private snap: Snapshot = {
    phase: 'hidden',
    progress: null,
    atTop: true,
    running: false,
  };
  private listeners = new Set<() => void>();
  private work: RefreshWork = async () => {};

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get = (): Snapshot => this.snap;

  /** The latest refresh, without re-creating anything that holds this. */
  setWork(work: RefreshWork): void {
    this.work = work;
  }

  private update(patch: Partial<Snapshot>): void {
    const next = { ...this.snap, ...patch };
    if (
      next.phase === this.snap.phase &&
      next.progress === this.snap.progress &&
      next.atTop === this.snap.atTop &&
      next.running === this.snap.running
    ) {
      return;
    }
    this.snap = next;
    for (const listener of this.listeners) listener();
  }

  /** From the scroll view's own event — the one thing the pull needs from it. */
  onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    this.update({ atTop: e.nativeEvent.contentOffset.y <= 0 });
  };

  /** From the gesture's listener, per move: words only, never motion. */
  onDrag = (translationY: number): void => {
    if (this.snap.running) return;
    this.update({ phase: pullPhase(pullDistance(translationY), false) });
  };

  /** The finger has left. Asked of where the PAGE is — see `releaseStarts`. */
  onRelease = (translationY: number, completed: boolean): void => {
    if (this.snap.running) return;
    if (completed && releaseStarts(pullDistance(translationY))) this.start();
    else this.settle(0);
  };

  private settle(to: number, then?: () => void): void {
    Animated.spring(this.drag, {
      toValue: to,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14,
    }).start(() => then?.());
  }

  private start(): void {
    this.update({
      running: true,
      phase: 'refreshing',
      progress: { current: 0, total: 1 },
    });
    // Parked exactly at the threshold — "dropping it at the threshold keeps
    // it there during the refresh". The curve is one-to-one up to there, so
    // the finger's travel and the page's are the same number.
    this.settle(PULL_RESTING);
    void this.work((current, total) => {
      if (this.snap.running) this.update({ progress: { current, total } });
    })
      .catch(() => undefined)
      .then(() => {
        this.update({ running: false, progress: null });
        this.settle(0, () => this.update({ phase: 'hidden' }));
      });
  }
}

/**
 * The pull's store, made once and held — so HomeScreen gets the same object
 * every render and nothing it passes down changes identity because of it.
 */
export function usePullToRefresh(onRefresh: RefreshWork): PullStore {
  const store = useRef<PullStore | null>(null);
  if (!store.current) store.current = new PullStore();
  store.current.setWork(onRefresh);
  return store.current;
}

function usePull(store: PullStore): Snapshot {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * The frame the page is pulled within.
 *
 * `children` is the scroll view, exactly as HomeScreen built it. The frame
 * re-renders when the page reaches or leaves the top, or a refresh starts
 * or ends — and when it does, React reuses that element as it is, so the
 * page under it does not render with it.
 */
export function PullToRefreshFrame({
  store,
  enabled,
  top = 0,
  children,
}: {
  store: PullStore;
  /** False on Catalyst, and while there is nothing to refresh. */
  enabled: boolean;
  /** The status bar's height, where this page runs to the top edge. */
  top?: number;
  children: ReactNode;
}) {
  const { atTop, running } = usePull(store);
  const pan = useRef<PanGestureHandler>(null);

  const onGestureEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { translationY: store.drag } }], {
        useNativeDriver: true,
        listener: (e: { nativeEvent: { translationY: number } }) =>
          store.onDrag(e.nativeEvent.translationY),
      }),
    [store],
  );

  const onHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.oldState !== State.ACTIVE) return;
      // END is a release. CANCELLED is the system taking the gesture — a
      // notification shade, a call — and is never a refresh.
      store.onRelease(
        e.nativeEvent.translationY,
        e.nativeEvent.state === State.END,
      );
    },
    [store],
  );

  return (
    <PanGestureHandler
      ref={pan}
      enabled={enabled && atTop && !running}
      activeOffsetY={PULL_ACTIVE_OFFSET_Y}
      failOffsetY={PULL_FAIL_OFFSET_Y}
      failOffsetX={PULL_FAIL_OFFSET_X}
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}>
      <Animated.View style={styles.host}>
        <PullIndicator store={store} top={top} />
        <Animated.View
          style={[styles.page, { transform: [{ translateY: store.translate }] }]}>
          {/* The scroll view waits for the pull to fail before it starts,
              so a drag that is a pull never scrolls and one that is not
              loses a few points at most. When the pull is disabled — the
              page is not at the top — it fails at once and waits for
              nothing. */}
          <NativeViewGestureHandler waitFor={pan}>
            {children}
          </NativeViewGestureHandler>
        </Animated.View>
      </Animated.View>
    </PanGestureHandler>
  );
}

/**
 * The strip above the page, only ever seen because the page has been
 * dragged off the top of it.
 *
 * Always mounted, and moved by the same native value as the page: mounting
 * it on the first frame of a pull was a render in the middle of the one
 * gesture that most needs not to have one. It re-renders only when its
 * words or its progress change.
 */
function PullIndicator({ store, top }: { store: PullStore; top: number }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { phase, progress } = usePull(store);

  const label =
    phase === 'refreshing'
      ? t('home.pullRefreshing', 'Refreshing your times…')
      : phase === 'release'
        ? t('home.pullRelease', 'Release to refresh')
        : t('home.pullToRefresh', 'Pull down to refresh');

  const fraction = progress ? pullProgress(progress.current, progress.total) : 0;

  /**
   * Its own height plus the status bar's, and lifted by exactly that, so
   * the words clear the clock where the page runs to the top edge and
   * still land against the page when it is pulled.
   */
  const height = PULL_RESTING + top;
  const hidden = phase === 'hidden';

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      // Off the screen while hidden, so nothing reads it out.
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}
      style={[
        styles.strip,
        {
          height,
          top: -height,
          paddingTop: top,
          transform: [{ translateY: store.translate }],
        },
      ]}>
      <Text style={[styles.label, { color: palette.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <View
        style={[
          styles.track,
          {
            backgroundColor:
              phase === 'refreshing' ? palette.accentBg : 'transparent',
          },
        ]}>
        {phase === 'refreshing' ? (
          <View
            style={[
              styles.fill,
              {
                width: `${Math.round(fraction * 100)}%`,
                backgroundColor: palette.accentSolid,
              },
            ]}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /**
   * Clips: the page is translated DOWN inside this, so without it the last
   * card slides past the tab bar rather than under it, and the strip above
   * the page would be drawn over whatever is behind this screen.
   */
  host: { flex: 1, overflow: 'hidden' },
  page: { flex: 1 },
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    /**
     * Against the page, not centred in the strip. The strip is seen from
     * the bottom up — a pull of twenty points reveals its bottom twenty —
     * so a centred label would be invisible for the first half of the
     * gesture, which is the half where the reader is deciding whether the
     * gesture exists.
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
