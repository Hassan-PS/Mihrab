/**
 * A pulsing dot beside the surah name: this reading is being kept, and
 * the colour says WHICH of the three trails is keeping it.
 *
 * A following bookmark used to say so by washing an ayah — and since it
 * moves with the reading, the ayah it washed was the first one on
 * whatever page you had reached. That reads as "you bookmarked this
 * line", which is not what happened and not something the reader did.
 * The mark belonged to the session, not to an ayah, so it moved to where
 * sessions belong: the chrome, next to the name of what you are reading.
 *
 * It pulses because it is live. A still dot in a bookmark colour is
 * indistinguishable from a decoration; a slow breath is the one thing on
 * this page that says "and it is recording".
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import {
  BOOKMARK_COLORS,
  KHATMAH_COLOR,
  READING_COLOR,
  useQuranState,
  type QuranBookmark,
} from './quranState';
import {
  readingSessionSnapshot,
  subscribeReadingSession,
  type ReadingOwner,
} from './readingSession';

/** The bookmark that owns the open visit, if one does. */
export function useSessionBookmark(): QuranBookmark | null {
  const { owner } = useReadingSession();
  const quran = useQuranState();
  if (owner?.kind !== 'bookmark') return null;
  const b = quran.bookmarks.find(x => x.id === owner.id);
  return b?.follows ? b : null;
}

/** Whether the open visit is the khatmah's — see `readingSession`. */
export function useKhatmahSession(): boolean {
  return useReadingSession().owner?.kind === 'khatmah';
}

function useReadingSession() {
  return useSyncExternalStore(
    subscribeReadingSession,
    readingSessionSnapshot,
    readingSessionSnapshot,
  );
}

/**
 * The following bookmark whose ayah should be DRAWN on the page — the
 * anchor of the open visit, and only while it is still an anchor. Once
 * reading carries the bookmark along it stops being drawn; bookmarking an
 * ayah or scrubbing to a page makes it one again.
 */
export function useAnchorBookmarkId(): string | null {
  const { owner, anchorVisible } = useReadingSession();
  return anchorVisible && owner?.kind === 'bookmark' ? owner.id : null;
}

/**
 * WHICH TRAIL OWNS THIS VISIT, as a colour — or null with no reader open.
 *
 * Three trails run through one book: a khatmah, any number of following
 * bookmarks, and the reading marker. Only the bookmarks used to say so,
 * which is an accident of the order they were built in rather than a
 * design — and it left the marker as the one trail that could overwrite
 * your place without anything on screen having said it was recording.
 *
 * So the dot is the visit's owner in that owner's own ink: the
 * bookmark's colour, the khatmah's, or the marker's. It answers "what is
 * this reading counting towards" at a glance, always, instead of only
 * when a bookmark happens to be the answer.
 *
 * It is the OWNER, not a forecast of what this particular page will
 * move. The khatmah's ±2 veto and the bookmark's ±3 detach are guards on
 * individual turns, and a dot that flickered as you crossed them would
 * be describing the machinery rather than the reading.
 */
/**
 * WHICH READER IS ASKING, because one of the three does not record in
 * both of them.
 *
 * Khatmah progress is credited from muṣḥaf page turns and nowhere else,
 * by design: a plan read in the verse-by-verse reader does not advance.
 * So a cyan dot there would be the one thing this dot must never be —
 * a claim that the visit is being recorded when it is not. Bookmarks and
 * the marker do move in both readers, so they are drawn in both.
 */
export type ReaderKind = 'mushaf' | 'translation';

export function sessionColorOf(
  owner: ReadingOwner | null,
  bookmarks: QuranBookmark[],
  reader: ReaderKind = 'mushaf',
): string | null {
  if (owner == null) return null;
  if (owner.kind === 'khatmah') {
    return reader === 'mushaf' ? KHATMAH_COLOR : null;
  }
  if (owner.kind === 'reading') return READING_COLOR;
  // A bookmark that has stopped following owns nothing: the switch is
  // the whole of the feature, and turning it off has to turn this off.
  const b = bookmarks.find(x => x.id === owner.id);
  return b?.follows ? (BOOKMARK_COLORS[b.color] ?? null) : null;
}

export function useSessionColor(reader: ReaderKind = 'mushaf'): string | null {
  const { owner } = useReadingSession();
  return sessionColorOf(owner, useQuranState().bookmarks, reader);
}

export function SessionDot({ color, size = 8 }: { color: string; size?: number }) {
  // One driver, native: this thing breathes for as long as the reader is
  // open, and a JS-driven loop on a page being swiped is a dropped frame
  // waiting to happen.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      // Decorative: the dot repeats what the bookmark row already says in
      // words, and a screen reader announcing "pulsing dot" beside every
      // surah name would be noise.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.slot, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: color,
            borderRadius: size / 2,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.72, 1],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'center' },
  dot: { width: '100%', height: '100%' },
});
