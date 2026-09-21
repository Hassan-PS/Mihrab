/**
 * The word reader's gesture, over a Ḥafṣ page.
 *
 * A pan that only begins as a long press: the finger has to stay put for
 * `HOLD_MS` before anything happens, and a finger that moves first has
 * failed it — that movement is a page turn or a scroll, and the pager or
 * the list takes it as it always did. Once the hold has begun the pan
 * owns the touch: the word under the finger lights (`wordReader.hold`),
 * moving relights, lifting reads (`wordReader.release`), and anything
 * that takes the gesture away — the page unmounting under it, an
 * interruption — cancels (`wordReader.cancel`).
 *
 * The gesture sits over the page's lines and gets the touch in the lines'
 * own coordinates, so `wordAtPoint` can answer from the layout alone.
 * Nothing here knows about pages, spreads or scrolling.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { MushafPageLayout } from './mushafLayout';
import { wordAtPoint, type PageGeometry } from './mushafHitTest';
import { cancel, hold, release } from './audio/wordReader';
import { hapticScrubStart, hapticScrubTick } from '../polish/haptics';

/** How long the finger stays still before the hold begins. */
export const HOLD_MS = 280;
/** How far it may drift in that time before the touch is a scroll instead. */
export const HOLD_SLOP = 10;

type Props = {
  layout: MushafPageLayout;
  geometry: PageGeometry;
  children: React.ReactNode;
};

export function WordReaderSurface({ layout, geometry, children }: Props) {
  // Read at touch time, never captured: the geometry changes with every
  // resize and the gesture object must not be rebuilt for it.
  const live = useRef({ layout, geometry });
  live.current = { layout, geometry };
  const lastKey = useRef<string>('');
  /** This surface's finger is down on a word — the hold is ours to cancel. */
  const holding = useRef(false);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(HOLD_MS)
        .failOffsetX([-HOLD_SLOP, HOLD_SLOP])
        .failOffsetY([-HOLD_SLOP, HOLD_SLOP])
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart(e => {
          const { layout: l, geometry: g } = live.current;
          const word = wordAtPoint(l, e.x, e.y, g);
          lastKey.current = '';
          hapticScrubStart();
          if (word) {
            lastKey.current = `${word.surah}:${word.ayah}:${word.position}`;
            holding.current = true;
            hold(word);
            hapticScrubTick(false);
          }
        })
        .onUpdate(e => {
          const { layout: l, geometry: g } = live.current;
          const word = wordAtPoint(l, e.x, e.y, g);
          if (!word) return;
          const key = `${word.surah}:${word.ayah}:${word.position}`;
          if (key === lastKey.current) return;
          lastKey.current = key;
          holding.current = true;
          hold(word);
          hapticScrubTick(true);
        })
        .onEnd(() => {
          holding.current = false;
          void release();
        })
        .onFinalize((_e, success) => {
          if (!success) {
            holding.current = false;
            cancel();
          }
        }),
    [],
  );

  // A page that unmounts mid-hold — a jump, a turn from elsewhere — must
  // not leave a word lit and the recitation paused. Only OUR hold, though:
  // the pager mounts and drops the neighbouring pages on its own clock,
  // and their surfaces unmounting must not cut short a word this one is
  // reading.
  useEffect(
    () => () => {
      if (holding.current) cancel();
    },
    [],
  );

  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
