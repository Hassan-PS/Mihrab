/**
 * Back is the way out of fullscreen, because nothing else on screen is.
 *
 * Issue #43: the muṣḥaf reader "intermittently fails to render its top
 * navigation bar" — it renders the surah name on a strip and no controls
 * at all. That IS fullscreen; the reader had entered it, and a tap
 * anywhere on the page is what toggles it, so entering by accident while
 * reading is easy. Getting out is a tap on the strip or a margin, but a
 * tap on a WORD opens that ayah instead, so the obvious move gives you a
 * sheet rather than the chrome back. On a phone with gesture navigation
 * the reporter's edge-swipe then left the app rather than the mode.
 *
 * One Android back listener serves the route (see useAndroidSubScreenBack
 * for why it must be one), and the state it has to ask about lives a
 * component below it, so the child publishes an answer and the parent's
 * listener asks. These are the two halves of that.
 */
import * as React from 'react';
import { act } from 'react';
import { create } from 'react-test-renderer';
import { readFileSync } from 'fs';
import path from 'path';
import { useCallback, useRef } from 'react';
import {
  askBackAnswer,
  usePublishBackAnswer,
  type BackAnswer,
} from '../src/navigation/backIntercept';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

describe('the published answer', () => {
  it('is asked, and can take the press', () => {
    const ref = { current: null as BackAnswer };
    expect(askBackAnswer(ref)).toBe(false);
    ref.current = () => true;
    expect(askBackAnswer(ref)).toBe(true);
  });

  it('is false when nobody published one', () => {
    // Not undefined, and not a throw: the parent asks on every press,
    // including the ones where no child is listening.
    expect(askBackAnswer(undefined)).toBe(false);
    expect(askBackAnswer({ current: null })).toBe(false);
  });

  it('clears when the screen that published it goes away', () => {
    // A popped reader must not be able to swallow the next screen's back
    // press with a closure over its own dead state.
    const ref = { current: null as BackAnswer };
    function Child() {
      usePublishBackAnswer(
        ref,
        useCallback(() => true, []),
      );
      return null;
    }
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Child />);
    });
    expect(askBackAnswer(ref)).toBe(true);
    act(() => tree!.unmount());
    expect(askBackAnswer(ref)).toBe(false);
  });

  it('follows the state it was published from', () => {
    // The answer is re-published when the state changes, so back reads
    // the mode the reader is in NOW, not the one it was in on mount.
    const ref = { current: null as BackAnswer };
    const exits: number[] = [];
    function Child({ full }: { full: boolean }) {
      const n = useRef(0);
      usePublishBackAnswer(
        ref,
        useCallback(() => {
          if (!full) return false;
          exits.push((n.current += 1));
          return true;
        }, [full]),
      );
      return null;
    }
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<Child full={false} />);
    });
    expect(askBackAnswer(ref)).toBe(false);
    act(() => tree!.update(<Child full />));
    expect(askBackAnswer(ref)).toBe(true);
    expect(exits).toHaveLength(1);
    act(() => tree!.unmount());
  });
});

/**
 * The wiring, read rather than rendered.
 *
 * Both screens pull in the whole muṣḥaf — fonts, page geometry, the
 * riwayah store, the audio player — and mounting that to prove two props
 * are connected would test the mocks. What can silently break here is the
 * connection itself: a reader that never publishes leaves back exactly as
 * it was before #43, and nothing else would fail.
 */
describe('both ends are connected', () => {
  const parent = read('src/screens/QuranSurahScreen.tsx');
  const child = read('src/screens/quran/MushafSurahScreen.tsx');

  it('the route asks the published answer on back', () => {
    expect(parent).toContain('askBackAnswer(leaveFullscreen)');
    expect(parent).toMatch(/useAndroidSubScreenBack\(\s*undefined,/);
  });

  it('the route hands the muṣḥaf somewhere to publish it', () => {
    expect(parent).toMatch(/onBackAnswer=\{leaveFullscreen\}/);
  });

  it('the muṣḥaf publishes leaving fullscreen', () => {
    expect(child).toContain('usePublishBackAnswer');
    // The CALL, not the import above it.
    const call = child.indexOf('usePublishBackAnswer(');
    expect(call).toBeGreaterThan(-1);
    const answer = child.slice(call, call + 400);
    // False when it is not in the mode, so back out of the READER is
    // unchanged — one level at a time, not two.
    expect(answer).toMatch(/if \(!isFullscreen\) return false;/);
    // Through the veil, like every other way out — see fullscreenVeil.ts.
    expect(answer).toContain('requestFullscreen(false)');
  });
});
